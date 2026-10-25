import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { BOOK_RESTORE_METHODS, preparationProgress } from '../src/bookRestoreUploadContracts.mjs';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  readyRestoreHistory,
  finishRestoreHistory,
  historyRestoreFixture,
} from './helpers/bookRestoreHistoryFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
  uploadLegacyRestore,
  finishLegacyRestore,
} from './helpers/bookLegacyRestoreFixture.mjs';
import { bookLegacyFixture } from './helpers/bookLegacyFixture.mjs';
import { finishRestoreStructure } from './helpers/bookRestoreStructureFixture.mjs';
import { finishRestoreLore } from './helpers/bookRestoreLoreFixture.mjs';
import { finishRestoreResources } from './helpers/bookRestoreResourcesFixture.mjs';
import { finishRestoreCounts } from './helpers/bookRestoreCountsFixture.mjs';
import { finishRestorePersonas } from './helpers/bookRestorePersonasFixture.mjs';
const uid = 'author',
  id = 'history-restore01',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
const stage = async (f, p, op = 'history-stage-0001') =>
  (await f.api.advanceBookRestoreHistory(uid, mutation(id, p, op))).progress;
const mapper = (p) =>
  createBookRestoreRemapper({
    schemaVersion: 1,
    jobToken: p.jobToken,
    sourceBookId: 'book',
    bookId: p.bookId,
  });
