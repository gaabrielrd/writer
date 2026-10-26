import test from 'node:test';
import assert from 'node:assert/strict';
import { createUniverseService } from '../src/universes.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createAdventureBackupSourceService } from '../src/adventureBackupSource.mjs';
import { createAdventureBackupUniverseService } from '../src/adventureBackupUniverseRead.mjs';
import { validatePortableUniverseOrigin } from '../src/portableUniverseOrigin.mjs';
import { validateBookBackupUniverseOrigin } from '../src/bookBackupUniverse.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';

const uid = 'author',
  id = 'adventure-universe-backup-0001',
  worldId = 'universe-origin-backup-0001',
  path = 'adventures/' + id,
  worldPath = 'universes/' + worldId;
async function fixture(link = true) {
  const f = adventureImportDb({ nativeUpdates: true });
  await createUniverseService({ db: f.db, now: () => 1000 }).createUniverse(uid, {
    creationId: worldId,
    name: 'DO_NOT_COPY_WORLD_NAME',
    description: 'DO_NOT_COPY_GLOBAL_PROSE',
  });
  await createStudioService({ db: f.db, now: () => 1100 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ADVENTURE',
    ...(link ? { universeId: worldId } : {}),
  });
  const pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  return { ...f, pin, api: createAdventureBackupUniverseService(f) };
}
const input = (f, extra = {}) => ({ adventureId: id, sourceToken: f.pin.sourceToken, ...extra });
const get = (f, extra = {}, actor = uid) =>
  f.api.getAdventureBackupUniverse(actor, input(f, extra));
const update = (f, p, patch) => f.db.runTransaction((tx) => tx.update(f.db.doc(p), patch));

test('real universe and Studio producers yield only neutral metadata origin without prose or writes', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    start = f.commits.length;
  f.reads.length = 0;
  f.metadataReads.length = 0;
  const a = await get(f),
    b = await get(f, { expectedUniverseToken: a.universeToken });
  assert.deepEqual(a, b);
  assert.equal(a.origin.kind, 'reference');
  assert.equal(a.origin.id, worldId);
  assert.ok(a.origin.created.seconds >= 0);
  assert.equal(JSON.stringify(a).includes('DO_NOT_COPY'), false);
  assert.ok(
    f.metadataReads.every((r) =>
      r.fields.every((k) => !['name', 'description', 'content', 'details'].includes(k)),
    ),
  );
  assert.equal(f.reads.length, 0);
  assert.ok(
    f.metadataReads.every((r) => !r.path.includes('/lore/') && !r.path.startsWith('users/')),
  );
  assert.deepEqual([...f.records], before);
  assert.ok(f.commits.slice(start).every((w) => w.length === 0));
});

for (const link of [false, null])
  test('absent/null universe binding remains none: ' + link, async () => {
    const f = await fixture(false);
    if (link === null) {
      await update(f, path, { universeId: null });
      f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
        adventureId: id,
      });
    }
    f.metadataReads.length = 0;
    assert.deepEqual((await get(f)).origin, { kind: 'none' });
    assert.ok(f.metadataReads.every((r) => r.path !== worldPath));
  });

for (const scenario of ['missing', 'foreign', 'deleting'])
  test(
    'unavailable universe preserves own content origin without exposing the reason: ' + scenario,
    async () => {
      const f = await fixture(),
        previous = await get(f);
      if (scenario === 'missing') await f.db.runTransaction((tx) => tx.delete(f.db.doc(worldPath)));
      else
        await update(
          f,
          worldPath,
          scenario === 'foreign' ? { authorId: 'other' } : { deleting: true },
        );
      const current = await get(f);
      assert.deepEqual(current.origin, { kind: 'unavailable', id: worldId });
      assert.equal(Object.hasOwn(current.origin, 'created'), false);
      await assert.rejects(get(f, { expectedUniverseToken: previous.universeToken }), {
        code: 'failed-precondition',
      });
    },
  );

for (const mode of ['change', 'recreate'])
  test(
    'native universe ' + mode + ' invalidates token while adventure source stays unchanged',
    async () => {
      const f = await fixture(),
        a = await get(f),
        record = structuredClone(f.records.get(worldPath));
      if (mode === 'change')
        await update(f, worldPath, { description: 'Changed but not exported' });
      else {
        await f.db.runTransaction((tx) => tx.delete(f.db.doc(worldPath)));
        await f.db.runTransaction((tx) => tx.create(f.db.doc(worldPath), record));
      }
      assert.equal(
        (
          await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
            adventureId: id,
          })
        ).sourceToken,
        f.pin.sourceToken,
      );
      await assert.rejects(get(f, { expectedUniverseToken: a.universeToken }), {
        code: 'failed-precondition',
      });
      const b = await get(f);
      assert.notEqual(b.universeToken, a.universeToken);
      if (mode === 'recreate') assert.notDeepEqual(a.origin.created, b.origin.created);
    },
  );

for (const actor of [null, 'other'])
  test('origin reauthorizes account ' + actor, async () => {
    const f = await fixture();
    await assert.rejects(get(f, {}, actor), { code: actor ? 'not-found' : 'unauthenticated' });
  });

for (const value of ['', '../world', 3, 'x'.repeat(129)])
  test('malformed stored universe ID refuses lookup ' + JSON.stringify(value), async () => {
    const f = await fixture();
    await update(f, path, { universeId: value });
    f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
      adventureId: id,
    });
    f.metadataReads.length = 0;
    await assert.rejects(get(f), { code: 'failed-precondition' });
    assert.ok(f.metadataReads.every((r) => !r.path.startsWith('universes/')));
  });

test('origin request is closed, captures expected token before awaits and failed reads can retry', async () => {
  const f = await fixture(),
    value = await get(f),
    data = input(f, { expectedUniverseToken: value.universeToken }),
    before = structuredClone([...f.records]);
  for (const extra of [{ universeId: worldId }, { expectedUniverseToken: null }, { ownerId: uid }])
    await assert.rejects(get(f, extra), { code: 'invalid-argument' });
  const port = {
    ...f.db,
    runTransaction: (op) =>
      f.db.runTransaction((tx) =>
        op({
          ...tx,
          async getAll(ref, options) {
            await Promise.resolve();
            Object.assign(data, {
              adventureId: 'other',
              sourceToken: '0'.repeat(64),
              expectedUniverseToken: '0'.repeat(64),
            });
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  assert.deepEqual(
    await createAdventureBackupUniverseService({ db: port }).getAdventureBackupUniverse(uid, data),
    value,
  );
  const failing = {
    ...f.db,
    runTransaction: (op) =>
      f.db.runTransaction((tx) =>
        op({
          ...tx,
          getAll(ref, options) {
            if (ref.path === worldPath) throw Error('injected origin failure');
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  await assert.rejects(
    createAdventureBackupUniverseService({ db: failing }).getAdventureBackupUniverse(uid, input(f)),
    /injected origin failure/,
  );
  assert.deepEqual(await get(f), value);
  assert.deepEqual([...f.records], before);
});

test('neutral validator keeps book alias and exact payload for all three origin forms', () => {
  for (const value of [
    { kind: 'none' },
    { kind: 'unavailable', id: worldId },
    { kind: 'reference', id: worldId, created: { seconds: 1, nanoseconds: 7 } },
  ]) {
    assert.deepEqual(validatePortableUniverseOrigin(value), value);
    assert.deepEqual(validateBookBackupUniverseOrigin(value), value);
  }
  assert.equal(validatePortableUniverseOrigin, validateBookBackupUniverseOrigin);
});
