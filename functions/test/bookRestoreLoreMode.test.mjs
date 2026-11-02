import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readyLoreMode,
  advanceLoreMode,
  removeMode,
  loreHeads,
  uid,
} from './helpers/bookRestoreLoreModeFixture.mjs';
import { legacyMutation } from './helpers/bookLegacyRestoreFixture.mjs';
import { digest } from '../src/sceneContracts.mjs';

for (const indexed of [false, true])
  test(
    'original lore mode stays pinned when later service configuration becomes ' + !indexed,
    async () => {
      const f = await readyLoreMode(indexed),
        original = f.records.get(f.root),
        replay = await f.factory(!indexed).startBookRestore(uid, {
          operationId: f.id,
          source: original.source,
          reviewHash: original.reviewHash,
        });
      assert.equal(replay.progress.checkpoint, f.p.checkpoint);
      assert.equal(f.records.get(f.root).loreMode, indexed ? 'indexed-v2' : 'inline-v1');
      assert.equal(f.records.get(f.reservation).loreMode, f.records.get(f.root).loreMode);
      await advanceLoreMode(f, !indexed);
      const heads = loreHeads(f);
      assert.equal(heads.length, 2);
      assert.ok(
        heads.every(([, value]) => (value.payloadStorage?.schemaVersion === 2) === indexed),
      );
      assert.equal(f.records.has('books/' + f.p.bookId), false);
    },
  );

test('lore mode is not client input and job/reservation mismatch or mutation cannot be adopted', async () => {
  const f = await readyLoreMode(true),
    job = structuredClone(f.records.get(f.root)),
    reservation = structuredClone(f.records.get(f.reservation)),
    get = () => f.factory(false).getBookRestore(uid, { restoreId: f.id, jobToken: f.p.jobToken });
  await assert.rejects(
    f.factory(false).startBookRestore(uid, {
      operationId: f.id,
      source: job.source,
      reviewHash: job.reviewHash,
      loreMode: 'inline-v1',
    }),
    { code: 'invalid-argument' },
  );
  for (const value of ['inline-v1', 'future-mode', undefined]) {
    const changed = { ...job };
    if (value === undefined) delete changed.loreMode;
    else changed.loreMode = value;
    f.records.set(f.root, changed);
    await assert.rejects(get(), { code: 'failed-precondition' });
  }
  f.records.set(f.root, job);
  f.records.set(f.reservation, { ...reservation, loreMode: 'inline-v1' });
  await assert.rejects(get(), { code: 'failed-precondition' });
  f.records.set(f.reservation, reservation);
  await f.db.runTransaction((tx) => tx.update(f.db.doc(f.reservation), { loreMode: 'indexed-v2' }));
  await assert.rejects(get(), { code: 'failed-precondition' });
});

test('an unpinned legacy job without prepared evidence stays legacy even with new configuration enabled', async () => {
  const f = await readyLoreMode(false);
  removeMode(f);
  await advanceLoreMode(f, true);
  assert.ok(loreHeads(f).every(([, value]) => value.payloadStorage?.schemaVersion !== 2));
  assert.equal(Object.hasOwn(f.records.get(f.root), 'loreMode'), false);
});

test('an unpinned legacy payload prefix stays legacy without changing its bytes or cursor interpretation', async () => {
  const f = await readyLoreMode(false, {
    data: { name: 'Own', category: 'concept', details: 'x'.repeat(1100000) },
  });
  await advanceLoreMode(
    f,
    false,
    (p) => p.preparation.lorePayload !== null && p.preparation.lorePayload !== undefined,
  );
  assert.notEqual(f.p.preparation.lorePayload.streamed, true);
  removeMode(f);
  await advanceLoreMode(f, true);
  assert.ok(loreHeads(f).every(([, value]) => value.payloadStorage?.schemaVersion !== 2));
});

for (const boundary of ['prefix', 'between'])
  test(
    'an unpinned streamed job resumes across ' + boundary + ' with original certified v2 evidence',
    async () => {
      const f = await readyLoreMode(true);
      await advanceLoreMode(f, true, (p) =>
        boundary === 'prefix'
          ? p.preparation.lorePayload?.streamed === true
          : p.preparation.loreCount === 1 && p.preparation.lorePayload === null,
      );
      removeMode(f);
      await advanceLoreMode(f, false);
      assert.equal(loreHeads(f).length, 2);
      assert.ok(loreHeads(f).every(([, value]) => value.payloadStorage?.schemaVersion === 2));
      const metadataQueries = f.reads.filter(
        (q) => q.collectionPath === 'books/' + f.p.bookId + '/lore',
      );
      assert.ok(metadataQueries.length > 0);
      assert.ok(metadataQueries.every((q) => q.maximum === 1));
    },
  );

test('legacy v2 metadata without the original artifact journal never authorizes indexed continuation', async () => {
  const f = await readyLoreMode(true);
  await advanceLoreMode(
    f,
    true,
    (p) => p.preparation.loreCount === 1 && p.preparation.lorePayload === null,
  );
  removeMode(f);
  const id = loreHeads(f)[0][0].split('/').at(-1),
    journal = f.root + '/materializationArtifacts/' + digest(['lore', id]);
  assert.equal(f.records.has(journal), true);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(journal)));
  const before = structuredClone(f.records);
  await assert.rejects(
    f.factory(true).advanceBookRestoreLore(uid, legacyMutation(f.id, f.p, f.id + '-foreign-mode')),
    { code: 'failed-precondition' },
  );
  assert.deepEqual(f.records, before);
});
