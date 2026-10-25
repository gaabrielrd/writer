import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createBookContentMachine,
  createBookContentState,
  BOOK_CONTENT_CHECKPOINT_BYTES,
} from '../src/bookContentMachine.mjs';
import { validateBookBackupContent } from '../src/bookBackupContent.mjs';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { chunkId } from '../src/bookRestoreUploadContracts.mjs';
import { readBookBackupFrame } from '../src/bookBackupContainer.mjs';
import {
  initialBookValidation,
  prepareBookValidationStep,
  completeBookValidation,
} from '../src/bookRestoreValidationStep.mjs';
import {
  fixture,
  source,
  indexFixture,
  hashPort,
  resource,
  hash,
} from './helpers/bookContentFixture.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  indexedLoreData,
  indexedLoreArchive,
  PRIVATE_LORE_BODY,
} from './helpers/bookLoreContentFixture.mjs';
import { uploadArchiveRestore } from './helpers/bookRestoreContentFixture.mjs';
import {
  finishLegacyRestore,
  cleanupLegacyRestore,
  legacyMutation as mutation,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'indexed-lore-validation01',
  root = 'users/' + uid + '/bookRestores/' + id,
  descriptor = (record) => ({ kind: record.kind, id: record.id, part: 0 });
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
async function local(records) {
  return validateBookBackupContent(await source(records), {
    index: indexFixture(),
    hash: hashPort,
  });
}
function state(f) {
  return f.records.get(root + '/validationState/current')?.state;
}
async function untilPending(f, records = indexedLoreArchive(indexedLoreData({ count: 1000 }))) {
  let { progress } = await uploadArchiveRestore(f.api, uid, id, records);
  for (let step = 0; step < 100; step++) {
    progress = (
      await f
        .factory()
        .advanceBookRestoreValidation(uid, mutation(id, progress, id + '-pending-' + step))
    ).progress;
    if (state(f)?.lore?.frame) return progress;
  }
  throw Error('No dense frame checkpoint');
}
test('local validator accepts lore text and relation descriptions beyond 8 MiB without changing semantic reports', async () => {
  const big = indexedLoreArchive(indexedLoreData({ large: true, largeRelation: true })),
    expected = await local(indexedLoreArchive()),
    actual = await local(big);
  assert.ok(big.filter((r) => r.kind === 'book-lore').length > 256);
  assert.deepEqual(actual.totals, expected.totals);
  assert.deepEqual(actual.warnings, expected.warnings);
});
test('machine resumes dense references by consumed bytes, writes <=64 rows and withholds the node until complete EOF', async () => {
  const index = indexFixture(),
    ports = { index, hash: hashPort },
    record = resource('lore', 'entity', indexedLoreData({ count: 1000 }));
  let machine = createBookContentMachine(createBookContentState('book'), ports),
    maximum = 0,
    units = 0;
  await machine.beginLore(descriptor(record));
  for (let start = 0; start < record.payload.length; start += 65536) {
    const unit = record.payload.subarray(start, start + 65536);
    for (let at = 0; at < unit.length;) {
      const before = index.data.size,
        result = await machine.advanceLore(unit.subarray(at));
      assert.ok(index.data.size - before <= 64);
      assert.ok(result.references <= 64 && result.consumed > 0);
      at += result.consumed;
      const checkpoint = machine.checkpoint();
      maximum = Math.max(maximum, Buffer.byteLength(JSON.stringify(checkpoint)));
      assert.equal(JSON.stringify(checkpoint).includes(PRIVATE_LORE_BODY), false);
      assert.equal(index.data.has(JSON.stringify(['node', 'lore', '', 'entity'])), false);
      assert.throws(() => machine.result(), { code: 'invalid-record' });
      machine = createBookContentMachine(JSON.parse(JSON.stringify(checkpoint)), ports);
      units++;
    }
  }
  const metadata = await machine.finishLore();
  assert.equal(metadata.index.relations.count, 1000);
  assert.equal(metadata.byteLength, record.payload.length);
  assert.equal(machine.checkpoint().lore, null);
  assert.equal(machine.checkpoint().totals.resources.lore, 1);
  assert.ok(maximum <= BOOK_CONTENT_CHECKPOINT_BYTES && units > 15);
  assert.equal(index.data.has(JSON.stringify(['node', 'lore', '', 'entity'])), true);
});
test('old checkpoints normalize lore:null and maximal local/qualified IDs fit the existing machine bound', async () => {
  const index = indexFixture(),
    ports = { index, hash: hashPort },
    old = createBookContentState('b'.repeat(1500));
  delete old.lore;
  let machine = createBookContentMachine(old, ports);
  assert.equal(machine.checkpoint().lore, null);
  const data = indexedLoreData({ count: 1 });
  data.relations[0].targetEntityId = 'universe:' + 'w'.repeat(1500) + ':' + '🌙'.repeat(375);
  const record = resource('lore', '🌙'.repeat(375), data);
  await machine.beginLore(descriptor(record));
  for (let at = 0; at < record.payload.length;) {
    const result = await machine.advanceLore(record.payload.subarray(at, at + 23), 1);
    at += result.consumed;
    machine = createBookContentMachine(JSON.parse(JSON.stringify(machine.checkpoint())), ports);
  }
  await machine.finishLore();
});
test('a pending incremental item forbids interleaving, early EOF, duplicate nodes and poisoned I/O resumes', async () => {
  const record = resource('lore', 'entity', indexedLoreData({ count: 1 })),
    index = indexFixture(),
    ports = { index, hash: hashPort };
  const base = createBookContentMachine(createBookContentState('book'), ports);
  await base.beginLore(descriptor(record));
  const pending = base.checkpoint();
  for (const action of [
    (m) => m.beginFinish(),
    (m) => m.beginLore(descriptor(record)),
    (m) =>
      m.acceptJSON(
        descriptor(fixture()[0]),
        JSON.parse(Buffer.from(fixture()[0].payload).toString()),
      ),
    (m) => m.finishLore(),
    (m) => m.advanceLore(new Uint8Array()),
  ]) {
    const m = createBookContentMachine(pending, ports);
    await assert.rejects(action(m));
    assert.throws(() => m.checkpoint());
  }
  const failedIndex = indexFixture();
  failedIndex.add = async () => {
    throw Error('quota');
  };
  const failed = createBookContentMachine(pending, { index: failedIndex, hash: hashPort });
  await assert.rejects(failed.advanceLore(record.payload), /quota/);
  assert.throws(() => failed.checkpoint());
  const duplicate = createBookContentMachine(pending, ports);
  await duplicate.advanceLore(record.payload);
  await duplicate.finishLore();
  await duplicate.beginLore(descriptor(record));
  await duplicate.advanceLore(record.payload);
  await assert.rejects(duplicate.finishLore(), /duplicate identity/);
});
test('server validates >8 MiB across fresh instances with constant item pointers, bounded writes and no root activation', async (t) => {
  const f = setup(),
    records = indexedLoreArchive(indexedLoreData({ large: true, count: 1000 })),
    expected = await local(indexedLoreArchive(indexedLoreData({ count: 1000 }))),
    { progress } = await uploadArchiveRestore(f.api, uid, id, records);
  let maximum = 0,
    resumed = 0,
    maxRows = 0;
  const done = await finishLegacyRestore(f.factory, uid, id, progress, {
    onStep: () => {
      const snapshot = state(f);
      maximum = Math.max(maximum, Buffer.byteLength(JSON.stringify(snapshot)));
      assert.equal(JSON.stringify(snapshot).includes(PRIVATE_LORE_BODY), false);
      if (snapshot.lore?.frame) resumed++;
      if (snapshot.lore) assert.equal(Object.hasOwn(snapshot.lore, 'spans'), false);
      const commit = f.commits.at(-1),
        rows = commit.filter(
          (write) =>
            write.path.includes('/validationIndex/') &&
            f.records.get(write.path)?.value?.kind === 'lore-relation',
        ).length;
      maxRows = Math.max(maxRows, rows);
      assert.ok(rows <= 64 && commit.length <= 96);
    },
  });
  assert.equal(done.state, 'content-verified');
  assert.deepEqual(done.validation.summary.totals, expected.totals);
  assert.deepEqual(done.validation.summary.warnings, expected.warnings);
  assert.ok(maximum < 65536 && resumed > 0 && maxRows === 64);
  const pointer = [...f.records.entries()].find(
      ([path, value]) =>
        path.startsWith(root + '/validationItems/') && value.record.kind === 'book-lore',
    )[1],
    body = Buffer.concat(records.filter((r) => r.kind === 'book-lore').map((r) => r.payload));
  assert.equal(Object.hasOwn(pointer, 'spans'), false);
  assert.ok(pointer.byteLength > 8 * 1024 * 1024);
  assert.ok(Buffer.byteLength(JSON.stringify(pointer)) < 16384);
  assert.equal(pointer.lore.chunkCount, Math.ceil(body.length / 65536));
  assert.equal(pointer.lore.contentHash, hash(body));
  assert.equal(pointer.lore.metadata.index.relations.count, 1000);
  assert.equal(f.records.has('books/' + done.bookId), false);
  t.diagnostic(
    JSON.stringify({
      bodyBytes: body.length,
      parts: pointer.lore.chunkCount,
      snapshotBytes: maximum,
      pointerBytes: Buffer.byteLength(JSON.stringify(pointer)),
      resumed,
      maxRows,
    }),
  );
});
test('dense-frame retry confirms its receipt once, competing checkpoints lose CAS and source ABA cannot commit rows', async () => {
  const f = setup(),
    progress = await untilPending(f),
    request = mutation(id, progress, id + '-resume-once'),
    results = await Promise.all([
      f.factory().advanceBookRestoreValidation(uid, request),
      f.factory().advanceBookRestoreValidation(uid, request),
    ]);
  assert.deepEqual(results[0], results[1]);
  const next = results[0].progress,
    prior = structuredClone(state(f));
  assert.ok(prior.lore.frame);
  const race = await Promise.allSettled([
    f.factory().advanceBookRestoreValidation(uid, mutation(id, next, id + '-race-a')),
    f.factory().advanceBookRestoreValidation(uid, mutation(id, next, id + '-race-b')),
  ]);
  assert.equal(race.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(race.find((r) => r.status === 'rejected').reason.code, 'failed-precondition');
  const current = await f.factory().getBookRestore(uid, { restoreId: id }),
    before = structuredClone([...f.records]);
  assert.ok(state(f).lore.frame);
  const chunk = Math.floor(state(f).lore.frame.span.offset / 65536),
    path = root + '/chunks/' + chunkId(chunk);
  f.metadata.set(path, { ...f.metadata.get(path), updatedAtNanoseconds: 999999 });
  await assert.rejects(
    f.factory().advanceBookRestoreValidation(uid, mutation(id, current, id + '-source-aba')),
    { code: 'failed-precondition' },
  );
  assert.deepEqual([...f.records], before);
});
test('cancelling a partial dense frame cleans its state and reference rows without touching another book', async () => {
  const f = setup(),
    progress = await untilPending(f);
  await f.db.runTransaction(async (tx) => {
    tx.create(f.db.doc('books/other'), { authorId: uid, title: 'preserve' });
  });
  const done = await cleanupLegacyRestore(f.api, uid, id, progress);
  assert.equal(done.state, 'cancelled');
  for (const name of ['validationState', 'validationIndex', 'validationItems'])
    assert.equal(
      [...f.records.keys()].some((path) => path.startsWith(root + '/' + name + '/')),
      false,
    );
  assert.equal(f.records.get('books/other').title, 'preserve');
  assert.equal(f.records.has('books/' + progress.bookId), false);
});
for (const change of [
  (r) => ({ ...r, id: 'f'.repeat(64) }),
  (r) => ({ ...r, part: 1 }),
  (r) => ({ ...r, payload: Buffer.from(Buffer.from(r.payload).toString().slice(0, -1)) }),
  (r) => ({ ...r, payload: Buffer.from(Buffer.from(r.payload).toString() + ',"isPublic":true') }),
  (r) => ({
    ...r,
    payload: Buffer.from(
      Buffer.from(r.payload).toString().replace('"category":"character"', '"category":"invalid"'),
    ),
  }),
])
  test(
    'malformed streamed lore is durably rejected rather than accepted or retried: ' +
      change.toString().slice(0, 65),
    async () => {
      const f = setup(),
        records = indexedLoreArchive(indexedLoreData({ count: 1 })).map((record) =>
          record.kind === 'book-lore' ? change(record) : record,
        ),
        { progress } = await uploadArchiveRestore(f.api, uid, id, records),
        done = await finishLegacyRestore(f.factory, uid, id, progress);
      assert.equal(done.state, 'content-rejected');
      assert.equal(done.validation.failure, 'invalid-record');
      assert.equal(f.records.has('books/' + done.bookId), false);
    },
  );

test('an archive checkpoint already collecting lore spans resumes through its original bounded path', async () => {
  const data = indexedLoreData({ count: 0 });
  data.details = PRIVATE_LORE_BODY.repeat(5000);
  const records = indexedLoreArchive(data),
    bytes = await source(records),
    state = initialBookValidation(),
    index = indexFixture(),
    items = new Map(),
    store = {
      index,
      setItemIndex() {},
      async addItem(at, value) {
        assert.equal(items.has(at), false);
        items.set(at, structuredClone(value));
      },
    };
  while (!state.lore) await prepareBookValidationStep(state, bytes, store);
  assert.equal(state.lore.frame, null);
  assert.equal(state.lore.part, 1);
  const first = await readBookBackupFrame(bytes, state.lore.cursor);
  state.json = {
    record: state.lore.record,
    spans: [first.span],
    byteLength: first.record.payload.length,
  };
  delete state.lore;
  delete state.machine.lore;
  for (let unit = 0; state.phase !== 'recheck'; unit++) {
    assert.ok(unit < 200);
    await prepareBookValidationStep(state, bytes, store);
    Object.assign(state, JSON.parse(JSON.stringify(state)));
  }
  const result = completeBookValidation(state, 'a'.repeat(64), index),
    expected = await local(records),
    lore = [...items.values()].find((value) => value.record.kind === 'book-lore');
  assert.deepEqual(result.totals, expected.totals);
  assert.deepEqual(result.warnings, expected.warnings);
  assert.equal(lore.spans.length, 3);
  assert.equal(Object.hasOwn(lore, 'lore'), false);
});

test('a native source change after parsing a dense suffix rolls back every buffered reference row', async () => {
  const f = setup(),
    progress = await untilPending(f),
    before = structuredClone([...f.records]),
    path = root + '/chunks/' + chunkId(Math.floor(state(f).lore.frame.span.offset / 65536)),
    doc = f.db.doc.bind(f.db);
  let changed = false;
  f.db.doc = (address) => {
    const ref = doc(address);
    return {
      ...ref,
      async get() {
        const snapshot = await ref.get();
        if (!changed && address.startsWith(root + '/validationIndex/')) {
          changed = true;
          f.metadata.set(path, { ...f.metadata.get(path), updatedAtNanoseconds: 999999 });
        }
        return snapshot;
      },
    };
  };
  await assert.rejects(
    f
      .factory()
      .advanceBookRestoreValidation(uid, mutation(id, progress, id + '-source-before-commit')),
    { code: 'failed-precondition' },
  );
  assert.equal(changed, true);
  assert.deepEqual([...f.records], before);
});
test('small indexed lore readback checks its native pointer before an atomic consumer write', async () => {
  const f = setup(),
    { progress } = await uploadArchiveRestore(f.api, uid, id, indexedLoreArchive()),
    done = await finishLegacyRestore(f.factory, uid, id, progress),
    reader = await f
      .factory()
      .openVerifiedBookRestoreContent(uid, { restoreId: id, jobToken: done.jobToken }),
    [path, pointer] = [...f.records.entries()].find(
      ([path, value]) =>
        path.startsWith(root + '/validationItems/') && value.record.kind === 'book-lore',
    ),
    item = await reader.readItem(pointer.index);
  assert.deepEqual(item.value.data, indexedLoreData());
  await f.db.runTransaction(item.verify);
  f.metadata.set(path, { ...f.metadata.get(path), createdAtNanoseconds: 999999 });
  await assert.rejects(f.db.runTransaction(item.verify), { code: 'failed-precondition' });
  await assert.rejects(reader.readItem(pointer.index), { code: 'failed-precondition' });
});
