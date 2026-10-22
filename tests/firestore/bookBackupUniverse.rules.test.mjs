import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, deleteDoc } from 'firebase/firestore';
import { createBookBackupReadService } from '../../functions/src/bookBackupRead.mjs';
import { createBookBackupUniverseService } from '../../functions/src/bookBackupUniverseRead.mjs';
import {
  createUniverseService,
  prepareUniverseProjectLink,
} from '../../functions/src/universes.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-backup-universe';
let environment, admin, root, api, universes;
const source = () => root.getBookBackupSource('author', { bookId: 'book' });
const read = (pin, extra = {}, uid = 'author') =>
  api.getBookBackupUniverse(uid, { bookId: 'book', sourceToken: pin.sourceToken, ...extra });
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? '')) throw new Error('Use emulador local demo.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  root = createBookBackupReadService({ db: admin });
  api = createBookBackupUniverseService({ db: admin });
  universes = createUniverseService({ db: admin, now: () => 1000 });
});
beforeEach(async () => {
  await environment.clearFirestore();
  await admin
    .doc('books/book')
    .set({ authorId: 'author', title: 'Book', status: 'draft', createdAt: 1, updatedAt: 2 });
  await universes.createUniverse('author', {
    creationId: 'world',
    name: 'DO NOT COPY',
    description: 'DO NOT COPY',
  });
  await admin.runTransaction(async (tx) => {
    const plan = await prepareUniverseProjectLink(
      tx,
      admin,
      'author',
      { kind: 'book', id: 'book' },
      null,
      'world',
      () => 1000,
      { strict: true },
    );
    plan.commit();
    tx.update(admin.doc('books/book'), { universeId: 'world', updatedAt: 3 });
  });
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});

test('real universe/link writers yield exact native origin while copying no global metadata or counters', async () => {
  const pin = await source(),
    value = await read(pin),
    snapshot = await admin.doc('universes/world').get(),
    data = snapshot.data();
  assert.deepEqual(value.origin, {
    kind: 'reference',
    id: 'world',
    created: { seconds: snapshot.createTime.seconds, nanoseconds: snapshot.createTime.nanoseconds },
  });
  assert.equal(data.bookCount, 1);
  assert.equal(JSON.stringify(value).includes('DO NOT COPY'), false);
  assert.equal(Object.hasOwn(value.origin, 'authorId'), false);
  assert.equal(Object.hasOwn(value.origin, 'bookCount'), false);
  const [masked] = await admin.runTransaction((tx) =>
    tx.getAll(admin.doc('universes/world'), { fieldMask: ['authorId', 'deleting'] }),
  );
  assert.deepEqual(masked.data(), { authorId: 'author' });
  assert.ok(masked.createTime.isEqual(snapshot.createTime));
  assert.deepEqual(await read(pin, { expectedUniverseToken: value.universeToken }), value);
});
test('real universe metadata and lore mutations invalidate origin while book source stays unchanged', async () => {
  const pin = await source(),
    first = await read(pin);
  await universes.updateUniverse('author', {
    id: 'world',
    name: 'Updated',
    description: 'Secret updated description',
  });
  assert.deepEqual(await source(), pin);
  await assert.rejects(read(pin, { expectedUniverseToken: first.universeToken }), {
    code: 'failed-precondition',
  });
  const second = await read(pin);
  await universes.saveUniverseLore('author', {
    universeId: 'world',
    id: 'entity',
    create: true,
    input: {
      name: 'Secret global entity',
      category: 'character',
      summary: 'Secret',
      details: 'Secret global prose',
      isPublic: false,
    },
  });
  assert.deepEqual(await source(), pin);
  await assert.rejects(read(pin, { expectedUniverseToken: second.universeToken }), {
    code: 'failed-precondition',
  });
  const fresh = await read(pin);
  assert.equal(JSON.stringify(fresh).includes('Secret'), false);
  assert.deepEqual(fresh.origin, first.origin);
});
test('linked universe cannot be deleted normally, but Admin equal-data replacement invalidates native identity', async () => {
  const pin = await source(),
    first = await read(pin),
    ref = admin.doc('universes/world'),
    body = (await ref.get()).data(),
    own = environment.authenticatedContext('author').firestore();
  await assertFails(deleteDoc(doc(own, 'universes/world')));
  await assert.rejects(universes.deleteUniverse('author', { id: 'world' }), {
    code: 'failed-precondition',
  });
  await ref.delete();
  await ref.set(body);
  assert.deepEqual(await source(), pin);
  const current = await read(pin);
  assert.notDeepEqual(current.origin.created, first.origin.created);
  await assert.rejects(read(pin, { expectedUniverseToken: first.universeToken }), {
    code: 'failed-precondition',
  });
});
test('unavailable causes are opaque and foreign changes do not affect token; unlinking requires new book source', async () => {
  const pin = await source(),
    first = await read(pin);
  await admin.doc('universes/world').update({ authorId: 'other' });
  await assert.rejects(read(pin, { expectedUniverseToken: first.universeToken }), {
    code: 'failed-precondition',
  });
  const unavailable = await read(pin);
  assert.deepEqual(unavailable.origin, { kind: 'unavailable', id: 'world' });
  await admin.doc('universes/world').update({ description: 'Changed secret' });
  assert.deepEqual(
    await read(pin, { expectedUniverseToken: unavailable.universeToken }),
    unavailable,
  );
  await admin.doc('universes/world').update({ authorId: 'author', deleting: true });
  assert.deepEqual(await read(pin), unavailable);
  await admin.doc('universes/world').delete();
  assert.deepEqual(await read(pin), unavailable);
  await admin.doc('books/book').update({ universeId: null });
  await assert.rejects(read(pin), { code: 'failed-precondition' });
  assert.deepEqual((await read(await source())).origin, { kind: 'none' });
});
test('every call reauthorizes book, rejects arbitrary universe paths and respects deleting/recreated origin', async () => {
  const pin = await source(),
    other = environment.authenticatedContext('other').firestore();
  await assertFails(getDoc(doc(other, 'books/book')));
  await assertFails(getDoc(doc(other, 'universes/world')));
  await assert.rejects(read(pin, {}, 'other'), { code: 'not-found' });
  await assert.rejects(read(pin, {}, ''), { code: 'unauthenticated' });
  await assert.rejects(read(pin, { universeId: 'foreign' }), { code: 'invalid-argument' });
  await admin.doc('books/book').update({ deleting: true });
  await assert.rejects(read(pin), { code: 'not-found' });
  await admin.doc('books/book').delete();
  await admin.doc('books/book').set({
    authorId: 'author',
    title: 'Recreated',
    universeId: 'world',
    createdAt: 1,
    updatedAt: 2,
  });
  await assert.rejects(read(pin), { code: 'failed-precondition' });
});
