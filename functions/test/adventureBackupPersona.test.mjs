import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatFixture, uid } from './helpers/editorChatFixture.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';
import { createAdventureBackupSourceService } from '../src/adventureBackupSource.mjs';
import { createAdventureBackupPersonaService } from '../src/adventureBackupPersonaRead.mjs';
import { serializeBookBackupPersona } from '../src/bookBackupPersonas.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import {
  preparePersonaRestoreBatch,
  activatePersonaRestoreBatch,
  personaRestoreProfile,
  personaRestorePaths,
} from './helpers/personaRestoreAvailabilityFixture.mjs';

const legacyId = 'minha-persona-antiga',
  profilePath = 'users/' + uid + '/aiPersonas/' + legacyId;
async function bind(f, sceneId, value, operationId) {
  const current = await f.call({
    action: 'getAdventurePersonaBinding',
    adventureId: f.target.id,
    sceneId,
  });
  return f.mutate({
    action: 'setAdventurePersonaBinding',
    adventureId: f.target.id,
    adventureToken: current.adventureToken,
    sceneId,
    expectedBindingToken: current.bindingToken,
    value,
    operationId,
  });
}
async function fixture(count = 1) {
  const f = await editorChatFixture('adventure', true, adventureImportDb({ nativeUpdates: true })),
    sceneId = f.records.get(f.path + '/sceneBlocks/' + f.resource.id).sceneId,
    custom = {
      ...structuredClone(DEFAULT_PERSONAS[0]),
      id: legacyId,
      instructions: '  PRIVATE_PROFILE 🌙\n  ',
      apiKey: 'FORBIDDEN_KEY',
      provider: 'FORBIDDEN_PROVIDER',
    };
  custom.traits[0].apiKey = 'FORBIDDEN_TRAIT_KEY';
  custom.traits.push({
    id: 'old-trait',
    name: 'Old trait',
    description: 'Old trait',
    low: 'Low',
    high: 'High',
    value: 50,
  });
  await f.db.runTransaction((tx) => tx.create(f.db.doc(profilePath), custom));
  await bind(f, null, { personaId: DEFAULT_PERSONAS[1].id }, 'persona-backup-root-0001');
  await bind(
    f,
    sceneId,
    {
      personaComplement: { personaId: legacyId, overrides: [{ traitId: 'old-trait', value: 33 }] },
    },
    'persona-backup-scene-0001',
  );
  // A later profile edit removes the trait while preserving the scene's old override.
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc(profilePath), { traits: custom.traits.filter((t) => t.id !== 'old-trait') }),
  );
  for (let n = 1; n < count; n++)
    await f.scenes.createScene(uid, {
      target: f.target,
      operationId: 'persona-backup-extra-' + String(n).padStart(4, '0'),
      title: 'PRIVATE_SCENE',
    });
  const pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: f.target.id,
  });
  return { ...f, sceneId, pin, custom, backup: createAdventureBackupPersonaService(f) };
}
const list = (f, scope = 'scene', extra = {}, actor = uid) =>
  f.backup.listAdventureBackupPersonaBindings(actor, {
    adventureId: f.target.id,
    sourceToken: f.pin.sourceToken,
    scope,
    ...extra,
  });
const request = (f, scope, row) => ({
  adventureId: f.target.id,
  sourceToken: f.pin.sourceToken,
  scope,
  id: row.id,
  itemToken: row.itemToken,
  index: 0,
});
async function read(f, scope, row) {
  const r = await f.backup.readAdventureBackupPersona(uid, request(f, scope, row)),
    bytes = Buffer.from(r.chunkBase64, 'base64');
  assert.equal(r.chunkCount, 1);
  assert.equal(bytes.length, r.byteLength);
  assert.equal(digest(bytes.toString()), r.contentHash);
  return JSON.parse(bytes.toString());
}
const update = (f, p, patch) => f.db.runTransaction((tx) => tx.update(f.db.doc(p), patch));
const remove = (f, p) => f.db.runTransaction((tx) => tx.delete(f.db.doc(p)));

