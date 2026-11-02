import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { readBookResourcePayload } from '../src/bookResourcePayloadRead.mjs';
import { jobShape } from '../src/bookRestoreUploadContracts.mjs';
import { lorePayloadStorage } from '../src/bookRestoreLorePayloadContracts.mjs';
import { lorePayloadSegmentId } from '../src/bookRestoreLorePayload.mjs';
import {
  readyLargeLore,
  finishLargeLore,
  largeLoreData,
  largeLoreRecords,
  mutation,
} from './helpers/bookRestoreLorePayloadFixture.mjs';
import { cleanupLegacyRestore } from './helpers/bookLegacyRestoreFixture.mjs';
import { finishRestoreResources } from './helpers/bookRestoreResourcesFixture.mjs';
import { finishRestoreCounts } from './helpers/bookRestoreCountsFixture.mjs';
import {
  readyRestoreSourceIndexes,
  finishRestoreSourceIndexes,
} from './helpers/bookRestoreSourceIndexesFixture.mjs';
const uid = 'author',
  id = 'large-lore-job001',
  root = 'users/' + uid + '/bookRestores/' + id;
const sha = (v) => createHash('sha256').update(v).digest('hex');
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
function entity(p) {
  return createBookRestoreRemapper({
    schemaVersion: 1,
    jobToken: p.jobToken,
    sourceBookId: 'book',
    bookId: p.bookId,
  }).identity('lore', 'entity');
}
async function base(f, p, storage) {
  return f.db.runTransaction(async (tx) =>
    readBookResourcePayload(tx, f.db, {
      uid,
      bookId: p.bookId,
      resource: { kind: 'lore', parentId: null, id: entity(p) },
      ...storage.base,
    }),
  );
}
test('large lore is prepared in parts and relation pages, final stub appears only after complete source; counts remain private', async () => {
  const f = setup(),
    data = largeLoreData(),
    initial = await readyLargeLore(f.factory, uid, id, data),
    request = mutation(id, initial, 'large-lore-first001'),
    first = await f.api.advanceBookRestoreLore(uid, request),
    path = 'books/' + initial.bookId + '/lore/' + entity(initial);
  assert.equal(f.records.has(path), false);
  assert.equal(f.records.get(root).payloadInventoryVersion, 1);
  assert.ok(first.progress.preparation.lorePayload.segment.nextPart <= 16);
  assert.deepEqual(await f.factory().advanceBookRestoreLore(uid, request), first);
  const p = await finishLargeLore(f.factory, uid, id, first.progress),
    stub = f.records.get(path),
    storage = lorePayloadStorage(stub.payloadStorage);
  assert.equal(p.preparation.loreCount, 3);
  assert.equal(p.preparation.loreRelationCount, 130);
  assert.equal(p.preparation.lorePayload, null);
  assert.deepEqual(storage.relations, { present: true, count: 130, pages: 3 });
  assert.deepEqual(Object.keys(stub).sort(), [
    'bookId',
    'createdAt',
    'payloadStorage',
    'updatedAt',
  ]);
  const logical = await base(f, p, storage);
  assert.equal(sha(logical.details), sha(data.details));
  assert.deepEqual(logical.aliases, data.aliases);
  assert.equal(logical.isPublic, false);
  const relations = [];
  for (let offset = 0; offset < 130; offset += 64) {
    const segment = f.records.get(
      'books/' +
        p.bookId +
        '/bookLoreSegments/' +
        lorePayloadSegmentId(storage.generationId, offset),
    );
    const values = await f.db.runTransaction(async (tx) =>
      readBookResourcePayload(tx, f.db, {
        uid,
        bookId: p.bookId,
        resource: { kind: 'lore', parentId: null, id: entity(p) },
        ...segment.payload,
      }),
    );
    relations.push(...values);
  }
  assert.equal(relations.length, 130);
  assert.equal(relations[0].targetEntityId, entity(p));
  assert.equal(relations[1].targetEntityId, 'universe:gone:external');
  assert.equal(relations[129].description, 'literal 129');
  assert.equal(f.records.has('books/' + p.bookId), false);
  const resources = await finishRestoreResources(f.factory, uid, id, p);
  const counted = await finishRestoreCounts(f.factory, uid, id, resources);
  assert.equal(counted.preparation.phase, 'personas');
  assert.equal(counted.preparation.counts.lorePayloadOffset, null);
  assert.equal(f.records.get('books/' + p.bookId + '/workProgress/current').countReady, false);
  const cancelled = await cleanupLegacyRestore(f.api, uid, id, counted, { limit: 3 });
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(cancelled.preparation.cleanedArtifacts, cancelled.preparation.artifactCount);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + p.bookId + '/')),
    false,
  );
});
for (const mode of ['absent', 'empty'])
  test('large base preserves ' + mode + ' relations', async () => {
    const f = setup(),
      data = {
        name: 'x'.repeat(600000),
        category: 'other',
        ...(mode === 'empty' ? { relations: [] } : {}),
      },
      p = await finishLargeLore(f.factory, uid, id, await readyLargeLore(f.factory, uid, id, data)),
      storage = f.records.get('books/' + p.bookId + '/lore/' + entity(p)).payloadStorage;
    assert.deepEqual(storage.relations, { present: mode === 'empty', count: 0, pages: 0 });
    const value = await base(f, p, storage);
    assert.equal(value.name.length, 600000);
    assert.equal(Object.hasOwn(value, 'relations'), false);
  });
