import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  bookLoreWriteRecoveryFixture,
  recoveryControl,
} from '../../functions/test/helpers/bookLoreWriteRecoveryFixture.mjs';
import { createBookLoreWriteRecoveryService } from '../../functions/src/bookLoreWriteRecovery.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from '../../functions/test/helpers/bookLoreDeletionFixture.mjs';
import { recoveryKeyInventoryRef } from '../../functions/src/bookLoreWriteRecoveryInventory.mjs';
import {
  recoveryPaths,
  recoveryRequestHash,
} from '../../functions/src/bookLoreWriteRecoveryContracts.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';
import { webcrypto } from 'node:crypto';
import { bookLoreCreationRecoveryFixture } from '../../functions/test/helpers/bookLoreCreationRecoveryFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from '../../functions/test/helpers/bookLoreCreationAdoptionFixture.mjs';
import {
  finishCreationUploads,
  creationUploadFixture,
} from '../../functions/test/helpers/bookLoreCreationUploadFixture.mjs';
import { createBookLoreEditTransportService } from '../../functions/src/bookLoreEditTransport.mjs';

const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-recovery';
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
const key = (f, p) => f.service.getBookLoreEditRecoveryKey(f.uid, recoveryControl(p));
test('SDK concurrent reserve creates one original key and denies every private artifact to owner/other/anonymous', async () => {
  const f = await bookLoreWriteRecoveryFixture(admin),
    book = await admin.doc('books/book').get(),
    source = await admin.doc('books/book/lore/' + f.entityId).get(),
    [a, b] = await Promise.all([
      f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
      f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
    ]);
  assert.deepEqual(a, b);
  const secret = await key(f, a),
    root = await f.c.root.get(),
    proof = await f.c.proof.get(),
    storedKey = await f.c.key.get();
  assert.equal(root.createTime.isEqual(root.updateTime), true);
  for (const s of [proof, storedKey]) assert.equal(root.createTime.isEqual(s.createTime), true);
  assert.equal(Buffer.from(secret.keyBase64, 'base64').length, 32);
  assert.equal((await admin.doc('books/book').get()).updateTime.isEqual(book.updateTime), true);
  assert.equal(
    (await admin.doc('books/book/lore/' + f.entityId).get()).updateTime.isEqual(source.updateTime),
    true,
  );
  assert.equal((await admin.doc('users/author').get()).data().credits, 5);
  const owner = env.authenticatedContext(f.uid).firestore();
  await assertSucceeds(getDoc(doc(owner, 'books/book/lore/' + f.entityId)));
  for (const client of [
    owner,
    env.authenticatedContext('other').firestore(),
    env.unauthenticatedContext().firestore(),
  ])
    for (const path of [
      f.c.root.path,
      f.c.proof.path,
      f.c.key.path,
      f.c.closed.path,
      f.c.closedProof.path,
      recoveryKeyInventoryRef(f.c, f.bookId).path,
    ]) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { forged: true }));
      await assertFails(deleteDoc(doc(client, path)));
    }
  const closed = await f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(a)),
    terminal = await f.c.closed.get(),
    terminalProof = await f.c.closedProof.get();
  assert.equal(closed.phase, 'revoked');
  assert.equal((await f.c.key.get()).exists, false);
  assert.equal(terminal.createTime.isEqual(terminalProof.createTime), true);
  await assert.rejects(key(f, a), { code: 'failed-precondition' });
  assert.deepEqual(await f.service.reserveBookLoreEditRecovery(f.uid, f.intent), closed);
});
test('SDK origin/key recreation never reopens old cipher while metadata and revoke remain safe after deletion', async () => {
  const f = await bookLoreWriteRecoveryFixture(admin),
    p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
    original = await key(f, p),
    source = await admin.doc('books/book/lore/' + f.entityId).get();
  await source.ref.update({ summary: 'Changed current summary' });
  await admin.doc('books/book').update({ localLoreVersion: 19 });
  assert.deepEqual(await key(f, p), original);
  await source.ref.delete();
  await source.ref.create(source.data());
  await assert.rejects(key(f, p), { code: 'failed-precondition' });
  assert.deepEqual(await f.service.getBookLoreEditRecovery(f.uid, recoveryControl(p)), p);
  const value = (await f.c.key.get()).data();
  await f.c.key.delete();
  await f.c.key.create(value);
  await assert.rejects(f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p)), {
    code: 'failed-precondition',
  });
  assert.deepEqual((await f.c.key.get()).data(), value);
  await f.c.key.delete();
  await admin.doc('books/book').delete();
  assert.equal(
    (await f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p))).phase,
    'revoked',
  );
  assert.equal((await f.c.key.get()).exists, false);
});
test('SDK final native write failure rolls back reservation and revoke, and retry preserves the exact key', async () => {
  const f = await bookLoreWriteRecoveryFixture(admin);
  let fail = 'create';
  const runTransaction = (callback) =>
    admin.runTransaction((tx) =>
      callback(
        new Proxy(tx, {
          get(target, name) {
            const method = target[name];
            if (typeof method !== 'function') return method;
            return (...args) => {
              if (args[0]?.path === f.c.key.path && name === fail) {
                const ref = fail === 'create' ? f.c.key : admin.doc(f.c.path + '/rollback/missing');
                target.update(ref, { injectedFailure: true });
                return target;
              }
              return method.apply(target, args);
            };
          },
        }),
      ),
    );
  const db = new Proxy(admin, {
    get(target, name) {
      if (name === 'runTransaction') return runTransaction;
      const value = Reflect.get(target, name);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
  const service = createBookLoreWriteRecoveryService({ db, now: () => 8000 });
  await assert.rejects(service.reserveBookLoreEditRecovery(f.uid, f.intent));
  for (const ref of [f.c.root, f.c.proof, f.c.key]) assert.equal((await ref.get()).exists, false);
  fail = null;
  const p = await service.reserveBookLoreEditRecovery(f.uid, f.intent),
    original = await key(f, p);
  fail = 'delete';
  await assert.rejects(service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p)));
  assert.equal((await f.c.closed.get()).exists, false);
  assert.equal((await f.c.closedProof.get()).exists, false);
  assert.deepEqual(await key(f, p), original);
  fail = null;
  assert.equal(
    (await service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p))).phase,
    'revoked',
  );
  assert.equal((await f.c.key.get()).exists, false);
});