test('preserves complete private versions of removed resources and ends before draft without changing manuscript', async () => {
  const f = setup(),
    initial = await readyRestoreHistory(f.factory, uid, id),
    p = await finishRestoreHistory(f.factory, uid, id, initial),
    m = mapper(p),
    native = f.records.get(
      'books/' + p.bookId + '/workVersions/' + m.identity('version', 'manual'),
    );
  assert.equal(p.preparation.schemaVersion, 7);
  assert.equal(f.records.get(root).cleanupVersion, 10);
  assert.equal(p.preparation.phase, 'draft');
  assert.equal(native.reason, 'manual');
  assert.equal(native.label, '  Rótulo 🌙  ');
  assert.equal(native.createdAt, 10);
  assert.equal(native.deleting, false);
  assert.equal(native.target.id, p.bookId);
  assert.equal(native.resource.id, m.identity('chapter', 'removed'));
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.equal(f.records.has('books/' + p.bookId + '/chapters/' + native.resource.id), false);
  assert.equal(f.records.get('books/' + p.bookId + '/workProgress/current').countReady, false);
  assert.equal(p.preparation.history.versions, 2);
  assert.equal(p.preparation.history.bodyCount, 2);
  assert.equal(BOOK_RESTORE_METHODS.includes('advanceBookRestoreHistory'), true);
  const history = createWorkHistoryService({ db: f.db });
  await assert.rejects(() =>
    history.readWorkVersion(uid, { target: { kind: 'book', id: p.bookId }, versionId: native.id }),
  );
  // Synthetic root only proves compatibility of existing readers, not production activation.
  f.records.set('books/' + p.bookId, { authorId: uid, title: 'Synthetic root' });
  const result = await history.readWorkVersion(uid, {
    target: { kind: 'book', id: p.bookId },
    versionId: native.id,
  });
  assert.equal(result.chunks.map((c) => c.content).join(''), '\ufeffOriginal 🌙');
  const empty = await history.readWorkVersion(uid, {
    target: { kind: 'book', id: p.bookId },
    versionId: m.identity('version', 'backup'),
  });
  assert.equal(empty.version.reason, 'before-restore');
  assert.equal(empty.chunks[0].content, '');
});
test('resumes one source frame at a time and keeps exact Unicode/BOM/hash', async () => {
  const f = setup(),
    parts = ['\ufeff' + '🌙'.repeat(16383), 'á'.repeat(32768), 'fim'],
    content = parts.join(''),
    initial = await readyRestoreHistory(
      f.factory,
      uid,
      id,
      historyRestoreFixture([{ id: 'large', content, parts }]),
    ),
    first = await stage(f, initial),
    key = 'books/' + first.bookId + '/workVersions/' + mapper(first).identity('version', 'large');
  assert.equal(first.preparation.itemIndex, initial.preparation.itemIndex);
  assert.equal(first.preparation.history.pending.part, 1);
  assert.equal(first.preparation.history.pending.bytes, Buffer.byteLength(parts[0]));
  assert.equal(first.preparation.history.bodyCount, 1);
  assert.equal(f.records.has(key), false);
  assert.equal(JSON.stringify(first.preparation.history).includes('🌙'), false);
  const p = await finishRestoreHistory(f.factory, uid, id, first),
    version = f.records.get(key),
    bodies = [...f.records]
      .filter(([k]) => k.startsWith('books/' + p.bookId + '/workVersionBodies/'))
      .map(([, v]) => v)
      .sort((a, b) => a.index - b.index);
  assert.equal(version.chunkCount, 3);
  assert.equal(p.preparation.history.sourceChunks, 3);
  assert.equal(bodies.map((v) => v.content).join(''), content);
  assert.ok(bodies.every((v) => Buffer.byteLength(v.content) <= 65536));
  assert.equal(p.preparation.history.pending, null);
});
test('CAS/replay and a new service instance do not duplicate header or bodies', async () => {
  const f = setup(),
    initial = await readyRestoreHistory(f.factory, uid, id),
    a = mutation(id, initial, 'history-race-one'),
    b = mutation(id, initial, 'history-race-two'),
    results = await Promise.allSettled([
      f.api.advanceBookRestoreHistory(uid, a),
      f.factory().advanceBookRestoreHistory(uid, b),
    ]);
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  const won = results[0].status === 'fulfilled' ? a : b,
    first = results.find((r) => r.status === 'fulfilled').value;
  assert.deepEqual(await f.factory().advanceBookRestoreHistory(uid, won), first);
  const p = await finishRestoreHistory(f.factory, uid, id, first.progress);
  assert.deepEqual((await f.api.advanceBookRestoreHistory(uid, won)).receipt, first.receipt);
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith('books/' + p.bookId + '/workVersions/'))
      .length,
    2,
  );
});
test('body write failure and automatic transaction callback retry preserve the cursor and receipt', async () => {
  const f = setup(),
    initial = await readyRestoreHistory(f.factory, uid, id),
    run = f.db.runTransaction.bind(f.db),
    before = structuredClone([...f.records]),
    failure = new Error('body write failed');
  let inject = true,
    automatic = false;
  f.db.runTransaction = async (operation) => {
    try {
      return await run(async (tx) => {
        const create = tx.create;
        tx.create = (ref, ...args) => {
          if (inject && ref.path.includes('/workVersionBodies/')) throw failure;
          return create(ref, ...args);
        };
        return operation(tx);
      });
    } catch (error) {
      if (error === failure && automatic) {
        inject = false;
        return run(operation);
      }
      throw error;
    }
  };
  const request = mutation(id, initial, 'history-retry-001');
  await assert.rejects(
    () => f.api.advanceBookRestoreHistory(uid, request),
    (e) => e === failure,
  );
  assert.deepEqual([...f.records], before);
  automatic = true;
  const result = await f.api.advanceBookRestoreHistory(uid, request);
  assert.equal(result.progress.preparation.history.versions, 1);
  assert.deepEqual(await f.api.advanceBookRestoreHistory(uid, request), result);
});
test('occupied new namespace prevents migration and foreign data is preserved', async () => {
  const f = setup(),
    initial = await readyRestoreHistory(f.factory, uid, id),
    path = 'books/' + initial.bookId + '/workVersions/foreign';
  f.records.set(path, { foreign: true });
  const before = structuredClone([...f.records]);
  await assert.rejects(() => stage(f, initial));
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.get(root).cleanupVersion, 9);
});
test('cancel during source read prevents new body writes and receipt', async () => {
  const f = setup(),
    initial = await readyRestoreHistory(f.factory, uid, id),
    run = f.db.runTransaction.bind(f.db);
  let intercepted = false;
  f.db.runTransaction = async (operation) => {
    let sourceRead = false;
    const result = await run(async (tx) => {
      const get = tx.get;
      tx.get = async (ref, ...args) => {
        const value = await get(ref, ...args);
        if (ref.path?.startsWith(root + '/chunks/')) sourceRead = true;
        return value;
      };
      return operation(tx);
    });
    if (sourceRead && !intercepted) {
      intercepted = true;
      await f.api.cancelBookRestore(uid, mutation(id, initial, 'history-reading-cancel'));
    }
    return result;
  };
  await assert.rejects(() => stage(f, initial));
  assert.equal(intercepted, true);
  assert.equal(
    [...f.records.keys()].some((k) => k.includes('/workVersionBodies/')),
    false,
  );
  assert.equal(f.records.has('users/' + uid + '/bookRestoreOperations/history-stage-0001'), false);
});
test('partial version cleanup removes journaled bodies without a header and preserves other copies', async () => {
  const f = setup(),
    parts = ['a'.repeat(65536), 'b'],
    initial = await readyRestoreHistory(
      f.factory,
      uid,
      id,
      historyRestoreFixture([{ id: 'partial', content: parts.join(''), parts }]),
    ),
    first = await stage(f, initial);
  f.records.set('books/other/workVersionBodies/own', { content: 'keep' });
  const terminal = await cleanupLegacyRestore(f.api, uid, id, first, { limit: 1 });
  assert.equal(terminal.state, 'cancelled');
  assert.equal(terminal.preparation.cleanedArtifacts, first.preparation.artifactCount);
  assert.equal(
    [...f.records.keys()].some((k) => k.startsWith('books/' + first.bookId + '/workVersion')),
    false,
  );
  assert.equal(f.records.get('books/other/workVersionBodies/own').content, 'keep');
});
test('forged hash checkpoint cannot complete a pending version', async () => {
  const f = setup(),
    parts = ['a'.repeat(65536), 'b'],
    initial = await readyRestoreHistory(
      f.factory,
      uid,
      id,
      historyRestoreFixture([{ id: 'partial', content: parts.join(''), parts }]),
    ),
    first = await stage(f, initial),
    job = structuredClone(f.records.get(root));
  job.preparation.history.pending.hashState = 'AAAA';
  f.records.set(root, job);
  const before = structuredClone([...f.records]);
  await assert.rejects(() => stage(f, first, 'history-forged-hash'));
  assert.deepEqual([...f.records], before);
});
test('closed history progress rejects invalid cursor, positions, premature phase and lost pending state', async () => {
  const f = setup(),
    parts = ['a'.repeat(65536), 'b'],
    initial = await readyRestoreHistory(
      f.factory,
      uid,
      id,
      historyRestoreFixture([{ id: 'partial', content: parts.join(''), parts }]),
    ),
    first = await stage(f, initial);
  for (const change of [
    (p) => (p.history.pending.cursor.previous = 'x'),
    (p) => (p.history.pending.part = 0),
    (p) => p.history.startIndex--,
    (p) => (p.phase = 'draft'),
    (p) => (p.history.name = 'prose'),
  ]) {
    const p = structuredClone(first.preparation);
    change(p);
    assert.throws(() => preparationProgress(p));
  }
});
for (const version of [1, 2, 3, 4, 5, 6])
  test('legacy v' + version + ' keeps history absent rather than inventing versions', async () => {
    const f = setup(),
      uploaded = await uploadLegacyRestore(f.api, uid, id, bookLegacyFixture(version)),
      validated = await finishLegacyRestore(f.factory, uid, id, uploaded.progress),
      structure = await finishRestoreStructure(f.factory, uid, id, validated),
      lore = await finishRestoreLore(f.factory, uid, id, structure),
      resources = await finishRestoreResources(f.factory, uid, id, lore),
      counts = await finishRestoreCounts(f.factory, uid, id, resources),
      personas = await finishRestorePersonas(f.factory, uid, id, counts),
      universe = (
        await f.api.advanceBookRestoreUniverse(uid, mutation(id, personas, 'legacy-universe01'))
      ).progress,
      p = await stage(f, universe);
    assert.equal(p.preparation.phase, 'draft');
    assert.equal(p.preparation.history.versions, 0);
    assert.equal(p.preparation.history.bodyCount, 0);
    const terminal = await cleanupLegacyRestore(f.api, uid, id, p, { limit: 10 });
    assert.equal(terminal.state, 'cancelled');
  });

