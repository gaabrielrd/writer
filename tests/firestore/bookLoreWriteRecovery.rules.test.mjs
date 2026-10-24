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
