import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { studioDb } from './helpers/studioDb.mjs';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import {
  createBookBackupCoverService,
  setBookBackupCoverHeaders,
} from '../src/bookBackupCoverRead.mjs';
const imageId = 'cover-capture-image-0001',
  hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture() {
  const f = studioDb(),
    bytes = Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), Buffer.alloc(140000, 7)]),
    io = [],
    hook = { metadata: null, hash: null, range: null };
  const meta = {
    generation: '12',
    metageneration: '3',
    size: bytes.length,
    contentType: 'image/png',
    accepted: true,
  };
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Book',
    coverImageId: imageId,
    coverUrl: 'DO NOT COPY',
    createdAt: 1,
    updatedAt: 2,
  });
  f.records.set('users/author/imageLibrary/' + imageId, {
    name: 'My cover',
    path: 'book-covers/author/' + imageId + '.png',
    url: 'DO NOT COPY',
    state: 'active',
    useCount: 1,
    createdAt: 3,
    updatedAt: 4,
  });
  f.records.set('users/author/imageLibrary/' + imageId + '/uses/book', { bookId: 'book' });
  const assets = {
    async metadata(path) {
      io.push(['metadata', path]);
      await hook.metadata?.();
      return { ...meta };
    },
    async hashGeneration(path, generation, max) {
      io.push(['hash', path, generation, max]);
      await hook.hash?.();
      return {
        byteLength: bytes.length,
        contentHash: hash(bytes),
        signature: bytes.subarray(0, 8).toString('hex'),
      };
    },
    async readRange(path, generation, start, end) {
      io.push(['range', path, generation, start, end]);
      const result = Buffer.from(bytes.subarray(start, end + 1));
      await hook.range?.();
      return result;
    },
  };
  return {
    ...f,
    bytes,
    meta,
    io,
    hook,
    assets,
    root: createBookBackupReadService(f),
    api: createBookBackupCoverService({ db: f.db, assets }),
  };
}
const source = (f) => f.root.getBookBackupSource('author', { bookId: 'book' });
const cover = (f, pin, extra = {}, uid = 'author') =>
  f.api.getBookBackupCover(uid, { bookId: 'book', sourceToken: pin.sourceToken, ...extra });
const verify = (f, pin, token) =>
  f.api.verifyBookBackupCover('author', {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    coverToken: token,
  });
const read = (f, pin, token, index = 0, extra = {}) =>
  f.api.readBookBackupCoverChunk('author', {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    coverToken: token,
    index,
    ...extra,
  });
