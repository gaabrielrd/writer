import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { inspectBookLegacyContent } from '../src/bookLegacyReview.mjs';
import { readBookLegacyNormalizedItem } from '../src/bookLegacyNormalize.mjs';
import { createBookRestoreValidationStore } from '../src/bookRestoreValidationStore.mjs';
import { chunkId, requestHash, mutationInput } from '../src/bookRestoreUploadContracts.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { bookLegacyFixture as fixture } from './helpers/bookLegacyFixture.mjs';
import { indexFixture, hashPort } from './helpers/bookContentFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  cleanupLegacyRestore,
  legacyMutation as mutation,
  largeLegacyCursorFixture,
} from './helpers/bookLegacyRestoreFixture.mjs';
const uid = 'author',
  id = 'legacy-validation-0001',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
for (const version of [1, 2, 3, 4, 5, 6])
  test(
    'server legacy v' +
      version +
      ' resumes through upload/integrity/validation and matches the full shared report',
    async () => {
      const f = setup(),
        { progress, source } = await uploadLegacyRestore(f.api, uid, id, fixture(version));
      const expected = await inspectBookLegacyContent(source, {
        index: indexFixture(),
        hash: hashPort,
      });
      const done = await finishLegacyRestore(f.factory, uid, id, progress);
      assert.equal(done.state, 'content-verified');
      assert.equal(done.validation.phase, 'done');
      assert.deepEqual(done.validation.summary, {
        sourceBookId: expected.source.bookId,
        totals: expected.totals,
        warnings: expected.warnings,
        source: expected.source,
        legacyWarnings: expected.legacyWarnings,
      });
      assert.equal(f.records.has('books/' + done.bookId), false);
      const job = f.records.get(root),
        saved = f.records.get(root + '/validationState/current');
      assert.equal(job.validationVersion, 2);
      assert.equal(saved.validationVersion, 2);
      assert.equal(typeof saved.stateJSON, 'string');
      assert.equal(Object.hasOwn(saved, 'state'), false);
      assert.equal(digest(saved), job.validationStateHash);
      const state = JSON.parse(saved.stateJSON);
      const loaded = { ref: f.db.doc(root), job, view: { jobToken: done.jobToken } };
      const store = createBookRestoreValidationStore(f.db, loaded, 'legacy-read-only-0001');
      let pointers = 0;
      for (const [path, value] of f.records) {
        if (path.startsWith(root + '/validationItems/')) {
          const item = await readBookLegacyNormalizedItem(
            source,
            state.legacy.catalog,
            value.legacy.cursor,
            { record: value.record, valueHash: value.valueHash },
            { index: store.index, hash: hashPort },
          );
          assert.equal(item.valueHash, value.valueHash);
          pointers++;
        }
        if (
          path.startsWith(root + '/validationItems/') ||
          path.startsWith(root + '/validationIndex/')
        )
          for (const text of [
            'Own title',
            'Own prose',
            'Original',
            'PRIVATE_TOKEN',
            'GLOBAL NAME',
            'PRIVATE RESOLVED NAME',
          ])
            assert.ok(!JSON.stringify(value).includes(text), text);
      }
      assert.equal(pointers, done.validation.items);
      assert.equal(store.writes.size, 0);
      const metadata = JSON.stringify(await f.api.listBookRestores(uid, {}));
      for (const text of [
        'Own title',
        'Own prose',
        'Original',
        'PRIVATE_TOKEN',
        'GLOBAL NAME',
        'PRIVATE RESOLVED NAME',
        'stateJSON',
      ])
        assert.ok(!metadata.includes(text), text);
    },
  );
