import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createAdventureDeletionSourceService } from '../src/adventureDeletionSource.mjs';
import {
  adventureReservationPath,
  adventureDeletionReservationFields,
} from '../src/adventureDeletionGuard.mjs';
const uid = 'author',
  id = 'deletion-native-source-0001';
async function fixture() {
  const f = adventureImportDb({ nativeUpdates: true }),
    studio = createStudioService({ db: f.db, now: () => 1000 });
  await studio.createAdventure(uid, {
    operationId: id,
    title: 'Own title',
    synopsis: 'PRIVATE_SYNOPSIS',
  });
  f.records.get('adventures/' + id).content = 'PRIVATE_ROOT_BODY';
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('adventures/' + id + '/workProgress/current'), {
      schemaVersion: 1,
      privateText: 'PRIVATE_PROGRESS',
    }),
  );
  const api = createAdventureDeletionSourceService({ db: f.db });
  return { ...f, api, read: () => api.getAdventureDeletionSource(uid, { adventureId: id }) };
}
test('deletion confirmation reads only reservation and root/progress metadata without reserving or changing any project', async () => {
  const f = await fixture(),
    before = structuredClone(f.records),
    source = await f.read();
  assert.equal(source.title, 'Own title');
  assert.equal(source.revision, 1);
  assert.equal(source.adventureId, id);
  assert.match(source.adventureToken, /^[a-f0-9]{64}$/);
  assert.match(source.sourceToken, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    Object.keys(source).sort(),
    [
      'schemaVersion',
      'ownerId',
      'adventureId',
      'adventureToken',
      'sourceToken',
      'revision',
      'title',
    ].sort(),
  );
  assert.equal(JSON.stringify(source).includes('PRIVATE_'), false);
  assert.deepEqual(f.records, before);
  assert.deepEqual(await f.read(), source);
  const paths = [
    adventureReservationPath(id),
    'adventures/' + id,
    'adventures/' + id + '/workProgress/current',
  ];
  assert.ok(
    f.metadataReads.every(
      (r) =>
        paths.includes(r.path) &&
        !r.fields.some((k) => ['content', 'synopsis', 'privateText'].includes(k)),
    ),
  );
  assert.ok(
    f.metadataReads.some(
      (r) =>
        r.path === paths[0] &&
        JSON.stringify(r.fields) === JSON.stringify(adventureDeletionReservationFields),
    ),
  );
});
test('native nanosecond updates change the confirmation token even when logical revision, timestamps and text are copied', async () => {
  const f = await fixture(),
    first = await f.read();
  await f.db.runTransaction(async (tx) => {
    const r = f.db.doc('adventures/' + id);
    tx.set(r, (await tx.get(r)).data());
  });
  const root = await f.read();
  assert.equal(root.revision, first.revision);
  assert.equal(root.adventureToken, first.adventureToken);
  assert.notEqual(root.sourceToken, first.sourceToken);
  await f.db.runTransaction(async (tx) => {
    const r = f.db.doc('adventures/' + id + '/workProgress/current');
    tx.set(r, (await tx.get(r)).data());
  });
  const progress = await f.read();
  assert.equal(progress.adventureToken, first.adventureToken);
  assert.notEqual(progress.sourceToken, root.sourceToken);
});
test('recreated root and removed progress are distinct sources rather than equivalent copied content', async () => {
  const f = await fixture(),
    first = await f.read(),
    old = structuredClone(f.records.get('adventures/' + id));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc('adventures/' + id)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc('adventures/' + id), old));
  const copied = await f.read();
  assert.notEqual(copied.adventureToken, first.adventureToken);
  assert.notEqual(copied.sourceToken, first.sourceToken);
  await f.db.runTransaction((tx) =>
    tx.delete(f.db.doc('adventures/' + id + '/workProgress/current')),
  );
  assert.notEqual((await f.read()).sourceToken, copied.sourceToken);
});
test('absence, foreign owner and deletion do not expose title or identity', async () => {
  const f = await fixture();
  assert.equal(await f.api.getAdventureDeletionSource('other', { adventureId: id }), null);
  assert.equal(
    await f.api.getAdventureDeletionSource(uid, { adventureId: 'absent-deletion-source-0001' }),
    null,
  );
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc(adventureReservationPath(id)), {
      schemaVersion: 1,
      ownerId: uid,
      adventureId: id,
      adventureToken: 'a'.repeat(64),
      deletionId: 'own-deletion-source-0001',
      state: 'deleting',
      createdAt: 1000,
      updatedAt: 1000,
    }),
  );
  assert.equal(await f.read(), null);
  assert.equal(await f.api.getAdventureDeletionSource('other', { adventureId: id }), null);
});
for (const patch of [
  { schemaVersion: 2 },
  { revision: 0 },
  { revision: undefined },
  { title: '' },
  { title: '\ud800' },
])
  test(
    'inconsistent owned root cannot become a deletion confirmation ' + JSON.stringify(patch),
    async () => {
      const f = await fixture();
      Object.assign(f.records.get('adventures/' + id), patch);
      await assert.rejects(
        () => f.read(),
        (e) =>
          e.code === 'failed-precondition' &&
          e.details?.reason === 'adventure-deletion-source-inconsistent',
      );
    },
  );
test('missing, backwards and invalid native metadata fail closed without substituting logical timestamps', async () => {
  const f = await fixture();
  for (const override of [
    { createTime: null },
    { updateTime: { seconds: 0, nanoseconds: 0 } },
    { updateTime: { seconds: 1, nanoseconds: 1e9 } },
  ]) {
    const db = {
      ...f.db,
      runTransaction: (fn) =>
        f.db.runTransaction((tx) =>
          fn({
            ...tx,
            getAll: async (...args) => {
              const rows = await tx.getAll(...args);
              return args[0].path === 'adventures/' + id ? [{ ...rows[0], ...override }] : rows;
            },
          }),
        ),
    };
    await assert.rejects(
      () =>
        createAdventureDeletionSourceService({ db }).getAdventureDeletionSource(uid, {
          adventureId: id,
        }),
      { code: 'failed-precondition' },
    );
  }
});
test('source accepts only an authenticated account and the exact source request', async () => {
  const f = await fixture();
  await assert.rejects(() => f.api.getAdventureDeletionSource(null, { adventureId: id }), {
    code: 'unauthenticated',
  });
  for (const request of [
    { adventureId: id, ownerId: uid },
    { adventureId: id, confirm: true },
    { adventureId: '../bad' },
    { adventureId: id, sourceToken: 'a'.repeat(64) },
  ])
    await assert.rejects(() => f.api.getAdventureDeletionSource(uid, request), {
      code: 'invalid-argument',
    });
});
