import { digest } from './sceneContracts.mjs';
import { born, closed, inconsistent, integer, sum } from './bookRestoreUploadContracts.mjs';
import {
  BOOK_LORE_GENERATION_FIELDS,
  loreGenerationStorage,
} from './bookLoreGenerationContracts.mjs';
import { lorePayloadSegmentId } from './bookRestoreLorePayloadContracts.mjs';
import {
  bookRestoreLorePageToken,
  bookRestoreLoreNextPageSource,
} from './bookRestoreLorePages.mjs';
import {
  prepareBookRestoreStreamBody,
  readBookRestoreStreamBody,
} from './bookRestoreStreamBody.mjs';
import {
  readBookRestoreArtifact,
  readBookRestoreArtifactReceipt,
  assertBookRestorePayloadNamespacesEmpty,
} from './bookRestoreArtifacts.mjs';
const stageKind = 'restore-lore-generation';
const generationId = (loaded, id, operationId) =>
  digest({
    domain: 'book-lore-payload',
    jobToken: loaded.view.jobToken,
    entityId: id,
    operationId,
  });
function address(loaded, prefix) {
  return digest([stageKind, loaded.view.jobToken, prefix.entityId, prefix.generationOperationId]);
}
function checked(p, loaded, prefix, item) {
  closed(p, [
    'schemaVersion',
    'stageKind',
    'ownerId',
    'bookId',
    'jobToken',
    'entityId',
    'sourceToken',
    'generationId',
    'phase',
    'fieldIndex',
    'fields',
    'page',
    'relationSource',
    'sealOperationId',
  ]);
  if (
    p.schemaVersion !== 1 ||
    p.stageKind !== stageKind ||
    p.ownerId !== loaded.job.ownerId ||
    p.bookId !== loaded.job.bookId ||
    p.jobToken !== loaded.view.jobToken ||
    p.entityId !== item.id ||
    p.sourceToken !== item.sourceToken ||
    p.generationId !== prefix.generationId ||
    prefix.entityId !== item.id ||
    !prefix.streamed ||
    prefix.generationId !== generationId(loaded, item.id, prefix.generationOperationId) ||
    !['fields', 'relations', 'seal', 'head', 'done'].includes(p.phase)
  )
    inconsistent();
  integer(p.fieldIndex);
  integer(p.page);
  if (
    p.fieldIndex > BOOK_LORE_GENERATION_FIELDS.length ||
    p.page > Math.ceil(item.sourceMetadata.index.relations.count / 64)
  )
    inconsistent();
  closed(p.fields, [], BOOK_LORE_GENERATION_FIELDS);
  if (Buffer.byteLength(JSON.stringify(p)) > 16384) inconsistent();
}
function target(loaded, prefix, p, item) {
  const metadata = item.sourceMetadata.index;
  if (p.phase === 'fields') {
    const field = BOOK_LORE_GENERATION_FIELDS[p.fieldIndex];
    if (!Object.hasOwn(metadata.ranges, field)) return null;
    return {
      entityId: item.id,
      generationOperationId: prefix.generationOperationId,
      sourceToken: item.sourceToken,
      target: { field },
      timestamp: loaded.job.preparation.timestamp,
    };
  }
  if (p.phase === 'relations' && p.page < Math.ceil(metadata.relations.count / 64))
    return {
      entityId: item.id,
      generationOperationId: prefix.generationOperationId,
      sourceToken: bookRestoreLorePageToken(item.sourceToken, p.page),
      target: {
        field: 'relations',
        page: p.page,
        count: Math.min(64, metadata.relations.count - p.page * 64),
      },
      timestamp: loaded.job.preparation.timestamp,
    };
  return null;
}
async function loadControl(tx, db, loaded, prefix, item) {
  const native = await readBookRestoreArtifact(
    tx,
    db,
    loaded,
    'payload-body',
    address(loaded, prefix),
  );
  const p = structuredClone(native.value);
  checked(p, loaded, prefix, item);
  return { native, progress: p };
}
/** Capture only native control metadata before I/O. The write transaction rechecks all observations. */
export async function prepareBookRestoreLoreStreamSource(db, loaded, item) {
  const prefix = loaded.job.preparation.lorePayload;
  if (!prefix?.streamed) return null;
  const observed = await db.runTransaction(async (tx) => {
    await item.verify(tx);
    const control = await loadControl(tx, db, loaded, prefix, item),
      config = target(loaded, prefix, control.progress, item),
      body = config ? await readBookRestoreStreamBody(tx, db, loaded, config) : null;
    return { ...control, config, body };
  });
  const { progress: p, config, body } = observed;
  let unit = null;
  if (config && (!body || body.progress.phase === 'stage'))
    unit =
      config.target.field === 'relations'
        ? await item.readRelationPage(p.page, {
            cursor: body?.progress.cursor ?? null,
            source: p.relationSource,
          })
        : await item.readField(config.target.field, { cursor: body?.progress.cursor ?? null });
  return {
    unit,
    async verify(tx) {
      await observed.native.verify(tx);
      if (body) await body.verify(tx);
      if (unit) await unit.verify(tx);
    },
  };
}
/** Full-generation write plan. Root activation and reconciliation have separate gates. */
export async function prepareBookRestoreLoreStream(
  tx,
  db,
  loaded,
  request,
  preparation,
  item,
  source,
) {
  if (loaded.job.payloadInventoryVersion !== 1)
    await assertBookRestorePayloadNamespacesEmpty(tx, db, loaded);
  const scoped = {
      ...loaded,
      job: { ...loaded.job, cleanupVersion: 6, payloadInventoryVersion: 1, preparation },
    },
    writes = [],
    metadata = item.sourceMetadata.index;
  if (!preparation.lorePayload) {
    if (preparation.relationOffset !== 0) inconsistent();
    const prefix = {
      schemaVersion: 1,
      entityId: item.id,
      generationId: generationId(loaded, item.id, request.operationId),
      generationOperationId: request.operationId,
      base: null,
      pages: 0,
      sealOperationId: null,
      segment: null,
      streamed: true,
    };
    preparation.lorePayload = prefix;
    writes.push({
      kind: 'payload-body',
      id: address(scoped, prefix),
      value: {
        schemaVersion: 1,
        stageKind,
        ownerId: loaded.job.ownerId,
        bookId: loaded.job.bookId,
        jobToken: loaded.view.jobToken,
        entityId: item.id,
        sourceToken: item.sourceToken,
        generationId: prefix.generationId,
        phase: 'fields',
        fieldIndex: 0,
        fields: {},
        page: 0,
        relationSource: null,
        sealOperationId: null,
      },
    });
    return { loaded: scoped, writes };
  }
  const prefix = preparation.lorePayload,
    read = await loadControl(tx, db, scoped, prefix, item),
    p = read.progress,
    before = digest(p),
    config = target(scoped, prefix, p, item);
  if (source) await source.verify(tx);
  if (p.phase === 'fields' || p.phase === 'relations') {
    if (config) {
      const body = await prepareBookRestoreStreamBody(
        tx,
        db,
        scoped,
        request,
        config,
        source?.unit ?? null,
      );
      writes.push(...body.writes);
      if (body.pointer) {
        if (config.target.field === 'relations') {
          writes.push({
            kind: 'lore-segment',
            id: lorePayloadSegmentId(prefix.generationId, p.page * 64),
            value: {
              schemaVersion: 2,
              ownerId: loaded.job.ownerId,
              bookId: loaded.job.bookId,
              loreId: item.id,
              generationId: prefix.generationId,
              offset: p.page * 64,
              count: config.target.count,
              payload: body.pointer,
            },
          });
          p.relationSource = bookRestoreLoreNextPageSource(body.progress.cursor);
          p.page++;
        } else {
          p.fields[config.target.field] = body.pointer;
          p.fieldIndex++;
        }
      }
    } else if (p.phase === 'fields') p.fieldIndex++;
    else p.phase = 'seal';
    if (p.phase === 'fields' && p.fieldIndex === BOOK_LORE_GENERATION_FIELDS.length)
      p.phase = 'relations';
  } else if (p.phase === 'seal') {
    if (p.page !== Math.ceil(metadata.relations.count / 64)) inconsistent();
    p.sealOperationId = request.operationId;
    p.phase = 'head';
  } else if (p.phase === 'head') {
    const seal = await readBookRestoreArtifactReceipt(tx, db, scoped, p.sealOperationId),
      sealBirth = born(seal),
      stamp = preparation.timestamp,
      storage = loreGenerationStorage({
        schemaVersion: 2,
        generationId: prefix.generationId,
        base: null,
        fields: p.fields,
        dates: { createdAt: stamp, updatedAt: stamp },
        portableDates: structuredClone(metadata.dates),
        relations: {
          ...metadata.relations,
          pages: p.page,
          generationId: prefix.generationId,
          sealBirth,
        },
        sealBirth,
      });
    for (const pointer of Object.values(p.fields)) {
      const header = await readBookRestoreArtifact(
        tx,
        db,
        scoped,
        'payload-body',
        pointer.manifest.bodyId,
      );
      if (digest(pointer.expectedBirth) !== digest(born(header.snapshot))) inconsistent();
    }
    writes.push({
      kind: 'lore',
      id: item.id,
      value: {
        bookId: loaded.job.bookId,
        createdAt: stamp,
        updatedAt: stamp,
        ...(metadata.isPublic.present ? { isPublic: metadata.isPublic.value } : {}),
        payloadStorage: storage,
      },
    });
    p.phase = 'done';
    preparation.loreCount = sum(preparation.loreCount, 1);
    preparation.loreRelationCount = sum(preparation.loreRelationCount, metadata.relations.count);
    preparation.loreItemIndex = sum(preparation.loreItemIndex, 1);
    preparation.lorePayload = null;
  } else inconsistent();
  checked(p, scoped, prefix, item);
  if (digest(p) !== before)
    writes.push({ kind: 'payload-body', id: address(scoped, prefix), replace: true, value: p });
  return { loaded: scoped, writes };
}
