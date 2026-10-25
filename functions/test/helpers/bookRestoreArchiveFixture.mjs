import { readyMedia, finishMedia, uid } from './bookRestoreMediaFixture.mjs';
export { uid };
export async function readyArchive(options = {}) {
  const f = await readyMedia(options);
  f.mediaDone = await finishMedia(f);
  f.archiveProgress = (
    await f.factory().getBookRestoreArchiveCleanup(uid, {
      restoreId: f.id,
      jobToken: f.p.jobToken,
    })
  ).progress;
  return f;
}
export const archiveRequest = (f, p, id) => ({
  restoreId: f.id,
  jobToken: f.p.jobToken,
  operationId: id ?? f.id + '-archive-' + p.revision,
  expectedRevision: p.revision,
});
export const archiveStep = (f, p = f.archiveProgress, id) =>
  f.factory().advanceBookRestoreArchiveCleanup(uid, archiveRequest(f, p, id));
export async function finishArchive(f, start = f.archiveProgress, prefix = f.id + '-clean-') {
  let p = start;
  for (let unit = 0; unit < 10000 && p.phase !== 'done'; unit++)
    p = (await archiveStep(f, p, prefix + unit)).progress;
  if (p.phase !== 'done') throw Error('Archive cleanup did not finish');
  return p;
}
