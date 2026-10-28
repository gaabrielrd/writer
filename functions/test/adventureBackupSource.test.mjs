import test from 'node:test';
import {
  adventureReservationPath,
  adventureDeletionReservationFields,
} from '../src/adventureDeletionGuard.mjs';
import assert from 'node:assert/strict';
import { createStudioService } from '../src/studio.mjs';
import { createAdventureBackupSourceService } from '../src/adventureBackupSource.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';

const uid = 'author',
  id = 'adventure-backup-source-0001',
  path = 'adventures/' + id;
async function fixture() {
  const f = adventureImportDb({ nativeUpdates: true }),
    studio = createStudioService({ db: f.db, now: () => 1000 });
  await studio.createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_NAME 🌙',
    synopsis: 'PRIVATE_PROSE',
  });
  const api = createAdventureBackupSourceService(f),
    read = (extra = {}, actor = uid) =>
      api.getAdventureBackupSource(actor, { adventureId: id, ...extra });
  f.metadataReads.length = 0;
  return { ...f, api, read };
}
test('actual Studio project has a repeatable metadata-only anchor with no content, universe reads or writes', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    first = await f.read(),
    again = await f.read({ expectedSourceToken: first.sourceToken });
  assert.deepEqual(again, first);
  assert.deepEqual(Object.keys(first).sort(), ['adventureId', 'schemaVersion', 'sourceToken']);
  assert.equal(first.adventureId, id);
  assert.equal(first.schemaVersion, 1);
  assert.match(first.sourceToken, /^[a-f0-9]{64}$/);
  assert.equal(JSON.stringify(first).includes('PRIVATE_'), false);
  assert.deepEqual([...f.records], before);
  assert.deepEqual(
    f.metadataReads,
    [0, 1].flatMap(() => [
      { path: adventureReservationPath(id), fields: [...adventureDeletionReservationFields] },
      { path, fields: ['ownerId', 'schemaVersion', 'deleting'] },
      { path: path + '/workProgress/current', fields: ['schemaVersion'] },
    ]),
  );
  assert.ok(f.commits.slice(1).every((writes) => writes.length === 0));
});
for (const actor of [null, '', 'other'])
  test('anchor never grants access for actor ' + String(actor), async () => {
    const f = await fixture(),
      before = structuredClone([...f.records]);
    await assert.rejects(f.read({}, actor), { code: actor ? 'not-found' : 'unauthenticated' });
    assert.deepEqual([...f.records], before);
    assert.equal(
      f.metadataReads.some((r) => r.path.includes('workProgress')),
      false,
    );
  });
for (const extra of [
  { ownerId: uid },
  { expectedSourceToken: null },
  { expectedSourceToken: undefined },
  { expectedSourceToken: 'x'.repeat(64) },
])
  test('closed source input rejects ' + JSON.stringify(extra), async () => {
    const f = await fixture();
    await assert.rejects(f.read(extra), { code: 'invalid-argument' });
    assert.deepEqual(f.metadataReads, []);
  });
for (const change of [
  'root-update',
  'root-recreate',
  'control-create',
  'control-update',
  'control-recreate',
  'control-delete',
])
  test('native ' + change + ' invalidates the anchor despite unchanged logical dates', async () => {
    const f = await fixture(),
      controlPath = path + '/workProgress/current';
    if (['control-update', 'control-recreate', 'control-delete'].includes(change))
      await f.db.runTransaction((tx) =>
        tx.create(f.db.doc(controlPath), { schemaVersion: 1, updatedAt: 10 }),
      );
    const first = await f.read(),
      root = structuredClone(f.records.get(path));
    if (change === 'root-recreate' || change === 'control-recreate') {
      const selected = change === 'root-recreate' ? path : controlPath,
        value = structuredClone(f.records.get(selected)),
        born = f.metadata.get(selected).createdAtNanoseconds;
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(selected)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(selected), value));
      assert.notEqual(f.metadata.get(selected).createdAtNanoseconds, born);
    } else
      await f.db.runTransaction((tx) => {
        if (change === 'root-update') tx.update(f.db.doc(path), { title: 'New own title' });
        if (change === 'control-create')
          tx.create(f.db.doc(controlPath), { schemaVersion: 1, updatedAt: 10 });
        if (change === 'control-update') tx.update(f.db.doc(controlPath), { wordGoal: 42 });
        if (change === 'control-delete') tx.delete(f.db.doc(controlPath));
      });
    await assert.rejects(f.read({ expectedSourceToken: first.sourceToken }), {
      code: 'failed-precondition',
      details: { reason: 'adventure-backup-source-changed' },
    });
    assert.notEqual((await f.read()).sourceToken, first.sourceToken);
    assert.equal(f.records.get(path).updatedAt, root.updatedAt);
  });
