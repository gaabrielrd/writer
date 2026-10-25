import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { seedBookLoreRead } from '../../functions/test/helpers/bookLoreReadFixture.mjs';
import { seedBookLoreGeneration } from '../../functions/test/helpers/bookLoreGenerationFixture.mjs';
import { loreLogicalFixture } from '../../functions/test/helpers/bookLoreLogicalFixture.mjs';
import { resourcePayloadChunkPath } from '../../functions/src/bookResourcePayloadPaths.mjs';
import { createBookLoreContextReader } from '../../functions/src/bookLoreContextRead.mjs';
import { createBookLoreProjectionBudget } from '../../functions/src/bookLoreTextProjection.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-context';
let admin, env;
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
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const budget = (extra = {}) =>
  createBookLoreProjectionBudget({
    bytes: 32 * 1024 * 1024,
    parts: 512,
    retainedBytes: 10000,
    ...extra,
  });
async function read(id, selection, b = budget(), seen = []) {
  return admin.runTransaction(async (native) => {
    const tx = new Proxy(native, {
      get(target, key) {
        if (key === 'get')
          return (ref, ...args) => {
            if (ref.path) seen.push(ref.path);
            return target.get(ref, ...args);
          };
        const value = target[key];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    return (await createBookLoreContextReader(tx, admin, 'author', 'book')).read(id, selection, b);
  });
}
test('SDK certifies more than 8 MiB and 128 native parts while retaining only the selected prefix', async () => {
  const details = '\ufeff' + '🌙'.repeat(2300000);
  const seed = await seedBookLoreRead(admin, {
    id: 'large',
    data: { name: 'Literal', category: 'other', details, aliases: ['', 'same', 'same'] },
  });
  assert.ok(seed.base.prepared.manifest.chunkCount > 128);
  const b = budget(),
    seen = [],
    head = await admin.doc(seed.path).get();
  const r = await read(
    'large',
    { name: null, details: 1999, aliases: { items: 2, characters: 200 } },
    b,
    seen,
  );
  assert.equal(r.fields.name.value, 'Literal');
  assert.equal(r.fields.details.value, details.slice(0, 1999));
  assert.equal(r.fields.details.truncated, true);
  assert.deepEqual(r.fields.aliases, {
    value: ['', 'same'],
    count: 3,
    omitted: 1,
    truncated: false,
  });
  assert.ok(b.used.retainedBytes < 9000);
  assert.equal(
    seen.filter((p) => p.includes('/bookResourceChunks/')).length,
    seed.base.prepared.manifest.chunkCount,
  );
  assert.equal((await admin.doc(seed.path).get()).updateTime.isEqual(head.updateTime), true);
});
test('SDK flat metadata avoids unselected bodies, preserves removals and rejects a recreated native part', async () => {
  const seed = await seedBookLoreGeneration(admin, {
    id: 'flat',
    noBase: true,
    fields: {
      name: 'Aria',
      category: 'character',
      summary: null,
      aliases: ['', 'A', 'A'],
      details: 'PRIVATE_' + 'x'.repeat(180000),
      structuredDetails: { notes: 'PRIVATE_NOTES' },
      isPublic: false,
    },
  });
  const seen = [],
    b = budget({ bytes: 10000, parts: 10 });
  const r = await read(
    'flat',
    { name: null, category: null, summary: 140, aliases: { items: null, characters: null } },
    b,
    seen,
  );
  assert.equal(r.fields.name.value, 'Aria');
  assert.equal(Object.hasOwn(r.fields, 'summary'), false);
  assert.deepEqual(r.fields.aliases.value, ['', 'A', 'A']);
  assert.deepEqual(r.privacy, { present: true, value: false });
  for (const key of ['details', 'structuredDetails'])
    assert.equal(
      seen.some((p) => p.includes(seed.bodies[key].prepared.manifest.bodyId)),
      false,
    );
  const path = resourcePayloadChunkPath('book', seed.bodies.name.prepared.manifest.bodyId, 0);
  const original = (await admin.doc(path).get()).data();
  await admin.doc(path).delete();
  await admin.doc(path).create(original);
  await assert.rejects(read('flat', { name: null }));
});
test('SDK producer-created lore projects its literal text through the original creation proof', async () => {
  const f = await loreLogicalFixture(admin, { mode: 'created' });
  const r = await read(f.entityId, { name: null, category: null, details: 2000 });
  assert.equal(r.fields.name.value, f.expected.name);
  assert.equal(r.fields.details.value, f.expected.details);
  assert.equal(r.sourceToken.length, 64);
  await admin.doc('books/book/bookLoreTombstones/' + f.entityId).create({ removed: true });
  const seen = [];
  await assert.rejects(read(f.entityId, { name: null }, budget(), seen));
  assert.equal(
    seen.some((p) => p.includes('/bookResourceChunks/')),
    false,
  );
});
test('SDK exhausted I/O budget rejects before body chunks and leaves the source unchanged', async () => {
  const seed = await seedBookLoreRead(admin, {
    id: 'budget',
    data: { name: 'N', category: 'other' },
  });
  const head = await admin.doc(seed.path).get(),
    seen = [];
  await assert.rejects(read('budget', { name: null }, budget({ parts: 0 }), seen), {
    code: 'resource-exhausted',
  });
  assert.equal(
    seen.some((p) => p.includes('/bookResourceChunks/')),
    false,
  );
  assert.equal((await admin.doc(seed.path).get()).updateTime.isEqual(head.updateTime), true);
});