test('SDK creation recovery protects a draft before a head exists and survives native cancel without granting uploads', async () => {
  const f = await bookLoreCreationRecoveryFixture(admin);
  const book = await admin.doc('books/book').get();
  const [a, b] = await Promise.all([
    f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
    f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
  ]);
  assert.deepEqual(a, b);
  const original = await key(f, a),
    root = await f.c.root.get();
  for (const snapshot of [await f.c.proof.get(), await f.c.key.get()])
    assert.equal(snapshot.createTime.isEqual(root.createTime), true);
  assert.equal((await admin.doc('books/book/lore/' + f.intent.loreId).get()).exists, false);
  assert.equal((await admin.doc('books/book').get()).updateTime.isEqual(book.updateTime), true);
  const imported = await webcrypto.subtle.importKey(
    'raw',
    Buffer.from(original.keyBase64, 'base64'),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  );
  const iv = webcrypto.getRandomValues(new Uint8Array(12)),
    text = '\ufeff  Draft 🌙\r\n  ';
  const cipher = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    imported,
    Buffer.from(text),
  );
  for (const client of [
    env.authenticatedContext(f.uid).firestore(),
    env.authenticatedContext('other').firestore(),
    env.unauthenticatedContext().firestore(),
  ])
    for (const path of [f.c.key.path, f.parent.c.path, f.parent.c.reservationPath]) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { forged: true }));
      await assertFails(deleteDoc(doc(client, path)));
    }
  const transport = createBookLoreEditTransportService({ db: admin });
  const cancelled = await transport.bookLoreEdit(f.uid, {
    method: 'cancelBookLoreCreationReservation',
    input: {
      ...f.parent.intent,
      jobToken: f.progress.jobToken,
      operationId: 'cancel-sdk-creation',
    },
  });
  await finishCreationUploads(f.parent, cancelled);
  const cold = createBookLoreWriteRecoveryService({ db: admin });
  const secret = await cold.getBookLoreEditRecoveryKey(f.uid, recoveryControl(a));
  assert.deepEqual(secret, original);
  const restored = await webcrypto.subtle.importKey(
    'raw',
    Buffer.from(secret.keyBase64, 'base64'),
    'AES-GCM',
    false,
    ['decrypt'],
  );
  assert.equal(
    Buffer.from(await webcrypto.subtle.decrypt({ name: 'AES-GCM', iv }, restored, cipher)).toString(
      'utf8',
    ),
    text,
  );
  assert.equal((await f.parent.get()).phase, 'cancelled');
  const field = await creationUploadFixture(admin, {
    parent: f.parent,
    uploadId: 'lore-field-' + 'f'.repeat(64),
  });
  await assert.rejects(
    transport.bookLoreEdit(f.uid, { method: 'startBookLoreFieldUpload', input: field.intent }),
    { code: 'failed-precondition' },
  );
  assert.equal((await field.c.ref.get()).exists, false);
  await assert.rejects(
    cold.reserveBookLoreEditRecovery(f.uid, { ...f.intent, writeId: 'new-key-after-cancel' }),
  );
  assert.equal((await admin.doc('books/book/lore/' + f.intent.loreId).get()).exists, false);
});

