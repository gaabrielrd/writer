import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { creationCompositionFixture } from '../../functions/test/helpers/bookLoreCreationCompositionFixture.mjs';
import {
  finishCreationUploads,
  advanceParent,
  creationCleanupControl,
} from '../../functions/test/helpers/bookLoreCreationUploadFixture.mjs';
import {
  reserveAllEditUploads,
  editControl,
  getEditReservation,
} from '../../functions/test/helpers/bookLoreEditReservationFixture.mjs';
import {
  finishCompilation,
  openCompilation,
} from '../../functions/test/helpers/bookLoreEditCompilationFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from '../../functions/test/helpers/bookLoreDeletionFixture.mjs';
import { readBookResourcePayload } from '../../functions/src/bookResourcePayloadRead.mjs';
import { resourcePayloadBodyPath } from '../../functions/src/bookResourcePayloadPaths.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-creation-composition';
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
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
const ready = async (f) => finishCompilation(f, await reserveAllEditUploads(f));
const data = async (path) => (await admin.doc(path).get()).data();
const remainingBytes = async () => {
  const bodies = await admin.collection('books/book/bookResourceBodies').limit(1).get(),
    chunks = await admin.collection('books/book/bookResourceChunks').limit(1).get(),
    segments = await admin.collection('books/book/bookLoreSegments').limit(1).get();
  return bodies.size + chunks.size + segments.size;
};
const readPointer = (f, pointer) =>
  admin.runTransaction((tx) =>
    readBookResourcePayload(tx, admin, {
      uid: f.uid,
      bookId: f.bookId,
      resource: { kind: 'lore', parentId: null, id: f.loreId },
      ...pointer,
    }),
  );

