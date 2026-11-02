import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../../src/bookRestoreUpload.mjs';
import { createVerifiedBookRestoreContent } from '../../src/bookRestoreContentRead.mjs';
import { prepareBookRestoreArtifacts } from '../../src/bookRestoreArtifacts.mjs';
import {
  jobShape,
  jobToken,
  requestHash,
  date,
  sum,
  integrityProgress,
} from '../../src/bookRestoreUploadContracts.mjs';
import { createBookRestoreRemapper } from '../../src/bookRestoreRemap.mjs';
import { loreRestoreFixture } from './bookRestoreLoreFixture.mjs';
import { resource, address } from './bookContentFixture.mjs';
import { uploadArchiveRestore } from './bookRestoreContentFixture.mjs';
import { finishRestoreStructure } from './bookRestoreStructureFixture.mjs';
import { finishLegacyRestore, legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
export const prefixData = ({ count = 200, descriptionBytes = 6000, details = '' } = {}) => ({
  name: 'Literal legacy lore',
  category: 'character',
  aliases: ['A', 'A', ''],
  details,
  relations: Array.from({ length: count }, (_, index) => ({
    targetEntityId: index % 2 ? 'universe:gone:external' : 'entity',
    relationType: 'knows',
    description: String(index).padStart(8, '0') + 'x'.repeat(descriptionBytes),
  })),
});
export function prefixRecords(data = prefixData(), prior = false) {
  const rows = loreRestoreFixture({ relations: 0 }),
    entity = address(['lore', null, 'entity']);
  const at = rows.findIndex((r) => r.id === entity);
  rows[at] = resource('lore', 'entity', data);
  if (prior) {
    const index = rows.findIndex((r) => r.id === address(['lore', null, 'absent']));
    rows[index] = resource('lore', 'absent', {
      name: 'Earlier',
      category: 'other',
      relations: [
        { targetEntityId: 'entity', relationType: 'first' },
        { targetEntityId: 'entity', relationType: 'second' },
      ],
    });
    const [large] = rows.splice(at, 1);
    rows.splice(
      rows.findIndex((r) => r.kind === 'book-resources'),
      0,
      large,
    );
  }
  return rows.flatMap((r) =>
    r.payload.length <= 65536
      ? [r]
      : Array.from({ length: Math.ceil(r.payload.length / 65536) }, (_, part) => ({
          ...r,
          part,
          payload: r.payload.subarray(part * 65536, (part + 1) * 65536),
        })),
  );
}
function loader(db, uid, id) {
  return async (tx, actor, restoreId, token) => {
    assert.equal(actor, uid);
    assert.equal(restoreId, id);
    const ref = db.doc('users/' + uid + '/bookRestores/' + id),
      snapshot = await tx.get(ref),
      job = jobShape(uid, id, snapshot.data()),
      nativeToken = jobToken(uid, id, snapshot, job.startFingerprint);
    assert.equal(token, nativeToken);
    assert.equal(job.state, 'content-verified');
    assert.equal((await tx.get(db.doc('books/' + job.bookId))).exists, false);
    return { ref, snapshot, job, view: { jobToken: nativeToken } };
  };
}
export const prefixEntity = (p) =>
  createBookRestoreRemapper({
    schemaVersion: 1,
    jobToken: p.jobToken,
    sourceBookId: 'book',
    bookId: p.bookId,
  }).identity('lore', 'entity');
async function reader(db, uid, id, p) {
  return createVerifiedBookRestoreContent({
    db,
    uid,
    id,
    token: p.jobToken,
    load: loader(db, uid, id),
  });
}
/**
 * Reproduce M28/v6 inline relation-page writes, not an execution of an old binary.
 * Input is uploaded/validated by the real services. The transaction creates/updates
 * native lore, journal, job and immutable receipt together. No native stamps are edited.
 */
export async function writeLegacyPrefixPage(db, uid, id, p, operationId) {
  const load = loader(db, uid, id),
    request = mutation(id, p, operationId),
    cursor =
      p.preparation.schemaVersion === 1
        ? {
            ...p.preparation,
            schemaVersion: 2,
            loreCount: 0,
            loreRelationCount: 0,
            relationOffset: 0,
            loreItemIndex: p.preparation.itemIndex,
          }
        : structuredClone(p.preparation),
    item = await (await reader(db, uid, id, p)).readMappedItem(cursor.loreItemIndex),
    page = await item.loreRelations.read(cursor.relationOffset);
  assert.equal(item.record.kind, 'book-lore');
  assert.equal(item.value.id, prefixEntity(p));
  assert.equal(page.done, false);
  const receipt = await db.runTransaction(async (tx) => {
    const loaded = await load(tx, uid, id, p.jobToken);
    assert.equal(loaded.job.checkpoint, request.expectedCheckpoint);
    assert.equal(loaded.job.preparation.phase, 'resources');
    await item.verify(tx);
    await page.verify(tx);
    const next = structuredClone(cursor),
      value = {
        ...item.value.data,
        bookId: p.bookId,
        createdAt: next.timestamp,
        updatedAt: next.timestamp,
      },
      ref = db.doc('books/' + p.bookId + '/lore/' + item.value.id);
    if (next.relationOffset) {
      const previous = (await tx.get(ref)).data();
      assert.equal(previous.relations.length, next.relationOffset);
      value.relations = [...previous.relations, ...page.values];
    } else value.relations = page.values;
    const effects = await prepareBookRestoreArtifacts(
      tx,
      db,
      loaded,
      operationId,
      [
        {
          kind: 'lore',
          id: item.value.id,
          value,
          replace: next.relationOffset > 0,
        },
      ],
      6,
    );
    next.relationOffset = sum(next.relationOffset, page.values.length);
    next.loreRelationCount = sum(next.loreRelationCount, page.values.length);
    next.artifactCount = sum(next.artifactCount, effects.created);
    const job = {
      ...loaded.job,
      cleanupVersion: 6,
      preparation: next,
      checkpoint: loaded.job.checkpoint + 1,
      updatedAt: date(() => loaded.job.updatedAt + 1, loaded.job.updatedAt),
    };
    const valueReceipt = {
      schemaVersion: 1,
      operationId,
      action: 'advanceBookRestoreLore',
      expectedCheckpoint: request.expectedCheckpoint,
      checkpoint: job.checkpoint,
      state: job.state,
      sequence: null,
      uploadedChunks: job.uploadedChunks,
      uploadedBytes: job.uploadedBytes,
      cleanedChunks: job.cleanedChunks,
      integrity: integrityProgress(job),
      validation: job.validationMeta,
      preparation: next,
    };
    effects.commit();
    tx.update(loaded.ref, job);
    tx.create(db.doc('users/' + uid + '/bookRestoreOperations/' + operationId), {
      schemaVersion: 1,
      ownerId: uid,
      restoreId: id,
      jobToken: p.jobToken,
      fingerprint: requestHash('advanceBookRestoreLore', request),
      receipt: valueReceipt,
    });
    return valueReceipt;
  });
  const progress = await createBookRestoreUploadService({ db }).getBookRestore(uid, {
    restoreId: id,
  });
  return { progress, request, receipt };
}
export async function readyLegacyPrefix(
  factory,
  db,
  uid,
  id,
  { data = prefixData(), pages = 1, prior = false } = {},
) {
  const { progress } = await uploadArchiveRestore(factory(), uid, id, prefixRecords(data, prior));
  let p = await finishRestoreStructure(
    factory,
    uid,
    id,
    await finishLegacyRestore(factory, uid, id, progress),
  );
  let unit = 0;
  while (true) {
    const item = await (
      await reader(db, uid, id, p)
    ).readMappedItem(p.preparation.loreItemIndex ?? p.preparation.itemIndex);
    if (item.record.kind === 'book-lore' && item.value.id === prefixEntity(p)) break;
    p = (await factory().advanceBookRestoreLore(uid, mutation(id, p, id + '-prior-' + unit++)))
      .progress;
    if (unit > 10000) throw new Error('Prefix target not reached');
  }
  const receipts = [];
  for (let index = 0; index < pages; index++) {
    const old = await writeLegacyPrefixPage(db, uid, id, p, id + '-old-page-' + index);
    p = old.progress;
    receipts.push(old);
  }
  return { progress: p, receipts, data };
}
export { mutation };
