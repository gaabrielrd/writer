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
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore, FieldValue } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-portable-lore',
  hash = (b) => createHash('sha256').update(b).digest('hex');
let admin, env, createClient;
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