test('SDK creation attempt native proof and certified composition preserve literal fields and all relation pages without an active head', async () => {
  const changes = [
      { target: { field: 'name' }, value: '\ufeffName 🌙' },
      { target: { field: 'category' }, value: 'other' },
      { target: { field: 'details' }, value: '\ufeffliteral\r\n🌙'.repeat(8000) },
      {
        target: { field: 'relations', page: 0, count: 64 },
        value: Array.from({ length: 64 }, (_, i) => ({
          targetEntityId: 'entity-' + i,
          relationType: 'r',
        })),
      },
      {
        target: { field: 'relations', page: 1, count: 1 },
        value: [{ targetEntityId: 'entity-64', relationType: 'r' }],
      },
    ],
    f = await creationCompositionFixture(admin, {
      changes,
      relations: { present: true, count: 65 },
    }),
    root = await data('books/book'),
    p = await ready(f),
    opened = await openCompilation(f),
    job = await admin.doc(f.c.path).get(),
    binding = await admin.doc(f.parent.c.path + '/attempts/' + f.editId).get(),
    proof = await admin.doc(f.parent.c.path + '/attemptProofs/' + f.editId).get();
  assert.equal(binding.createTime.isEqual(job.createTime), true);
  assert.equal(proof.createTime.isEqual(job.createTime), true);
  assert.equal(p.compilation.phase, 'ready');
  assert.equal(opened.storage.base, null);
  assert.equal(opened.storage.relations.pages, 2);
  for (const f1 of changes.filter((x) => x.target.field !== 'relations'))
    assert.deepEqual(await readPointer(f, opened.storage.fields[f1.target.field]), f1.value);
  assert.deepEqual(await data('books/book'), root);
  assert.equal((await admin.doc('books/book/lore/' + f.loreId).get()).exists, false);
  assert.equal((await admin.collection('users/author/bookLoreSourceInspections').get()).size, 0);
  const client = env.authenticatedContext(f.uid).firestore();
  await assertFails(getDoc(doc(client, binding.ref.path)));
  await assertFails(setDoc(doc(client, binding.ref.path), binding.data()));
  await assertFails(
    setDoc(doc(client, 'books/book/lore/' + f.loreId), { name: 'Bypass', category: 'other' }),
  );
  await assert.rejects(() =>
    f.factory().adoptBookLoreEditGeneration(f.uid, {
      ...editControl(f, p, 'sdk-stale-activation'),
      expectedRevision: p.revision + 1,
    }),
  );
  const cancelled = await f.parent.cancel();
  assert.equal(cancelled.cleanupPhase, 'attempts');
  await assert.rejects(() => openCompilation(f));
  assert.equal((await finishCreationUploads(f.parent, cancelled)).phase, 'cancelled');
  assert.equal(await remainingBytes(), 0);
  assert.equal((await getEditReservation(f)).phase, 'cancelled');
  assert.equal((await admin.doc(f.c.path + '/compilationCertificate/current').get()).exists, true);
  assert.deepEqual(await data('books/book'), root);
});
test('SDK reserved creation cleanup limits parts per transaction and removes the header last after book revocation', async () => {
  const f = await creationCompositionFixture(admin, {
    changes: [
      { target: { field: 'name' }, value: 'Name' },
      { target: { field: 'category' }, value: 'other' },
      { target: { field: 'details' }, value: '🌙'.repeat(300000) },
    ],
  });
  await ready(f);
  const upload = f.uploads[2],
    bodyId = upload.prepared.manifest.bodyId,
    header = resourcePayloadBodyPath('book', bodyId),
    chunks = admin.collection('books/book/bookResourceChunks').where('bodyId', '==', bodyId);
  assert.ok(upload.prepared.manifest.chunkCount > 16);
  let p = await f.parent.cancel(),
    previous = (await chunks.select().get()).size,
    sawBatch = false;
  await admin.doc('books/book').update({ authorId: 'revoked-owner' });
  while (p.phase !== 'cancelled') {
    p = (await advanceParent(f.parent, p)).progress;
    const count = (await chunks.select().get()).size;
    assert.ok(previous - count <= 16);
    if (previous - count === 16) sawBatch = true;
    if (count > 0) assert.equal((await admin.doc(header).get()).exists, true);
    previous = count;
  }
  assert.equal(sawBatch, true);
  assert.equal((await admin.doc(header).get()).exists, false);
  assert.equal(await remainingBytes(), 0);
  assert.equal((await data('books/book')).authorId, 'revoked-owner');
});
test('SDK attempt start and child cancellation rollback together; exact concurrent retry commits once and book deletion takes over', async () => {
  const f = await creationCompositionFixture(admin),
    run = admin.runTransaction.bind(admin);
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'create')
              return (ref, v) => {
                target.create(ref, v);
                if (ref.path === f.c.path) throw Error('injected attempt failure');
              };
            const method = target[key];
            return typeof method === 'function' ? method.bind(target) : method;
          },
        }),
      ),
    );
  await assert.rejects(() => f.factory().startBookLoreEditReservation(f.uid, f.intent), /injected/);
  assert.equal((await admin.doc(f.parent.c.path + '/attempts/' + f.editId).get()).exists, false);
  admin.runTransaction = run;
  await ready(f);
  const p = await f.parent.cancel(),
    before = await data(f.c.path);
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'update')
              return (ref, v) => {
                target.update(ref, v);
                if (ref.path === f.parent.c.path + '/cleanup/current')
                  throw Error('injected parent failure');
              };
            const method = target[key];
            return typeof method === 'function' ? method.bind(target) : method;
          },
        }),
      ),
    );
  await assert.rejects(() => advanceParent(f.parent, p), /injected/);
  assert.deepEqual(await data(f.c.path), before);
  admin.runTransaction = run;
  const r = creationCleanupControl(f.parent, p),
    [a, b] = await Promise.all([
      f.parent.factory().advanceBookLoreCreationCleanup(f.uid, r),
      f.parent.factory().advanceBookLoreCreationCleanup(f.uid, r),
    ]);
  assert.deepEqual(a.receipt, b.receipt);
  assert.equal((await f.parent.get()).cleanupRevision, 1);
  const deletion = bookLoreDeletionFixture(admin);
  await markBookDeleting(deletion);
  assert.equal((await finishBookLoreDeletion(deletion)).complete, true);
  assert.equal(await remainingBytes(), 0);
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.equal((await f.parent.start()).phase, 'cancelled');
  assert.equal((await getEditReservation(f)).phase, 'cancelled');
});
test('SDK recreated native binding and generation are preserved and cannot certify a cleanup', async () => {
  for (const artifact of ['binding', 'generation']) {
    const f = await creationCompositionFixture(admin, {
      creationId: 'sdk-recreate-' + artifact,
      editId: 'sdk-attempt-' + artifact,
    });
    const p = await ready(f),
      j = await data(f.c.path),
      cancelled = await f.parent.cancel(),
      path =
        artifact === 'binding'
          ? f.parent.c.path + '/attempts/' + f.editId
          : 'books/book/bookLoreGenerations/' + j.generationId,
      old = await admin.doc(path).get();
    await admin.doc(path).delete();
    await admin.doc(path).create(old.data());
    await assert.rejects(() =>
      f.factory().getBookLoreEditReservation(f.uid, {
        editId: f.editId,
        startHash: f.startHash,
        jobToken: p.jobToken,
      }),
    );
    await assert.rejects(() => finishCreationUploads(f.parent, cancelled));
    assert.deepEqual(await data(path), old.data());
    assert.equal((await f.parent.get()).phase, 'cancelling');
  }
});
