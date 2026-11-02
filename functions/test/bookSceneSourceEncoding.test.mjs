import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import { createBookBackupResourceService } from '../src/bookBackupResourceRead.mjs';
import { serializeBookBackupResource } from '../src/bookBackupResources.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  seedIndexedSceneSource,
  observeSceneSourcePartReads,
} from './helpers/bookSceneSourceEncodingFixture.mjs';
async function fixture(content = '\ufeff' + 'source exact '.repeat(95000), options) {
  const f = adventureImportDb({ nativeUpdates: true }),
    seeded = await seedIndexedSceneSource(f.db, content, options),
    root = createBookBackupReadService({ db: f.db }),
    api = createBookBackupResourceService({ db: f.db }),
    anchor = await root.getBookBackupSource(seeded.uid, { bookId: seeded.bookId }),
    scope = { bookId: seeded.bookId, kind: 'scene-source', sourceToken: anchor.sourceToken },
    item = (await api.listBookBackupResources(seeded.uid, scope)).items[0];
  return { ...f, ...seeded, api, anchor, scope, item };
}
async function collect(f) {
  const observer = observeSceneSourcePartReads(f.db),
    output = [];
  let count, first;
  try {
    for (let index = 0; count === undefined || index < count; index++) {
      const result = await f.api.readBookBackupResource(f.uid, { ...f.scope, ...f.item, index });
      if (!first) first = result;
      assert.equal(result.contentHash, first.contentHash);
      assert.equal(result.byteLength, first.byteLength);
      assert.equal(result.index, index);
      assert.ok(Buffer.from(result.chunkBase64, 'base64').length <= 65536);
      count = result.chunkCount;
      output.push(Buffer.from(result.chunkBase64, 'base64'));
    }
  } finally {
    observer.stop();
  }
  const bytes = Buffer.concat(output),
    expected = serializeBookBackupResource('scene-source', null, f.sourceId, f.source);
  assert.deepEqual(bytes, Buffer.from(expected.bytes));
  assert.equal(first.contentHash, digest(expected.json));
  return { counts: observer.counts, count, bytes };
}
const variants = [
  ['Unicode boundary and BOM', '\ufeff' + 'a'.repeat(65531) + '🌙ç'.repeat(110000)],
  ['JSON escapes and controls', '"\\\n\u0000\t'.repeat(130000)],
  ['near 8 MiB', '\ufeff' + 'x'.repeat(8 * 1024 * 1024 - 4096)],
];
for (const [label, content] of variants)
  test('indexed source preserves exact legacy JSON and bounded reads: ' + label, async (t) => {
    const f = await fixture(content),
      result = await collect(f);
    assert.ok(result.counts.every((count) => count <= 4));
    assert.ok(result.counts.reduce((a, b) => a + b, 0) <= 4 * result.count);
    const queries = f.reads.filter(
      (q) => q.collectionPath === 'books/' + f.bookId + '/sceneSources',
    );
    assert.ok(queries.every((q) => q.fields.includes('original.contentStorage')));
    if (label === 'Unicode boundary and BOM')
      assert.ok(f.plan.writes[0].value.sceneSourceEncoding.carry.some((n) => n > 0));
    t.diagnostic(
      result.count +
        ' output pages, ' +
        result.counts.reduce((a, b) => a + b, 0) +
        ' raw-part get requests',
    );
  });
test('missing legacy index keeps exact output without pretending to have bounded range reads', async () => {
  const f = await fixture(undefined, { indexed: false }),
    result = await collect(f);
  assert.ok(result.counts.some((count) => count > 4));
});
for (const [label, mutate] of [
  ['unknown field', (index) => (index.path = 'elsewhere')],
  ['missing index shape', () => null],
  ['offset count', (index) => index.offsets.pop()],
  ['carry count', (index) => index.carry.pop()],
  ['invalid carry', (index) => (index.carry[1] = 4)],
  ['last carry', (index) => (index.carry[index.carry.length - 1] = 1)],
  ['prefix hash', (index) => (index.prefixHash = 'f'.repeat(64))],
  ['suffix hash', (index) => (index.suffixHash = 'f'.repeat(64))],
  ['unsafe length', (index) => (index.byteLength = Number.MAX_SAFE_INTEGER)],
  ['offset order', (index) => (index.offsets[1] = 0)],
  ['wrong escaped length', (index) => (index.offsets[1] += 1)],
])
  test('present malformed index fails closed: ' + label, async () => {
    const f = await fixture(),
      header = f.records.get(f.bodyPath),
      index = structuredClone(header.sceneSourceEncoding),
      changed = mutate(index);
    await f.db.runTransaction(async (tx) =>
      tx.update(f.db.doc(f.bodyPath), { sceneSourceEncoding: changed === null ? null : index }),
    );
    const item = (await f.api.listBookBackupResources(f.uid, f.scope)).items[0];
    await assert.rejects(() =>
      f.api.readBookBackupResource(f.uid, { ...f.scope, ...item, index: 0 }),
    );
  });
for (const mode of ['recreated body and all parts', 'updated body', 'ABA body metadata'])
  test('item proof rejects ' + mode + ' without consuming plaintext', async () => {
    const f = await fixture(),
      rows = [...f.records].filter(
        ([path]) => path === f.bodyPath || path.startsWith(f.bodyPath + '/chunks/'),
      );
    if (mode === 'recreated body and all parts') {
      await f.db.runTransaction(async (tx) => {
        for (const [path] of rows) tx.delete(f.db.doc(path));
      });
      await f.db.runTransaction(async (tx) => {
        for (const [path, value] of rows) tx.create(f.db.doc(path), value);
      });
    } else {
      await f.db.runTransaction(async (tx) => tx.update(f.db.doc(f.bodyPath), { pins: 2 }));
      if (mode === 'ABA body metadata')
        await f.db.runTransaction(async (tx) => tx.update(f.db.doc(f.bodyPath), { pins: 1 }));
    }
    const observer = observeSceneSourcePartReads(f.db);
    try {
      await assert.rejects(() =>
        f.api.readBookBackupResource(f.uid, { ...f.scope, ...f.item, index: 0 }),
      );
    } finally {
      observer.stop();
    }
    assert.equal(
      observer.counts.reduce((a, b) => a + b, 0),
      0,
    );
    const item = (await f.api.listBookBackupResources(f.uid, f.scope)).items[0];
    assert.notEqual(item.itemToken, f.item.itemToken);
    await f.api.readBookBackupResource(f.uid, { ...f.scope, ...item, index: 0 });
  });
test('range reader detects a corrupted required part instead of silently falling back', async () => {
  const f = await fixture(),
    path = f.bodyPath + '/chunks/000000000000000';
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc(path), { bytes: Buffer.alloc(65536) }),
  );
  await assert.rejects(() =>
    f.api.readBookBackupResource(f.uid, { ...f.scope, ...f.item, index: 0 }),
  );
});

test('a source marked unavailable is rejected before any raw-part read even with a fresh item token', async () => {
  const f = await fixture();
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/' + f.bookId + '/sceneSources/' + f.sourceId), { deleting: true }),
  );
  const item = (await f.api.listBookBackupResources(f.uid, f.scope)).items[0],
    observer = observeSceneSourcePartReads(f.db);
  try {
    await assert.rejects(() =>
      f.api.readBookBackupResource(f.uid, { ...f.scope, ...item, index: 0 }),
    );
  } finally {
    observer.stop();
  }
  assert.equal(
    observer.counts.reduce((a, b) => a + b, 0),
    0,
  );
});