for (const patch of [null, { deleting: true }, { schemaVersion: 2 }])
  test(
    'missing deleting or future root cannot produce a partial anchor: ' + JSON.stringify(patch),
    async () => {
      const f = await fixture();
      if (patch === null) await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      else await f.db.runTransaction((tx) => tx.update(f.db.doc(path), patch));
      await assert.rejects(f.read(), {
        code: patch?.schemaVersion ? 'failed-precondition' : 'not-found',
      });
      assert.equal(
        f.metadataReads.some((r) => r.path.includes('workProgress')),
        false,
      );
    },
  );
test('own content anchor does not depend on a linked world or copy its content', async () => {
  const f = await fixture();
  await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { universeId: 'unavailable-world' }));
  const a = await f.read();
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('universes/unavailable-world'), {
      authorId: 'other',
      deleting: true,
      name: 'GLOBAL_PRIVATE',
    }),
  );
  assert.deepEqual(await f.read({ expectedSourceToken: a.sourceToken }), a);
  assert.ok(
    f.metadataReads.every(
      (r) => r.path.startsWith(path) || r.path === adventureReservationPath(id),
    ),
  );
  assert.equal(JSON.stringify(a).includes('GLOBAL_PRIVATE'), false);
});
for (const metadata of [
  { createdAt: -1000 },
  { createdAtNanoseconds: 1000000000 },
  { updatedAt: NaN },
])
  test('malformed native timestamp fails closed: ' + JSON.stringify(metadata), async () => {
    const f = await fixture();
    f.metadata.set(path, { ...f.metadata.get(path), ...metadata });
    await assert.rejects(f.read(), {
      code: 'failed-precondition',
      details: { reason: 'adventure-backup-source-inconsistent' },
    });
  });
test('scene-only changes need later resource proofs and are not falsely represented by this root anchor', async () => {
  const f = await fixture(),
    a = await f.read();
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(path + '/scenes/scene'), { ownerId: uid, personaRevision: 1 }),
  );
  assert.deepEqual(await f.read({ expectedSourceToken: a.sourceToken }), a);
  assert.equal(
    f.metadataReads.some((r) => r.path.includes('/scenes/')),
    false,
  );
});

test('native root birth independently binds the anchor, even when a double holds updateTime constant', async () => {
  const f = await fixture(),
    a = await f.read(),
    data = structuredClone(f.records.get(path)),
    previous = { ...f.metadata.get(path) };
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), data));
  f.metadata.set(path, {
    ...f.metadata.get(path),
    updatedAt: previous.updatedAt,
    updatedAtNanoseconds: previous.updatedAtNanoseconds,
  });
  await assert.rejects(f.read({ expectedSourceToken: a.sourceToken }), {
    code: 'failed-precondition',
    details: { reason: 'adventure-backup-source-changed' },
  });
});
test('another owned adventure cannot reuse an anchor from a different project', async () => {
  const f = await fixture(),
    a = await f.read(),
    otherId = id + '-other';
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('adventures/' + otherId), { ...f.records.get(path), id: otherId }),
  );
  await assert.rejects(
    f.api.getAdventureBackupSource(uid, {
      adventureId: otherId,
      expectedSourceToken: a.sourceToken,
    }),
    {
      code: 'failed-precondition',
      details: { reason: 'adventure-backup-source-changed' },
    },
  );
});
test('a present future progress control is refused rather than interpreted as absence', async () => {
  const f = await fixture();
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(path + '/workProgress/current'), { schemaVersion: 2 }),
  );
  await assert.rejects(f.read(), { code: 'failed-precondition' });
});
test('a port without field masks cannot fall back to downloading root content', async () => {
  let fullRead = false;
  const api = createAdventureBackupSourceService({
    db: {
      doc: (path) => ({ path }),
      runTransaction: (operation) =>
        operation({
          get() {
            fullRead = true;
            throw Error('full read');
          },
        }),
    },
  });
  await assert.rejects(api.getAdventureBackupSource(uid, { adventureId: id }), {
    code: 'failed-precondition',
  });
  assert.equal(fullRead, false);
});

test('the original source contract retains its exact version-one golden token', async () => {
  const f = await fixture();
  assert.equal(
    (await f.read()).sourceToken,
    'c41d18f83b27fdecddd06b3b2f10dd77f1135a99339aa66ee8736e6d3469628e',
  );
});
