import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, writeBatch } from 'firebase/firestore';
import { createBookBackupReadService } from '../../functions/src/bookBackupRead.mjs';
import { createBookBackupPersonaService } from '../../functions/src/bookBackupPersonaRead.mjs';
import { createBookBackupResourceService } from '../../functions/src/bookBackupResourceRead.mjs';
import { DEFAULT_PERSONAS } from '../../functions/src/personaProfile.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url));
const { Firestore } = requireFunctions('firebase-admin/firestore');
const projectId = 'demo-writer-backup-personas';
let environment, admin, root, api, resources;
const profile = {
  ...structuredClone(DEFAULT_PERSONAS[0]),
  id: 'custom-used',
  archived: true,
  revision: 1,
  createdAt: 10,
  updatedAt: 11,
};
const source = () => root.getBookBackupSource('author', { bookId: 'book' });
const list = (pin, kind = 'book', extra = {}, uid = 'author') =>
  api.listBookBackupPersonaBindings(uid, {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    kind,
    limit: 50,
    ...extra,
  });
const read = (pin, kind, row, extra = {}, uid = 'author') =>
  api.readBookBackupPersona(uid, {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    kind,
    id: row.id,
    itemToken: row.itemToken,
    index: 0,
    ...extra,
  });
const decode = (chunk) => JSON.parse(Buffer.from(chunk.chunkBase64, 'base64').toString('utf8'));
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
  api = createBookBackupPersonaService({ db: admin });
  resources = createBookBackupResourceService({ db: admin });
});
beforeEach(async () => {
  await environment.clearFirestore();
  const batch = admin.batch();
  batch.set(admin.doc('books/book'), {
    authorId: 'author',
    title: 'Livro',
    personaId: 'custom-used',
    status: 'draft',
    localLoreVersion: 0,
    createdAt: 1,
    updatedAt: 2,
  });
  batch.set(admin.doc('users/author/aiPersonas/custom-used'), profile);
  batch.set(admin.doc('users/author/aiPersonas/custom-unused'), {
    ...profile,
    id: 'custom-unused',
    name: 'UNUSED',
  });
  batch.set(admin.doc('books/book/chapters/chapter'), {
    content: 'Private body',
    personaComplement: { personaId: 'custom-used', overrides: [] },
  });
  batch.set(admin.doc('books/book/chapters/none'), { content: 'Private body' });
  batch.set(admin.doc('books/book/sceneSources/chapter'), {
    original: {
      content: 'Original body',
      personaComplement: { personaId: 'preset-epic', overrides: [] },
    },
  });
  await batch.commit();
});
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});

