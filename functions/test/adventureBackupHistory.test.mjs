import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioService } from '../src/studio.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createAdventureBlocksService } from '../src/adventureBlocks.mjs';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import { createAdventureBackupSourceService } from '../src/adventureBackupSource.mjs';
import { createAdventureBackupHistoryService } from '../src/adventureBackupHistoryRead.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { digest } from '../src/workProgressContracts.mjs';

const uid = 'author',
  id = 'adventure-history-backup-0001',
  path = 'adventures/' + id,
  target = { kind: 'adventure', id },
  sceneId = 'history-scene-backup-0001',
  blockId = 'history-block-backup-0001',
  scenePath = path + '/scenes/' + sceneId,
  versionId = 'history-manual-scene-0001',
  versionPath = path + '/workVersions/' + versionId;
async function fixture(count = 1, content = '<p>PRIVATE_SCENE 🌙</p>', restore = false) {
  const f = adventureImportDb({ nativeUpdates: true });
  await createStudioService({ db: f.db, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ROOT',
  });
  const scenes = createScenesService({ db: f.db, now: () => 1100 });
  await scenes.createScene(uid, { target, operationId: sceneId, title: 'PRIVATE_SCENE', content });
  const blocks = createAdventureBlocksService({ db: f.db, now: () => 1200 });
  await blocks.createAdventureBlock(uid, {
    adventureId: id,
    sceneId,
    operationId: blockId,
    title: 'PRIVATE_BLOCK',
    content: '<p>PRIVATE_BLOCK_BODY</p>',
    audience: 'gm',
  });
  const history = createWorkHistoryService({ db: f.db, now: () => 1300 });
  for (let n = 1; n <= count; n++) {
    const current = await history.getWorkVersionSource(uid, {
      target,
      resource: { kind: 'scene', id: sceneId },
    });
    await history.createWorkVersion(uid, {
      target,
      resource: { kind: 'scene', id: sceneId },
      operationId: 'history-manual-scene-' + String(n).padStart(4, '0'),
      expectedSourceToken: current.sourceToken,
      label: 'PRIVATE_LABEL 🌙',
    });
  }
  if (restore) {
    const current = await history.getWorkVersionSource(uid, {
      target,
      resource: { kind: 'block', id: blockId },
    });
    await history.createWorkVersion(uid, {
      target,
      resource: current.resource,
      operationId: 'history-manual-block-0001',
      expectedSourceToken: current.sourceToken,
    });
    await scenes.updateScene(uid, {
      target,
      sceneId,
      operationId: 'history-scene-update-0001',
      expectedRevision: f.records.get(scenePath).revision,
      patch: { content: '<p>PRIVATE_BEFORE_RESTORE</p>' },
    });
    const changed = await history.getWorkVersionSource(uid, {
      target,
      resource: { kind: 'scene', id: sceneId },
    });
    await history.restoreWorkVersion(uid, {
      target,
      resource: changed.resource,
      versionId,
      operationId: 'history-restore-scene-0001',
      expectedSourceToken: changed.sourceToken,
    });
  }
  const pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  return { ...f, scenes, blocks, history, pin, api: createAdventureBackupHistoryService(f) };
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
async function readAll(f, input) {
  const chunks = [];
  let header;
  for (let index = 0; ; index++) {
    const r = await f.api.readAdventureBackupHistory(uid, { ...input, index });
    header ??= r;
    assert.equal(r.contentHash, header.contentHash);
    const bytes = Buffer.from(r.chunkBase64, 'base64');
    assert.ok(bytes.length > 0 && bytes.length <= 65536);
    chunks.push(bytes);
    if (index + 1 === r.chunkCount) break;
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.length, header.byteLength);
  assert.equal(digest(bytes.toString('utf8')), header.contentHash);
  return { dto: JSON.parse(bytes.toString('utf8')), header };
}
const chunkScope = (row) => ({
  kind: 'version-chunk',
  parentId: row.id,
  parentToken: row.itemToken,
});
async function versionText(f, row) {
  const head = (await readAll(f, request(f, row))).dto.data,
    scope = chunkScope(row),
    records = [];
  let cursor = null;
  do {
    const page = await list(f, { ...scope, cursor, limit: 2 });
    for (const part of page.items)
      records.push((await readAll(f, request(f, part, scope))).dto.data);
    cursor = page.nextCursor;
  } while (cursor);
  records.sort((a, b) => a.index - b.index);
  assert.deepEqual(
    records.map((p) => p.index),
    Array.from({ length: head.chunkCount }, (_, n) => n),
  );
  const text = records.map((p) => p.content).join('');
  assert.equal(Buffer.byteLength(text), head.byteLength);
  assert.equal(digest(text), head.contentHash);
  return { head, text };
}
const update = (f, p, patch) => f.db.runTransaction((tx) => tx.update(f.db.doc(p), patch));
const remove = (f, p) => f.db.runTransaction((tx) => tx.delete(f.db.doc(p)));

test('real manual scene/block versions and pre-restore copies retain private history without current manuscript mutation', async () => {
  const f = await fixture(1, '<p>PRIVATE_SCENE 🌙</p>', true),
    before = structuredClone([...f.records]),
    start = f.commits.length;
  f.reads.length = 0;
  f.metadataReads.length = 0;
  const page = await list(f);
  assert.equal(page.items.length, 3);
  assert.equal(JSON.stringify(page).includes('PRIVATE_'), false);
  assert.ok(f.reads.every((r) => !r.fields.includes('label') && !r.fields.includes('content')));
  const versions = [];
  for (const row of page.items) versions.push(await versionText(f, row));
  assert.equal(versions.filter((v) => v.head.reason === 'manual').length, 2);
  assert.equal(
    versions.find((v) => v.head.reason === 'before-restore').text,
    '<p>PRIVATE_BEFORE_RESTORE</p>',
  );
  assert.equal(
    versions.find((v) => v.head.resource.kind === 'block').text,
    '<p>PRIVATE_BLOCK_BODY</p>',
  );
  assert.equal(
    versions.find((v) => v.head.label === 'PRIVATE_LABEL 🌙').text,
    '<p>PRIVATE_SCENE 🌙</p>',
  );
  assert.ok(f.metadataReads.every((r) => !r.path.startsWith('users/')));
  assert.deepEqual([...f.records], before);
  assert.ok(f.commits.slice(start).every((w) => w.length === 0));
});

test('fifty-three retained versions page by physical ID without a hidden selection cap', async () => {
  const f = await fixture(53),
    a = await list(f, { limit: 50 }),
    b = await list(f, { limit: 50, cursor: a.nextCursor });
  assert.equal(a.items.length, 50);
  assert.equal(b.items.length, 3);
  assert.equal(b.nextCursor, null);
});

for (const text of ['', '\ufeff🌙\n  '.repeat(22000), '\u0000'.repeat(65536)])
  test(
    'literal version text and escaped JSON units preserve native chunks: bytes ' +
      Buffer.byteLength(text),
    async () => {
      const f = await fixture(1, text),
        row = (await list(f)).items[0],
        result = await versionText(f, row);
      assert.equal(result.text, text);
      if (text.startsWith('\u0000')) {
        const scope = chunkScope(row),
          part = (await list(f, scope)).items[0];
        assert.ok((await readAll(f, request(f, part, scope))).header.chunkCount > 5);
      }
    },
  );

for (const mutation of ['change', 'recreate'])
  test('version and chunk native identities reject ' + mutation, async () => {
    for (const dependency of ['head', 'body']) {
      const f = await fixture(),
        head = (await list(f)).items[0],
        scope = chunkScope(head),
        row = (await list(f, scope)).items[0],
        p = dependency === 'head' ? versionPath : path + '/workVersionBodies/' + row.id,
        value = structuredClone(f.records.get(p));
      if (mutation === 'change') await update(f, p, { ignoredMetadata: true });
      else {
        await remove(f, p);
        await f.db.runTransaction((tx) => tx.create(f.db.doc(p), value));
      }
      await assert.rejects(f.api.readAdventureBackupHistory(uid, request(f, row, scope)), {
        code: 'failed-precondition',
      });
      if (dependency === 'head')
        await assert.rejects(list(f, scope), { code: 'failed-precondition' });
    }
  });

test('root recreation cannot adopt historical manifests or bodies with a fresh source token', async () => {
  const f = await fixture(),
    value = structuredClone(f.records.get(path));
  await remove(f, path);
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  await assert.rejects(list(f), { code: 'failed-precondition' });
});

test('retained own history does not require a current scene head', async () => {
  const f = await fixture();
  await remove(f, scenePath);
  const row = (await list(f)).items[0];
  assert.equal((await versionText(f, row)).text, '<p>PRIVATE_SCENE 🌙</p>');
});

for (const patch of [
  { target: { kind: 'book', id } },
  { target: { kind: 'adventure', id: 'other' } },
  { resource: { kind: 'chapter', id: sceneId } },
  { schemaVersion: 2 },
  { deleting: true },
  { chunkCount: 0 },
  { byteLength: -1 },
  { contentHash: 'bad' },
  { contentStorage: null },
  { payloadStorage: null },
  { bodyStorage: null },
])
  test('invalid historical head refuses metadata and unit ' + JSON.stringify(patch), async () => {
    const f = await fixture(),
      row = (await list(f)).items[0];
    await update(f, versionPath, patch);
    await assert.rejects(list(f));
    await assert.rejects(f.api.readAdventureBackupHistory(uid, request(f, row)));
  });

for (const patch of [
  { draft: {} },
  { reason: 'generated' },
  { label: '\ud800' },
  { createdAt: -1 },
  { wordCount: -1 },
])
  test(
    'full historical metadata refuses unsupported or corrupt value ' + JSON.stringify(patch),
    async () => {
      const f = await fixture();
      await update(f, versionPath, patch);
      const row = (await list(f)).items[0];
      await assert.rejects(f.api.readAdventureBackupHistory(uid, request(f, row)), {
        code: 'failed-precondition',
      });
    },
  );

for (const patch of [
  { versionId: 'wrong-parent' },
  { index: 99 },
  { contentStorage: null },
  { content: '\ud800' },
])
  test('chunk validates native address and content ' + JSON.stringify(patch), async () => {
    const f = await fixture(),
      head = (await list(f)).items[0],
      scope = chunkScope(head),
      row = (await list(f, scope)).items[0];
    await update(f, path + '/workVersionBodies/' + row.id, patch);
    await assert.rejects(f.api.readAdventureBackupHistory(uid, request(f, row, scope)), {
      code: 'failed-precondition',
    });
  });

test('missing historical chunk cannot return a stub and a unit hash does not replace the whole-version hash', async () => {
  const f = await fixture(),
    head = (await list(f)).items[0],
    scope = chunkScope(head),
    row = (await list(f, scope)).items[0],
    bodyPath = path + '/workVersionBodies/' + row.id;
  await update(f, bodyPath, { content: 'tampered yet well-formed' });
  const fresh = (await list(f, scope)).items[0],
    chunk = (await readAll(f, request(f, fresh, scope))).dto.data,
    manifest = (await readAll(f, request(f, head))).dto.data;
  assert.notEqual(digest(chunk.content), manifest.contentHash);
  // Package assembly must reject this mismatch before sealing; no package is exposed here.
  await remove(f, bodyPath);
  await assert.rejects(f.api.readAdventureBackupHistory(uid, request(f, fresh, scope)), {
    code: 'failed-precondition',
  });
});

test('history cursor cannot change parent, kind, source or copy another account intent', async () => {
  const f = await fixture(2),
    page = await list(f, { limit: 1 }),
    cursor = JSON.parse(Buffer.from(page.nextCursor, 'base64url').toString()),
    row = page.items[0];
  for (const patch of [
    { kind: 'version-chunk' },
    { parentId: versionId },
    { parentToken: row.itemToken },
    { sourceToken: '0'.repeat(64) },
    { adventureId: 'another-project' },
    { version: 2 },
    { extra: true },
  ])
    await assert.rejects(
      list(f, {
        cursor: Buffer.from(JSON.stringify({ ...cursor, ...patch })).toString('base64url'),
      }),
      { code: 'invalid-argument' },
    );
  for (const patch of [
    { kind: 'version-chunk' },
    { parentId: versionId },
    { limit: 51 },
    { parentToken: row.itemToken },
  ])
    await assert.rejects(list(f, patch), { code: 'invalid-argument' });
  for (const actor of [null, 'other']) {
    await assert.rejects(
      f.api.listAdventureBackupHistory(actor, {
        adventureId: id,
        sourceToken: f.pin.sourceToken,
        kind: 'version',
      }),
      { code: actor ? 'not-found' : 'unauthenticated' },
    );
    await assert.rejects(f.api.readAdventureBackupHistory(actor, request(f, row)), {
      code: actor ? 'not-found' : 'unauthenticated',
    });
  }
});

test('header literals and legacy schema absence do not invent labels or dates', async () => {
  const f = await fixture(),
    value = structuredClone(f.records.get(versionPath));
  delete value.schemaVersion;
  delete value.label;
  value.createdAt = 0;
  await f.db.runTransaction((tx) => tx.set(f.db.doc(versionPath), value));
  const head = (await readAll(f, request(f, (await list(f)).items[0]))).dto.data;
  assert.equal(head.createdAt, 0);
  assert.equal(Object.hasOwn(head, 'label'), false);
});

test('captured history request and retry preserve original scope and source bytes', async () => {
  const f = await fixture(),
    row = (await list(f)).items[0],
    input = request(f, row),
    before = structuredClone([...f.records]);
  let paused = false;
  const port = {
    ...f.db,
    runTransaction: (op) =>
      f.db.runTransaction((tx) =>
        op({
          ...tx,
          async getAll(ref, options) {
            if (!paused) {
              paused = true;
              await Promise.resolve();
              Object.assign(input, {
                kind: 'version-chunk',
                parentId: 'other',
                id: 'other',
                index: 7,
              });
            }
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  const result = await createAdventureBackupHistoryService({ db: port }).readAdventureBackupHistory(
    uid,
    input,
  );
  assert.equal(result.kind, 'version');
  assert.equal(result.id, row.id);
  assert.equal(result.index, 0);
  const failing = {
    ...f.db,
    runTransaction: (op) =>
      f.db.runTransaction((tx) =>
        op({
          ...tx,
          getAll(ref, options) {
            if (ref.path === versionPath) throw Error('injected historical failure');
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  await assert.rejects(
    createAdventureBackupHistoryService({ db: failing }).readAdventureBackupHistory(
      uid,
      request(f, row),
    ),
    /injected historical failure/,
  );
  await readAll(f, request(f, row));
  assert.deepEqual([...f.records], before);
});

const textRequest = (f, row, ordinal = 0) => ({
  adventureId: id,
  sourceToken: f.pin.sourceToken,
  ...chunkScope(row),
  ordinal,
});
test('ordered raw history reads preserve Unicode, chunk hashes and native manifests without writes', async () => {
  const content = 'a'.repeat(65535) + '🌙' + 'b'.repeat(65533),
    f = await fixture(1, content),
    row = (await list(f)).items[0],
    before = structuredClone([...f.records]),
    chunks = [];
  const head = f.records.get(versionPath);
  assert.equal(head.chunkCount, 3);
  for (let ordinal = 0; ordinal < head.chunkCount; ordinal++) {
    const result = await f.api.readAdventureBackupHistoryText(uid, textRequest(f, row, ordinal)),
      bytes = Buffer.from(result.chunkBase64, 'base64');
    assert.equal(result.ordinal, ordinal);
    assert.equal(result.parentToken, row.itemToken);
    assert.equal(result.id, digest({ versionId: row.id, index: ordinal }));
    assert.ok(bytes.length <= 65536);
    assert.equal(digest(bytes.toString('utf8')), result.chunkHash);
    assert.deepEqual(result.manifest, {
      byteLength: head.byteLength,
      chunkCount: head.chunkCount,
      contentHash: head.contentHash,
    });
    chunks.push(bytes);
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(bytes.toString('utf8'), content);
  assert.equal(bytes.length, head.byteLength);
  assert.equal(digest(content), head.contentHash);
  assert.deepEqual([...f.records], before);
});
test('raw history supports an empty retained version and does not require its current source', async () => {
  const f = await fixture(1, ''),
    row = (await list(f)).items[0];
  await f.db.runTransaction((tx) => {
    tx.delete(f.db.doc(scenePath));
    tx.delete(f.db.doc(scenePath + '/body/current'));
  });
  const result = await f.api.readAdventureBackupHistoryText(uid, textRequest(f, row));
  assert.equal(result.chunkBase64, '');
  assert.equal(result.chunkHash, digest(''));
  assert.deepEqual(result.manifest, { byteLength: 0, chunkCount: 1, contentHash: digest('') });
});
test('raw history checks actor, source, parent and closed ordinal input before exposing text', async () => {
  const f = await fixture(),
    row = (await list(f)).items[0],
    input = textRequest(f, row);
  for (const actor of ['', 'other'])
    await assert.rejects(f.api.readAdventureBackupHistoryText(actor, input), {
      code: actor ? 'not-found' : 'unauthenticated',
    });
  for (const ordinal of [-1, 0.5, NaN, Infinity, '0', f.records.get(versionPath).chunkCount])
    await assert.rejects(f.api.readAdventureBackupHistoryText(uid, { ...input, ordinal }), {
      code: 'invalid-argument',
    });
  await assert.rejects(f.api.readAdventureBackupHistoryText(uid, { ...input, extra: true }), {
    code: 'invalid-argument',
  });
  for (const patch of [{ sourceToken: 'f'.repeat(64) }, { parentToken: 'f'.repeat(64) }])
    await assert.rejects(f.api.readAdventureBackupHistoryText(uid, { ...input, ...patch }), {
      code: 'failed-precondition',
    });
});
for (const patch of [
  { versionId: 'other' },
  { index: 99 },
  { contentStorage: null },
  { bodyStorage: null },
  { content: '\ud800' },
]) {
  test('raw history refuses a malformed physical chunk: ' + Object.keys(patch)[0], async () => {
    const f = await fixture(),
      row = (await list(f)).items[0],
      path = 'adventures/' + id + '/workVersionBodies/' + digest({ versionId: row.id, index: 0 });
    await f.db.runTransaction((tx) => tx.update(f.db.doc(path), patch));
    await assert.rejects(f.api.readAdventureBackupHistoryText(uid, textRequest(f, row)), {
      code: 'failed-precondition',
    });
  });
}
test('raw history has no missing-body fallback and refreshed child tokens reveal recreation', async () => {
  const f = await fixture(),
    row = (await list(f)).items[0],
    input = textRequest(f, row),
    path = 'adventures/' + id + '/workVersionBodies/' + digest({ versionId: row.id, index: 0 });
  const first = await f.api.readAdventureBackupHistoryText(uid, input),
    body = structuredClone(f.records.get(path));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await assert.rejects(f.api.readAdventureBackupHistoryText(uid, input), {
    code: 'failed-precondition',
  });
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), body));
  const recreated = await f.api.readAdventureBackupHistoryText(uid, input);
  assert.notEqual(recreated.itemToken, first.itemToken);
  assert.equal(recreated.chunkBase64, first.chunkBase64);
});
test('raw history freezes ordinal and parent before the first await and retries as a read-only operation', async () => {
  const f = await fixture(1, 'x'.repeat(80000)),
    row = (await list(f)).items[0],
    input = textRequest(f, row),
    before = structuredClone([...f.records]);
  let entered = false;
  const db = {
    ...f.db,
    runTransaction: (op) =>
      f.db.runTransaction((tx) =>
        op({
          ...tx,
          getAll: async (ref, options) => {
            if (!entered) {
              entered = true;
              await Promise.resolve();
              Object.assign(input, { ordinal: 1, parentId: 'other', parentToken: 'f'.repeat(64) });
            }
            return tx.getAll(ref, options);
          },
        }),
      ),
  };
  const result = await createAdventureBackupHistoryService({ db }).readAdventureBackupHistoryText(
    uid,
    input,
  );
  assert.equal(result.ordinal, 0);
  assert.equal(result.parentId, row.id);
  assert.equal(Buffer.from(result.chunkBase64, 'base64').length, 65536);
  await f.api.readAdventureBackupHistoryText(uid, textRequest(f, row));
  assert.deepEqual([...f.records], before);
});
