import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createAdventureBackupReadService } from '../../functions/src/adventureBackupRead.mjs';
import { createAdventureBackupSourceService } from '../../functions/src/adventureBackupSource.mjs';
import { createAdventureBackupUniverseService } from '../../functions/src/adventureBackupUniverseRead.mjs';
import { createUniverseService } from '../../functions/src/universes.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';

const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-adventure-universe',
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

test('SDK adventure universe origin stays metadata-only, binds native birth and preserves own content after revocation', async () => {
  const worldId = 'sdk-universe-origin-0001',
    worldPath = 'universes/' + worldId;
  await createUniverseService({ db: admin, now: () => 1000 }).createUniverse(uid, {
    creationId: worldId,
    name: 'FORBIDDEN_GLOBAL_NAME',
    description: 'FORBIDDEN_GLOBAL_PROSE',
  });
  await createStudioService({ db: admin, now: () => 1100 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_OWN_TITLE',
    synopsis: 'PRIVATE_OWN_PROSE',
    universeId: worldId,
  });
  const pin = await createAdventureBackupSourceService({ db: admin }).getAdventureBackupSource(
      uid,
      { adventureId: id },
    ),
    before = await admin.doc(worldPath).get(),
    rootBefore = await admin.doc(path).get(),
    port = {
      doc: (p) => admin.doc(p),
      runTransaction: (op) =>
        admin.runTransaction((tx) =>
          op({
            async getAll(ref, options) {
              const snapshots = await tx.getAll(ref, options);
              for (const snapshot of snapshots)
                if (snapshot.exists)
                  for (const key of ['name', 'description', 'title', 'synopsis'])
                    assert.equal(Object.hasOwn(snapshot.data(), key), false);
              return snapshots;
            },
          }),
        ),
    },
    api = createAdventureBackupUniverseService({ db: port }),
    input = { adventureId: id, sourceToken: pin.sourceToken },
    first = await api.getAdventureBackupUniverse(uid, input);
  assert.equal(first.origin.kind, 'reference');
  assert.equal(first.origin.id, worldId);
  assert.deepEqual(first.origin.created, {
    seconds: before.createTime.seconds,
    nanoseconds: before.createTime.nanoseconds,
  });
  assert.equal(JSON.stringify(first).includes('FORBIDDEN'), false);
  assert.ok((await admin.doc(worldPath).get()).updateTime.isEqual(before.updateTime));
  assert.ok((await admin.doc(path).get()).updateTime.isEqual(rootBefore.updateTime));
  await admin.doc(worldPath).delete();
  await admin.doc(worldPath).create(before.data());
  assert.equal((await admin.doc(worldPath).get()).createTime.isEqual(before.createTime), false);
  await assert.rejects(
    api.getAdventureBackupUniverse(uid, { ...input, expectedUniverseToken: first.universeToken }),
    { code: 'failed-precondition' },
  );
  const recreated = await api.getAdventureBackupUniverse(uid, input);
  assert.notDeepEqual(recreated.origin.created, first.origin.created);
  await admin.doc(worldPath).update({ authorId: 'other' });
  const unavailable = await api.getAdventureBackupUniverse(uid, input);
  assert.deepEqual(unavailable.origin, { kind: 'unavailable', id: worldId });
  const own = await createAdventureBackupReadService({ db: admin }).readAdventureBackupStructure(
    uid,
    {
      adventureId: id,
      sourceToken: pin.sourceToken,
      kind: 'adventure',
      id,
      itemToken: pin.sourceToken,
      index: 0,
    },
  );
  const text = Buffer.from(own.chunkBase64, 'base64').toString();
  assert.equal(digest(text), own.contentHash);
  assert.equal(JSON.parse(text).data.synopsis, 'PRIVATE_OWN_PROSE');
  await assert.rejects(api.getAdventureBackupUniverse('other', input), { code: 'not-found' });
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), path)));
  await assertFails(
    setDoc(doc(env.authenticatedContext(uid).firestore(), path), { universeId: null }),
  );
});
