import { readyEditorialActivation, activateEditorial, uid } from './bookRestoreEditorialActivationFixture.mjs';
export { uid };
export async function readyEditorialHistory(options) {
  const f = await readyEditorialActivation(options);
  f.activation = await activateEditorial(f); f.p = f.activation.progress;
  f.history = () => f.factory();
  return f;
}
export async function finishEditorialSourceCleanup(f) {
  await f.factory().finalizeBookRestoreMedia(uid, { restoreId: f.id, jobToken: f.p.jobToken,
    operationId: f.id + '-history-media-none' });
  let progress = (await f.factory().getBookRestoreArchiveCleanup(uid,
    { restoreId: f.id, jobToken: f.p.jobToken })).progress;
  for (let unit = 0; unit < 10000 && progress.phase !== 'done'; unit++)
    progress = (await f.factory().advanceBookRestoreArchiveCleanup(uid, { restoreId: f.id,
      jobToken: f.p.jobToken, operationId: f.id + '-history-source-cleanup-' + unit,
      expectedRevision: progress.revision })).progress;
  if (progress.phase !== 'done') throw Error('Editorial source cleanup did not finish');
  return progress;
}
export const historyInput = f => ({ bookId: f.p.bookId, after: null, limit: 50 });
