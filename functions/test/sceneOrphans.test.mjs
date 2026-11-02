import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatFixture } from './helpers/editorChatFixture.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { createScenesService } from '../src/scenes.mjs';
const uid = 'author',
  missing = 'missing-native-part-0001';
async function fixture() {
  const f = await editorChatFixture('adventure', false, adventureImportDb({ nativeUpdates: true }));
  await f.db.runTransaction((tx) => {
    tx.update(f.db.doc(f.path + '/scenes/' + f.resource.id), { parentId: missing });
    tx.update(f.db.doc(f.path + '/sceneControls/unassigned'), { sceneCount: 0, wordCount: 0 });
  });
  const api = createScenesService({ db: f.db, now: () => 7000 });
  return {
    ...f,
    api,
    request: {
      target: f.target,
      sceneId: f.resource.id,
      expectedRevision: 1,
      expectedMissingParentId: missing,
      operationId: 'orphan-recovery-test-0001',
    },
  };
}
test('orphan listing is readonly and recovery preserves body, previous parent and native counters exactly once', async () => {
  const f = await fixture(),
    body = structuredClone(f.records.get(f.path + '/scenes/' + f.resource.id + '/body/current')),
    before = structuredClone(f.records);
  const page = await f.api.listOrphanScenes(uid, { target: f.target, limit: 1 });
  assert.equal(page.items[0].id, f.resource.id);
  assert.deepEqual(f.records, before);
  const recovered = await f.api.recoverOrphanScene(uid, f.request);
  assert.equal(recovered.scene.parentId, null);
  assert.equal(recovered.scene.formerParentId, missing);
  assert.equal(f.records.has(f.path + '/parts/' + missing), false);
  assert.deepEqual(f.records.get(f.path + '/scenes/' + f.resource.id + '/body/current'), body);
  const after = structuredClone(f.records);
  assert.deepEqual(await f.api.recoverOrphanScene(uid, f.request), recovered);
  assert.deepEqual(f.records, after);
  assert.equal((await f.api.listOrphanScenes(uid, { target: f.target })).items.length, 0);
  assert.equal(f.records.get(f.path + '/sceneControls/unassigned').sceneCount, 1);
});
for (const mode of ['other', 'revision', 'parent', 'recreated', 'book', 'extra'])
  test('recovery refuses ' + mode + ' without changing any native record', async () => {
    const f = await fixture();
    let actor = uid;
    const request = { ...f.request };
    if (mode === 'other') actor = 'other';
    if (mode === 'revision') request.expectedRevision++;
    if (mode === 'parent') request.expectedMissingParentId = 'another-missing-part-0001';
    if (mode === 'book') request.target = { kind: 'book', id: f.target.id };
    if (mode === 'extra') request.ownerId = uid;
    if (mode === 'recreated')
      await f.db.runTransaction((tx) =>
        tx.create(f.db.doc(f.path + '/parts/' + missing), { title: 'Recreated' }),
      );
    const before = structuredClone(f.records);
    await assert.rejects(() => f.api.recoverOrphanScene(actor, request));
    assert.deepEqual(f.records, before);
  });
test('bounded scan may return an empty page and advances by scanned head, with account-bound and revision-bound cursors', async () => {
  const f = await fixture();
  const first = await f.scenes.createScene(uid, {
    target: f.target,
    operationId: 'aaa-unassigned-0001',
    title: 'Unassigned',
  });
  const page = await f.api.listOrphanScenes(uid, { target: f.target, limit: 1 });
  assert.deepEqual(page.items, []);
  assert.ok(page.nextCursor);
  assert.equal(
    (await f.api.listOrphanScenes(uid, { target: f.target, limit: 1, cursor: page.nextCursor }))
      .items[0].id,
    f.resource.id,
  );
  await assert.rejects(() =>
    f.api.listOrphanScenes('other', { target: f.target, cursor: page.nextCursor }),
  );
  await f.scenes.updateScene(uid, {
    target: f.target,
    sceneId: first.scene.id,
    operationId: 'orphan-cursor-invalid-0001',
    expectedRevision: first.scene.revision,
    patch: { title: 'Changed' },
  });
  await assert.rejects(() =>
    f.api.listOrphanScenes(uid, { target: f.target, cursor: page.nextCursor }),
  );
});
test('legacy part source is visible without changing composed mode or manuscript', async () => {
  const f = await fixture(),
    part = await f.scenes.createSceneGroup(uid, {
      target: f.target,
      operationId: 'orphan-legacy-part-0001',
      title: 'Part',
    });
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(f.path + '/parts/' + part.id), {
      content: '<p>Texto anterior</p>',
      contentMode: 'legacy',
    }),
  );
  const before = structuredClone(f.records),
    view = await f.api.getSceneGroup(uid, { target: f.target, parentId: part.id });
  assert.equal(view.group.contentMode, 'scenes');
  assert.equal(view.legacy.content, '<p>Texto anterior</p>');
  assert.deepEqual(f.records, before);
});
