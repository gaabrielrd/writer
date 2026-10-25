import test from 'node:test';
import assert from 'node:assert/strict';
import sharp from 'sharp';
import { readyAudit, finishAudit, uid } from './helpers/bookRestoreAuditFixture.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { universeRestoreFixture } from './helpers/bookRestoreUniverseFixture.mjs';
import { coverRestoreFixture } from './helpers/bookRestoreCoverFixture.mjs';
import { draftRestoreFixture } from './helpers/bookRestoreDraftFixture.mjs';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { record } from './helpers/bookContentFixture.mjs';
import { born } from '../src/bookRestoreUploadContracts.mjs';
import { bookRestoreStorageBucket } from './helpers/bookRestoreStorageBucket.mjs';
import { createBookRestoreCoverStorage } from '../src/bookRestoreCoverStorage.mjs';
import { legacyMutation as mutation } from './helpers/bookLegacyRestoreFixture.mjs';
const input = (f) => ({ restoreId: f.id, jobToken: f.p.jobToken });
const review = (f) => f.factory().getBookRestoreActivationReview(uid, input(f));
async function ready(options = {}) {
  const f = await readyAudit(options);
  f.p = await finishAudit(f);
  return f;
}
function worldRecords(records, origin) {
  return records.map((r) => {
    if (r.kind === 'book-universe') return record(r.kind, r.id, { schemaVersion: 1, origin });
    if (r.kind !== 'book-metadata') return r;
    const value = JSON.parse(new TextDecoder().decode(r.payload));
    value.book.universeId = origin.id;
    return record(r.kind, r.id, value);
  });
}
async function world(f) {
  await f.db.runTransaction((tx) =>
    tx.create(f.db.doc('universes/world'), {
      authorId: uid,
      deleting: false,
      bookCount: 0,
      name: 'GLOBAL NAME MUST NOT BE COPIED',
      description: 'GLOBAL BODY MUST NOT BE COPIED',
    }),
  );
  return { kind: 'reference', id: 'world', created: born(await f.db.doc('universes/world').get()) };
}
async function covered({ before, verifyHook } = {}) {
  const storage = bookRestoreStorageBucket(),
    assets = createBookRestoreCoverStorage(storage.bucket),
    png = await sharp({ create: { width: 3, height: 4, channels: 4, background: '#123456' } })
      .png()
      .toBuffer(),
    base = adventureImportDb({ nativeUpdates: true });
  let records = coverRestoreFixture({ bytes: png });
  if (before) records = await before(base, records);
  const holder = { current: null };
  const f = {
    ...base,
    ...(await ready({
      db: base.db,
      records,
      restoreAssets: {
        ...assets,
        async verify(...args) {
          const proof = await assets.verify(...args);
          if (holder.current && verifyHook) await verifyHook(holder.current, proof);
          return proof;
        },
      },
    })),
  };
  holder.current = f;
  return { f, storage, assets };
}
test('activation review is deterministic, bounded and read only; it keeps private preparation invisible', async () => {
  const f = await ready(),
    before = structuredClone([...f.records]),
    at = f.commits.length,
    value = await review(f);
  assert.deepEqual(await review(f), value);
  assert.equal(value.schemaVersion, 1);
  assert.match(value.reviewToken, /^[a-f0-9]{64}$/);
  assert.equal(value.bookId, f.p.bookId);
  assert.equal(value.checkpoint, f.p.checkpoint);
  assert.equal(value.summary.visibility, 'private');
  assert.equal(value.summary.draft.outcome, 'none');
  assert.deepEqual(value.summary.universe, {
    originKind: 'none',
    observed: 'none',
    universeId: null,
  });
  assert.ok(Buffer.byteLength(JSON.stringify(value)) < 2048);
  assert.deepEqual([...f.records], before);
  assert.ok(f.commits.slice(at).every((writes) => writes.length === 0));
  assert.equal(f.records.has('books/' + f.p.bookId), false);
  assert.equal(f.records.get('books/' + f.p.bookId + '/workProgress/current').countReady, false);
  assert.equal(JSON.stringify(value).includes(f.p.jobToken), false);
  assert.deepEqual(Object.keys(value).sort(), [
    'bookId',
    'checkpoint',
    'reviewToken',
    'schemaVersion',
    'summary',
  ]);
});
test('review rejects unfinished audit, another actor, wrong token and injected confirmation fields', async () => {
  const early = await readyAudit();
  await assert.rejects(() => review(early));
  const f = await ready();
  await assert.rejects(() => f.factory().getBookRestoreActivationReview('other', input(f)));
  await assert.rejects(() =>
    f.factory().getBookRestoreActivationReview(uid, { ...input(f), jobToken: 'a'.repeat(64) }),
  );
  await assert.rejects(() =>
    f.factory().getBookRestoreActivationReview(uid, { ...input(f), universeId: 'forged' }),
  );
  await f.factory().cancelBookRestore(uid, mutation(f.id, f.p, f.id + '-cancel'));
  await assert.rejects(() => review(f));
});
test('review observes current universe access without copying or modifying global data', async () => {
  const base = adventureImportDb({ nativeUpdates: true }),
    origin = await world(base),
    f = { ...base, ...(await ready({ db: base.db, records: universeRestoreFixture(origin) })) },
    first = await review(f);
  assert.deepEqual(first.summary.universe, {
    originKind: 'reference',
    observed: 'available',
    universeId: 'world',
  });
  assert.equal(JSON.stringify(first).includes('GLOBAL'), false);
  const count = f.records.get('universes/world').bookCount;
  await f.db.runTransaction((tx) => tx.update(f.db.doc('universes/world'), { deleting: true }));
  const second = await review(f);
  assert.deepEqual(second.summary.universe, {
    originKind: 'reference',
    observed: 'unavailable',
    universeId: null,
  });
  assert.notEqual(first.reviewToken, second.reviewToken);
  assert.equal(f.records.get('universes/world').bookCount, count);
  assert.equal(
    [...f.records.keys()].some((p) => p.includes('/books/' + f.p.bookId)),
    false,
  );
});
test('a recreated universe with the same ID is unavailable instead of being silently adopted', async () => {
  const base = adventureImportDb({ nativeUpdates: true }),
    origin = await world(base),
    f = { ...base, ...(await ready({ db: base.db, records: universeRestoreFixture(origin) })) },
    first = await review(f),
    value = structuredClone(f.records.get('universes/world'));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc('universes/world')));
  await f.db.runTransaction((tx) => tx.create(f.db.doc('universes/world'), value));
  const second = await review(f);
  assert.notEqual(first.reviewToken, second.reviewToken);
  assert.equal(second.summary.universe.observed, 'unavailable');
  assert.equal(second.summary.universe.universeId, null);
});
for (const dependency of ['seal', 'work-control', 'cover-definition', 'draft-definition', 'batch'])
  test(
    'review refuses a recreated original ' + dependency + ' and preserves uncertain data',
    async () => {
      const f = await ready();
      let path;
      if (dependency === 'seal')
        path = 'users/' + uid + '/bookRestoreOperations/' + f.p.preparation.audit.sealOperationId;
      else if (dependency === 'batch')
        path = 'users/' + uid + '/aiPersonaRestoreBatches/' + f.p.bookId;
      else if (dependency === 'work-control')
        path = 'books/' + f.p.bookId + '/workProgress/current';
      else
        path =
          f.root +
          '/' +
          (dependency === 'cover-definition' ? 'preparedCovers' : 'preparedDrafts') +
          '/current';
      const value = structuredClone(f.records.get(path));
      assert.ok(value);
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
      await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      await assert.rejects(() => review(f));
      assert.deepEqual(f.records.get(path), value);
      assert.equal(f.records.has('books/' + f.p.bookId), false);
    },
  );