test('invalid legacy syntax/schema/version/content rejects durably without a book and remains cleanable', async () => {
  const future = fixture(6);
  future.version = 7;
  const wrongBody = fixture(5);
  wrongBody.scenes.scenes[0].bodyHash = 'f'.repeat(64);
  const missingArc = fixture(6);
  missingArc.narrative.milestones[0].arcId = 'gone';
  const scalar = fixture(1);
  scalar.lore[0].structuredDetails = { bad: 'SENTINEL_NUMBER' };
  const nonfinite = JSON.stringify(scalar).replace('"SENTINEL_NUMBER"', '1e999');
  const duplicate = JSON.stringify(fixture(1)).replace(
    '"format":',
    '"format":"writer-book-backup","\\u0066ormat":',
  );
  const variants = [
    { value: future, version: 6, reason: 'unsupported-version' },
    { value: fixture(1), version: 6, reason: 'invalid-record' },
    { value: '{"format":"writer-book-backup","version":1}', version: 1, reason: 'invalid-record' },
    { value: JSON.stringify(fixture(1)) + ' garbage', version: 1, reason: 'invalid-record' },
    { value: duplicate, version: 1, reason: 'invalid-record' },
    { value: wrongBody, version: 5, reason: 'invalid-record' },
    { value: missingArc, version: 6, reason: 'invalid-record' },
    { value: nonfinite, version: 1, reason: 'invalid-record' },
  ];
  for (const item of variants) {
    const f = setup(),
      { progress } = await uploadLegacyRestore(f.api, uid, id, item.value, {
        version: item.version,
      });
    const done = await finishLegacyRestore(f.factory, uid, id, progress);
    assert.equal(done.state, 'content-rejected');
    assert.equal(done.validation.failure, item.reason);
    assert.equal(f.records.has(root + '/validationState/current'), false);
    assert.equal(f.records.has('books/' + done.bookId), false);
    await cleanupLegacyRestore(f.api, uid, id, done, { limit: 5 });
    assert.equal(
      [...f.records.keys()].some((p) => p.startsWith(root + '/')),
      false,
    );
  }
});
test('legacy receipt retries and CAS races preserve historical receipt/current progress without false rejection', async () => {
  const f = setup(),
    { progress: p } = await uploadLegacyRestore(f.api, uid, id, fixture(3));
  const request = mutation(id, p, 'legacy-replay-0001');
  const twins = await Promise.all([
    f.api.advanceBookRestoreValidation(uid, request),
    f.api.advanceBookRestoreValidation(uid, request),
  ]);
  assert.deepEqual(twins[0].receipt, twins[1].receipt);
  const current = await f.api.getBookRestore(uid, { restoreId: id });
  const raced = await Promise.allSettled([
    f.api.advanceBookRestoreValidation(uid, mutation(id, current, 'legacy-race-0001')),
    f.api.advanceBookRestoreValidation(uid, mutation(id, current, 'legacy-race-0002')),
  ]);
  assert.equal(raced.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(raced.find((r) => r.status === 'rejected').reason.code, 'failed-precondition');
  const now = await f.api.getBookRestore(uid, { restoreId: id });
  assert.equal(now.validation.failure, null);
  const replay = await f.api.advanceBookRestoreValidation(uid, request);
  assert.deepEqual(replay.receipt, twins[0].receipt);
  assert.equal(replay.progress.checkpoint, now.checkpoint);
  assert.deepEqual(
    await f.api.resolveBookRestoreOperation(uid, {
      restoreId: id,
      jobToken: p.jobToken,
      operationId: request.operationId,
      requestHash: requestHash('advanceBookRestoreValidation', mutationInput(request)),
    }),
    replay,
  );
});
test('a TypeError from index I/O is transient and no prepared legacy effects or checkpoint survive', async () => {
  const f = setup(),
    { progress: p } = await uploadLegacyRestore(f.api, uid, id, fixture(1));
  const original = f.db.doc,
    transient = new TypeError('private index unavailable');
  f.db.doc = (path) => {
    const ref = original(path);
    return path.startsWith(root + '/validationIndex/')
      ? {
          ...ref,
          get: async () => {
            throw transient;
          },
        }
      : ref;
  };
  const request = mutation(id, p, 'legacy-transient-0001');
  await assert.rejects(() => f.api.advanceBookRestoreValidation(uid, request), transient);
  assert.equal(f.records.get(root).state, 'bytes-verified');
  assert.equal(
    [...f.records.keys()].some(
      (p) => p.includes('/validationIndex/') || p.includes('/validationState/'),
    ),
    false,
  );
  f.db.doc = original;
  const retry = await f.api.advanceBookRestoreValidation(uid, request);
  assert.equal(retry.progress.state, 'validating');
});
test('a native source change after lexical preparation prevents every buffered legacy write', async () => {
  const f = setup(),
    { progress: p } = await uploadLegacyRestore(f.api, uid, id, fixture(1));
  const original = f.db.doc;
  let changed = false;
  f.db.doc = (path) => {
    const ref = original(path);
    if (!path.startsWith(root + '/validationIndex/')) return ref;
    return {
      ...ref,
      get: async () => {
        const snapshot = await ref.get();
        if (!changed) {
          changed = true;
          f.metadata.set(root + '/chunks/' + chunkId(0), {
            createdAt: 1000,
            createdAtNanoseconds: 999999,
          });
        }
        return snapshot;
      },
    };
  };
  await assert.rejects(
    () => f.api.advanceBookRestoreValidation(uid, mutation(id, p, 'legacy-source-race01')),
    { code: 'failed-precondition' },
  );
  assert.equal(changed, true);
  assert.equal(f.records.get(root).state, 'bytes-verified');
  assert.equal(
    [...f.records.keys()].some(
      (p) => p.includes('/validationIndex/') || p.includes('/validationState/'),
    ),
    false,
  );
});
test('large valid lexical cursor uses an opaque v2 checkpoint and resumes beyond the old 64 KiB limit', async () => {
  const f = setup(),
    { progress: p } = await uploadLegacyRestore(
      f.api,
      uid,
      id,
      largeLegacyCursorFixture(fixture(2)),
    );
  let largest = 0,
    outer = 0,
    largeResumes = 0;
  const done = await finishLegacyRestore(f.factory, uid, id, p, {
    onStep(progress) {
      const saved = f.records.get(root + '/validationState/current');
      if (!saved) return;
      const size = Buffer.byteLength(saved.stateJSON, 'utf8');
      largest = Math.max(largest, size);
      outer = Math.max(outer, Buffer.byteLength(JSON.stringify(saved)));
      if (size > 65536) largeResumes++;
      assert.equal(saved.validationVersion, 2);
      assert.ok(size <= 640 * 1024);
      assert.equal(progress.validation.failure, null);
    },
  });
  assert.equal(done.state, 'content-verified');
  assert.ok(largest > 200 * 1024, String(largest));
  assert.ok(outer > largest);
  assert.ok(largeResumes > 3);
  assert.equal(done.validation.summary.source.ignoredGlobalEntries, 1);
});
test('opaque checkpoint corruption is not a file rejection and v3 cleanup preserves another book', async () => {
  const f = setup(),
    { progress: p } = await uploadLegacyRestore(f.api, uid, id, fixture(3));
  const first = (
    await f.api.advanceBookRestoreValidation(uid, mutation(id, p, 'legacy-corrupt-0001'))
  ).progress;
  f.records.get(root + '/validationState/current').stateJSON = 'broken private state';
  await assert.rejects(
    () => f.api.advanceBookRestoreValidation(uid, mutation(id, first, 'legacy-corrupt-0002')),
    { code: 'failed-precondition' },
  );
  assert.equal(f.records.get(root).state, 'validating');
  assert.equal(f.records.get(root).validationMeta.failure, null);
  f.records.set('books/unrelated/chapters/chapter', { content: 'preserve' });
  const done = await cleanupLegacyRestore(f.api, uid, id, first, { limit: 3 });
  assert.equal(done.state, 'cancelled');
  assert.equal(f.records.get('books/unrelated/chapters/chapter').content, 'preserve');
  assert.equal(
    [...f.records.keys()].some((p) => p.startsWith(root + '/')),
    false,
  );
  assert.equal(f.records.has('deletedBooks/' + done.bookId), true);
  assert.ok(
    f.commits.every(
      (w) => w.filter((v) => v.method === 'delete' && v.path.startsWith(root + '/')).length <= 3,
    ),
  );
});
test('legacy validation still refuses client state, proofs and unknown snapshot versions', async () => {
  const f = setup(),
    { progress: p } = await uploadLegacyRestore(f.api, uid, id, fixture(1));
  for (const extra of [
    { cursor: {} },
    { report: {} },
    { proof: {} },
    { stateJSON: '{}' },
    { validationVersion: 2 },
  ])
    await assert.rejects(
      () =>
        f.api.advanceBookRestoreValidation(uid, {
          ...mutation(id, p, 'legacy-forged-0001'),
          ...extra,
        }),
      { code: 'invalid-argument' },
    );
  const first = (
    await f.api.advanceBookRestoreValidation(uid, mutation(id, p, 'legacy-version-0001'))
  ).progress;
  const phase = f.records.get(root).validationMeta.phase;
  f.records.get(root).validationMeta.phase = 'frames';
  await assert.rejects(() => f.api.getBookRestore(uid, { restoreId: id }), {
    code: 'failed-precondition',
  });
  f.records.get(root).validationMeta.phase = phase;
  f.records.get(root).validationVersion = 3;
  await assert.rejects(
    () => f.api.advanceBookRestoreValidation(uid, mutation(id, first, 'legacy-version-0002')),
    { code: 'failed-precondition' },
  );
});

test('legacy large logical JSON and reference/relationship fanout resume in bounded semantic batches', async () => {
  const value = fixture(6);
  value.chapters[0].title = '🌙'.repeat(20000);
  value.scenes.groups[0].title = value.chapters[0].title;
  value.lore[0].relations = Array.from({ length: 205 }, (_, i) => ({
    targetEntityId: 'missing-' + i,
    relationType: 'knows',
  }));
  value.scenes.scenes[0].references = Array.from({ length: 205 }, (_, i) => ({
    id: 'reference-' + i,
    reference: { kind: 'universe', scopeId: 'world', entityId: 'global-' + i },
    available: false,
    name: 'PRIVATE RESOLVED NAME',
  }));
  const f = setup(),
    { progress, source } = await uploadLegacyRestore(f.api, uid, id, value);
  const done = await finishLegacyRestore(f.factory, uid, id, progress);
  const expected = await inspectBookLegacyContent(source, {
    index: indexFixture(),
    hash: hashPort,
  });
  assert.equal(done.state, 'content-verified');
  assert.deepEqual(done.validation.summary.totals, expected.totals);
  assert.deepEqual(done.validation.summary.warnings, expected.warnings);
  assert.equal(done.validation.summary.totals.resources['scene-reference'], 205);
  assert.equal(done.validation.summary.legacyWarnings.resolvedLabelsIgnored, 205);
  assert.equal(
    JSON.parse(f.records.get(root + '/validationState/current').stateJSON).relations,
    null,
  );
  assert.ok(
    f.commits.every(
      (w) =>
        w.filter((v) => v.method === 'create' && v.path.startsWith(root + '/validationIndex/'))
          .length <= 96,
    ),
  );
});
test('private snapshot codecs keep archive v1 bounds and reject unknown, mixed, noncanonical or oversized v2 state', async () => {
  const { validationSnapshot, readValidationSnapshot, initialBookValidation } =
    await import('../src/bookRestoreValidationStep.mjs');
  const { initialBookLegacyValidation } = await import('../src/bookRestoreLegacyValidation.mjs');
  const loaded = {
    job: {
      ownerId: uid,
      restoreId: id,
      source: { format: 'writer-book-backup' },
      validationVersion: 2,
    },
    view: { jobToken: 'a'.repeat(64) },
  };
  const encoded = validationSnapshot(loaded, initialBookLegacyValidation(), 1).value;
  assert.equal(readValidationSnapshot(encoded, loaded).phase, 'legacy-scan');
  for (const bad of [
    { ...encoded, validationVersion: 3 },
    { ...encoded, state: {} },
    { ...encoded, extra: true },
    { ...encoded, stateJSON: ' ' + encoded.stateJSON },
    { ...encoded, stateJSON: 'not JSON' },
    { ...encoded, stateJSON: JSON.stringify({ legacy: { padding: 'x'.repeat(640 * 1024) } }) },
  ])
    assert.throws(() => readValidationSnapshot(bad, loaded), { code: 'failed-precondition' });
  assert.throws(
    () => validationSnapshot(loaded, { legacy: { padding: 'x'.repeat(640 * 1024) } }, 1),
    { code: 'failed-precondition' },
  );
  const old = {
    ...loaded,
    job: { ...loaded.job, source: { format: 'writer-book-archive' }, validationVersion: 1 },
  };
  const archive = validationSnapshot(old, initialBookValidation(), 1).value;
  assert.equal(readValidationSnapshot(archive, old).phase, 'frames');
  assert.equal(Object.hasOwn(archive, 'stateJSON'), false);
  assert.throws(() => readValidationSnapshot({ ...archive, validationVersion: 2 }, old), {
    code: 'failed-precondition',
  });
  assert.throws(() => validationSnapshot(old, { padding: 'x'.repeat(65536) }, 1), {
    code: 'failed-precondition',
  });
});