test('cancellation drains journaled orphan parts before a body exists and no delayed replay recreates them', async () => {
  const f = setup(),
    p0 = await readyLargeLore(f.factory, uid, id),
    request = mutation(id, p0, 'large-orphan-first01'),
    first = await f.api.advanceBookRestoreLore(uid, request);
  assert.equal([...f.records.keys()].filter((k) => k.includes('/bookResourceBodies/')).length, 0);
  assert.ok([...f.records.keys()].some((k) => k.includes('/bookResourceChunks/')));
  const done = await cleanupLegacyRestore(f.api, uid, id, first.progress, { limit: 2 });
  await f.api.advanceBookRestoreLore(uid, request);
  assert.equal(done.preparation.cleanedArtifacts, done.preparation.artifactCount);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + p0.bookId + '/')),
    false,
  );
});
for (const kind of ['bookResourceChunks', 'bookResourceBodies', 'bookLoreSegments'])
  test('foreign ' + kind + ' blocks first inventory transition and remains intact', async () => {
    const f = setup(),
      p = await readyLargeLore(f.factory, uid, id),
      path = 'books/' + p.bookId + '/' + kind + '/' + 'a'.repeat(64);
    f.records.set(path, { foreign: true });
    await assert.rejects(() =>
      f.api.advanceBookRestoreLore(uid, mutation(id, p, 'large-foreign-first01')),
    );
    assert.deepEqual(f.records.get(path), { foreign: true });
    assert.equal(f.records.get(root).payloadInventoryVersion, undefined);
  });