test('review verifies the exact staged Storage generation without accepting or writing it', async () => {
  const { f, storage } = await covered(),
    at = storage.events.length,
    before = structuredClone([...f.records]),
    result = await review(f);
  assert.equal(result.summary.cover.kind, 'library');
  assert.ok(storage.events.length > at);
  assert.ok(storage.events.slice(at).every((e) => e.method === 'head'));
  assert.deepEqual([...f.records], before);
  const path = 'book-covers/' + uid + '/' + f.p.preparation.cover.imageId + '.png';
  assert.equal(storage.version(path).metadata.metadata.accepted, 'false');
  const metadata = storage.version(path).metadata;
  metadata.metageneration = '2';
  await assert.rejects(() => review(f));
});
test('cancellation while external Storage verification is in flight prevents the review response', async () => {
  let enabled = false;
  const { f } = await covered({
    verifyHook: async (f) => {
      if (enabled)
        await f.factory().cancelBookRestore(uid, mutation(f.id, f.p, f.id + '-in-flight-cancel'));
    },
  });
  enabled = true;
  await assert.rejects(() => review(f));
  assert.equal(f.records.get(f.root).state, 'cancelling');
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});
test('universe revocation during Storage verification invalidates the observed review', async () => {
  let enabled = false;
  const { f } = await covered({
    before: async (base, records) => worldRecords(records, await world(base)),
    verifyHook: async (f) => {
      if (enabled)
        await f.db.runTransaction((tx) =>
          tx.update(f.db.doc('universes/world'), { authorId: 'other' }),
        );
    },
  });
  enabled = true;
  await assert.rejects(
    () => review(f),
    (e) => e.details?.reason === 'activation-review-changed',
  );
  enabled = false;
  assert.equal((await review(f)).summary.universe.observed, 'unavailable');
  assert.equal(f.records.has('books/' + f.p.bookId), false);
});
test('title preview is bounded on a Unicode boundary without altering original title or its binding', async () => {
  const title = 'x'.repeat(299) + '🌙 original',
    records = universeRestoreFixture().map((r) => {
      if (r.kind !== 'book-metadata') return r;
      const value = JSON.parse(new TextDecoder().decode(r.payload));
      value.book.title = title;
      return record(r.kind, r.id, value);
    }),
    f = await ready({ records }),
    result = await review(f);
  assert.equal(result.summary.titlePreview, 'x'.repeat(299));
  assert.equal(result.summary.titlePreview.isWellFormed(), true);
  assert.equal(result.summary.titleTruncated, true);
});
test('missing audit preparation cannot be confirmed by a historical replay receipt', async () => {
  const f = await readyAudit(),
    request = mutation(f.id, f.p, f.id + '-first-audit'),
    first = await f.factory().advanceBookRestoreAudit(uid, request),
    path = 'users/' + uid + '/bookRestoreOperations/' + request.operationId,
    value = structuredClone(f.records.get(path));
  delete value.receipt.preparation;
  f.records.set(path, value);
  await assert.rejects(() => f.factory().advanceBookRestoreAudit(uid, request));
  assert.equal(f.records.get(f.root).checkpoint, first.progress.checkpoint);
});
test('reading the existing recovery key after audit preserves the review and prepared content', async () => {
  const f = await ready(),
    first = await review(f);
  await f.factory().getBookRestoreRecoveryKey(uid, {
    ...input(f),
    reviewHash: f.records.get(f.root).reviewHash,
  });
  const second = await review(f);
  assert.deepEqual(first, second);
});

