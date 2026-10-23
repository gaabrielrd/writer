import { draftRestoreFixture } from './bookRestoreDraftFixture.mjs';
import { readyRestoreCover, finishRestoreCover } from './bookRestoreCoverFixture.mjs';
import { legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
export async function readyRestorePersonaLibrary(
  factory,
  uid,
  id,
  records = draftRestoreFixture(),
) {
  const cover = await finishRestoreCover(
      factory,
      uid,
      id,
      await readyRestoreCover(factory, uid, id, records),
    ),
    reserved = (
      await factory().reserveBookRestoreCover(uid, mutation(id, cover, id + '-cover-reserve'))
    ).progress;
  return (
    await factory().materializeBookRestoreCover(
      uid,
      mutation(id, reserved, id + '-cover-materialize'),
    )
  ).progress;
}
export async function finishRestorePersonaLibrary(
  factory,
  uid,
  id,
  progress,
  prefix = id + '-library-',
) {
  let unit = 0;
  while (progress.preparation.phase === 'personas-integrate') {
    if (unit > 10000) throw new Error('Persona library did not finish');
    progress = (
      await factory().advanceBookRestorePersonaLibrary(uid, mutation(id, progress, prefix + unit++))
    ).progress;
  }
  if (progress.preparation.phase !== 'resources-finalize')
    throw new Error('Unexpected persona library phase');
  return progress;
}