test('real root/scene setter preserves legacy IDs and used profiles without copying prose, keys or unrelated library', async () => {
  const f = await fixture(2);
  await update(f, profilePath, { archived: true });
  f.records.set('users/' + uid + '/aiPersonas/custom-unused', {
    ...f.custom,
    id: 'custom-unused',
    instructions: 'UNUSED_SECRET',
  });
  const before = structuredClone([...f.records]),
    start = f.commits.length;
  f.reads.length = 0;
  f.metadataReads.length = 0;
  const roots = await list(f, 'adventure'),
    scenes = await list(f);
  assert.equal(roots.items.length, 1);
  assert.equal(scenes.items.length, 2);
  assert.ok(
    f.reads.every(
      (r) =>
        !r.collectionPath.includes('aiPersonas') &&
        !r.fields.includes('content') &&
        !r.fields.includes('title'),
    ),
  );
  assert.ok(
    f.metadataReads.every(
      (r) => !r.fields.includes('instructions') && !r.fields.includes('content'),
    ),
  );
  const root = await read(f, 'adventure', roots.items[0]),
    scene = await read(
      f,
      'scene',
      scenes.items.find((r) => r.personaId === legacyId),
    );
  assert.equal(root.profile.id, DEFAULT_PERSONAS[1].id);
  assert.equal(scene.profile.id, legacyId);
  assert.equal(scene.bindingId, f.sceneId);
  assert.equal(scene.profile.archived, true);
  assert.equal(scene.profile.instructions, f.custom.instructions);
  assert.equal(JSON.stringify([root, scene]).includes('FORBIDDEN'), false);
  assert.equal(JSON.stringify([root, scene]).includes('UNUSED_SECRET'), false);
  assert.deepEqual(f.records.get(f.path + '/scenes/' + f.sceneId).personaComplement.overrides, [
    { traitId: 'old-trait', value: 33 },
  ]);
  assert.deepEqual([...f.records], before);
  assert.ok(f.commits.slice(start).every((w) => w.length === 0));
});

test('fifty-three scenes include absent bindings and root is a singleton', async () => {
  const f = await fixture(53),
    a = await list(f, 'scene', { limit: 50 }),
    b = await list(f, 'scene', { limit: 50, cursor: a.nextCursor });
  assert.equal(a.items.length, 50);
  assert.equal(b.items.length, 3);
  assert.equal(b.nextCursor, null);
  const none = [...a.items, ...b.items].find((r) => r.personaId === null);
  await assert.rejects(f.backup.readAdventureBackupPersona(uid, request(f, 'scene', none)), {
    code: 'failed-precondition',
  });
  await assert.rejects(list(f, 'adventure', { cursor: a.nextCursor }), {
    code: 'invalid-argument',
  });
});

for (const dependency of ['scene', 'profile'])
  for (const mode of ['change', 'recreate'])
    test(
      dependency + ' native identity rejects ' + mode + ' without a root clock change',
      async () => {
        const f = await fixture(),
          row = (await list(f)).items[0],
          p = dependency === 'scene' ? f.path + '/scenes/' + f.sceneId : profilePath,
          value = structuredClone(f.records.get(p)),
          root = f.pin.sourceToken;
        if (mode === 'change') await update(f, p, { ignoredMetadata: true });
        else {
          await remove(f, p);
          await f.db.runTransaction((tx) => tx.create(f.db.doc(p), value));
        }
        assert.equal(
          (
            await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
              adventureId: f.target.id,
            })
          ).sourceToken,
          root,
        );
        await assert.rejects(f.backup.readAdventureBackupPersona(uid, request(f, 'scene', row)), {
          code: 'failed-precondition',
        });
      },
    );

for (const state of ['preparing', 'cancelled', 'active'])
  test(
    'restored library profile requires native active batch before opening instructions: ' + state,
    async () => {
      const f = await fixture();
      await preparePersonaRestoreBatch(f.db);
      if (state === 'active') await activatePersonaRestoreBatch(f.db);
      else if (state === 'cancelled') await update(f, personaRestorePaths.batch, { state });
      await update(f, f.path + '/scenes/' + f.sceneId, {
        personaComplement: { personaId: personaRestoreProfile, overrides: [] },
      });
      f.metadataReads.length = 0;
      if (state !== 'active') {
        await assert.rejects(list(f), { code: 'failed-precondition' });
        assert.equal(
          f.metadataReads.some(
            (r) => r.path === personaRestorePaths.profile && r.fields.includes('instructions'),
          ),
          false,
        );
      } else {
        const row = (await list(f)).items[0],
          value = await read(f, 'scene', row);
        assert.equal(value.profile.id, personaRestoreProfile);
        assert.equal(Object.hasOwn(value.profile, 'restoreOrigin'), false);
        await update(f, personaRestorePaths.batch, { state: 'cancelled' });
        f.metadataReads.length = 0;
        await assert.rejects(f.backup.readAdventureBackupPersona(uid, request(f, 'scene', row)), {
          code: 'failed-precondition',
        });
        assert.equal(
          f.metadataReads.some(
            (r) => r.path === personaRestorePaths.profile && r.fields.includes('instructions'),
          ),
          false,
        );
      }
    },
  );

