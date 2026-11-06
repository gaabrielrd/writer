import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
import { validateBookBackupJSONItem } from '../../functions/src/bookBackupSchema.mjs';
import { seedBookLoreRead } from '../../functions/test/helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from '../../functions/test/helpers/bookLoreGenerationFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from '../../functions/test/helpers/bookLoreCreationAdoptionFixture.mjs';
import { resourcePayloadChunkPath } from '../../functions/src/bookResourcePayloadPaths.mjs';
import {
  bookArchiveReadApi,
  bookArchiveCapturePorts,
} from '../../functions/test/helpers/bookArchiveCaptureFixture.mjs';
import {
  uploadSealedArchiveRestore,
  uploadArchiveRestore,
} from '../../functions/test/helpers/bookRestoreContentFixture.mjs';
import {
  indexedLoreData,
  indexedLoreArchive,
} from '../../functions/test/helpers/bookLoreContentFixture.mjs';
import { finishLegacyRestore } from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { chunkId } from '../../functions/src/bookRestoreUploadContracts.mjs';
import { digest } from '../../functions/src/sceneContracts.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore, FieldValue } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-portable-lore',
  hash = (b) => createHash('sha256').update(b).digest('hex');
let admin, env, createClient, saveArchive;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated demo loopback emulator required');
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
  // Compile the current client in memory. No external artifact, server credentials or bundle fixture.
  const bundled = await build({
    configFile: false,
    resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
    root: fileURLToPath(new URL('../../', import.meta.url)),
    logLevel: 'silent',
    build: {
      write: false,
      rolldownOptions: { output: { codeSplitting: false } },
      lib: {
        entry: fileURLToPath(
          new URL('../../src/features/lore/services/bookLoreReadClient.ts', import.meta.url),
        ),
        formats: ['es'],
      },
    },
  });
  const outputs = Array.isArray(bundled) ? bundled : [bundled];
  const code = outputs.flatMap((result) => result.output).find((o) => o.type === 'chunk')?.code;
  assert.equal(typeof code, 'string');
  ({ createBookLoreReadClient: createClient } = await import(
    'data:text/javascript;base64,' +
      Buffer.from(code + '\n//# sourceURL=writer-lore-portable-sdk.mjs').toString('base64')
  ));
  const archiveBundle = await build({
    configFile: false,
    resolve: { alias: { '@': fileURLToPath(new URL('../../src', import.meta.url)) } },
    root: fileURLToPath(new URL('../../', import.meta.url)),
    logLevel: 'silent',
    build: {
      write: false,
      lib: {
        entry: fileURLToPath(
          new URL(
            '../../src/features/book-portability/services/bookBackupSink.ts',
            import.meta.url,
          ),
        ),
        formats: ['es'],
      },
      rolldownOptions: {
        output: { codeSplitting: false },
        external: (id) =>
          (id.startsWith('@/') && !['@/shared/streams', '@/shared/validation'].includes(id)) ||
          id.startsWith('firebase/'),
      },
    },
  });
  const archiveCode = (Array.isArray(archiveBundle) ? archiveBundle : [archiveBundle])
    .flatMap((r) => r.output)
    .find((o) => o.type === 'chunk')?.code;
  assert.equal(typeof archiveCode, 'string');
  ({ saveBookBackup: saveArchive } = await import(
    'data:text/javascript;base64,' + Buffer.from(archiveCode).toString('base64')
  ));
});
beforeEach(async () => {
  await env.clearFirestore();
  await admin
    .doc('books/book')
    .create({ authorId: 'author', localLoreVersion: 0, status: 'draft', title: 'Book' });
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
async function fixture(mode = 'v1', { large = false } = {}) {
  const data = {
    name: ' \ufeff🌙 exact ',
    category: 'character',
    aliases: ['', 'same', 'same'],
    details: large ? '\ufeff' + 'PRIVATE_PORTABLE_TEXT🌙'.repeat(400000) : 'PRIVATE_PORTABLE_TEXT',
    summary: '',
    structuredDetails: { notes: '\u0000\n literal' },
    isPublic: false,
  };
  let seed,
    id = 'entity';
  if (mode === 'created') {
    const f = await creationAdoptionFixture(admin, {
      changes: Object.entries(data).map(([field, value]) => ({ target: { field }, value })),
    });
    await adoptCreation(f);
    seed = f.source.seed;
    id = f.loreId;
  } else if (mode === 'v2')
    seed = await seedBookLoreGeneration(admin, { id, noBase: true, fields: data });
  else seed = await seedBookLoreRead(admin, { id, data });
  const api = createBookLoreReadService({ db: admin }),
    requests = [],
    client = createClient(
      async (method, input) => {
        requests.push({ method, input });
        return api[method]('author', input);
      },
      () => {},
    );
  return { data, id, seed, client, requests };
}
async function capture(f, write) {
  const parts = [],
    before = await admin.doc('books/book').get(),
    proof = await f.client.writePortable(
      'book',
      f.id,
      write ??
        (async (part, bytes) => {
          assert.equal(part, parts.length);
          parts.push(Buffer.from(bytes));
        }),
    );
  return { proof, parts, bytes: Buffer.concat(parts), before };
}
test('SDK portable lore: native v1 above 8 MiB/128 parts is read once and preserves full literal fields', async () => {
  const f = await fixture('v1', { large: true }),
    r = await capture(f);
  assert.ok(r.parts.length > 128);
  assert.equal(r.proof.contentHash, hash(r.bytes));
  const value = JSON.parse(r.bytes.toString());
  validateBookBackupJSONItem('book-lore', value, 'book');
  assert.deepEqual(value.data, { ...f.data, createdAt: 1000, updatedAt: 1000 });
  const reads = f.requests.filter((r) => r.method === 'readBookLorePart');
  assert.equal(reads.length, f.seed.base.prepared.manifest.chunkCount);
  assert.equal(new Set(reads.map((r) => r.input.index)).size, reads.length);
  const n = f.requests.length;
  await f.client.verifyPortable(r.proof);
  assert.deepEqual(
    f.requests.slice(n).map((r) => r.method),
    ['getBookLoreRead'],
  );
  assert.ok(r.before.updateTime.isEqual((await admin.doc('books/book').get()).updateTime));
  const owner = env.authenticatedContext('author').firestore();
  await assertFails(
    getDoc(doc(owner, resourcePayloadChunkPath('book', f.seed.base.prepared.manifest.bodyId, 0))),
  );
});
for (const mode of ['v2', 'created'])
  test(
    'SDK portable lore: ' + mode + ' source and creation proofs survive the compiled client bridge',
    async () => {
      const f = await fixture(mode),
        r = await capture(f),
        head = (await admin.doc('books/book/lore/' + f.id).get()).data();
      assert.equal(r.proof.contentHash, hash(r.bytes));
      assert.deepEqual(JSON.parse(r.bytes.toString()).data, {
        ...f.data,
        ...head.payloadStorage.dates,
      });
      await f.client.verifyPortable(r.proof);
      assert.equal(JSON.stringify(r.proof).includes('PRIVATE_PORTABLE_TEXT'), false);
    },
  );
test('SDK portable lore: original collection clock is reauthorized after the final output', async () => {
  const f = await fixture('v2');
  await assert.rejects(
    capture(f, async () =>
      admin.doc('books/book').update({ localLoreVersion: FieldValue.increment(1) }),
    ),
    { code: 'failed-precondition' },
  );
});
test('SDK portable lore: a recreated native part cannot reuse its old scope or Merkle proof', async () => {
  const f = await fixture('v1'),
    path = resourcePayloadChunkPath('book', f.seed.base.prepared.manifest.bodyId, 0),
    value = (await admin.doc(path).get()).data();
  await admin.doc(path).delete();
  await admin.doc(path).create(value);
  await assert.rejects(capture(f), { code: 'failed-precondition' });
});

test('SDK archive capture: large C1 source reaches sealed bytes and server content validation without activating a copy', async () => {
  const f = await fixture('v2', { large: true }),
    api = bookArchiveReadApi(admin),
    call = (method, input) => api[method]('author', input),
    lore = { ...f.client, guard: () => {} },
    options = bookArchiveCapturePorts(call, lore),
    parts = [];
  let closed = false,
    aborted = false;
  await saveArchive('book', options, {
    async write(bytes) {
      parts.push(Buffer.from(bytes));
    },
    async close() {
      closed = true;
    },
    async abort() {
      aborted = true;
    },
  });
  const bytes = Buffer.concat(parts),
    id = 'sdk-sealed-c1-archive01',
    factory = () => createBookRestoreUploadService({ db: admin }),
    progress = await uploadSealedArchiveRestore(factory(), 'author', id, bytes),
    done = await finishLegacyRestore(factory, 'author', id, progress);
  assert.ok(bytes.length > 8 * 1024 * 1024);
  assert.equal(closed, true);
  assert.equal(aborted, false);
  assert.equal(done.state, 'content-verified');
  assert.equal(done.validation.summary.totals.resources.lore, 1);
  assert.equal((await admin.doc('books/' + done.bookId).get()).exists, false);
  const reads = f.requests.filter((r) => r.method === 'readBookLorePart');
  assert.equal(
    new Set(
      reads.map((r) =>
        JSON.stringify([r.input.section, r.input.field, r.input.page, r.input.index]),
      ),
    ).size,
    reads.length,
  );
  const last = f.requests.filter((r) => r.method === 'getBookLoreRead').at(-1);
  assert.equal(last.input.tokenVersion, 1);

  const reader = await factory().openVerifiedBookRestoreContent('author', {
      restoreId: id,
      jobToken: done.jobToken,
    }),
    pointer = (
      await admin
        .collection('users/author/bookRestores/' + id + '/validationItems')
        .where('record.kind', '==', 'book-lore')
        .limit(1)
        .get()
    ).docs[0],
    indexed = await reader.openIndexedLore(pointer.data().index),
    expected = Buffer.from(JSON.stringify(f.data.details));
  assert.ok(indexed.metadata.index.ranges.details.byteLength > 8 * 1024 * 1024);
  await assert.rejects(() => reader.readItem(pointer.data().index));
  for (const offset of [expected.length - 65536, 65530, 0]) {
    const unit = await indexed.readField('details', { offset });
    assert.deepEqual(Buffer.from(unit.bytes), expected.subarray(offset, offset + 65536));
    await admin.runTransaction(async (tx) => {
      await unit.verify(tx);
      tx.create(admin.doc('sdkIndexedRead/result-' + offset), { byteLength: unit.bytes.length });
    });
  }
  assert.equal((await admin.doc('books/' + done.bookId).get()).exists, false);
});
test('SDK archive capture: a changed root clock before the final seal aborts the file without a successful close', async () => {
  const f = await fixture('v2'),
    api = bookArchiveReadApi(admin),
    call = (method, input) => api[method]('author', input),
    lore = { ...f.client, guard: () => {} },
    options = bookArchiveCapturePorts(call, lore),
    verify = options.history.verify;
  let closed = false,
    aborted = false;
  options.history.verify = async (...args) => {
    await verify(...args);
    await admin.doc('books/book').update({ localLoreVersion: FieldValue.increment(1) });
  };
  await assert.rejects(
    saveArchive('book', options, {
      async write() {},
      async close() {
        closed = true;
      },
      async abort() {
        aborted = true;
      },
    }),
  );
  assert.equal(closed, false);
  assert.equal(aborted, true);
});

test('SDK archive seal: same-UID actor changes during seal and close cannot return success', async () => {
  const f = await fixture('v2'),
    api = bookArchiveReadApi(admin),
    call = (method, input) => api[method]('author', input),
    actor = { uid: 'author' };
  let current = actor,
    closed = false,
    aborted = false,
    changed = false;
  const lore = {
      ...f.client,
      guard: () => {
        if (current !== actor) throw Error('Actor changed');
      },
    },
    options = bookArchiveCapturePorts(call, lore);
  await assert.rejects(
    saveArchive('book', options, {
      async write(bytes) {
        if (Buffer.from(bytes).includes(Buffer.from('"type":"end"'))) {
          changed = true;
          current = { uid: 'author' };
        }
      },
      async close() {
        closed = true;
      },
      async abort() {
        aborted = true;
      },
    }),
    /Actor changed/,
  );
  assert.equal(changed, true);
  assert.equal(closed, false);
  assert.equal(aborted, true);
  current = actor;
  aborted = false;
  await assert.rejects(
    saveArchive('book', options, {
      async write() {},
      async close() {
        closed = true;
        current = { uid: 'author' };
      },
      async abort() {
        aborted = true;
      },
    }),
    /Actor changed/,
  );
  assert.equal(closed, true);
  assert.equal(aborted, true);
});

async function indexedReady(
  id,
  { data = indexedLoreData({ count: 3 }), sourceId = 'entity' } = {},
) {
  const factory = () => createBookRestoreUploadService({ db: admin });
  delete data.summary;
  const { progress } = await uploadArchiveRestore(
      factory(),
      'author',
      id,
      indexedLoreArchive(data, { id: sourceId }),
    ),
    done = await finishLegacyRestore(factory, 'author', id, progress),
    reader = await factory().openVerifiedBookRestoreContent('author', {
      restoreId: id,
      jobToken: done.jobToken,
    }),
    pointer = (
      await admin
        .collection('users/author/bookRestores/' + id + '/validationItems')
        .where('record.kind', '==', 'book-lore')
        .limit(1)
        .get()
    ).docs[0];
  return {
    factory,
    done,
    reader,
    pointer,
    lore: await reader.openIndexedLore(pointer.data().index),
  };
}
test('SDK indexed restore: native ABA blocks consumption of a previously authenticated range', async () => {
  for (const mode of ['pointer', 'receipt', 'birth', 'chunk', 'proof', 'state', 'job']) {
    const id = 'sdk-indexed-aba-' + mode,
      r = await indexedReady(id),
      root = 'users/author/bookRestores/' + id,
      job = (await admin.doc(root).get()).data(),
      unit = await r.lore.readField('details'),
      path = {
        pointer: r.pointer.ref.path,
        receipt: 'users/author/bookRestoreOperations/' + r.pointer.data().createdByOperationId,
        birth: 'users/author/bookRestoreOperations/' + job.validationBirthOperationId,
        chunk: root + '/chunks/' + chunkId(0),
        proof: root + '/integrityProofs/' + chunkId(0),
        state: root + '/validationState/current',
        job: root,
      }[mode],
      ref = admin.doc(path),
      original = (await ref.get()).data();
    assert.ok(original, mode + ': original document must exist');
    await ref.delete();
    await ref.create(original);
    const result = admin.doc('sdkIndexedRead/denied-' + mode);
    await assert.rejects(
      () =>
        admin.runTransaction(async (tx) => {
          await unit.verify(tx);
          tx.create(result, { accepted: true });
        }),
      mode,
    );
    assert.equal((await result.get()).exists, false);
    if (mode !== 'proof') await assert.rejects(() => r.lore.readField('details'), mode);
    assert.equal((await admin.doc('books/' + r.done.bookId).get()).exists, false);
  }
});
test('SDK indexed restore: account, absence and range checks remain valid until consumer commit and cancellation revokes them', async () => {
  const id = 'sdk-indexed-cancel-0001',
    r = await indexedReady(id),
    request = { restoreId: id, jobToken: r.done.jobToken },
    missing = await r.lore.readField('summary'),
    unit = await r.lore.readRange(1, 10);
  assert.equal(missing.present, false);
  assert.equal(Object.hasOwn(missing, 'bytes'), false);
  for (const [actor, input] of [
    ['other', request],
    [null, request],
    ['author', { ...request, jobToken: 'f'.repeat(64) }],
  ])
    await assert.rejects(() => r.factory().openVerifiedBookRestoreContent(actor, input));
  await assert.rejects(() => r.lore.readRange(0, 65537));
  await assert.rejects(() => r.lore.readField('summary', { offset: 1 }));
  const root = 'users/author/bookRestores/' + id;
  for (const path of [
    r.pointer.ref.path,
    root + '/chunks/' + chunkId(0),
    root + '/integrityProofs/' + chunkId(0),
  ]) {
    assert.equal((await admin.doc(path).get()).exists, true, path);
    for (const actor of [
      env.authenticatedContext('author'),
      env.authenticatedContext('other'),
      env.unauthenticatedContext(),
    ])
      await assertFails(getDoc(doc(actor.firestore(), path)));
  }
  await admin.runTransaction(missing.verify);
  await r.factory().cancelBookRestore('author', {
    ...request,
    operationId: id + '-cancel',
    expectedCheckpoint: r.done.checkpoint,
  });
  for (const proof of [r.lore, unit, missing])
    await assert.rejects(() =>
      admin.runTransaction(async (tx) => {
        await proof.verify(tx);
        tx.create(admin.doc('sdkIndexedRead/cancelled'), { accepted: true });
      }),
    );
  await assert.rejects(() => r.lore.readRange(0, 10));
  assert.equal((await admin.doc('sdkIndexedRead/cancelled').get()).exists, false);
  assert.equal((await admin.doc('books/' + r.done.bookId).get()).exists, false);
});

test('SDK mapped lore: remap growth crosses 8 MiB and cursor resumes after native preparation advances', async () => {
  const id = 'sdk-mapped-growth-0001',
    data = indexedLoreData({ count: 1000 });
  data.relations = data.relations.map((v) => ({ ...v, targetEntityId: 'entity' }));
  data.relations[0].description = 'PRIVATE_INDEXED_LORE_BODY';
  const fill = 8 * 1024 * 1024 - 32768 - Buffer.byteLength(JSON.stringify(data.relations));
  assert.ok(fill > 0);
  data.relations[0].description += 'x'.repeat(fill);
  const r = await indexedReady(id, { data }),
    original = await r.reader.openMappedIndexedLore(r.pointer.data().index),
    first = await original.readField('relations', { limit: 17 }),
    parts = [Buffer.from(first.bytes)];
  assert.ok(r.pointer.data().byteLength < 8 * 1024 * 1024);
  const advanced = (
    await r.factory().advanceBookRestoreStructure('author', {
      restoreId: id,
      jobToken: r.done.jobToken,
      operationId: id + '-prepare',
      expectedCheckpoint: r.done.checkpoint,
    })
  ).progress;
  await assert.rejects(() => admin.runTransaction(first.verify));
  const fresh = await r.factory().openVerifiedBookRestoreContent('author', {
      restoreId: id,
      jobToken: advanced.jobToken,
    }),
    mapped = await fresh.openMappedIndexedLore(r.pointer.data().index);
  assert.equal(mapped.sourceToken, original.sourceToken);
  let cursor = JSON.parse(JSON.stringify(first.cursor)),
    last,
    units = 1;
  for (;;) {
    const unit = await mapped.readField('relations', { cursor });
    assert.ok(unit.bytes.length <= 80 * 1024 && unit.references <= 64);
    await admin.runTransaction(unit.verify);
    parts.push(Buffer.from(unit.bytes));
    cursor = JSON.parse(JSON.stringify(unit.cursor));
    assert.ok(Buffer.byteLength(JSON.stringify(cursor)) <= 16384);
    last = unit;
    units++;
    if (unit.done) break;
  }
  const actual = Buffer.concat(parts),
    expected = Buffer.from(
      JSON.stringify(data.relations.map((v) => ({ ...v, targetEntityId: mapped.id }))),
    );
  assert.deepEqual(actual, expected);
  assert.ok(actual.length > 8 * 1024 * 1024);
  assert.equal(last.summary.contentHash, hash(expected));
  assert.equal(last.summary.byteLength, expected.length);
  assert.equal(last.summary.relations, 1000);
  assert.ok(units > 128);
  await admin.runTransaction(async (tx) => {
    await last.verify(tx);
    tx.create(admin.doc('sdkMappedLore/result'), { hash: last.summary.contentHash });
  });
  assert.equal((await admin.doc('books/' + advanced.bookId).get()).exists, false);
});
test('SDK mapped lore: present and absent qualified-local observations plus cancellation are pinned at consumer commit', async () => {
  for (const present of [true, false]) {
    const id = 'sdk-mapped-index-' + present,
      local = 'universe:world:outside',
      r = await indexedReady(id, { sourceId: present ? local : 'entity' }),
      mapped = await r.reader.openMappedIndexedLore(r.pointer.data().index),
      unit = await mapped.readField('relations'),
      path =
        'users/author/bookRestores/' +
        id +
        '/validationIndex/' +
        digest(['node', 'lore', '', local]),
      ref = admin.doc(path),
      original = await ref.get();
    assert.equal(original.exists, present);
    if (present) {
      await ref.delete();
      await ref.create(original.data());
    } else {
      const own = await admin
        .doc(
          'users/author/bookRestores/' +
            id +
            '/validationIndex/' +
            digest(['node', 'lore', '', 'entity']),
        )
        .get();
      assert.equal(own.exists, true);
      await ref.create({ ...own.data(), key: ['node', 'lore', '', local] });
    }
    const result = admin.doc('sdkMappedLore/denied-' + present);
    await assert.rejects(() =>
      admin.runTransaction(async (tx) => {
        await unit.verify(tx);
        tx.create(result, { accepted: true });
      }),
    );
    assert.equal((await result.get()).exists, false);
    await r.factory().cancelBookRestore('author', {
      restoreId: id,
      jobToken: r.done.jobToken,
      expectedCheckpoint: r.done.checkpoint,
      operationId: id + '-cancel',
    });
    await assert.rejects(() => mapped.readField('relations', { cursor: unit.cursor }));
    await assert.rejects(() =>
      r
        .factory()
        .openVerifiedBookRestoreContent('other', { restoreId: id, jobToken: r.done.jobToken }),
    );
  }
});
