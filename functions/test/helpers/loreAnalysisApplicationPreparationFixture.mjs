import { analysisApplicationFixture } from './loreAnalysisApplicationFixture.mjs';
export async function applicationPreparationFixture(db, options = {}) {
  const f = await analysisApplicationFixture(db, options),
    initial = await f.reserve();
  return {
    ...f,
    initial,
    step: (p, operationId = 'prepare-' + p.revision) =>
      f.service.advanceLoreAnalysisApplication(f.uid, {
        ...f.input,
        jobToken: p.jobToken,
        expectedRevision: p.revision,
        operationId,
      }),
    cleanupStep: (p, operationId = 'cleanup-' + p.revision) =>
      f.service.advanceLoreAnalysisApplicationCleanup(f.uid, {
        ...f.control,
        jobToken: p.jobToken,
        expectedRevision: p.revision,
        operationId,
      }),
  };
}
export async function prepareApplication(f, p = f.initial, maximum = 20000) {
  let count = 0;
  while (p.phase === 'preparing' && count++ < maximum) p = (await f.step(p)).progress;
  if (p.phase !== 'ready') throw Error('Application did not finish preparation');
  return p;
}
export async function cleanupApplication(f, p = null, maximum = 20000) {
  p ??= await f.cancel();
  let count = 0;
  while (p.phase === 'cancelling' && count++ < maximum) p = (await f.cleanupStep(p)).progress;
  if (p.phase !== 'cancelled') throw Error('Application did not finish cleanup');
  return p;
}
