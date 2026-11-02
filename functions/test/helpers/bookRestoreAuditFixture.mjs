import { adventureImportDb } from './adventureImportDb.mjs';
import { createBookRestoreUploadService } from '../../src/bookRestoreUpload.mjs';
import {
  sourceIndexesRecords,
  readyRestoreSourceIndexes,
  finishRestoreSourceIndexes,
} from './bookRestoreSourceIndexesFixture.mjs';
import { loreOnlyRecords, loreRecords } from './bookRestorePreparedLoreFixture.mjs';
import { sourceText } from './bookSceneSourceFixture.mjs';
import { legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
export const uid = 'author';
export function fullAuditRecords() {
  return sourceIndexesRecords({ sources: 2, content: sourceText }).flatMap((r) =>
    r.kind === 'book-lore'
      ? loreRecords({
          name: 'Full',
          category: 'other',
          details: '\ufeff' + 'x'.repeat(600000),
          relations: [],
        })
      : [r],
  );
}
/** Real full preparation through installed pending personas and final source indexes. */
export async function readyAudit({
  db: provided = null,
  id = 'audit-restore-0001',
  records = null,
  indexedLoreBodies = true,
  restoreAssets,
  finishIndexes = true,
} = {}) {
  const f = provided ? { db: provided } : adventureImportDb({ nativeUpdates: true }),
    factory = () =>
      createBookRestoreUploadService({
        db: f.db,
        now: () => 1000,
        indexedLoreBodies,
        restoreAssets,
      });
  let p = await readyRestoreSourceIndexes(
    factory,
    uid,
    id,
    records ?? loreOnlyRecords(loreRecords({ name: 'N', category: 'other' })),
  );
  if (finishIndexes) p = await finishRestoreSourceIndexes(factory, uid, id, p);
  return { ...f, factory, api: factory(), id, root: 'users/' + uid + '/bookRestores/' + id, p };
}
export async function finishAudit(f, start = f.p, prefix = f.id + '-audit-') {
  let p = start;
  for (let unit = 0; unit < 10000; unit++) {
    if (p.preparation.phase === 'activation-ready') return p;
    p = (await f.factory().advanceBookRestoreAudit(uid, mutation(f.id, p, prefix + unit))).progress;
  }
  throw Error('Audit did not finish');
}
