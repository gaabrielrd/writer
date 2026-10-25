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
import { uploadSealedArchiveRestore } from '../../functions/test/helpers/bookRestoreContentFixture.mjs';
import { finishLegacyRestore } from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
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
    root: fileURLToPath(new URL('../../', import.meta.url)),
    logLevel: 'silent',
    build: {
      write: false,
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
      rolldownOptions: { external: (id) => id.startsWith('@/') || id.startsWith('firebase/') },
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
