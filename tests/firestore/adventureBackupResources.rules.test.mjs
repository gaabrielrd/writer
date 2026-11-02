import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createAdventureBackupSourceService } from '../../functions/src/adventureBackupSource.mjs';
import { createAdventureBlocksService } from '../../functions/src/adventureBlocks.mjs';
import { createAdventureBackupResourceService } from '../../functions/src/adventureBackupResourceRead.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';

const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-adventure-resources',
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

const target = { kind: 'adventure', id },
  sceneId = 'sdk-resource-scene-000001',
  partId = 'sdk-resource-part-000001',
  blockId = 'sdk-resource-block-000001',
  scenePath = path + '/scenes/' + sceneId,
  blockPath = path + '/sceneBlocks/' + blockId;
async function fixture(count = 1) {
  await createStudioService({ db: admin, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ROOT',
    synopsis: 'PRIVATE_SYNOPSIS',
  });
  const scenes = createScenesService({ db: admin, now: () => 1100 });
  await scenes.createSceneGroup(uid, { target, operationId: partId, title: 'PRIVATE_PART' });
  for (let n = 1; n <= count; n++)
    await scenes.createScene(uid, {
      target,
      operationId: 'sdk-resource-scene-' + String(n).padStart(6, '0'),
      parentId: n === 1 ? partId : null,
      title: 'PRIVATE_SCENE_' + n,
      content: '<p>PRIVATE_BODY 🌙</p>',
      planning: { objective: 'PRIVATE_OBJECTIVE' },
    });
  await createAdventureBlocksService({ db: admin, now: () => 1200 }).createAdventureBlock(uid, {
    adventureId: id,
    sceneId,
    operationId: blockId,
    title: 'PRIVATE_BLOCK',
    narrativeType: 'clue',
    audience: 'gm',
    content: '<p>PRIVATE_CLUE 🌙</p>',
  });
  const pin = await createAdventureBackupSourceService({ db: admin }).getAdventureBackupSource(
    uid,
    { adventureId: id },
  );
  return { pin, api: createAdventureBackupResourceService({ db: admin }) };
}
const list = (f, kind, parentId = null, extra = {}) =>
  f.api.listAdventureBackupResources(uid, {
    adventureId: id,
    sourceToken: f.pin.sourceToken,
    kind,
    parentId,
    ...extra,
  });
const request = (f, kind, row, parentId = null) => ({
  adventureId: id,
  sourceToken: f.pin.sourceToken,
  kind,
  parentId,
  id: row.id,
  itemToken: row.itemToken,
  index: 0,
});
test('SDK adventure resources use real scenes/blocks, bounded masked pages and exact large body ranges', async () => {
  const f = await fixture(52),
    content = '\ufeff🌙 literal\\\n'.repeat(23000),
    hash = digest(content);
  await admin.doc(blockPath).update({ bodyHash: hash, revision: 11 });
  await admin.doc(blockPath + '/body/current').update({ content, hash, revision: 1 });
  await admin.doc(scenePath + '/references/external-ref').create({
    kind: 'universe',
    scopeId: 'unavailable-world',
    entityId: 'unavailable-entity',
    label: 'FORBIDDEN_LABEL',
    content: 'FORBIDDEN_GLOBAL_BODY',
  });
  let queries = 0;
  const port = {
    doc: (p) => admin.doc(p),
    collection: (p) => admin.collection(p),
    runTransaction: (op) =>
      admin.runTransaction((tx) =>
        op({
          async getAll(ref, options) {
            const snapshots = await tx.getAll(ref, options);
            for (const snapshot of snapshots)
              if (snapshot.exists) {
                for (const key of ['title', 'content', 'objective'])
                  if (!options.fieldMask.includes(key))
                    assert.equal(Object.hasOwn(snapshot.data(), key), false);
              }
            return snapshots;
          },
          async get(query) {
            queries++;
            const page = await tx.get(query);
            for (const snapshot of page.docs) {
              for (const key of ['title', 'content', 'objective'])
                assert.equal(Object.hasOwn(snapshot.data(), key), false);
              assert.ok(snapshot.createTime && snapshot.updateTime);
            }
            return page;
          },
        }),
      ),
  };
  f.api = createAdventureBackupResourceService({ db: port });
  const a = await list(f, 'scene', null, { limit: 50 }),
    b = await list(f, 'scene', null, { limit: 50, cursor: a.nextCursor });
  assert.equal(a.items.length, 50);
  assert.equal(b.items.length, 2);
  assert.equal(b.nextCursor, null);
  assert.equal(queries, 2);
  for (const [kind, parentId] of [
    ['part-control', null],
    ['scene-control', null],
    ['scene', null],
    ['scene-body', sceneId],
    ['scene-planning', sceneId],
    ['scene-reference', sceneId],
    ['block', null],
    ['block-body', blockId],
  ]) {
    const page = await list(f, kind, parentId);
    assert.ok(page.items.length);
    assert.equal(JSON.stringify(page).includes('PRIVATE_'), false);
    const result = await f.api.readAdventureBackupResource(
      uid,
      request(f, kind, page.items[0], parentId),
    );
    if (kind === 'scene-reference')
      assert.deepEqual(JSON.parse(Buffer.from(result.chunkBase64, 'base64').toString()).data, {
        kind: 'universe',
        scopeId: 'unavailable-world',
        entityId: 'unavailable-entity',
      });
  }
  const row = (await list(f, 'block-body', blockId)).items[0],
    chunks = [];
  let header;
  for (let index = 0; ; index++) {
    const r = await f.api.readAdventureBackupResource(uid, {
      ...request(f, 'block-body', row, blockId),
      index,
    });
    header ??= r;
    assert.equal(r.contentHash, header.contentHash);
    const bytes = Buffer.from(r.chunkBase64, 'base64');
    assert.ok(bytes.length <= 65536);
    chunks.push(bytes);
    if (index + 1 === r.chunkCount) break;
  }
  const bytes = Buffer.concat(chunks);
  assert.ok(header.chunkCount > 4);
  assert.equal(bytes.length, header.byteLength);
  assert.equal(digest(bytes.toString('utf8')), header.contentHash);
  assert.equal(JSON.parse(bytes.toString('utf8')).data.content, content);
});

