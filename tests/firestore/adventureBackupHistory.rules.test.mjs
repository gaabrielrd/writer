import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createScenesService } from '../../functions/src/scenes.mjs';
import { createAdventureBackupSourceService } from '../../functions/src/adventureBackupSource.mjs';
import { createAdventureBackupHistoryService } from '../../functions/src/adventureBackupHistoryRead.mjs';
import { createAdventureBlocksService } from '../../functions/src/adventureBlocks.mjs';
import { createWorkHistoryService } from '../../functions/src/workHistory.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';

const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-adventure-history',
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
  sceneId = 'sdk-history-scene-0001',
  blockId = 'sdk-history-block-0001',
  firstId = 'sdk-history-manual-scene-0001',
  blockVersion = 'sdk-history-manual-block-0001',
  versionPath = path + '/workVersions/' + firstId,
  scenePath = path + '/scenes/' + sceneId,
  large = '\ufeff🌙\n  '.repeat(18000);
async function fixture(count = 1, restore = false) {
  await createStudioService({ db: admin, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ROOT',
  });
  const scenes = createScenesService({ db: admin, now: () => 1100 });
  await scenes.createScene(uid, {
    target,
    operationId: sceneId,
    title: 'PRIVATE_SCENE',
    content: 'PRIVATE_ORIGINAL',
  });
  await createAdventureBlocksService({ db: admin, now: () => 1200 }).createAdventureBlock(uid, {
    adventureId: id,
    sceneId,
    operationId: blockId,
    title: 'PRIVATE_BLOCK',
    content: large,
    audience: 'gm',
  });
  const history = createWorkHistoryService({ db: admin, now: () => 1300 });
  for (let n = 1; n <= count; n++) {
    const current = await history.getWorkVersionSource(uid, {
      target,
      resource: { kind: 'scene', id: sceneId },
    });
    await history.createWorkVersion(uid, {
      target,
      resource: current.resource,
      operationId: 'sdk-history-manual-scene-' + String(n).padStart(4, '0'),
      expectedSourceToken: current.sourceToken,
      label: 'PRIVATE_LABEL',
    });
  }
  if (restore) {
    const block = await history.getWorkVersionSource(uid, {
      target,
      resource: { kind: 'block', id: blockId },
    });
    await history.createWorkVersion(uid, {
      target,
      resource: block.resource,
      operationId: blockVersion,
      expectedSourceToken: block.sourceToken,
    });
    await scenes.updateScene(uid, {
      target,
      sceneId,
      operationId: 'sdk-history-change-0001',
      expectedRevision: (await admin.doc(scenePath).get()).data().revision,
      patch: { content: 'PRIVATE_BEFORE_RESTORE' },
    });
    const current = await history.getWorkVersionSource(uid, {
      target,
      resource: { kind: 'scene', id: sceneId },
    });
    await history.restoreWorkVersion(uid, {
      target,
      resource: current.resource,
      versionId: firstId,
      operationId: 'sdk-history-restore-0001',
      expectedSourceToken: current.sourceToken,
    });
  }
  const pin = await createAdventureBackupSourceService({ db: admin }).getAdventureBackupSource(
    uid,
    { adventureId: id },
  );
  return { pin, api: createAdventureBackupHistoryService({ db: admin }) };
}
const list = (f, extra = {}) =>
  f.api.listAdventureBackupHistory(uid, {
    adventureId: id,
    sourceToken: f.pin.sourceToken,
    kind: 'version',
    ...extra,
  });
