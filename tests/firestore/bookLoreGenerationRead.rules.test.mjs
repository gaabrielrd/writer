import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc } from 'firebase/firestore';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
import { born } from '../../functions/src/bookRestoreUploadContracts.mjs';
import {
  seedBookLoreGeneration,
  readGenerationSection,
} from '../../functions/test/helpers/bookLoreGenerationFixture.mjs';
import { resourcePayloadChunkPath } from '../../functions/src/bookResourcePayloadPaths.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-generation-read',
  sha = (x) => createHash('sha256').update(x).digest('hex');
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw Error('Dedicated loopback emulator required');
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
test('SDK v2 reads a Unicode field and retained relation generation without mutating the source; revocation is immediate', async () => {
  const name = '\ufeff' + '🌙'.repeat(50000),
    relations = Array.from({ length: 65 }, (_, i) => ({
      targetEntityId: 'target',
      relationType: 'r' + i,
    })),
    s = await seedBookLoreGeneration(admin, {
      baseData: { name: 'old', category: 'other', details: 'untouched', relations },
      fields: { name, isPublic: false, summary: null },
    }),
    api = createBookLoreReadService({ db: admin }),
    before = await admin.doc(s.path).get(),
    view = await api.getBookLoreRead(s.uid, { bookId: s.bookId, id: s.id });
  assert.equal(view.schemaVersion, 2);
  assert.equal(sha(await readGenerationSection(api, s, view)), sha(name));
  assert.equal(await readGenerationSection(api, s, view, 'field', 'isPublic'), false);
  const all = [];
  for (let page = 0; page < view.relations.pages; page++)
    all.push(...(await readGenerationSection(api, s, view, 'relations', undefined, page)));
  assert.deepEqual(all, relations);
  const after = await admin.doc(s.path).get();
  assert.equal(before.updateTime.isEqual(after.updateTime), true);
  const client = env.authenticatedContext(s.uid).firestore();
  await assertFails(getDoc(doc(client, s.bodies.name.path)));
  await assertFails(
    getDoc(
      doc(client, resourcePayloadChunkPath(s.bookId, s.bodies.name.prepared.manifest.bodyId, 0)),
    ),
  );
  await admin.doc(s.bookPath).update({ authorId: 'other' });
  await assert.rejects(() =>
    api.readBookLorePart(s.uid, {
      bookId: s.bookId,
      id: s.id,
      readToken: view.readToken,
      section: 'field',
      field: 'name',
      page: 0,
      index: 0,
    }),
  );
});
test('SDK field cutoff rejects a recreated part even when its new header has the same native birthday', async () => {
  const s = await seedBookLoreGeneration(admin),
    api = createBookLoreReadService({ db: admin }),
    initial = await api.getBookLoreRead(s.uid, { bookId: s.bookId, id: s.id });
  assert.equal(await readGenerationSection(api, s, initial), 'Renamed');
  const body = s.bodies.name,
    header = admin.doc(body.path),
    part = admin.doc(resourcePayloadChunkPath(s.bookId, body.prepared.manifest.bodyId, 0)),
    oldHeader = (await header.get()).data(),
    oldPart = (await part.get()).data();
  await admin.runTransaction(async (tx) => {
    tx.delete(header);
    tx.delete(part);
  });
  await admin.runTransaction(async (tx) => {
    tx.create(part, oldPart);
    tx.create(header, oldHeader);
  });
  const nativeHeader = await header.get(),
    nativePart = await part.get();
  assert.equal(nativeHeader.createTime.isEqual(nativePart.createTime), true);
  const storage = structuredClone(s.storage);
  storage.fields.name.expectedBirth = born(nativeHeader);
  storage.sealBirth = born(nativeHeader);
  // Explicit reader harness: rebinding this raw head is not an adoption implementation.
  await admin.doc(s.path).update({ payloadStorage: storage });
  const view = await api.getBookLoreRead(s.uid, { bookId: s.bookId, id: s.id });
  await assert.rejects(() => readGenerationSection(api, s, view));
});
test('SDK new v2 relation pages enforce their native cutoff and preserve literal descriptions', async () => {
  const relations = Array.from({ length: 65 }, () => ({
      targetEntityId: 'target',
      relationType: 'knows',
      description: '\ufeffliteral 🌙',
    })),
    s = await seedBookLoreGeneration(admin, { relations }),
    api = createBookLoreReadService({ db: admin }),
    view = await api.getBookLoreRead(s.uid, { bookId: s.bookId, id: s.id }),
    all = [];
  for (let page = 0; page < 2; page++)
    all.push(...(await readGenerationSection(api, s, view, 'relations', undefined, page)));
  assert.deepEqual(all, relations);
  const segment = s.newSegments[0],
    header = admin.doc(segment.body.path),
    chunk = admin.doc(resourcePayloadChunkPath(s.bookId, segment.body.prepared.manifest.bodyId, 0)),
    segmentRef = admin.doc(segment.path),
    h = (await header.get()).data(),
    p = (await chunk.get()).data(),
    metadata = (await segmentRef.get()).data();
  await admin.runTransaction(async (tx) => {
    tx.delete(header);
    tx.delete(chunk);
    tx.delete(segmentRef);
  });
  await admin.runTransaction(async (tx) => {
    tx.create(chunk, p);
    tx.create(header, h);
  });
  const headerBirth = born(await header.get());
  metadata.payload.expectedBirth = headerBirth;
  await segmentRef.create(metadata);
  const seal = born(await segmentRef.get()),
    storage = structuredClone(s.storage);
  storage.relations.sealBirth = seal;
  storage.sealBirth = seal;
  await admin.doc(s.path).update({ payloadStorage: storage });
  const changed = await api.getBookLoreRead(s.uid, { bookId: s.bookId, id: s.id });
  await assert.rejects(() => readGenerationSection(api, s, changed, 'relations', undefined, 0));
});