test('capture and all ranges preserve exact authorized bytes/hash/metadata without paths/tokens/uses or writes', async () => {
  const f = fixture(),
    pin = await source(f),
    before = structuredClone(f.records),
    value = await cover(f, pin),
    parts = [];
  assert.deepEqual(value.cover, {
    kind: 'library',
    imageId,
    contentType: 'image/png',
    byteLength: f.bytes.length,
    chunkCount: 3,
    contentHash: hash(f.bytes),
    name: 'My cover',
    createdAt: 3,
    updatedAt: 4,
  });
  assert.equal(JSON.stringify(value.cover).includes('DO NOT COPY'), false);
  assert.equal(Object.hasOwn(value.cover, 'path'), false);
  for (let index = 0; index < value.cover.chunkCount; index++) {
    const chunk = await read(f, pin, value.coverToken, index),
      bytes = Buffer.from(chunk.chunkBase64, 'base64');
    assert.ok(bytes.length <= 65536);
    assert.equal(chunk.chunkHash, hash(bytes));
    parts.push(bytes);
  }
  assert.deepEqual(Buffer.concat(parts), f.bytes);
  await verify(f, pin, value.coverToken);
  assert.equal(f.io.filter(([method]) => method === 'hash').length, 1);
  assert.deepEqual(f.records, before);
});
test('none and URL-only legacy cover are explicit without any Storage lookup or fetch', async () => {
  for (const kind of ['none', 'legacy-unavailable']) {
    const f = fixture();
    f.records.get('books/book').coverImageId = null;
    f.records.get('books/book').coverUrl =
      kind === 'none' ? null : 'https://example.invalid/private?token=DO-NOT-COPY';
    const pin = await source(f),
      value = await cover(f, pin);
    assert.deepEqual(value.cover, { kind });
    await verify(f, pin, value.coverToken);
    await assert.rejects(read(f, pin, value.coverToken), { code: 'failed-precondition' });
    assert.equal(f.io.length, 0);
  }
});
test('invalid own path, inactive library, broken use/counter and malformed image ID fail before Storage', async () => {
  for (const problem of ['path', 'state', 'count', 'use', 'id']) {
    const f = fixture(),
      image = f.records.get('users/author/imageLibrary/' + imageId);
    if (problem === 'path') image.path = 'book-covers/other/' + imageId + '.png';
    if (problem === 'state') image.state = 'deleting';
    if (problem === 'count') image.useCount = 0;
    if (problem === 'use') f.records.delete('users/author/imageLibrary/' + imageId + '/uses/book');
    if (problem === 'id') f.records.get('books/book').coverImageId = '../x';
    await assert.rejects(cover(f, await source(f)));
    assert.equal(f.io.length, 0);
  }
});
test('each Storage metadata/hash/range I/O is followed by current book/library/use authorization', async () => {
  for (const at of ['metadata', 'hash', 'range']) {
    const f = fixture(),
      pin = await source(f),
      initial = await cover(f, pin);
    f.hook[at] = async () => {
      await f.db.runTransaction(async (tx) =>
        tx.update(f.db.doc('books/book'), { deleting: true }),
      );
    };
    await assert.rejects(at === 'range' ? read(f, pin, initial.coverToken) : cover(f, pin), {
      code: 'not-found',
    });
  }
  const f = fixture(),
    pin = await source(f);
  f.hook.metadata = async () => {
    f.hook.metadata = null;
    await f.db.runTransaction(async (tx) =>
      tx.update(f.db.doc('users/author/imageLibrary/' + imageId), { name: 'Changed' }),
    );
  };
  await assert.rejects(cover(f, pin), { code: 'failed-precondition' });
});
test('generation, metageneration and accepted ABA changes invalidate old token with root unchanged', async () => {
  for (const field of ['generation', 'metageneration']) {
    const f = fixture(),
      pin = await source(f),
      initial = await cover(f, pin);
    f.meta[field] = '99';
    assert.deepEqual(await source(f), pin);
    await assert.rejects(verify(f, pin, initial.coverToken), { code: 'failed-precondition' });
    await assert.rejects(read(f, pin, initial.coverToken), { code: 'failed-precondition' });
  }
  const f = fixture(),
    pin = await source(f),
    initial = await cover(f, pin);
  f.meta.accepted = false;
  f.meta.metageneration = '4';
  await assert.rejects(verify(f, pin, initial.coverToken), { code: 'failed-precondition' });
  f.meta.accepted = true;
  f.meta.metageneration = '5';
  await assert.rejects(verify(f, pin, initial.coverToken), { code: 'failed-precondition' });
});
test('object replacement or use deletion during range cannot return already-read bytes', async () => {
  for (const mutation of ['storage', 'use']) {
    const f = fixture(),
      pin = await source(f),
      initial = await cover(f, pin);
    f.hook.range = async () => {
      if (mutation === 'storage') f.meta.generation = '13';
      else
        await f.db.runTransaction(async (tx) =>
          tx.delete(f.db.doc('users/author/imageLibrary/' + imageId + '/uses/book')),
        );
    };
    await assert.rejects(read(f, pin, initial.coverToken), { code: 'failed-precondition' });
  }
});
test('bad size/type/accepted/signature and truncated or failed reads never produce a successful capture', async () => {
  for (const changed of [
    { size: 16 * 1024 * 1024 + 1 },
    { size: 0 },
    { contentType: 'text/html' },
    { accepted: false },
    { generation: 'x' },
  ]) {
    const f = fixture();
    Object.assign(f.meta, changed);
    await assert.rejects(cover(f, await source(f)), { code: 'failed-precondition' });
  }
  const f = fixture(),
    pin = await source(f);
  f.bytes[0] = 0;
  await assert.rejects(cover(f, pin), { code: 'failed-precondition' });
  const good = fixture(),
    goodPin = await source(good),
    initial = await cover(good, goodPin);
  good.assets.readRange = async () => Buffer.alloc(1);
  await assert.rejects(read(good, goodPin, initial.coverToken), { code: 'failed-precondition' });
});
test('root isolation/closed arguments/part bounds are enforced and responses are private no-store', async () => {
  const f = fixture(),
    pin = await source(f),
    initial = await cover(f, pin);
  await assert.rejects(cover(f, pin, {}, 'other'), { code: 'not-found' });
  await assert.rejects(cover(f, pin, {}, ''), { code: 'unauthenticated' });
  await assert.rejects(cover(f, pin, { path: 'outside' }), { code: 'invalid-argument' });
  for (const index of [-1, 256, 3])
    await assert.rejects(read(f, pin, initial.coverToken, index), { code: 'invalid-argument' });
  await assert.rejects(read(f, pin, initial.coverToken, 0, { imageId: 'other' }), {
    code: 'invalid-argument',
  });
  const headers = [];
  for (const method of ['getBookBackupCover', 'readBookBackupCoverChunk', 'verifyBookBackupCover'])
    setBookBackupCoverHeaders(method, {
      rawRequest: { res: { setHeader: (...args) => headers.push(args) } },
    });
  assert.deepEqual(headers, Array(3).fill(['Cache-Control', 'private, no-store']));
});