const request = (f, row, extra = {}) => ({
  adventureId: id,
  sourceToken: f.pin.sourceToken,
  kind: 'version',
  id: row.id,
  itemToken: row.itemToken,
  index: 0,
  ...extra,
});
const chunkScope = (row) => ({
  kind: 'version-chunk',
  parentId: row.id,
  parentToken: row.itemToken,
});
async function read(f, input) {
  const parts = [];
  let header;
  for (let index = 0; ; index++) {
    const r = await f.api.readAdventureBackupHistory(uid, { ...input, index });
    header ??= r;
    assert.equal(r.contentHash, header.contentHash);
    const bytes = Buffer.from(r.chunkBase64, 'base64');
    assert.ok(bytes.length <= 65536);
    parts.push(bytes);
    if (index + 1 === r.chunkCount) break;
  }
  const bytes = Buffer.concat(parts);
  assert.equal(bytes.length, header.byteLength);
  assert.equal(digest(bytes.toString('utf8')), header.contentHash);
  return JSON.parse(bytes.toString('utf8')).data;
}
test('SDK adventure history real manual/pre-restore versions use metadata pages and reconstruct ordered text hashes', async () => {
  const f = await fixture(52, true);
  const port = {
    doc: (p) => admin.doc(p),
    collection: (p) => admin.collection(p),
    runTransaction: (op) =>
      admin.runTransaction((tx) =>
        op({
          async getAll(ref, options) {
            const snapshots = await tx.getAll(ref, options);
            for (const snapshot of snapshots)
              if (snapshot.exists)
                for (const key of ['label', 'content'])
                  if (!options.fieldMask.includes(key))
                    assert.equal(Object.hasOwn(snapshot.data(), key), false);
            return snapshots;
          },
          async get(query) {
            const page = await tx.get(query);
            for (const snapshot of page.docs)
              for (const key of ['label', 'content'])
                assert.equal(Object.hasOwn(snapshot.data(), key), false);
            return page;
          },
        }),
      ),
  };
  f.api = createAdventureBackupHistoryService({ db: port });
  const a = await list(f, { limit: 50 }),
    b = await list(f, { limit: 50, cursor: a.nextCursor }),
    rows = [...a.items, ...b.items];
  assert.equal(a.items.length, 50);
  assert.equal(b.items.length, 4);
  assert.equal(b.nextCursor, null);
  assert.equal(JSON.stringify(rows).includes('PRIVATE_'), false);
  const block = rows.find((r) => r.id === blockVersion),
    head = await read(f, request(f, block)),
    scope = chunkScope(block),
    records = [];
  let cursor = null;
  do {
    const page = await list(f, { ...scope, cursor, limit: 2 });
    for (const row of page.items) records.push(await read(f, request(f, row, scope)));
    cursor = page.nextCursor;
  } while (cursor);
  records.sort((x, y) => x.index - y.index);
  assert.deepEqual(
    records.map((r) => r.index),
    Array.from({ length: head.chunkCount }, (_, n) => n),
  );
  const text = records.map((r) => r.content).join('');
  assert.equal(text, large);
  assert.equal(Buffer.byteLength(text), head.byteLength);
  assert.equal(digest(text), head.contentHash);
  const previous = rows.find((r) => r.id.startsWith('previous-'));
  assert.equal((await read(f, request(f, previous))).reason, 'before-restore');
  const previousScope = chunkScope(previous),
    previousPart = (await list(f, previousScope)).items[0];
  assert.equal(
    (await read(f, request(f, previousPart, previousScope))).content,
    'PRIVATE_BEFORE_RESTORE',
  );
});

test('SDK adventure history native head/chunk births, authority and retry protect the same source', async () => {
  const f = await fixture();
  for (const dependency of ['head', 'body']) {
    const head = (await list(f)).items[0],
      scope = chunkScope(head),
      row = (await list(f, scope)).items[0],
      p = dependency === 'head' ? versionPath : path + '/workVersionBodies/' + row.id,
      ref = admin.doc(p),
      before = await ref.get();
    await ref.delete();
    await ref.create(before.data());
    assert.equal((await ref.get()).createTime.isEqual(before.createTime), false);
    await assert.rejects(f.api.readAdventureBackupHistory(uid, request(f, row, scope)), {
      code: 'failed-precondition',
    });
  }
  const row = (await list(f)).items[0],
    input = request(f, row),
    before = await admin.doc(versionPath).get(),
    failing = {
      doc: (p) => admin.doc(p),
      collection: (p) => admin.collection(p),
      runTransaction: (op) =>
        admin.runTransaction((tx) =>
          op({
            getAll(ref, options) {
              if (ref.path === versionPath) throw Error('injected history SDK failure');
              return tx.getAll(ref, options);
            },
          }),
        ),
    };
  await assert.rejects(
    createAdventureBackupHistoryService({ db: failing }).readAdventureBackupHistory(uid, input),
    /injected history SDK failure/,
  );
  await read(f, input);
  assert.ok((await admin.doc(versionPath).get()).updateTime.isEqual(before.updateTime));
  await assert.rejects(f.api.readAdventureBackupHistory('other', input), { code: 'not-found' });
  await assertFails(getDoc(doc(env.authenticatedContext('other').firestore(), versionPath)));
  await assertFails(
    setDoc(doc(env.authenticatedContext(uid).firestore(), versionPath), { label: 'bypass' }),
  );
  const root = admin.doc(path),
    old = await root.get();
  await root.delete();
  await root.create(old.data());
  f.pin = await createAdventureBackupSourceService({ db: admin }).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  await assert.rejects(list(f), { code: 'failed-precondition' });
});
