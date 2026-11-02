import test from 'node:test';
import assert from 'node:assert/strict';
import { sceneAdventureArchive } from './helpers/adventureRestoreSceneArchiveFixture.mjs';
import {
  transferFixture,
  upload,
  verify,
  cleanup,
  mutation,
} from './helpers/adventureRestoreTransferFixture.mjs';
import { createVerifiedAdventureRestoreContent } from '../src/adventureRestoreContentRead.mjs';
async function ready(options) {
  const f = transferFixture(await sceneAdventureArchive(options));
  let p = await verify(f, await upload(f), 16),
    n = 0;
  while (['bytes-verified', 'validating'].includes(p.state))
    p = (
      await f.api.advanceAdventureRestoreValidation(
        f.uid,
        mutation(p, 'native-check-' + String(n++).padStart(6, '0')),
      )
    ).progress;
  assert.equal(p.state, 'content-verified');
  return { f, p };
}
const req = (p) => mutation(p, 'native-stage-' + String(p.checkpoint).padStart(8, '0'));
async function step(f, p) {
  return (await f.api.advanceAdventureRestoreStructure(f.uid, req(p))).progress;
}
async function scenePoint(f, p) {
  for (let n = 0; n < 100; n++) {
    const reader = await createVerifiedAdventureRestoreContent({
        db: f.db,
        uid: f.uid,
        restoreId: p.restoreId,
        jobToken: p.jobToken,
      }),
      unit = await reader.readItem(p.staging?.itemIndex ?? 0);
    if (unit.value.kind === 'scene') return p;
    p = await step(f, p);
  }
  throw Error('scene not reached');
}
test('native contract scene has exact paired text, archive/audience flags and remains private through complete cleanup', async () => {
  const { f, p } = await ready({ archived: true });
  let end = p;
  while (!end.staging || end.staging.phase === 'structure') end = await step(f, end);
  assert.deepEqual(
    [end.staging.parts, end.staging.scenes, end.staging.blocks, end.staging.artifactCount],
    [0, 1, 0, 5],
  );
  const path = [...f.records.keys()].find(
      (k) =>
        k.startsWith('adventures/' + p.adventureId + '/scenes/') && k.endsWith('/body/current'),
    ),
    head = f.records.get(path.slice(0, -13));
  assert.equal(f.records.get(path).content, '<p>PRIVATE_CORPO 🌙</p>');
  assert.equal(head.archived, true);
  assert.equal(head.mainBlockAudience, 'gm');
  assert.equal(head.revision, 1);
  assert.equal((await cleanup(f, end, 50)).state, 'cancelled');
});
test('semantically valid oversized text fails native compatibility without truncation or partial targets and remains cancellable', async () => {
  const { f, p } = await ready({ content: 'a'.repeat(800001) }),
    point = await scenePoint(f, p);
  await assert.rejects(() => step(f, point), {
    code: 'failed-precondition',
    details: { reason: 'native-compatibility' },
  });
  assert.equal(f.records.get(f.path).checkpoint, point.checkpoint);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('adventures/' + p.adventureId + '/scenes/')),
    false,
  );
  assert.ok(f.records.get(f.path).uploadedBytes > 800001);
  assert.equal((await cleanup(f, point, 50)).state, 'cancelled');
});
test('cancel winning a delayed stage read prevents target/journal writes and allows cleanup', async () => {
  const { f, p } = await ready(),
    run = f.db.runTransaction.bind(f.db);
  let calls = 0,
    cancelled;
  f.db.runTransaction = async (cb) => {
    if (++calls === 2) {
      f.db.runTransaction = run;
      cancelled = (
        await f.api.cancelAdventureRestore(f.uid, mutation(p, 'native-stage-cancel-0001'))
      ).progress;
    }
    return run(cb);
  };
  await assert.rejects(() => step(f, p));
  assert.equal(f.records.has(f.path + '/preparedRoot/current'), false);
  assert.equal((await cleanup(f, cancelled, 50)).state, 'cancelled');
});
test('legacy jobs refuse unjournaled staged definitions instead of deleting or certifying them', async () => {
  const { f, p } = await ready();
  f.records.set(f.path + '/preparedRoot/foreign', { content: 'FOREIGN' });
  await assert.rejects(() => step(f, p));
  await assert.rejects(() => cleanup(f, p, 50));
  assert.equal(f.records.get(f.path + '/preparedRoot/foreign').content, 'FOREIGN');
  assert.equal(f.records.get(f.path).state, 'cancelling');
});

test('corrupt validation or staging metadata is refused with a typed error before echoing private fields', async () => {
  for (const mode of ['summary', 'staging']) {
    const { f, p } = await ready(),
      next = await step(f, p),
      job = f.records.get(f.path);
    if (mode === 'summary') job.validation.summary = null;
    else job.staging.privateText = 'PRIVATE_INJECTED_TEXT';
    await assert.rejects(
      () => f.api.getAdventureRestore(f.uid, { restoreId: p.restoreId, jobToken: p.jobToken }),
      { code: 'failed-precondition' },
    );
    assert.equal(f.records.get(f.path).checkpoint, next.checkpoint);
  }
});
