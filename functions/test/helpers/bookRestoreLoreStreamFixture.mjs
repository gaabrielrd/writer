import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../../src/bookRestoreUpload.mjs';
import {
  readBookLoreLogical,
  createBookLoreLogicalBudget,
} from '../../src/bookLoreLogicalRead.mjs';
import { openBookLoreRecord } from '../../src/bookLoreStorageRead.mjs';
import { createBookRestoreRemapper } from '../../src/bookRestoreRemap.mjs';
import { adventureImportDb } from './adventureImportDb.mjs';
import { indexedLoreArchive } from './bookLoreContentFixture.mjs';
import { uploadArchiveRestore } from './bookRestoreContentFixture.mjs';
import { finishLegacyRestore, legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
import { finishRestoreStructure } from './bookRestoreStructureFixture.mjs';
export const uid = 'author',
  id = 'restore-lore-stream-0001';
export async function ready(data, { db: supplied = null } = {}) {
  const f = supplied ? { db: supplied } : adventureImportDb({ nativeUpdates: true }),
    factory = () =>
      createBookRestoreUploadService({ db: f.db, now: () => 1000, indexedLoreBodies: true }),
    { progress } = await uploadArchiveRestore(factory(), uid, id, indexedLoreArchive(data)),
    p = await finishRestoreStructure(
      factory,
      uid,
      id,
      await finishLegacyRestore(factory, uid, id, progress),
    ),
    mapper = createBookRestoreRemapper({
      schemaVersion: 1,
      jobToken: p.jobToken,
      sourceBookId: 'book',
      bookId: p.bookId,
    });
  return { ...f, factory, mapper, p };
}
export async function finish(f, initial = f.p) {
  let p = initial;
  for (let i = 0; i < 10000; i++) {
    p = (await f.factory().advanceBookRestoreLore(uid, mutation(id, p, id + '-advance-' + i)))
      .progress;
    if (f.records) assert.equal(f.records.has('books/' + p.bookId), false);
    if (p.preparation.phase === 'scenes') return p;
  }
  throw Error('Generation did not finish');
}
/** Explicit private prepared-read harness. Does not create or activate a project root. */
export async function logical(f, p) {
  await f.factory().getBookRestore(uid, { restoreId: id, jobToken: p.jobToken });
  const entityId = f.mapper.identity('lore', 'entity');
  return f.db.runTransaction(async (tx) => {
    const c = { db: f.db, uid, bookId: p.bookId, path: 'books/' + p.bookId },
      snapshot = await tx.get(f.db.doc(c.path + '/lore/' + entityId)),
      opened = await openBookLoreRecord(tx, c, snapshot),
      value = await readBookLoreLogical(
        tx,
        c,
        snapshot,
        createBookLoreLogicalBudget({
          bytes: 64 * 1024 * 1024,
          parts: 2048,
          pages: 64,
        }),
      );
    return { opened, data: value.data, native: snapshot.data() };
  });
}
