import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createAdventureBackupSourceService } from '../../functions/src/adventureBackupSource.mjs';
import { createAdventureBackupPersonaService } from '../../functions/src/adventureBackupPersonaRead.mjs';
import { createEditorChatContextService } from '../../functions/src/editorChatContext.mjs';
import { editorChatRequestHash } from '../../functions/src/editorChatContracts.mjs';
import { DEFAULT_PERSONAS } from '../../functions/src/personaProfile.mjs';
import {
  preparePersonaRestoreBatch,
  activatePersonaRestoreBatch,
  personaRestoreProfile,
  personaRestorePaths,
} from '../../functions/test/helpers/personaRestoreAvailabilityFixture.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';

const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-adventure-persona',
  uid = 'author',
  id = 'adventure-backup-sdk-0001',
  path = 'adventures/' + id;
let env, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw Error('Use only the local demo emulator.');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});

const sceneId = 'sdk-persona-backup-scene-0001',
  legacyId = 'minha-persona-antiga',
  profilePath = 'users/' + uid + '/aiPersonas/' + legacyId;
async function bind(api, sceneId, value, operationId) {
  const current = await api.dispatch(uid, {
      action: 'getAdventurePersonaBinding',
      adventureId: id,
      sceneId,
    }),
    request = {
      action: 'setAdventurePersonaBinding',
      adventureId: id,
      sceneId,
      adventureToken: current.adventureToken,
      expectedBindingToken: current.bindingToken,
      value,
      operationId,
    };
  return api.dispatch(uid, { ...request, requestHash: await editorChatRequestHash(request) });
}
async function fixture(count = 1) {
  await createStudioService({ db: admin, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ROOT',
  });
  const scenes = createScenesService({ db: admin, now: () => 1100 }),
    target = { kind: 'adventure', id };
  for (let n = 0; n < count; n++)
    await scenes.createScene(uid, {
      target,
      operationId: n === 0 ? sceneId : 'sdk-persona-backup-extra-' + String(n).padStart(4, '0'),
      title: 'PRIVATE_SCENE',
      content: 'PRIVATE_PROSE',
    });
  const custom = {
    ...structuredClone(DEFAULT_PERSONAS[0]),
    id: legacyId,
    instructions: '  PRIVATE_PROFILE 🌙\n  ',
    apiKey: 'DO_NOT_COPY',
    provider: 'DO_NOT_COPY',
  };
  custom.traits[0].apiKey = 'DO_NOT_COPY';
  await admin.doc(profilePath).create(custom);
  const bindings = createEditorChatContextService({ db: admin, now: () => 1200 });
  await bind(bindings, null, { personaId: DEFAULT_PERSONAS[1].id }, 'sdk-persona-root-0001');
  await bind(
    bindings,
    sceneId,
    { personaComplement: { personaId: legacyId, overrides: [{ traitId: 'sensory', value: 91 }] } },
    'sdk-persona-scene-0001',
  );
  const pin = await createAdventureBackupSourceService({ db: admin }).getAdventureBackupSource(
    uid,
    { adventureId: id },
  );
  return { pin, custom, bindings, api: createAdventureBackupPersonaService({ db: admin }) };
}
const list = (f, scope = 'scene', extra = {}) =>
  f.api.listAdventureBackupPersonaBindings(uid, {
    adventureId: id,
    sourceToken: f.pin.sourceToken,
    scope,
    ...extra,
  });
const request = (f, scope, row) => ({
  adventureId: id,
  sourceToken: f.pin.sourceToken,
  scope,
  id: row.id,
  itemToken: row.itemToken,
  index: 0,
});