test('missing declared persona never adopts another account or produces an empty profile', async () => {
  const f = await fixture();
  await remove(f, profilePath);
  f.records.set('users/other/aiPersonas/' + legacyId, f.custom);
  await assert.rejects(list(f), { code: 'failed-precondition' });
});

for (const patch of [
  { ownerId: 'other' },
  { schemaVersion: 2 },
  { deleting: true },
  { rebalancing: true },
  { personaComplement: { personaId: legacyId, overrides: [{ traitId: 'x', value: 101 }] } },
])
  test(
    'invalid binding metadata fails before profile content: ' + JSON.stringify(patch),
    async () => {
      const f = await fixture();
      await update(f, f.path + '/scenes/' + f.sceneId, patch);
      f.metadataReads.length = 0;
      await assert.rejects(list(f));
      assert.equal(
        f.metadataReads.some((r) => r.fields.includes('instructions')),
        false,
      );
    },
  );

test('requests reauthorize account, cursor/indices and capture intent before an async pause', async () => {
  const f = await fixture(2),
    row = (await list(f, 'adventure')).items[0],
    input = request(f, 'adventure', row);
  for (const actor of [null, 'other'])
    await assert.rejects(f.backup.readAdventureBackupPersona(actor, input), {
      code: actor ? 'not-found' : 'unauthenticated',
    });
  for (const extra of [{ index: -1 }, { index: 0.5 }, { id: f.sceneId }])
    await assert.rejects(f.backup.readAdventureBackupPersona(uid, { ...input, ...extra }), {
      code: 'invalid-argument',
    });
  const port = {
    ...f.db,
    runTransaction: (op) =>
      f.db.runTransaction((tx) =>
        op({
          ...tx,
          async getAll(ref, options) {
            await Promise.resolve();
            Object.assign(input, { scope: 'scene', id: f.sceneId, index: 8 });
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  const r = await createAdventureBackupPersonaService({ db: port }).readAdventureBackupPersona(
    uid,
    input,
  );
  assert.equal(r.scope, 'adventure');
  assert.equal(r.id, f.target.id);
  assert.equal(r.index, 0);
});

test('shared projection keeps the existing book serializer golden bytes', () => {
  assert.equal(
    digest(
      Buffer.from(
        serializeBookBackupPersona('book', 'book', DEFAULT_PERSONAS[0].id, DEFAULT_PERSONAS[0])
          .bytes,
      ).toString(),
    ),
    '1040cf51cf5789c2048c83acd243750c1684a3289daeffd74e87600b55c08794',
  );
});

test('persona cursor is closed by scope/project/source and never accepts an arbitrary library profile', async () => {
  const f = await fixture(2),
    page = await list(f, 'scene', { limit: 1 }),
    cursor = JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString());
  for (const patch of [
    { scope: 'adventure' },
    { adventureId: 'other-project' },
    { sourceToken: '0'.repeat(64) },
    { version: 2 },
    { extra: true },
  ])
    await assert.rejects(
      list(f, 'scene', {
        cursor: Buffer.from(JSON.stringify({ ...cursor, ...patch })).toString('base64url'),
      }),
      { code: 'invalid-argument' },
    );
  for (const extra of [
    { personaId: legacyId },
    { scope: 'block' },
    { limit: 51 },
    { path: profilePath },
  ])
    await assert.rejects(list(f, 'scene', extra), { code: 'invalid-argument' });
});

for (const patch of [{ id: 'different-id' }, { instructions: '\ud800' }, { traits: [] }])
  test(
    'portable profile rejects invalid own data without serializing an empty fallback ' +
      JSON.stringify(patch),
    async () => {
      const f = await fixture();
      await update(f, profilePath, patch);
      const row = (await list(f)).items[0];
      await assert.rejects(f.backup.readAdventureBackupPersona(uid, request(f, 'scene', row)), {
        code: 'failed-precondition',
      });
    },
  );

test('failed authorized profile read leaves all origins untouched and exact retry succeeds', async () => {
  const f = await fixture(),
    row = (await list(f)).items[0],
    before = structuredClone([...f.records]),
    port = {
      ...f.db,
      runTransaction: (op) =>
        f.db.runTransaction((tx) =>
          op({
            ...tx,
            getAll(ref, options) {
              if (ref.path === profilePath && options.fieldMask.includes('instructions'))
                throw Error('injected persona read failure');
              return tx.getAll(ref, options);
            },
          }),
        ),
    };
  await assert.rejects(
    createAdventureBackupPersonaService({ db: port }).readAdventureBackupPersona(
      uid,
      request(f, 'scene', row),
    ),
    /injected persona read failure/,
  );
  assert.equal((await read(f, 'scene', row)).profile.instructions, f.custom.instructions);
  assert.deepEqual([...f.records], before);
});
