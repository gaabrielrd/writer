import { adventureImportDb } from './adventureImportDb.mjs';
import { bookLegacyFixture } from './bookLegacyFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  legacyMutation as mutation,
} from './bookLegacyRestoreFixture.mjs';
import { createBookRestoreUploadService } from '../../src/bookRestoreUpload.mjs';
import { finishRestoreStructure } from './bookRestoreStructureFixture.mjs';
import { finishRestoreLore } from './bookRestoreLoreFixture.mjs';
import { finishRestoreResources } from './bookRestoreResourcesFixture.mjs';
import { finishRestoreCounts } from './bookRestoreCountsFixture.mjs';
import { finishRestorePersonas } from './bookRestorePersonasFixture.mjs';
import { finishRestoreHistory } from './bookRestoreHistoryFixture.mjs';
import { finishRestoreDraft } from './bookRestoreDraftFixture.mjs';
import { finishRestoreCover } from './bookRestoreCoverFixture.mjs';
import { finishRestorePersonaLibrary } from './bookRestorePersonaLibraryFixture.mjs';
import { finishRestoreSourceIndexes } from './bookRestoreSourceIndexesFixture.mjs';
import { finishAudit } from './bookRestoreAuditFixture.mjs';
export async function readyLegacyArchive(version) {
  const base = adventureImportDb({ nativeUpdates: true }),
    uid = 'author',
    id = 'archive-legacy-' + version + '-0001',
    factory = () =>
      createBookRestoreUploadService({ db: base.db, now: () => 1000, indexedLoreBodies: true });
  let p = (await uploadLegacyRestore(factory(), uid, id, bookLegacyFixture(version))).progress;
  p = await finishLegacyRestore(factory, uid, id, p);
  for (const finish of [
    finishRestoreStructure,
    finishRestoreLore,
    finishRestoreResources,
    finishRestoreCounts,
    finishRestorePersonas,
  ])
    p = await finish(factory, uid, id, p);
  p = (await factory().advanceBookRestoreUniverse(uid, mutation(id, p, id + '-world'))).progress;
  for (const finish of [finishRestoreHistory, finishRestoreDraft])
    p = await finish(factory, uid, id, p);
  p = (await factory().finalizeBookRestoreDraft(uid, mutation(id, p, id + '-final-draft')))
    .progress;
  p = await finishRestoreCover(factory, uid, id, p);
  p = (await factory().reserveBookRestoreCover(uid, mutation(id, p, id + '-reserve'))).progress;
  p = (await factory().materializeBookRestoreCover(uid, mutation(id, p, id + '-materialize')))
    .progress;
  p = await finishRestorePersonaLibrary(factory, uid, id, p);
  p = await finishRestoreSourceIndexes(factory, uid, id, p);
  const f = { ...base, factory, id, root: 'users/' + uid + '/bookRestores/' + id, p };
  f.p = await finishAudit(f);
  const review = await factory().getBookRestoreActivationReview(uid, {
    restoreId: id,
    jobToken: f.p.jobToken,
  });
  f.request = { ...mutation(id, f.p, id + '-activate'), reviewToken: review.reviewToken };
  f.activation = await factory().activateBookRestore(uid, f.request);
  f.p = f.activation.progress;
  f.mediaRequest = { restoreId: id, jobToken: f.p.jobToken, operationId: id + '-media' };
  f.mediaDone = await factory().finalizeBookRestoreMedia(uid, f.mediaRequest);
  f.archiveProgress = (
    await factory().getBookRestoreArchiveCleanup(uid, { restoreId: id, jobToken: f.p.jobToken })
  ).progress;
  return f;
}
