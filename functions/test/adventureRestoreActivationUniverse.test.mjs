import test from 'node:test';
import assert from 'node:assert/strict';
import { transferFixture, mutation } from './helpers/adventureRestoreTransferFixture.mjs';
import { prepareUniverseAdventure } from './helpers/adventureRestoreUniverseFixture.mjs';
import { finishPersonaLibrary } from './helpers/adventureRestorePersonaLibraryFixture.mjs';
import { finishImages } from './helpers/adventureRestoreImageFixture.mjs';
import { finishImageStorage } from './helpers/adventureRestoreImageStorageFixture.mjs';
import { finishCounts } from './helpers/adventureRestoreCountsFixture.mjs';
import { finishAudit } from './helpers/adventureRestoreAuditFixture.mjs';
import { finishImageLibrary } from './helpers/adventureRestoreImageLibraryFixture.mjs';
import { activationRequest } from './helpers/adventureRestoreActivationFixture.mjs';
import { createUniverseService } from '../src/universes.mjs';
import { born } from '../src/adventureRestoreContracts.mjs';
async function ready() {
  const f = transferFixture();
  await createUniverseService({ db: f.db, now: () => 1000 }).createUniverse(f.uid, {
    creationId: 'world',
    name: 'Original universe',
    description: 'Private global lore',
  });
  const origin = {
    kind: 'reference',
    id: 'world',
    created: born(await f.db.doc('universes/world').get()),
  };
  let p = await prepareUniverseAdventure(f.api, f.uid, origin);
  p = (
    await f.api.advanceAdventureRestoreUniverse(f.uid, mutation(p, 'activation-world-step-0001'))
  ).progress;
  p = await finishPersonaLibrary(f, p);
  p = await finishImages(f, p);
  p = await finishImageStorage(f, p);
  p = await finishCounts(f, p);
  p = await finishAudit(f, p);
  p = await finishImageLibrary(f, p);
  return { f, p: await finishAudit(f, p) };
}
test('the real activation commits original universe link and counter with the root once', async () => {
  const { f, p } = await ready(),
    { request, review } = await activationRequest(f, p);
  assert.equal(review.summary.universe.universeId, 'world');
  assert.equal(f.records.get('universes/world').adventureCount, 0);
  const activated = await f.api.activateAdventureRestore(f.uid, request);
  assert.equal(f.records.get('adventures/' + p.adventureId).universeId, 'world');
  assert.equal(f.records.get('universes/world').adventureCount, 1);
  assert.deepEqual(f.records.get('universes/world/adventures/' + p.adventureId), {
    adventureId: p.adventureId,
  });
  assert.deepEqual(await f.api.activateAdventureRestore(f.uid, request), activated);
  assert.equal(f.records.get('universes/world').adventureCount, 1);
  assert.equal(f.commits.at(-2).length, 7);
});
test('revocation or native recreation after review requires a fresh decision and never links a replacement', async () => {
  for (const kind of ['revoked', 'recreated', 'deleted']) {
    const { f, p } = await ready(),
      { request } = await activationRequest(f, p);
    const path = 'universes/world',
      value = f.records.get(path);
    await f.db.runTransaction((tx) =>
      kind === 'revoked'
        ? tx.update(f.db.doc(path), { authorId: 'other' })
        : tx.delete(f.db.doc(path)),
    );
    if (kind === 'recreated') await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
    const before = structuredClone([...f.records]);
    await assert.rejects(() => f.api.activateAdventureRestore(f.uid, request));
    assert.deepEqual([...f.records], before);
    const next = await activationRequest(f, p);
    assert.equal(next.review.summary.universe.observed, 'unavailable');
    assert.equal(next.review.summary.universe.universeId, null);
    const result = await f.api.activateAdventureRestore(f.uid, next.request);
    assert.equal(result.progress.state, 'activated');
    assert.equal(f.records.get('adventures/' + p.adventureId).universeId, null);
    assert.equal(f.records.has(path + '/adventures/' + p.adventureId), false);
    assert.deepEqual(
      [...f.records].filter(([k]) => k.startsWith('universes/')),
      before.filter(([k]) => k.startsWith('universes/')),
    );
  }
});
test('universe effects roll back with every subsequent activation write', async () => {
  const { f, p } = await ready(),
    { request } = await activationRequest(f, p),
    run = f.db.runTransaction;
  for (let failWrite = 1; failWrite <= 7; failWrite++) {
    const before = structuredClone([...f.records]);
    f.db.runTransaction = (cb) =>
      run((tx) => {
        let n = 0;
        return cb(
          new Proxy(tx, {
            get(object, key) {
              if (['create', 'set', 'update'].includes(key))
                return (...args) => {
                  if (++n === failWrite) throw Error('world activation rollback');
                  return object[key](...args);
                };
              return typeof object[key] === 'function' ? object[key].bind(object) : object[key];
            },
          }),
        );
      });
    await assert.rejects(
      () => f.api.activateAdventureRestore(f.uid, request),
      /world activation rollback/,
    );
    assert.deepEqual([...f.records], before);
  }
  f.db.runTransaction = run;
  await f.api.activateAdventureRestore(f.uid, request);
  assert.equal(f.records.get('universes/world').adventureCount, 1);
});
