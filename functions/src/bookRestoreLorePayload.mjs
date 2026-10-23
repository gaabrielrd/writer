import { digest } from './sceneContracts.mjs';
import { prepareBookResourcePayload } from './bookResourcePayload.mjs';
import { openBookResourcePayload } from './bookResourcePayloadRead.mjs';
import {
  captureBookRestoreLorePrefix,
  verifyBookRestoreLorePrefix,
  newlyPreparedLoreRelations,
} from './bookRestoreLorePrefix.mjs';
import { born, bornEqual, chunkId, inconsistent, sum } from './bookRestoreUploadContracts.mjs';
import {
  readBookRestoreArtifact,
  readBookRestoreArtifactReceipt,
  assertBookRestorePayloadNamespacesEmpty,
} from './bookRestoreArtifacts.mjs';
import { lorePayloadSegmentId } from './bookRestoreLorePayloadContracts.mjs';
export { lorePayloadSegmentId };
const resource = (id) => ({ kind: 'lore', parentId: null, id });
const baseValue = (loaded, item, p) => ({
  ...item.value.data,
  bookId: loaded.job.bookId,
  createdAt: p.timestamp,
  updatedAt: p.timestamp,
});
function generation(loaded, entityId, operationId) {
  return digest({
    domain: 'book-lore-payload',
    jobToken: loaded.view.jobToken,
    entityId,
    operationId,
  });
}
function pointer(artifact, manifest) {
  return { manifest, expectedBirth: born(artifact.snapshot) };
}
async function body(tx, db, loaded, entityId, at) {
  const artifact = await readBookRestoreArtifact(
    tx,
    db,
    loaded,
    'payload-body',
    at.manifest.bodyId,
  );
  await openBookResourcePayload(tx, db, {
    uid: loaded.job.ownerId,
    bookId: loaded.job.bookId,
    resource: resource(entityId),
    ...at,
  });
  return artifact;
}
async function verifyParts(tx, db, loaded, manifest, header = null) {
  for (let index = 0; index < manifest.chunkCount; index++) {
    const part = await readBookRestoreArtifact(
      tx,
      db,
      loaded,
      'payload-chunk',
      manifest.bodyId + ':' + chunkId(index),
      { metadataOnly: true },
    );
    if (header) {
      const first = born(part.snapshot),
        last = born(header.snapshot);
      if (
        first.seconds > last.seconds ||
        (first.seconds === last.seconds && first.nanoseconds > last.nanoseconds)
      )
        inconsistent();
    }
  }
}
/** Caller has authenticated item/page, CAS and state; returns only a native write plan. */
export async function prepareBookRestoreLorePayload(
  tx,
  db,
  loaded,
  request,
  preparation,
  item,
  page,
) {
  const legacy = !preparation.lorePayload
    ? await captureBookRestoreLorePrefix(tx, db, loaded, item, preparation)
    : null;
  if (loaded.job.payloadInventoryVersion !== 1)
    await assertBookRestorePayloadNamespacesEmpty(tx, db, loaded);
  const scoped = {
    ...loaded,
    job: { ...loaded.job, payloadInventoryVersion: 1, cleanupVersion: 6 },
  };
  if (!Object.hasOwn(preparation, 'lorePayload')) preparation.lorePayload = null;
  if (preparation.lorePayload === null) {
    if (legacy) preparation.relationOffset = 0;
    preparation.lorePayload = {
      schemaVersion: 1,
      entityId: item.value.id,
      generationOperationId: request.operationId,
      generationId: generation(loaded, item.value.id, request.operationId),
      base: null,
      pages: 0,
      sealOperationId: null,
      segment: null,
      ...(legacy ? { legacy } : {}),
    };
  }
  const p = preparation.lorePayload,
    total = item.loreRelations?.count ?? 0,
    writes = [];
  if (
    p.entityId !== item.value.id ||
    p.generationId !== generation(loaded, p.entityId, p.generationOperationId) ||
    preparation.relationOffset > total ||
    p.pages !== Math.ceil(preparation.relationOffset / 64) ||
    (p.legacy &&
      (p.legacy.relations >= total || p.legacy.relations > preparation.loreRelationCount))
  )
    inconsistent();
  const finishing = p.base !== null && preparation.relationOffset === total && p.segment === null;
  await verifyBookRestoreLorePrefix(tx, db, scoped, p.entityId, preparation, p.legacy, finishing);
  if (finishing) {
    const base = await body(tx, db, scoped, p.entityId, p.base),
      expected = prepareBookResourcePayload({
        uid: loaded.job.ownerId,
        bookId: loaded.job.bookId,
        resource: resource(p.entityId),
        operationId: p.generationOperationId,
        timestamp: preparation.timestamp,
        value: baseValue(loaded, item, preparation),
      });
    if (
      digest(base.value) !== digest(expected.header) ||
      digest(p.base.manifest) !== digest(expected.manifest)
    )
      inconsistent();
    const anchor = await readBookRestoreArtifactReceipt(tx, db, scoped, p.sealOperationId);
    if (
      anchor.data().receipt.action !== 'advanceBookRestoreLore' ||
      digest(anchor.data().receipt.preparation?.lorePayload) !== digest(p)
    )
      inconsistent();
    if (p.pages) {
      const last = await readBookRestoreArtifact(
        tx,
        db,
        scoped,
        'lore-segment',
        lorePayloadSegmentId(p.generationId, (p.pages - 1) * 64),
      );
      if (
        last.value.generationId !== p.generationId ||
        last.value.offset + last.value.count !== total
      )
        inconsistent();
    }
    writes.push({
      kind: 'lore',
      id: p.entityId,
      ...(p.legacy ? { replace: true } : {}),
      value: {
        bookId: loaded.job.bookId,
        createdAt: preparation.timestamp,
        updatedAt: preparation.timestamp,
        payloadStorage: {
          schemaVersion: 1,
          generationId: p.generationId,
          base: p.base,
          relations: { present: item.loreRelations !== null, count: total, pages: p.pages },
          sealBirth: born(anchor),
        },
      },
    });
    preparation.loreCount = sum(preparation.loreCount, 1);
    preparation.relationOffset = 0;
    preparation.loreItemIndex = sum(preparation.loreItemIndex, 1);
    preparation.lorePayload = null;
    return { loaded: scoped, writes };
  }
  const isBase = p.base === null;
  if (!isBase && (!page || page.offset !== preparation.relationOffset || !page.values.length))
    inconsistent();
  const value = isBase ? baseValue(loaded, item, preparation) : page.values,
    prepared = prepareBookResourcePayload({
      uid: loaded.job.ownerId,
      bookId: loaded.job.bookId,
      resource: resource(p.entityId),
      operationId: p.segment?.operationId ?? request.operationId,
      timestamp: preparation.timestamp,
      value,
    });
  if (p.segment === null)
    p.segment = {
      operationId: request.operationId,
      manifest: prepared.manifest,
      nextPart: 0,
      sealed: false,
    };
  const segment = p.segment;
  if (digest(segment.manifest) !== digest(prepared.manifest)) inconsistent();
  if (segment.nextPart < segment.manifest.chunkCount) {
    const end = Math.min(segment.nextPart + 16, segment.manifest.chunkCount);
    for (let index = segment.nextPart; index < end; index++)
      writes.push({
        kind: 'payload-chunk',
        id: segment.manifest.bodyId + ':' + chunkId(index),
        value: prepared.part(index),
      });
    segment.nextPart = end;
  } else if (!segment.sealed) {
    await verifyParts(tx, db, scoped, segment.manifest);
    writes.push({ kind: 'payload-body', id: segment.manifest.bodyId, value: prepared.header });
    segment.sealed = true;
  } else {
    const artifact = await readBookRestoreArtifact(
        tx,
        db,
        scoped,
        'payload-body',
        segment.manifest.bodyId,
      ),
      at = pointer(artifact, segment.manifest);
    if (
      !bornEqual(artifact.snapshot, { createTime: artifact.snapshot.updateTime }) ||
      digest(artifact.value) !== digest(prepared.header)
    )
      inconsistent();
    await verifyParts(tx, db, scoped, segment.manifest, artifact);
    if (isBase) p.base = at;
    else {
      writes.push({
        kind: 'lore-segment',
        id: lorePayloadSegmentId(p.generationId, page.offset),
        value: {
          schemaVersion: 1,
          ownerId: loaded.job.ownerId,
          bookId: loaded.job.bookId,
          loreId: p.entityId,
          generationId: p.generationId,
          offset: page.offset,
          count: page.values.length,
          payload: at,
        },
      });
      p.pages = sum(p.pages, 1);
      const before = preparation.relationOffset;
      preparation.relationOffset = sum(before, page.values.length);
      preparation.loreRelationCount = sum(
        preparation.loreRelationCount,
        newlyPreparedLoreRelations(before, preparation.relationOffset, p.legacy),
      );
    }
    p.sealOperationId = request.operationId;
    p.segment = null;
  }
  return { loaded: scoped, writes };
}
