import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createAdventureBackupReadService } from '../../functions/src/adventureBackupRead.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';

const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-adventure-backup',
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
async function fixture(count = 1) {
  await createStudioService({ db: admin, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ROOT 🌙',
    synopsis: 'PRIVATE_SYNOPSIS',
  });
  const scene = createScenesService({ db: admin, now: () => 1000 });
  for (let n = 0; n < count; n++)
    await scene.createSceneGroup(uid, {
      target: { kind: 'adventure', id },
      operationId: 'sdk-part-backup-' + String(n).padStart(6, '0'),
      title: 'PRIVATE_PART_' + n,
    });
  const api = createAdventureBackupReadService({ db: admin }),
    pin = await api.getAdventureBackupSource(uid, { adventureId: id });
  return { api, pin };
}
const list = (f, extra = {}) =>
  f.api.listAdventureBackupStructure(uid, {
    adventureId: id,
    kind: 'part',
    sourceToken: f.pin.sourceToken,
    ...extra,
  });
const request = (f, row) => ({
  adventureId: id,
  kind: 'part',
  sourceToken: f.pin.sourceToken,
  id: row.id,
  itemToken: row.itemToken,
  index: 0,
});
test('SDK adventure structure metadata pages, native masks and large exact chunks use real producers and deny foreign clients', async () => {
  const f = await fixture(52),
    partId = 'sdk-part-backup-000000',
    content = '\ufeff🌙 literal\n'.repeat(28000);
  await admin.doc(path + '/parts/' + partId).update({ content });
  let metadataQueries = 0;
  const port = {
    doc: (p) => admin.doc(p),
    collection: (p) => admin.collection(p),
    runTransaction: (operation) =>
      admin.runTransaction((tx) =>
        operation({
          async getAll(ref, options) {
            const result = await tx.getAll(ref, options);
            for (const snapshot of result)
              if (snapshot.exists) {
                const data = snapshot.data();
                if (!options.fieldMask.includes('title'))
                  assert.equal(Object.hasOwn(data, 'title'), false);
                if (!options.fieldMask.includes('content'))
                  assert.equal(Object.hasOwn(data, 'content'), false);
              }
            return result;
          },
          async get(query) {
            const result = await tx.get(query);
            metadataQueries++;
            for (const snapshot of result.docs) {
              const data = snapshot.data();
              assert.equal(Object.hasOwn(data, 'title'), false);
              assert.equal(Object.hasOwn(data, 'content'), false);
              assert.ok(snapshot.createTime && snapshot.updateTime);
            }
            return result;
          },
        }),
      ),
  };
  f.api = createAdventureBackupReadService({ db: port });
  const first = await list(f, { limit: 50 }),
    second = await list(f, { limit: 50, cursor: first.nextCursor });
  assert.equal(first.items.length, 50);
  assert.equal(second.items.length, 2);
  assert.equal(second.nextCursor, null);
  assert.equal(metadataQueries, 2);
  const row = first.items.find((r) => r.id === partId),
    parts = [];
  let header;
  for (let index = 0; ; index++) {
    const r = await f.api.readAdventureBackupStructure(uid, { ...request(f, row), index });
    header ??= r;
    assert.equal(r.contentHash, header.contentHash);
    const bytes = Buffer.from(r.chunkBase64, 'base64');
    assert.ok(bytes.length <= 65536);
    parts.push(bytes);
    if (index + 1 === r.chunkCount) break;
  }
  const bytes = Buffer.concat(parts);
  assert.ok(header.chunkCount > 4);
  assert.equal(bytes.length, header.byteLength);
  assert.equal(digest(bytes.toString('utf8')), header.contentHash);
  assert.equal(JSON.parse(bytes.toString('utf8')).data.content, content);
  assert.equal((await admin.doc(path + '/workProgress/current').get()).exists, false);
  await assert.rejects(
    f.api.listAdventureBackupStructure('other', {
      adventureId: id,
      kind: 'part',
      sourceToken: f.pin.sourceToken,
    }),
    { code: 'not-found' },
  );
  for (const context of [env.authenticatedContext('other'), env.unauthenticatedContext()]) {
    await assertFails(getDoc(doc(context.firestore(), path + '/parts/' + partId)));
  }
  await assertFails(
    setDoc(doc(env.authenticatedContext(uid).firestore(), path + '/parts/' + partId), {
      content: 'bypass',
    }),
  );
});
test('SDK adventure native ABA and real structural writer invalidate the original item and source anchors', async () => {
  const f = await fixture(),
    row = (await list(f)).items[0],
    ref = admin.doc(path + '/parts/' + row.id),
    before = await ref.get();
  await ref.delete();
  await ref.create(before.data());
  const recreated = await ref.get();
  assert.equal(recreated.createTime.isEqual(before.createTime), false);
  assert.equal(recreated.data().updatedAt, before.data().updatedAt);
  await assert.rejects(f.api.readAdventureBackupStructure(uid, request(f, row)), {
    code: 'failed-precondition',
    details: { reason: 'adventure-backup-item-changed' },
  });
  await createScenesService({ db: admin, now: () => 1000 }).createSceneGroup(uid, {
    target: { kind: 'adventure', id },
    operationId: 'sdk-part-backup-new-root',
    title: 'New part',
  });
  await assert.rejects(list(f), {
    code: 'failed-precondition',
    details: { reason: 'adventure-backup-source-changed' },
  });
});
test('SDK adventure read failure leaves native project untouched and the exact request can be retried', async () => {
  const f = await fixture(),
    row = (await list(f)).items[0],
    rootBefore = await admin.doc(path).get(),
    partBefore = await admin.doc(path + '/parts/' + row.id).get();
  const port = {
    doc: (p) => admin.doc(p),
    collection: (p) => admin.collection(p),
    runTransaction: (operation) =>
      admin.runTransaction((tx) =>
        operation({
          getAll(ref, options) {
            if (ref.path.includes('/parts/')) throw Error('injected range failure');
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  await assert.rejects(
    createAdventureBackupReadService({ db: port }).readAdventureBackupStructure(
      uid,
      request(f, row),
    ),
    /injected range failure/,
  );
  const rootAfter = await admin.doc(path).get(),
    partAfter = await partBefore.ref.get();
  assert.ok(rootAfter.updateTime.isEqual(rootBefore.updateTime));
  assert.ok(partAfter.updateTime.isEqual(partBefore.updateTime));
  const result = await f.api.readAdventureBackupStructure(uid, request(f, row));
  assert.equal(
    JSON.parse(Buffer.from(result.chunkBase64, 'base64').toString()).data.title,
    partBefore.data().title,
  );
});
