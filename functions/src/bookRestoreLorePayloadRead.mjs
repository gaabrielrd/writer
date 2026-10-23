import { digest } from './sceneContracts.mjs';
import { born, bornEqual, closed, inconsistent } from './bookRestoreUploadContracts.mjs';
import { lorePayloadStorage, lorePayloadSegmentId } from './bookRestoreLorePayloadContracts.mjs';
import { readBookRestoreArtifact } from './bookRestoreArtifacts.mjs';
import { readBookResourcePayload } from './bookResourcePayloadRead.mjs';
function notAfter(snapshot, birth) {
  const a = born(snapshot);
  return (
    a.seconds < birth.seconds || (a.seconds === birth.seconds && a.nanoseconds <= birth.nanoseconds)
  );
}
/** One base or relation page per count operation; caller authorizes source and root artifact. */
export async function checkRestoredLorePayload(tx, db, loaded, item, native, preparation, page) {
  if (loaded.job.payloadInventoryVersion !== 1) inconsistent();
  const p = preparation.counts,
    value = native.value,
    storage = lorePayloadStorage(value.payloadStorage);
  closed(value, ['bookId', 'createdAt', 'updatedAt', 'payloadStorage']);
  if (
    value.bookId !== loaded.job.bookId ||
    value.createdAt !== preparation.timestamp ||
    value.updatedAt !== preparation.timestamp ||
    storage.relations.present !== (item.loreRelations !== null) ||
    storage.relations.count !== (item.loreRelations?.count ?? 0)
  )
    inconsistent();
  const scope = {
    uid: loaded.job.ownerId,
    bookId: loaded.job.bookId,
    resource: { kind: 'lore', parentId: null, id: item.value.id },
  };
  if (!p.lorePayloadOffset) {
    const artifact = await readBookRestoreArtifact(
      tx,
      db,
      loaded,
      'payload-body',
      storage.base.manifest.bodyId,
    );
    if (!notAfter(artifact.snapshot, storage.sealBirth)) inconsistent();
    const base = await readBookResourcePayload(tx, db, { ...scope, ...storage.base }),
      expected = {
        ...item.value.data,
        bookId: loaded.job.bookId,
        createdAt: preparation.timestamp,
        updatedAt: preparation.timestamp,
      };
    if (digest(base) !== digest(expected)) inconsistent();
    p.lorePayloadOffset = storage.relations.count ? { entityId: item.value.id, offset: 0 } : null;
    return p.lorePayloadOffset !== null;
  }
  if (
    p.lorePayloadOffset.entityId !== item.value.id ||
    !page ||
    page.offset !== p.lorePayloadOffset.offset ||
    !page.values.length
  )
    inconsistent();
  const segment = await readBookRestoreArtifact(
      tx,
      db,
      loaded,
      'lore-segment',
      lorePayloadSegmentId(storage.generationId, page.offset),
    ),
    s = segment.value;
  closed(s, [
    'schemaVersion',
    'ownerId',
    'bookId',
    'loreId',
    'generationId',
    'offset',
    'count',
    'payload',
  ]);
  if (
    s.schemaVersion !== 1 ||
    s.ownerId !== loaded.job.ownerId ||
    s.bookId !== loaded.job.bookId ||
    s.loreId !== item.value.id ||
    s.generationId !== storage.generationId ||
    s.offset !== page.offset ||
    s.count !== page.values.length ||
    !bornEqual(segment.snapshot, { createTime: segment.snapshot.updateTime }) ||
    !notAfter(segment.snapshot, storage.sealBirth)
  )
    inconsistent();
  const header = await readBookRestoreArtifact(
    tx,
    db,
    loaded,
    'payload-body',
    s.payload.manifest.bodyId,
  );
  if (!notAfter(header.snapshot, born(segment.snapshot))) inconsistent();
  const relations = await readBookResourcePayload(tx, db, { ...scope, ...s.payload });
  if (digest(relations) !== digest(page.values)) inconsistent();
  const offset = page.offset + page.values.length;
  if (offset > storage.relations.count) inconsistent();
  p.lorePayloadOffset =
    offset === storage.relations.count ? null : { entityId: item.value.id, offset };
  return p.lorePayloadOffset !== null;
}