test('SDK adventure resources pin native body, block and scene births and optional planner absence', async () => {
  const f = await fixture();
  for (const resourcePath of [blockPath + '/body/current', blockPath, scenePath]) {
    const row = (await list(f, 'block-body', blockId)).items[0],
      ref = admin.doc(resourcePath),
      before = await ref.get();
    await ref.delete();
    await ref.create(before.data());
    const after = await ref.get();
    assert.equal(after.createTime.isEqual(before.createTime), false);
    await assert.rejects(
      f.api.readAdventureBackupResource(uid, request(f, 'block-body', row, blockId)),
      {
        code: 'failed-precondition',
        details: { reason: 'adventure-backup-item-changed' },
      },
    );
  }
  const planner = admin.doc(scenePath + '/planning/current');
  await planner.delete();
  const row = (await list(f, 'scene-planning', sceneId)).items[0];
  assert.equal(row.present, false);
  const absent = await f.api.readAdventureBackupResource(
    uid,
    request(f, 'scene-planning', row, sceneId),
  );
  assert.deepEqual(JSON.parse(Buffer.from(absent.chunkBase64, 'base64').toString()).data, {});
  await planner.create({ objective: '', conflict: '', pointOfView: '' });
  await assert.rejects(
    f.api.readAdventureBackupResource(uid, request(f, 'scene-planning', row, sceneId)),
    { code: 'failed-precondition' },
  );
});

test('SDK adventure resources enforce authority and body integrity, leave native data untouched on retry', async () => {
  const f = await fixture(),
    row = (await list(f, 'scene-body', sceneId)).items[0],
    input = request(f, 'scene-body', row, sceneId),
    refs = [path, scenePath, scenePath + '/body/current'].map((p) => admin.doc(p)),
    before = await Promise.all(refs.map((ref) => ref.get()));
  const failing = {
    doc: (p) => admin.doc(p),
    collection: (p) => admin.collection(p),
    runTransaction: (op) =>
      admin.runTransaction((tx) =>
        op({
          getAll(ref, options) {
            if (ref.path.endsWith('/body/current')) throw Error('injected resource failure');
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  await assert.rejects(
    createAdventureBackupResourceService({ db: failing }).readAdventureBackupResource(uid, input),
    /injected resource failure/,
  );
  await f.api.readAdventureBackupResource(uid, input);
  const after = await Promise.all(refs.map((ref) => ref.get()));
  assert.ok(after.every((snapshot, i) => snapshot.updateTime.isEqual(before[i].updateTime)));
  for (const actor of [null, 'other'])
    await assert.rejects(f.api.readAdventureBackupResource(actor, input), {
      code: actor ? 'not-found' : 'unauthenticated',
    });
  for (const context of [env.authenticatedContext('other'), env.unauthenticatedContext()])
    await assertFails(getDoc(doc(context.firestore(), scenePath + '/body/current')));
  await assertFails(
    setDoc(doc(env.authenticatedContext(uid).firestore(), scenePath + '/body/current'), {
      content: 'bypass',
    }),
  );
  const bodyRef = admin.doc(scenePath + '/body/current');
  await bodyRef.update({ content: 'tampered' });
  const fresh = (await list(f, 'scene-body', sceneId)).items[0];
  await assert.rejects(
    f.api.readAdventureBackupResource(uid, request(f, 'scene-body', fresh, sceneId)),
    { code: 'failed-precondition' },
  );
  await bodyRef.delete();
  await assert.rejects(list(f, 'scene-body', sceneId), { code: 'failed-precondition' });
});
