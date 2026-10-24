import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  bookLoreWriteRecoveryFixture,
  recoveryControl,
} from './helpers/bookLoreWriteRecoveryFixture.mjs';
import {
  createBookLoreWriteRecoveryService,
  setBookLoreWriteRecoveryHeaders,
} from '../src/bookLoreWriteRecovery.mjs';
import { recoveryRequestHash } from '../src/bookLoreWriteRecoveryContracts.mjs';
import { digest } from '../src/workProgressContracts.mjs';
async function fixture(options) {
  const f = adventureImportDb({ nativeUpdates: true });
  return { ...f, ...(await bookLoreWriteRecoveryFixture(f.db, options)) };
}
const key = (f, p) => f.service.getBookLoreEditRecoveryKey(f.uid, recoveryControl(p));
const state = (f) => structuredClone([...f.records]);
async function modify(f, path, update) {
  return f.db.runTransaction((tx) => tx.update(f.db.doc(path), update));
}
async function remove(f, path) {
  return f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
}
async function create(f, path, value) {
  return f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
}
for (const mode of ['inline', 'v1', 'v2', 'created'])
  test(
    'native ' +
      mode +
      ' source reserves metadata once and yields one original key without changing authoring state',
    async () => {
      const f = await fixture({ mode }),
        book = structuredClone(f.records.get('books/book')),
        source = structuredClone(f.records.get('books/book/lore/' + f.entityId)),
        p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
        a = await key(f, p),
        before = state(f),
        retry = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent);
      assert.deepEqual(retry, p);
      assert.deepEqual(await key(f, p), a);
      assert.deepEqual(state(f), before);
      assert.equal(p.phase, 'reserved');
      assert.equal('keyBase64' in p, false);
      assert.equal('bookBirth' in p, false);
      assert.equal(a.algorithm, 'AES-GCM');
      assert.equal(Buffer.from(a.keyBase64, 'base64').length, 32);
      assert.deepEqual(f.records.get('books/book'), book);
      assert.deepEqual(f.records.get('books/book/lore/' + f.entityId), source);
      assert.equal(f.records.get('users/author').credits, 5);
    },
  );
test('one writeId is permanently bound to its exact intention and account', async () => {
  const f = await fixture(),
    p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
    before = state(f);
  await assert.rejects(
    f.service.reserveBookLoreEditRecovery(f.uid, { ...f.intent, intentHash: 'd'.repeat(64) }),
    { code: 'failed-precondition' },
  );
  assert.equal(await f.service.getBookLoreEditRecovery('other', recoveryControl(p)), null);
  await assert.rejects(f.service.getBookLoreEditRecoveryKey('other', recoveryControl(p)), {
    code: 'failed-precondition',
  });
  await assert.rejects(
    f.service.getBookLoreEditRecoveryKey(f.uid, {
      ...recoveryControl(p),
      jobToken: 'd'.repeat(64),
    }),
    { code: 'failed-precondition' },
  );
  assert.deepEqual(state(f), before);
});
test('a later revision of the same authorized source permits recovery but never rebases the original source CAS', async () => {
  const f = await fixture(),
    p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
    a = await key(f, p);
  await modify(f, 'books/book', { localLoreVersion: 17 });
  await modify(f, 'books/book/lore/' + f.entityId, { summary: 'New current value' });
  assert.deepEqual(await key(f, p), a);
  assert.equal((await key(f, p)).sourceToken, f.intent.sourceToken);
  await assert.rejects(
    f.service.reserveBookLoreEditRecovery(f.uid, { ...f.intent, writeId: 'another-attempt' }),
    { code: 'failed-precondition' },
  );
});
for (const [name, mutation, code] of [
  ['new owner', (f) => modify(f, 'books/book', { authorId: 'other' }), 'not-found'],
  ['book deleting', (f) => modify(f, 'books/book', { deleting: true }), 'failed-precondition'],
  [
    'invalid book deleting',
    (f) => modify(f, 'books/book', { deleting: null }),
    'failed-precondition',
  ],
  [
    'source deleting',
    (f) => modify(f, 'books/book/lore/' + f.entityId, { deleting: true }),
    'failed-precondition',
  ],
  [
    'source deleted',
    (f) => modify(f, 'books/book/lore/' + f.entityId, { deleted: true }),
    'failed-precondition',
  ],
  [
    'lore tombstone',
    (f) => create(f, 'books/book/bookLoreTombstones/' + f.entityId, { removed: true }),
    'failed-precondition',
  ],
  [
    'deleted book marker',
    (f) => create(f, 'deletedBooks/book', { deleted: true }),
    'failed-precondition',
  ],
  ['missing book', (f) => remove(f, 'books/book'), 'not-found'],
  ['missing source', (f) => remove(f, 'books/book/lore/' + f.entityId), 'failed-precondition'],
  [
    'recreated book',
    async (f) => {
      const old = structuredClone(f.records.get('books/book'));
      await remove(f, 'books/book');
      await create(f, 'books/book', old);
    },
    'failed-precondition',
  ],
  [
    'recreated source',
    async (f) => {
      const path = 'books/book/lore/' + f.entityId,
        old = structuredClone(f.records.get(path));
      await remove(f, path);
      await create(f, path, old);
    },
    'failed-precondition',
  ],
])
  test(
    name + ' denies the key but retains own metadata and permits explicit revocation',
    async () => {
      const f = await fixture(),
        p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent);
      await mutation(f);
      await assert.rejects(key(f, p), { code });
      assert.deepEqual(await f.service.getBookLoreEditRecovery(f.uid, recoveryControl(p)), p);
      assert.deepEqual(await f.service.reserveBookLoreEditRecovery(f.uid, f.intent), p);
      const closed = await f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p));
      assert.equal(closed.phase, 'revoked');
      assert.equal(f.records.has(f.c.key.path), false);
      assert.equal(closed.jobToken, p.jobToken);
    },
  );