test('history larger than a native document stays bounded by one frame per operation', async () => {
  const f = setup(),
    parts = Array.from({ length: 17 }, (_, i) => (i % 2 ? 'b' : 'a').repeat(65536)),
    initial = await readyRestoreHistory(
      f.factory,
      uid,
      id,
      historyRestoreFixture([{ id: 'long', content: parts.join(''), parts }]),
    ),
    first = await stage(f, initial),
    p = await finishRestoreHistory(f.factory, uid, id, first),
    version = f.records.get(
      'books/' + p.bookId + '/workVersions/' + mapper(p).identity('version', 'long'),
    );
  assert.equal(first.preparation.history.pending.part, 1);
  assert.equal(first.preparation.history.bodyCount, 1);
  assert.equal(version.chunkCount, 17);
  assert.equal(version.byteLength, 17 * 65536);
  assert.equal(p.preparation.history.bodyCount, 17);
  assert.ok(
    f.commits.every(
      (writes) =>
        writes.filter((w) => w.method === 'create' && w.path.includes('/workVersionBodies/'))
          .length <= 1,
    ),
  );
});
test('a prepared raw unit is bound to its source and cannot be committed after native bytes change', async () => {
  const f = setup(),
    initial = await readyRestoreHistory(f.factory, uid, id),
    reader = await f.api.openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: initial.jobToken,
    }),
    item = await reader.readMappedItem(initial.preparation.itemIndex),
    unit = await item.readRawPart({ part: 0 });
  await assert.rejects(() => item.readRawPart({ part: 0, cursor: unit.cursor }));
  const path = [...f.records.keys()].find((k) => k.startsWith(root + '/chunks/'));
  await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { chunkBase64: 'corrupted' }));
  await assert.rejects(() =>
    f.db.runTransaction(async (tx) => {
      await unit.verify(tx);
      tx.create(f.db.doc('books/copy'), { bad: true });
    }),
  );
  assert.equal(f.records.has('books/copy'), false);
});
test('cleanup protects a recreated partial body instead of deleting the new incarnation', async () => {
  const f = setup(),
    parts = ['a'.repeat(65536), 'b'],
    initial = await readyRestoreHistory(
      f.factory,
      uid,
      id,
      historyRestoreFixture([{ id: 'partial', content: parts.join(''), parts }]),
    ),
    first = await stage(f, initial),
    path = [...f.records.keys()].find((k) =>
      k.startsWith('books/' + first.bookId + '/workVersionBodies/'),
    ),
    value = f.records.get(path);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
  const cancelling = (
    await f.api.cancelBookRestore(uid, mutation(id, first, 'history-cancel-recreated'))
  ).progress;
  await assert.rejects(() => cleanupLegacyRestore(f.api, uid, id, cancelling, { limit: 5 }));
  assert.deepEqual(f.records.get(path), value);
});