test('all binding scopes, native masks and archived/preset profiles use only own referenced data', async () => {
  const pin = await source(),
    snapshots = [];
  for (const kind of ['book', 'chapter', 'scene-source']) {
    const page = await list(pin, kind);
    for (const row of page.items)
      if (row.personaId !== null) snapshots.push(decode(await read(pin, kind, row)));
  }
  assert.equal(snapshots.length, 3);
  assert.equal(snapshots[0].profile.archived, true);
  assert.equal(snapshots[2].profile.id, 'preset-epic');
  assert.equal(JSON.stringify(snapshots).includes('UNUSED'), false);
  assert.equal(JSON.stringify(snapshots).includes('Private body'), false);
  const [masked] = await admin.runTransaction((tx) =>
    tx.getAll(admin.doc('users/author/aiPersonas/custom-used'), { fieldMask: [] }),
  );
  assert.deepEqual(masked.data(), {});
  assert.ok(masked.createTime && masked.updateTime);
  assert.equal(
    (await list(pin, 'chapter')).items.find((item) => item.id === 'none').personaId,
    null,
  );
});
test('more than 50 chapter bindings keep absent entries and scope-bound pagination', async () => {
  const batch = admin.batch();
  for (let i = 0; i < 101; i++)
    batch.set(
      admin.doc('books/book/chapters/c' + String(i).padStart(3, '0')),
      i % 2 ? {} : { personaComplement: { personaId: 'custom-used', overrides: [] } },
    );
  await batch.commit();
  const pin = await source(),
    rows = [];
  let cursor = null,
    first;
  do {
    const page = await list(pin, 'chapter', { cursor });
    first ??= page;
    rows.push(...page.items);
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(rows.length, 103);
  assert.equal(new Set(rows.map((row) => row.id)).size, 103);
  await assert.rejects(list(pin, 'scene-source', { cursor: first.nextCursor }), {
    code: 'invalid-argument',
  });
});
test('real SDK profile update leaves root unchanged and invalidates old native token', async () => {
  const pin = await source(),
    row = (await list(pin)).items[0],
    db = environment.authenticatedContext('author').firestore();
  await assertSucceeds(
    setDoc(doc(db, 'users/author/aiPersonas/custom-used'), {
      ...profile,
      instructions: 'New instructions',
      revision: 2,
      updatedAt: 12,
    }),
  );
  assert.deepEqual(await source(), pin);
  await assert.rejects(read(pin, 'book', row), { code: 'failed-precondition' });
  const changed = (await list(pin)).items[0];
  assert.notEqual(changed.itemToken, row.itemToken);
  assert.equal(decode(await read(pin, 'book', changed)).profile.instructions, 'New instructions');
});
test('SDK deletion is denied, Admin equal-data recreation is detected, and other users cannot read profiles or book', async () => {
  const pin = await source(),
    row = (await list(pin)).items[0],
    own = environment.authenticatedContext('author').firestore(),
    other = environment.authenticatedContext('other').firestore();
  await assertFails(getDoc(doc(other, 'users/author/aiPersonas/custom-used')));
  await assertFails(getDoc(doc(other, 'books/book')));
  await assert.rejects(list(pin, 'book', {}, 'other'), { code: 'not-found' });
  await assertFails(deleteDoc(doc(own, 'users/author/aiPersonas/custom-used')));
  await admin.doc('users/author/aiPersonas/custom-used').delete();
  await assert.rejects(list(pin), { code: 'failed-precondition' });
  await admin.doc('users/author/aiPersonas/custom-used').set(profile);
  assert.deepEqual(await source(), pin);
  await assert.rejects(read(pin, 'book', row), { code: 'failed-precondition' });
  assert.notEqual((await list(pin)).items[0].itemToken, row.itemToken);
});
test('native owner changes, missing foreign profile and deleting origin cannot be adopted silently', async () => {
  const pin = await source(),
    old = (await list(pin, 'chapter')).items[0];
  await admin
    .doc('books/book/chapters/chapter')
    .update({ personaComplement: { personaId: 'preset-intimate', overrides: [] } });
  assert.deepEqual(await source(), pin);
  await assert.rejects(read(pin, 'chapter', old), { code: 'failed-precondition' });
  await admin.doc('users/author/aiPersonas/custom-used').delete();
  await admin.doc('users/other/aiPersonas/custom-used').set(profile);
  await assert.rejects(list(pin), { code: 'failed-precondition' });
  await admin.doc('books/book').update({ deleting: true });
  await assert.rejects(list(pin), { code: 'not-found' });
});
test('own lore source projects structure/relations without resolved global labels and SDK writer invalidates source', async () => {
  const db = environment.authenticatedContext('author').firestore();
  const lore = {
    bookId: 'book',
    name: 'Ana',
    aliases: ['Aninha'],
    category: 'character',
    summary: 'Own',
    details: '\ufeffação 🌙'.repeat(10000),
    isPublic: false,
    createdAt: 10,
    updatedAt: 11,
    structuredDetails: { appearance: 'Own', personality: '', history: '', notes: '' },
    relations: [
      {
        targetEntityId: 'universe:gone:missing',
        relationType: 'knows',
        description: 'Own relation',
        available: false,
        name: 'DO NOT COPY',
      },
    ],
  };
  const batch = writeBatch(db);
  batch.set(doc(db, 'books/book/lore/entity'), lore);
  batch.update(doc(db, 'books/book'), { localLoreVersion: 1 });
  await assertSucceeds(batch.commit());
  const pin = await source(),
    args = { bookId: 'book', sourceToken: pin.sourceToken, kind: 'lore', parentId: null },
    page = await resources.listBookBackupResources('author', { ...args, limit: 50 }),
    row = page.items[0],
    parts = [];
  let count = 1;
  for (let index = 0; index < count; index++) {
    const chunk = await resources.readBookBackupResource('author', { ...args, ...row, index });
    count = chunk.chunkCount;
    parts.push(Buffer.from(chunk.chunkBase64, 'base64'));
  }
  const payload = JSON.parse(Buffer.concat(parts).toString('utf8'));
  assert.equal(payload.data.details, lore.details);
  assert.deepEqual(payload.data.relations, [
    { targetEntityId: 'universe:gone:missing', relationType: 'knows', description: 'Own relation' },
  ]);
  assert.equal(JSON.stringify(payload).includes('DO NOT COPY'), false);
  const update = writeBatch(db);
  update.update(doc(db, 'books/book/lore/entity'), { summary: 'Changed', updatedAt: 12 });
  update.update(doc(db, 'books/book'), { localLoreVersion: 2 });
  await assertSucceeds(update.commit());
  await assert.rejects(resources.listBookBackupResources('author', { ...args, limit: 50 }), {
    code: 'failed-precondition',
  });
});
