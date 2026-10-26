import { randomUUID } from 'node:crypto';
import { adventureImportDb } from './adventureImportDb.mjs';
import { createBookRestoreUploadService } from '../../src/bookRestoreUpload.mjs';
import { uploadArchiveRestore } from './bookRestoreContentFixture.mjs';
import { loreOnlyRecords, loreRecords } from './bookRestorePreparedLoreFixture.mjs';
import { finishLegacyRestore, legacyMutation } from './bookLegacyRestoreFixture.mjs';
import { finishRestoreStructure } from './bookRestoreStructureFixture.mjs';
export const uid = 'author';
export async function readyLoreMode(indexed = true, options = {}) {
  const f = options.db ? { db: options.db } : adventureImportDb({ nativeUpdates: true }),
    id = options.id ?? randomUUID(),
    factory = (flag = indexed) =>
      createBookRestoreUploadService({ db: f.db, now: () => 1000, indexedLoreBodies: flag }),
    data = options.data ?? {
      name: 'Own lore',
      category: 'character',
      details: 'Own 🌙',
      aliases: [],
      relations: [],
    },
    records = loreOnlyRecords([...loreRecords(data, 'first'), ...loreRecords(data, 'second')]),
    uploaded = await uploadArchiveRestore(factory(), uid, id, records);
  const p = await finishRestoreStructure(
    () => factory(),
    uid,
    id,
    await finishLegacyRestore(() => factory(), uid, id, uploaded.progress),
  );
  return {
    ...f,
    id,
    factory,
    p,
    root: 'users/' + uid + '/bookRestores/' + id,
    reservation: 'bookRestoreReservations/' + p.bookId,
  };
}
export async function advanceLoreMode(f, flag, until = (p) => p.preparation.phase === 'scenes') {
  for (let i = 0; i < 10000; i++) {
    const request = legacyMutation(f.id, f.p, f.id + '-mode-' + f.p.checkpoint);
    f.p = (await f.factory(flag).advanceBookRestoreLore(uid, request)).progress;
    if (until(f.p)) return f.p;
  }
  throw Error('Lore mode fixture budget exhausted');
}
export function removeMode(f) {
  for (const path of [f.root, f.reservation]) {
    const value = { ...f.records.get(path) };
    delete value.loreMode;
    f.records.set(path, value);
  }
}
export const loreHeads = (f) =>
  [...f.records].filter(([path]) => path.startsWith('books/' + f.p.bookId + '/lore/'));