test('missing or recreated key is never regenerated or deleted as an original key', async () => {
  const f = await fixture(),
    p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
    original = structuredClone(f.records.get(f.c.key.path));
  await remove(f, f.c.key.path);
  await assert.rejects(key(f, p), { code: 'failed-precondition' });
  assert.deepEqual(await f.service.reserveBookLoreEditRecovery(f.uid, f.intent), p);
  assert.equal(f.records.has(f.c.key.path), false);
  await create(f, f.c.key.path, original);
  const before = state(f);
  await assert.rejects(key(f, p), { code: 'failed-precondition' });
  await assert.rejects(f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p)), {
    code: 'failed-precondition',
  });
  assert.deepEqual(state(f), before);
});
test('revocation can permanently close a missing key without resurrecting it', async () => {
  const f = await fixture(),
    p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent);
  await remove(f, f.c.key.path);
  assert.equal(
    (await f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p))).phase,
    'revoked',
  );
  await assert.rejects(key(f, p), { code: 'failed-precondition' });
  assert.equal(f.records.has(f.c.key.path), false);
});
test('revoke-before-reserve creates a permanent native fence even if the source is absent', async () => {
  const f = await fixture(),
    r = { writeId: f.intent.writeId, requestHash: f.requestHash };
  await remove(f, 'books/book');
  const p = await f.service.revokeBookLoreEditRecovery(f.uid, r);
  assert.equal(p.phase, 'revoked');
  assert.equal(p.keyId, null);
  assert.equal(p.bookId, null);
  assert.deepEqual(await f.service.reserveBookLoreEditRecovery(f.uid, f.intent), p);
  assert.deepEqual(await f.service.revokeBookLoreEditRecovery(f.uid, r), p);
  assert.equal(f.records.has(f.c.key.path), false);
  await assert.rejects(key(f, p), { code: 'failed-precondition' });
});
test('revoked recovery never returns a key or deletes a later foreign key, even on reservation replay', async () => {
  const f = await fixture(),
    p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
    original = structuredClone(f.records.get(f.c.key.path)),
    closed = await f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p));
  await create(f, f.c.key.path, original);
  assert.deepEqual(await f.service.reserveBookLoreEditRecovery(f.uid, f.intent), closed);
  assert.deepEqual(await f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p)), closed);
  assert.ok(f.records.has(f.c.key.path));
  await assert.rejects(key(f, p), { code: 'failed-precondition' });
});
for (const which of ['proof', 'root', 'closedProof'])
  test('recreated ' + which + ' cannot authenticate an old recovery event', async () => {
    const f = await fixture(),
      p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent);
    if (which === 'closedProof')
      await f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p));
    const path = f.c[which].path,
      old = structuredClone(f.records.get(path));
    await remove(f, path);
    await create(f, path, old);
    await assert.rejects(f.service.getBookLoreEditRecovery(f.uid, recoveryControl(p)), {
      code: 'failed-precondition',
    });
    await assert.rejects(key(f, p), { code: 'failed-precondition' });
  });