test('a recreated raw part blocks seal and cleanup, without overwriting its new incarnation', async () => {
  const f = setup(),
    p0 = await readyLargeLore(f.factory, uid, id),
    p = (await f.api.advanceBookRestoreLore(uid, mutation(id, p0, 'large-aba-first01'))).progress,
    path = [...f.records.keys()].find((k) => k.includes('/bookResourceChunks/')),
    value = structuredClone(f.records.get(path));
  await f.db.runTransaction(async (tx) => {
    tx.delete(f.db.doc(path));
  });
  await f.db.runTransaction(async (tx) => {
    tx.create(f.db.doc(path), value);
  });
  await assert.rejects(() => finishLargeLore(f.factory, uid, id, p));
  await assert.rejects(() => cleanupLegacyRestore(f.api, uid, id, p, { limit: 50 }));
  assert.equal(sha(f.records.get(path).bytes), sha(value.bytes));
});
test('two competing operations advance one chunk batch; malformed progress and capability versions fail closed', async () => {
  const f = setup(),
    p = await readyLargeLore(f.factory, uid, id),
    results = await Promise.allSettled([
      f.api.advanceBookRestoreLore(uid, mutation(id, p, 'large-race-first01')),
      f.api.advanceBookRestoreLore(uid, mutation(id, p, 'large-race-second01')),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const saved = structuredClone(f.records.get(root));
  for (const change of [
    (j) => {
      j.payloadInventoryVersion = 2;
    },
    (j) => {
      delete j.payloadInventoryVersion;
    },
    (j) => {
      j.preparation.lorePayload.segment.nextPart = Number.MAX_SAFE_INTEGER;
    },
    (j) => {
      j.preparation.lorePayload.extra = true;
    },
    (j) => {
      j.preparation.lorePayload.base = {};
    },
  ]) {
    const bad = structuredClone(saved);
    change(bad);
    assert.throws(() => jobShape(uid, id, bad));
  }
});

test('a single large relation description uses its own multi-part payload without losing its literal text', async () => {
  const f = setup(),
    description = '\ufeff' + 'relation 🌙 '.repeat(100000),
    data = {
      name: 'A',
      category: 'other',
      relations: [{ targetEntityId: 'entity', relationType: '', description }],
    },
    p = await finishLargeLore(f.factory, uid, id, await readyLargeLore(f.factory, uid, id, data)),
    storage = f.records.get('books/' + p.bookId + '/lore/' + entity(p)).payloadStorage,
    segment = f.records.get(
      'books/' + p.bookId + '/bookLoreSegments/' + lorePayloadSegmentId(storage.generationId, 0),
    );
  assert.ok(segment.payload.manifest.chunkCount > 16);
  const page = await f.db.runTransaction(async (tx) =>
    readBookResourcePayload(tx, f.db, {
      uid,
      bookId: p.bookId,
      resource: { kind: 'lore', parentId: null, id: entity(p) },
      ...segment.payload,
    }),
  );
  assert.equal(sha(page[0].description), sha(description));
  assert.equal(page[0].targetEntityId, entity(p));
});
test('large aliases and structured details remain literal instead of being moved into small stub fields', async () => {
  const f = setup(),
    data = {
      name: 'N'.repeat(300000),
      category: 'other',
      aliases: ['', 'same', 'same', 'Alias'.repeat(70000)],
      structuredDetails: { appearance: '🌙'.repeat(80000), notes: '' },
    },
    p = await finishLargeLore(f.factory, uid, id, await readyLargeLore(f.factory, uid, id, data)),
    storage = f.records.get('books/' + p.bookId + '/lore/' + entity(p)).payloadStorage,
    value = await base(f, p, storage);
  assert.equal(sha(JSON.stringify(value.aliases)), sha(JSON.stringify(data.aliases)));
  assert.equal(sha(value.name), sha(data.name));
  assert.equal(sha(value.structuredDetails.appearance), sha(data.structuredDetails.appearance));
  assert.equal(Object.hasOwn(value, 'summary'), false);
});
test('many relations stay in fixed pages with bounded job size and native write batches', async () => {
  const f = setup(),
    data = {
      name: 'A',
      category: 'other',
      relations: Array.from({ length: 5000 }, () => ({ targetEntityId: 'x', relationType: '' })),
    },
    initial = await readyLargeLore(f.factory, uid, id, data),
    start = f.commits.length,
    p = await finishLargeLore(f.factory, uid, id, initial),
    storage = f.records.get('books/' + p.bookId + '/lore/' + entity(p)).payloadStorage;
  assert.deepEqual(storage.relations, { present: true, count: 5000, pages: 79 });
  assert.ok(Buffer.byteLength(JSON.stringify(f.records.get(root))) < 20000);
  assert.ok(f.commits.slice(start).every((writes) => writes.length <= 34));
  assert.equal(f.records.has('books/' + p.bookId), false);
});
test('a missing relation segment prevents count completion and leaves the book private', async () => {
  const f = setup(),
    p = await finishLargeLore(f.factory, uid, id, await readyLargeLore(f.factory, uid, id)),
    storage = f.records.get('books/' + p.bookId + '/lore/' + entity(p)).payloadStorage,
    path =
      'books/' + p.bookId + '/bookLoreSegments/' + lorePayloadSegmentId(storage.generationId, 64);
  await f.db.runTransaction(async (tx) => {
    tx.delete(f.db.doc(path));
  });
  const resources = await finishRestoreResources(f.factory, uid, id, p);
  await assert.rejects(() => finishRestoreCounts(f.factory, uid, id, resources));
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.equal(f.records.get(root).preparation.phase, 'resource-counts');
});
test('a failed staged write rolls back both inventory capability and progress and can retry with the same operation', async () => {
  const f = setup(),
    p = await readyLargeLore(f.factory, uid, id),
    request = mutation(id, p, 'large-rollback-first01'),
    run = f.db.runTransaction.bind(f.db);
  f.db.runTransaction = (operation) =>
    run(async (tx) =>
      operation({
        ...tx,
        create(ref, value) {
          if (ref.path.includes('/bookResourceChunks/')) throw new Error('Injected write failure');
          return tx.create(ref, value);
        },
      }),
    );
  await assert.rejects(() => f.api.advanceBookRestoreLore(uid, request));
  assert.equal(f.records.get(root).checkpoint, p.checkpoint);
  assert.equal(f.records.get(root).payloadInventoryVersion, undefined);
  assert.equal(
    [...f.records.keys()].some((k) => k.includes('/bookResourceChunks/')),
    false,
  );
  f.db.runTransaction = run;
  const result = await f.api.advanceBookRestoreLore(uid, request);
  assert.equal(result.progress.checkpoint, p.checkpoint + 1);
});

test('automatic callback retry advances a chunk cursor once and retains one authenticated batch', async () => {
  const f = setup(),
    p = await readyLargeLore(f.factory, uid, id),
    run = f.db.runTransaction.bind(f.db),
    failure = new Error('retry write'),
    request = mutation(id, p, 'large-auto-retry01');
  let inject = true,
    retries = 0;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) =>
        operation({
          ...tx,
          create(ref, value) {
            if (inject && ref.path.includes('/bookResourceChunks/')) throw failure;
            return tx.create(ref, value);
          },
        }),
      );
    } catch (error) {
      if (error !== failure) throw error;
      inject = false;
      retries++;
      return run(operation);
    }
  };
  const result = await f.api.advanceBookRestoreLore(uid, request);
  assert.equal(retries, 1);
  assert.equal(result.progress.checkpoint, p.checkpoint + 1);
  assert.equal(result.progress.preparation.lorePayload.segment.nextPart, 16);
  assert.equal(result.progress.preparation.artifactCount, p.preparation.artifactCount + 16);
  assert.deepEqual(await f.api.advanceBookRestoreLore(uid, request), result);
});

test('payload inventory survives every later preparation phase and v14 cancellation', async () => {
  const f = setup(),
    p11 = await readyRestoreSourceIndexes(f.factory, uid, id, largeLoreRecords()),
    p = await finishRestoreSourceIndexes(f.factory, uid, id, p11);
  assert.equal(p.preparation.schemaVersion, 12);
  assert.equal(f.records.get(root).cleanupVersion, 14);
  assert.equal(f.records.get(root).payloadInventoryVersion, 1);
  assert.equal(p.preparation.lorePayload, null);
  assert.equal(p.preparation.counts.lorePayloadOffset, null);
  assert.equal(f.records.has('books/' + p.bookId), false);
  const done = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 3 });
  assert.equal(done.state, 'cancelled');
  assert.equal(done.preparation.cleanedArtifacts, done.preparation.artifactCount);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + p.bookId + '/')),
    false,
  );
});