test('review never adopts a descriptor explicitly marked unavailable even when a same-ID universe is owned', async () => {
  const base = adventureImportDb({ nativeUpdates: true });
  await world(base);
  const f = {
      ...base,
      ...(await ready({
        db: base.db,
        records: universeRestoreFixture({ kind: 'unavailable', id: 'world' }),
      })),
    },
    result = await review(f);
  assert.deepEqual(result.summary.universe, {
    originKind: 'unavailable',
    observed: 'unavailable',
    universeId: null,
  });
});
test('review refuses missing Storage support and a verifier returning a different native proof', async () => {
  const { f } = await covered(),
    before = structuredClone([...f.records]);
  for (const restoreAssets of [
    undefined,
    { verify: async () => ({ generation: '1', metageneration: '1' }) },
  ]) {
    const api = createBookRestoreUploadService({ db: f.db, restoreAssets, now: () => 1000 });
    await assert.rejects(() => api.getBookRestoreActivationReview(uid, input(f)));
  }
  assert.deepEqual([...f.records], before);
});
test('a foreign root appearing during external verification blocks the response and remains untouched', async () => {
  let enabled = false;
  const { f } = await covered({
    verifyHook: async (f) => {
      if (enabled)
        await f.db.runTransaction((tx) =>
          tx.create(f.db.doc('books/' + f.p.bookId), { authorId: 'foreign' }),
        );
    },
  });
  enabled = true;
  await assert.rejects(() => review(f));
  assert.deepEqual(f.records.get('books/' + f.p.bookId), { authorId: 'foreign' });
});
for (const [outcome, options] of [
  ['saved', { content: 'Saved', savedContent: 'Saved', chapterId: 'legacy-chapter' }],
  [
    'version',
    { content: 'Different draft', savedContent: 'Original saved', chapterId: 'legacy-chapter' },
  ],
])
  test(
    'review reports ' +
      outcome +
      ' draft outcome while preserving saved manuscript and all versions',
    async () => {
      const f = await ready({ records: draftRestoreFixture(options) }),
        before = structuredClone([...f.records]),
        result = await review(f);
      assert.equal(result.summary.draft.outcome, outcome);
      assert.equal(
        result.summary.counts.versions,
        [...f.records.keys()].filter((path) =>
          path.startsWith('books/' + f.p.bookId + '/workVersions/'),
        ).length,
      );
      assert.deepEqual([...f.records], before);
      assert.equal(f.records.has('books/' + f.p.bookId), false);
    },
  );