test('SDK adventure persona real bindings preserve preset/legacy/archive and use only authorized closed profile fields', async () => {
  const f = await fixture(52);
  await admin.doc(profilePath).update({ archived: true });
  let profileReads = 0;
  const port = {
    doc: (p) => admin.doc(p),
    collection: (p) => {
      assert.equal(p.includes('aiPersonas'), false);
      return admin.collection(p);
    },
    runTransaction: (op) =>
      admin.runTransaction((tx) =>
        op({
          async getAll(ref, options) {
            const snapshots = await tx.getAll(ref, options);
            for (const snapshot of snapshots)
              if (snapshot.exists) {
                for (const key of ['title', 'content', 'instructions', 'apiKey', 'provider'])
                  if (!options.fieldMask.includes(key))
                    assert.equal(Object.hasOwn(snapshot.data(), key), false);
                if (options.fieldMask.includes('instructions')) profileReads++;
              }
            return snapshots;
          },
          async get(query) {
            const page = await tx.get(query);
            for (const snapshot of page.docs)
              for (const key of ['title', 'content', 'instructions'])
                assert.equal(Object.hasOwn(snapshot.data(), key), false);
            return page;
          },
        }),
      ),
  };
  f.api = createAdventureBackupPersonaService({ db: port });
  const root = (await list(f, 'adventure')).items[0],
    a = await list(f, 'scene', { limit: 50 }),
    b = await list(f, 'scene', { limit: 50, cursor: a.nextCursor });
  assert.equal(a.items.length, 50);
  assert.equal(b.items.length, 2);
  assert.equal(b.nextCursor, null);
  assert.equal(profileReads, 0);
  const row = [...a.items, ...b.items].find((r) => r.personaId === legacyId),
    before = await admin.doc(profilePath).get(),
    result = await f.api.readAdventureBackupPersona(uid, request(f, 'scene', row)),
    json = Buffer.from(result.chunkBase64, 'base64').toString(),
    data = JSON.parse(json);
  assert.equal(digest(json), result.contentHash);
  assert.equal(data.profile.id, legacyId);
  assert.equal(data.profile.archived, true);
  assert.equal(data.profile.instructions, f.custom.instructions);
  assert.equal(json.includes('DO_NOT_COPY'), false);
  assert.equal(profileReads, 1);
  const preset = await f.api.readAdventureBackupPersona(uid, request(f, 'adventure', root));
  assert.equal(
    JSON.parse(Buffer.from(preset.chunkBase64, 'base64').toString()).profile.id,
    DEFAULT_PERSONAS[1].id,
  );
  assert.ok((await admin.doc(profilePath).get()).updateTime.isEqual(before.updateTime));
  await admin.doc(profilePath).delete();
  await admin.doc(profilePath).create(before.data());
  await assert.rejects(f.api.readAdventureBackupPersona(uid, request(f, 'scene', row)), {
    code: 'failed-precondition',
  });
  await assert.rejects(f.api.readAdventureBackupPersona('other', request(f, 'adventure', root)), {
    code: 'not-found',
  });
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), profilePath)));
  await assertFails(
    setDoc(doc(env.authenticatedContext(uid).firestore(), path + '/scenes/' + sceneId), {
      personaComplement: null,
    }),
  );
});

test('SDK adventure persona restored batch proof is revalidated before profile instructions', async () => {
  const f = await fixture();
  await preparePersonaRestoreBatch(admin);
  await activatePersonaRestoreBatch(admin);
  await bind(
    f.bindings,
    sceneId,
    { personaComplement: { personaId: personaRestoreProfile, overrides: [] } },
    'sdk-restored-persona-bind-0001',
  );
  const row = (await list(f)).items[0],
    active = await f.api.readAdventureBackupPersona(uid, request(f, 'scene', row));
  assert.equal(
    JSON.parse(Buffer.from(active.chunkBase64, 'base64').toString()).profile.id,
    personaRestoreProfile,
  );
  await admin.doc(personaRestorePaths.batch).update({ state: 'cancelled' });
  let opened = false;
  const guarded = {
    doc: (p) => admin.doc(p),
    collection: (p) => admin.collection(p),
    runTransaction: (op) =>
      admin.runTransaction((tx) =>
        op({
          getAll(ref, options) {
            if (options.fieldMask.includes('instructions')) opened = true;
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  await assert.rejects(
    createAdventureBackupPersonaService({ db: guarded }).readAdventureBackupPersona(
      uid,
      request(f, 'scene', row),
    ),
    { code: 'failed-precondition' },
  );
  assert.equal(opened, false);
});