test('SDK creation key follows the original native head after adoption and refuses identical recreation', async () => {
  const f = await bookLoreCreationRecoveryFixture(admin);
  const p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
    original = await key(f, p);
  const prepared = await creationAdoptionFixture(admin, { parent: f.parent });
  await adoptCreation(prepared);
  const cold = createBookLoreWriteRecoveryService({ db: admin });
  assert.deepEqual(await cold.getBookLoreEditRecoveryKey(f.uid, recoveryControl(p)), original);
  assert.equal(original.sourceToken, f.progress.jobToken);
  const head = await admin.doc('books/book/lore/' + f.intent.loreId).get();
  const adoption = await admin.doc(f.parent.c.path + '/adoptions/current').get();
  assert.equal(head.createTime.isEqual(adoption.createTime), true);
  await head.ref.delete();
  await head.ref.create(head.data());
  const replacement = await head.ref.get();
  assert.equal(replacement.createTime.isEqual(head.createTime), false);
  await assert.rejects(cold.getBookLoreEditRecoveryKey(f.uid, recoveryControl(p)));
  assert.deepEqual(await cold.getBookLoreEditRecovery(f.uid, recoveryControl(p)), p);
  assert.equal((await cold.revokeBookLoreEditRecovery(f.uid, recoveryControl(p))).phase, 'revoked');
  assert.equal((await f.c.key.get()).exists, false);
  assert.equal((await head.ref.get()).updateTime.isEqual(replacement.updateTime), true);
  assert.equal((await f.parent.get()).phase, 'adopted');
});

test('SDK book deletion revokes indexed and legacy keys with native proofs and preserves another book', async () => {
  const f = await bookLoreWriteRecoveryFixture(admin, { mode: 'inline' }),
    p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
    original = (await f.c.root.get()).data(),
    keyData = (await f.c.key.get()).data(),
    legacyIntent = { ...f.intent, writeId: 'legacy-recovery' },
    legacy = recoveryPaths(admin, f.uid, legacyIntent.writeId),
    value = {
      ...original,
      writeId: legacyIntent.writeId,
      intent: legacyIntent,
      requestHash: recoveryRequestHash(f.uid, legacyIntent),
    };
  delete value.keyInventory;
  await admin.runTransaction(async (tx) => {
    tx.create(legacy.root, value);
    tx.create(legacy.proof, { schemaVersion: 1, hash: digest(value) });
    tx.create(legacy.key, keyData);
    tx.create(admin.doc('books/other/bookLoreRecoveryKeys/preserved'), { preserved: true });
  });
  const deletion = bookLoreDeletionFixture(admin);
  await markBookDeleting(deletion);
  await assert.rejects(
    f.service.reserveBookLoreEditRecovery(f.uid, { ...f.intent, writeId: 'after-mark' }),
  );
  await deletion.step();
  await deletion.step();
  assert.equal((await admin.doc('books/book').get()).exists, true);
  assert.equal((await legacy.key.get()).exists, false);
  assert.equal((await legacy.closed.get()).exists, true);
  await deletion.step();
  const terminal = await f.c.closed.get(),
    checkpoint = await admin.doc(deletion.path + '/state/current').get();
  assert.equal(terminal.createTime.isEqual(checkpoint.updateTime), true);
  assert.equal((await f.c.key.get()).exists, false);
  assert.equal((await recoveryKeyInventoryRef(f.c, f.bookId).get()).exists, false);
  await finishBookLoreDeletion(deletion);
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.equal((await admin.doc('books/other/bookLoreRecoveryKeys/preserved').get()).exists, true);
  const closed = await f.service.getBookLoreEditRecovery(f.uid, recoveryControl(p));
  assert.equal(closed.phase, 'revoked');
  assert.equal(closed.jobToken, p.jobToken);
  assert.equal((await legacy.root.get()).exists, true);
});
test('SDK final checkpoint failure rolls back key deletion, terminal and inventory together', async () => {
  const f = await bookLoreWriteRecoveryFixture(admin, { mode: 'inline' }),
    p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
    deletion = bookLoreDeletionFixture(admin),
    index = recoveryKeyInventoryRef(f.c, f.bookId);
  await markBookDeleting(deletion);
  await deletion.step();
  const before = await admin.doc(deletion.path + '/state/current').get();
  const db = {
    doc: admin.doc.bind(admin),
    collection: admin.collection.bind(admin),
    runTransaction: (callback) =>
      admin.runTransaction((tx) =>
        callback(
          new Proxy(tx, {
            get(target, name) {
              const method = target[name];
              if (typeof method !== 'function') return method;
              return (...args) => {
                if (
                  name === 'set' &&
                  args[0]?.path === 'users/author/sceneOperations/' + deletion.operationId
                ) {
                  target.update(admin.doc(deletion.path + '/rollback/missing'), { fail: true });
                  return target;
                }
                return method.apply(target, args);
              };
            },
          }),
        ),
      ),
  };
  await assert.rejects(bookLoreDeletionFixture(db).step());
  assert.equal((await f.c.key.get()).exists, true);
  assert.equal((await index.get()).exists, true);
  assert.equal((await f.c.closed.get()).exists, false);
  assert.equal(
    (await admin.doc(deletion.path + '/state/current').get()).updateTime.isEqual(before.updateTime),
    true,
  );
  await finishBookLoreDeletion(deletion);
  assert.equal(
    (await f.service.getBookLoreEditRecovery(f.uid, recoveryControl(p))).phase,
    'revoked',
  );
});
