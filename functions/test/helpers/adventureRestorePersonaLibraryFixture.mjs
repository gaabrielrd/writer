import assert from 'node:assert/strict';
import { profileAdventureArchive } from './adventureRestoreProfileArchiveFixture.mjs';
import { prepareUniverseAdventure } from './adventureRestoreUniverseFixture.mjs';
import { transferFixture, mutation } from './adventureRestoreTransferFixture.mjs';
export const libraryRequest = (p) =>
  mutation(p, 'persona-library-step-' + String(p.checkpoint).padStart(8, '0'));
export async function preparePersonaLibrary(api, uid, options = {}) {
  const bytes = await profileAdventureArchive(options),
    before = await prepareUniverseAdventure(api, uid, { kind: 'none' }, bytes);
  return (await api.advanceAdventureRestoreUniverse(uid, libraryRequest(before))).progress;
}
export async function personaLibraryFixture(options = {}) {
  const f = transferFixture();
  return { f, p: await preparePersonaLibrary(f.api, f.uid, options) };
}
export async function finishPersonaLibrary(f, p) {
  for (let n = 0; p.staging.phase !== 'persona-library-ready'; n++) {
    assert.ok(n < 10000);
    p = (await f.api.advanceAdventureRestorePersonaLibrary(f.uid, libraryRequest(p))).progress;
  }
  return p;
}
