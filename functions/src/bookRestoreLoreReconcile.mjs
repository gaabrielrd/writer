import { digest } from './sceneContracts.mjs';
import { born, closed, inconsistent, integer, chunkId } from './bookRestoreUploadContracts.mjs';
import { BOOK_LORE_GENERATION_FIELDS } from './bookLoreGenerationContracts.mjs';
import { readBookRestoreArtifact } from './bookRestoreArtifacts.mjs';
import { openBookLoreRecord, openBookLoreRelationPage } from './bookLoreStorageRead.mjs';
import {
  openBookResourcePayload,
  validateBookResourcePayloadSnapshot,
} from './bookResourcePayloadRead.mjs';
import { lorePayloadSegmentId } from './bookRestoreLorePayloadContracts.mjs';
import { bookRestoreLoreNextPageSource } from './bookRestoreLorePages.mjs';

const stageKind = 'restore-lore-reconcile';
const identity = (loaded, item) =>
  digest([stageKind, loaded.view.jobToken, item.sourceToken, item.id]);
const token = (native) =>
  digest({
    birth: born(native.snapshot),
    update: born({ createTime: native.snapshot.updateTime }),
    value: native.value,
  });
function checked(p, loaded, item, headToken) {
  closed(p, [
    'schemaVersion',
    'stageKind',
    'ownerId',
    'bookId',
    'jobToken',
    'entityId',
    'sourceToken',
    'headToken',
    'phase',
    'fieldIndex',
    'page',
    'cursor',
    'relationSource',
  ]);
  if (
    p.schemaVersion !== 1 ||
    p.stageKind !== stageKind ||
    p.ownerId !== loaded.job.ownerId ||
    p.bookId !== loaded.job.bookId ||
    p.jobToken !== loaded.view.jobToken ||
    p.entityId !== item.id ||
    p.sourceToken !== item.sourceToken ||
    p.headToken !== headToken ||
    !['fields', 'relations', 'done'].includes(p.phase) ||
    Buffer.byteLength(JSON.stringify(p)) > 24576
  )
    inconsistent();
  integer(p.fieldIndex);
  integer(p.page);
  if (
    p.fieldIndex > BOOK_LORE_GENERATION_FIELDS.length ||
    p.page > Math.ceil(item.sourceMetadata.index.relations.count / 64)
  )
    inconsistent();
}
async function open(tx, db, loaded, item) {
  const native = await readBookRestoreArtifact(tx, db, loaded, 'lore', item.id);
  if (native.value.payloadStorage?.schemaVersion !== 2) return null;
  if (loaded.job.payloadInventoryVersion !== 1) inconsistent();
  const scope = {
      db,
      uid: loaded.job.ownerId,
      bookId: loaded.job.bookId,
      path: 'books/' + loaded.job.bookId,
    },
    opened = await openBookLoreRecord(tx, scope, native.snapshot),
    storage = opened.storage,
    metadata = item.sourceMetadata.index,
    fields = BOOK_LORE_GENERATION_FIELDS.filter((key) => Object.hasOwn(metadata.ranges, key)),
    expected = {
      bookId: loaded.job.bookId,
      createdAt: loaded.job.preparation.timestamp,
      updatedAt: loaded.job.preparation.timestamp,
      ...(metadata.isPublic.present ? { isPublic: metadata.isPublic.value } : {}),
      payloadStorage: storage,
    };
  if (
    storage.base !== null ||
    !Object.hasOwn(storage, 'portableDates') ||
    digest(native.value) !== digest(expected) ||
    digest(storage.portableDates) !== digest(metadata.dates) ||
    digest(Object.keys(storage.fields).sort()) !== digest([...fields].sort()) ||
    fields.some((key) => storage.fields[key] === null) ||
    storage.relations.present !== metadata.relations.present ||
    storage.relations.count !== metadata.relations.count ||
    storage.relations.generationId !== storage.generationId ||
    digest(storage.relations.sealBirth) !== digest(storage.sealBirth)
  )
    inconsistent();
  const headToken = token(native),
    id = identity(loaded, item),
    control = await readBookRestoreArtifact(tx, db, loaded, 'payload-body', id, { optional: true }),
    progress = control
      ? structuredClone(control.value)
      : {
          schemaVersion: 1,
          stageKind,
          ownerId: loaded.job.ownerId,
          bookId: loaded.job.bookId,
          jobToken: loaded.view.jobToken,
          entityId: item.id,
          sourceToken: item.sourceToken,
          headToken,
          phase: 'fields',
          fieldIndex: 0,
          page: 0,
          cursor: null,
          relationSource: null,
        };
  checked(progress, loaded, item, headToken);
  return { native, opened, control, id, progress };
}
/** Produce one authenticated D2 source unit; all observations are rechecked in the write transaction. */
export async function prepareBookRestoreLoreReconciliationSource(db, loaded, item) {
  const observed = await db.runTransaction(async (tx) => {
    await item.verify(tx);
    return open(tx, db, loaded, item);
  });
  if (observed === null) return null;
  const p = observed.progress,
    field = BOOK_LORE_GENERATION_FIELDS[p.fieldIndex];
  let unit = null;
  if (p.phase === 'fields' && Object.hasOwn(item.sourceMetadata.index.ranges, field))
    unit = await item.readField(field, { cursor: p.cursor });
  else if (p.phase === 'relations' && p.page < observed.opened.storage.relations.pages)
    unit = await item.readRelationPage(p.page, { cursor: p.cursor, source: p.relationSource });
  return {
    progress: structuredClone(p),
    unit,
    async verify(tx) {
      await observed.native.verify(tx);
      if (observed.control) await observed.control.verify(tx);
      if (unit) await unit.verify(tx);
    },
  };
}
async function compareUnit(tx, db, loaded, item, opened, p, unit) {
  if (
    !unit ||
    unit.present !== true ||
    !(unit.bytes instanceof Uint8Array) ||
    unit.bytes.length > 81920 ||
    !unit.cursor
  )
    inconsistent();
  const field = p.phase === 'fields' ? BOOK_LORE_GENERATION_FIELDS[p.fieldIndex] : 'relations';
  if (unit.field !== field) inconsistent();
  let pointer, body;
  if (field === 'relations') {
    const segment = await readBookRestoreArtifact(
      tx,
      db,
      loaded,
      'lore-segment',
      lorePayloadSegmentId(opened.storage.generationId, p.page * 64),
    );
    if (segment.value.schemaVersion !== 2) inconsistent();
    const page = await openBookLoreRelationPage(tx, opened, p.page);
    if (digest(segment.value.payload) !== digest(page.pointer)) inconsistent();
    pointer = page.pointer;
    body = page.body;
  } else {
    pointer = opened.storage.fields[field];
    if (!pointer) inconsistent();
    body = await openBookResourcePayload(tx, db, {
      uid: loaded.job.ownerId,
      bookId: loaded.job.bookId,
      resource: { kind: 'lore', parentId: null, id: item.id },
      ...pointer,
    });
  }
  const header = await readBookRestoreArtifact(
    tx,
    db,
    loaded,
    'payload-body',
    pointer.manifest.bodyId,
  );
  if (digest(born(header.snapshot)) !== digest(pointer.expectedBirth)) inconsistent();
  const offset = p.cursor?.outputBytes ?? 0,
    end = offset + unit.bytes.length;
  if (
    !Number.isSafeInteger(end) ||
    end > pointer.manifest.byteLength ||
    unit.cursor.outputBytes !== end
  )
    inconsistent();
  let at = offset;
  while (at < end) {
    const index = Math.floor(at / 65536),
      artifact = await readBookRestoreArtifact(
        tx,
        db,
        loaded,
        'payload-chunk',
        pointer.manifest.bodyId + ':' + chunkId(index),
      ),
      bytes = validateBookResourcePayloadSnapshot(body, index, artifact.snapshot),
      from = at - index * 65536,
      length = Math.min(bytes.length - from, end - at);
    if (
      length < 1 ||
      !Buffer.from(bytes.subarray(from, from + length)).equals(
        Buffer.from(unit.bytes.subarray(at - offset, at - offset + length)),
      )
    )
      inconsistent();
    at += length;
  }
  if (unit.done) {
    if (
      !unit.summary ||
      unit.summary.byteLength !== pointer.manifest.byteLength ||
      unit.summary.contentHash !== pointer.manifest.contentHash ||
      end !== pointer.manifest.byteLength ||
      (field === 'relations' &&
        unit.summary.relations !== Math.min(64, opened.storage.relations.count - p.page * 64))
    )
      inconsistent();
  } else if (unit.summary !== null || end >= pointer.manifest.byteLength) inconsistent();
}
/** One limited comparison per operation; no complete body or accumulated proof catalog. */
export async function prepareBookRestoreLoreReconciliation(tx, db, loaded, item, source) {
  if (!source || loaded.job.preparation.counts?.lorePayloadOffset) inconsistent();
  await source.verify(tx);
  const native = await open(tx, db, loaded, item);
  if (!native || digest(native.progress) !== digest(source.progress)) inconsistent();
  const p = structuredClone(native.progress);
  if (p.phase === 'done') inconsistent();
  if (source.unit) {
    await compareUnit(tx, db, loaded, item, native.opened, p, source.unit);
    p.cursor = structuredClone(source.unit.cursor);
    if (source.unit.done) {
      if (p.phase === 'relations') {
        p.relationSource = bookRestoreLoreNextPageSource(p.cursor);
        p.page++;
      } else p.fieldIndex++;
      p.cursor = null;
    }
  } else if (p.phase === 'fields') {
    const field = BOOK_LORE_GENERATION_FIELDS[p.fieldIndex];
    if (Object.hasOwn(item.sourceMetadata.index.ranges, field) || p.cursor !== null) inconsistent();
    p.fieldIndex++;
  } else {
    if (p.page !== native.opened.storage.relations.pages || p.cursor !== null) inconsistent();
    p.phase = 'done';
  }
  if (p.phase === 'fields' && p.fieldIndex === BOOK_LORE_GENERATION_FIELDS.length)
    p.phase = 'relations';
  if (
    p.phase === 'relations' &&
    p.page === native.opened.storage.relations.pages &&
    p.cursor === null
  )
    p.phase = 'done';
  checked(p, loaded, item, p.headToken);
  return {
    pending: p.phase !== 'done',
    writes: [{ kind: 'payload-body', id: native.id, replace: native.control !== null, value: p }],
  };
}
