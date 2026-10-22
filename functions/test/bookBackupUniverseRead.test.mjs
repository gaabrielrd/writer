import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import { createBookBackupUniverseService } from '../src/bookBackupUniverseRead.mjs';
import { validateBookBackupUniverseOrigin } from '../src/bookBackupUniverse.mjs';
function fixture(binding = 'world') {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Book',
    createdAt: 1,
    updatedAt: 2,
    ...(binding === undefined ? {} : { universeId: binding }),
  });
  f.records.set('universes/world', {
    authorId: 'author',
    deleting: false,
    name: 'DO NOT COPY',
    description: 'DO NOT COPY',
    loreVersion: 1,
  });
  f.records.set('universes/world/lore/entity', { name: 'DO NOT COPY', details: 'DO NOT COPY' });
  f.metadata.set('universes/world', {
    createdAt: 1234,
    createdAtNanoseconds: 567,
    updatedAt: 2345,
    updatedAtNanoseconds: 890,
  });
  return { ...f, root: createBookBackupReadService(f), api: createBookBackupUniverseService(f) };
}
const source = (f) => f.root.getBookBackupSource('author', { bookId: 'book' });
const read = (f, pin, extra = {}, uid = 'author') =>
  f.api.getBookBackupUniverse(uid, { bookId: 'book', sourceToken: pin.sourceToken, ...extra });
test('authorized origin preserves exact native creation and reads only authorization metadata without writes/global prose', async () => {
  const f = fixture(),
    pin = await source(f),
    before = structuredClone(f.records),
    value = await read(f, pin);
  assert.deepEqual(value.origin, {
    kind: 'reference',
    id: 'world',
    created: { seconds: 1, nanoseconds: 234000567 },
  });
  assert.equal(value.sourceToken, pin.sourceToken);
  assert.equal(value.universeToken.length, 64);
  assert.equal(JSON.stringify(value).includes('DO NOT COPY'), false);
  assert.equal(f.reads.length, 0);
  assert.deepEqual(f.metadataReads, [
    { path: 'universes/world', fields: ['authorId', 'deleting'] },
  ]);
  assert.deepEqual(f.records, before);
  assert.deepEqual(await read(f, pin, { expectedUniverseToken: value.universeToken }), value);
});
test('missing or null binding yields none without reading universes', async () => {
  for (const absent of [true, false]) {
    const f = fixture(null);
    if (absent) delete f.records.get('books/book').universeId;
    const value = await read(f, await source(f));
    assert.deepEqual(value.origin, { kind: 'none' });
    assert.equal(f.metadataReads.length, 0);
  }
});
test('missing, deleting or foreign universe produce identical unavailable descriptor/token without external metadata leaks', async () => {
  const tokens = [];
  for (const state of ['missing', 'deleting', 'foreign']) {
    const f = fixture();
    if (state === 'missing') f.records.delete('universes/world');
    else
      f.records.set('universes/world', {
        authorId: state === 'foreign' ? 'other' : 'author',
        deleting: state === 'deleting',
        secret: state,
      });
    const value = await read(f, await source(f));
    assert.deepEqual(value.origin, { kind: 'unavailable', id: 'world' });
    tokens.push(value.universeToken);
  }
  assert.equal(new Set(tokens).size, 1);
});
test('authorized native edit or equal-body recreation invalidates token with book source unchanged', async () => {
  for (const recreate of [true, false]) {
    const f = fixture(),
      pin = await source(f),
      value = await read(f, pin),
      ref = f.db.doc('universes/world');
    if (recreate) {
      f.metadata.delete('universes/world');
      // Capture again under the default native metadata so creation sequence is observable.
      const original = await read(f, pin),
        body = structuredClone(f.records.get('universes/world'));
      await f.db.runTransaction(async (tx) => tx.delete(ref));
      await f.db.runTransaction(async (tx) => tx.create(ref, body));
      await assert.rejects(read(f, pin, { expectedUniverseToken: original.universeToken }), {
        code: 'failed-precondition',
        details: { reason: 'book-backup-universe-changed' },
      });
    } else {
      f.metadata.delete('universes/world');
      const original = await read(f, pin);
      await f.db.runTransaction(async (tx) => tx.update(ref, { name: 'Changed' }));
      await assert.rejects(read(f, pin, { expectedUniverseToken: original.universeToken }), {
        code: 'failed-precondition',
        details: { reason: 'book-backup-universe-changed' },
      });
    }
    assert.deepEqual(await source(f), pin);
    assert.equal(value.origin.kind, 'reference');
  }
});
test('availability transition invalidates proof while foreign edits do not become an oracle', async () => {
  const f = fixture();
  f.records.set('universes/world', { authorId: 'other' });
  const pin = await source(f),
    original = await read(f, pin);
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('universes/world'), { name: 'Changed secret' }),
  );
  assert.deepEqual(await read(f, pin, { expectedUniverseToken: original.universeToken }), original);
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('universes/world'), { authorId: 'author' }),
  );
  await assert.rejects(read(f, pin, { expectedUniverseToken: original.universeToken }), {
    code: 'failed-precondition',
  });
  const current = await read(f, pin);
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('universes/world'), { deleting: true }),
  );
  await assert.rejects(read(f, pin, { expectedUniverseToken: current.universeToken }), {
    code: 'failed-precondition',
  });
});
test('root binding/source, author, deletion, arbitrary path and invalid tokens are guarded', async () => {
  const f = fixture(),
    pin = await source(f);
  for (const extra of [
    { universeId: 'other' },
    { path: 'users/other' },
    { expectedUniverseToken: null },
    { sourceToken: 'bad' },
  ])
    await assert.rejects(read(f, pin, extra), { code: 'invalid-argument' });
  await assert.rejects(read(f, pin, {}, 'other'), { code: 'not-found' });
  await assert.rejects(read(f, pin, {}, ''), { code: 'unauthenticated' });
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc('books/book'), { universeId: null }));
  await assert.rejects(read(f, pin), { code: 'failed-precondition' });
  f.records.get('books/book').deleting = true;
  await assert.rejects(source(f), { code: 'not-found' });
  await assert.rejects(read(f, pin), { code: 'not-found' });
});
test('malformed stored binding fails before constructing a universe path', async () => {
  for (const id of ['', '../world', 'world/secret', 42, true, 'x'.repeat(129)]) {
    const f = fixture(id),
      pin = await source(f);
    await assert.rejects(read(f, pin), { code: 'failed-precondition' });
    assert.equal(f.metadataReads.length, 0);
  }
});
test('portable origin is a closed identity descriptor with precise timestamp limits', () => {
  const valid = {
    kind: 'reference',
    id: 'world_1',
    created: { seconds: 0, nanoseconds: 999999999 },
  };
  assert.deepEqual(validateBookBackupUniverseOrigin(valid), valid);
  for (const value of [
    null,
    {},
    { kind: 'none', id: 'world' },
    { kind: 'unavailable', id: 'world', name: 'secret' },
    { ...valid, grant: true },
    { ...valid, created: { seconds: -1, nanoseconds: 1 } },
    { ...valid, created: { seconds: 1, nanoseconds: 1e9 } },
    { ...valid, created: { seconds: 1.1, nanoseconds: 0 } },
    { ...valid, created: { seconds: 1, nanoseconds: 0, updated: 1 } },
    { kind: 'future', id: 'world' },
  ])
    assert.throws(() => validateBookBackupUniverseOrigin(value), TypeError);
});