test('orphan key or proof before reservation is preserved and refuses a new key', async () => {
  for (const kind of ['key', 'proof']) {
    const f = await fixture();
    await create(f, f.c[kind].path, { foreign: true });
    const before = state(f);
    await assert.rejects(f.service.reserveBookLoreEditRecovery(f.uid, f.intent), {
      code: 'failed-precondition',
    });
    await assert.rejects(
      f.service.revokeBookLoreEditRecovery(f.uid, {
        writeId: f.intent.writeId,
        requestHash: f.requestHash,
      }),
      { code: 'failed-precondition' },
    );
    assert.deepEqual(state(f), before);
  }
});
test('arguments/auth are closed before I/O and errors never echo key or draft values', async () => {
  const db = new Proxy(
      {},
      {
        get() {
          throw Error('unexpected I/O');
        },
      },
    ),
    s = createBookLoreWriteRecoveryService({ db });
  for (const uid of [null, '', 42, 'x/y'])
    await assert.rejects(s.reserveBookLoreEditRecovery(uid, { draft: 'PRIVATE' }), {
      code: 'unauthenticated',
    });
  for (const method of [
    'getBookLoreEditRecovery',
    'getBookLoreEditRecoveryKey',
    'revokeBookLoreEditRecovery',
  ])
    await assert.rejects(
      s[method]('author', {
        writeId: 'draft',
        requestHash: 'a'.repeat(64),
        jobToken: 'b'.repeat(64),
        keyBase64: 'PRIVATE',
      }),
      { code: 'invalid-argument' },
    );
  await assert.rejects(
    s.reserveBookLoreEditRecovery('author', {
      writeId: 'draft',
      bookId: 'book',
      loreId: 'lore',
      sourceToken: 'a'.repeat(64),
      intentHash: 'b'.repeat(64),
      uid: 'victim',
    }),
    { code: 'invalid-argument' },
  );
});
test('reservation and revocation are atomic on failure at the final key write/delete', async () => {
  const f = await fixture(),
    run = f.db.runTransaction.bind(f.db);
  let fail = 'create';
  const db = Object.create(f.db);
  db.runTransaction = (callback) =>
    run((tx) =>
      callback(
        new Proxy(tx, {
          get(target, name) {
            const method = target[name];
            if (typeof method !== 'function') return method;
            return (...args) => {
              if (name === fail && args[0].path === f.c.key.path)
                throw Error('injected final key failure');
              return method.apply(target, args);
            };
          },
        }),
      ),
    );
  const s = createBookLoreWriteRecoveryService({ db, now: () => 8000 }),
    before = state(f);
  await assert.rejects(s.reserveBookLoreEditRecovery(f.uid, f.intent), /injected/);
  assert.deepEqual(state(f), before);
  fail = null;
  const p = await s.reserveBookLoreEditRecovery(f.uid, f.intent),
    keyBefore = await key(f, p),
    reserved = state(f);
  fail = 'delete';
  await assert.rejects(s.revokeBookLoreEditRecovery(f.uid, recoveryControl(p)), /injected/);
  assert.deepEqual(state(f), reserved);
  assert.deepEqual(await key(f, p), keyBefore);
  fail = null;
  assert.equal((await s.revokeBookLoreEditRecovery(f.uid, recoveryControl(p))).phase, 'revoked');
});
test('private headers cover only metadata methods and request hash pins every intent field', async () => {
  const f = await fixture(),
    headers = [],
    request = { rawRequest: { res: { setHeader: (...v) => headers.push(v) } } };
  for (const method of [
    'reserveBookLoreEditRecovery',
    'getBookLoreEditRecovery',
    'revokeBookLoreEditRecovery',
  ])
    setBookLoreWriteRecoveryHeaders(method, request);
  assert.equal(headers.length, 6);
  setBookLoreWriteRecoveryHeaders('bookLoreEdit', request);
  assert.equal(headers.length, 6);
  for (const field of ['writeId', 'bookId', 'loreId', 'sourceToken', 'intentHash'])
    assert.notEqual(
      recoveryRequestHash(f.uid, {
        ...f.intent,
        [field]: field.endsWith('Hash') || field === 'sourceToken' ? 'd'.repeat(64) : 'other',
      }),
      f.requestHash,
    );
  assert.equal(digest(f.intent).length, 64);
});

test('initial foreign owner or stale CAS cannot reserve any key or modify the source', async () => {
  const f = await fixture(),
    before = state(f);
  await assert.rejects(f.service.reserveBookLoreEditRecovery('other', f.intent), {
    code: 'not-found',
  });
  await assert.rejects(
    f.service.reserveBookLoreEditRecovery(f.uid, { ...f.intent, sourceToken: 'a'.repeat(64) }),
    { code: 'failed-precondition' },
  );
  assert.deepEqual(state(f), before);
});
test('key bytes with original simulated birth still require the pinned SHA fingerprint', async () => {
  const f = await fixture(),
    p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent);
  f.records.get(f.c.key.path).keyBase64 = Buffer.alloc(32, 7).toString('base64');
  const before = state(f);
  await assert.rejects(key(f, p), { code: 'failed-precondition' });
  await assert.rejects(f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p)), {
    code: 'failed-precondition',
  });
  assert.deepEqual(state(f), before);
});
