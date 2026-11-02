import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { bookLoreCreationRecoveryFixture } from './helpers/bookLoreCreationRecoveryFixture.mjs';
import { recoveryControl } from './helpers/bookLoreWriteRecoveryFixture.mjs';
import {
  creationAdoptionFixture,
  adoptCreation,
} from './helpers/bookLoreCreationAdoptionFixture.mjs';
import {
  finishCreationUploads,
  creationUploadFixture,
} from './helpers/bookLoreCreationUploadFixture.mjs';
import { createBookLoreWriteRecoveryService } from '../src/bookLoreWriteRecovery.mjs';
import { recoveryIntent, recoveryRequestHash } from '../src/bookLoreWriteRecoveryContracts.mjs';
import { digest } from '../src/workProgressContracts.mjs';
import { createBookLoreEditTransportService } from '../src/bookLoreEditTransport.mjs';

async function fixture() {
  const f = adventureImportDb({ nativeUpdates: true });
  return { ...f, ...(await bookLoreCreationRecoveryFixture(f.db)) };
}
const state = (f) => structuredClone([...f.records]);
const key = (f, p) => f.service.getBookLoreEditRecoveryKey(f.uid, recoveryControl(p));
const mutate = (f, path, value, method = 'update') =>
  f.db.runTransaction((tx) => tx[method](f.db.doc(path), value));
const remove = (f, path) => f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
async function recreate(f, path) {
  const value = structuredClone(f.records.get(path));
  await remove(f, path);
  await mutate(f, path, value, 'create');
}
async function adopt(f) {
  const creation = await creationAdoptionFixture(f.db, { parent: f.parent });
  await adoptCreation(creation);
  return creation;
}

test('creation key is original, account-bound and usable before a head exists, without authoring mutation', async () => {
  const f = await fixture(),
    beforeBook = structuredClone(f.records.get('books/book'));
  const [a, b] = await Promise.all([
    f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
    f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
  ]);
  assert.deepEqual(a, b);
  assert.equal(f.records.has('books/book/lore/' + f.intent.loreId), false);
  assert.deepEqual(f.records.get('books/book'), beforeBook);
  const secret = await key(f, a),
    before = state(f);
  assert.equal(Buffer.from(secret.keyBase64, 'base64').length, 32);
  assert.deepEqual(await key(f, a), secret);
  assert.deepEqual(state(f), before);
  assert.equal(await f.service.getBookLoreEditRecovery('other', recoveryControl(a)), null);
  await assert.rejects(f.service.getBookLoreEditRecoveryKey('other', recoveryControl(a)), {
    code: 'failed-precondition',
  });
  await assert.rejects(f.service.reserveBookLoreEditRecovery('other', f.intent));
  assert.deepEqual(state(f), before);
  assert.equal(JSON.stringify(a).includes('keyBase64'), false);
});

test('same native creation reopens a protected literal draft after service restart and cancellation', async () => {
  const f = await fixture(),
    p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent);
  const original = await key(f, p),
    iv = webcrypto.getRandomValues(new Uint8Array(12));
  const importKey = (s) =>
    webcrypto.subtle.importKey('raw', Buffer.from(s.keyBase64, 'base64'), 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
  const text = '\ufeff  Literal 🌙\r\n\r final  ';
  const cipher = await webcrypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    await importKey(original),
    Buffer.from(text, 'utf8'),
  );
  await f.parent.cancel();
  f.service = createBookLoreWriteRecoveryService({ db: f.db, now: () => 9000 });
  assert.deepEqual(await key(f, p), original);
  await finishCreationUploads(f.parent);
  const restored = await key(f, p);
  const bytes = await webcrypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    await importKey(restored),
    cipher,
  );
  assert.equal(Buffer.from(bytes).toString('utf8'), text);
  assert.equal((await f.parent.get()).phase, 'cancelled');
  const field = await creationUploadFixture(f.db, {
    parent: f.parent,
    uploadId: 'lore-field-' + 'f'.repeat(64),
  });
  const before = state(f);
  await assert.rejects(
    createBookLoreEditTransportService({ db: f.db }).bookLoreEdit(f.uid, {
      method: 'startBookLoreFieldUpload',
      input: field.intent,
    }),
    { code: 'failed-precondition' },
  );
  assert.deepEqual(state(f), before);
  assert.equal(f.records.has('books/book/lore/' + f.intent.loreId), false);
  assert.equal(f.records.get('books/book').localLoreVersion, undefined);
});

for (const [name, change] of [
  ['book owner', (f) => mutate(f, 'books/book', { authorId: 'other' })],
  ['book deleting', (f) => mutate(f, 'books/book', { deleting: true })],
  ['book invalid deleting', (f) => mutate(f, 'books/book', { deleting: null })],
  ['book missing', (f) => remove(f, 'books/book')],
  ['book recreated', (f) => recreate(f, 'books/book')],
  ['marker false', (f) => mutate(f, 'books/book', { hasLoreResources: false })],
  ['marker invalid', (f) => mutate(f, 'books/book', { hasLoreResources: null })],
  ['deleted book', (f) => mutate(f, 'deletedBooks/book', { deleted: true }, 'create')],
  ['creation missing', (f) => remove(f, f.parent.c.path)],
  ['creation recreated', (f) => recreate(f, f.parent.c.path)],
  ['reservation missing', (f) => remove(f, f.parent.c.reservationPath)],
  ['reservation recreated', (f) => recreate(f, f.parent.c.reservationPath)],
  [
    'premature head',
    (f) => mutate(f, 'books/book/lore/' + f.intent.loreId, { foreign: true }, 'create'),
  ],
  [
    'lore tombstone',
    (f) =>
      mutate(f, 'books/book/bookLoreTombstones/' + f.intent.loreId, { removed: true }, 'create'),
  ],
])
  test(
    'creation origin ' + name + ' denies key, preserves metadata and permits own revocation',
    async () => {
      const f = await fixture(),
        p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent);
      await change(f);
      const before = state(f);
      await assert.rejects(key(f, p), {
        code: ['book owner', 'book missing'].includes(name) ? 'not-found' : 'failed-precondition',
      });
      assert.deepEqual(await f.service.getBookLoreEditRecovery(f.uid, recoveryControl(p)), p);
      assert.deepEqual(await f.service.reserveBookLoreEditRecovery(f.uid, f.intent), p);
      assert.deepEqual(state(f), before);
      const closed = await f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p));
      assert.equal(closed.phase, 'revoked');
      assert.equal(f.records.has(f.c.key.path), false);
    },
  );

test('native adoption preserves the original recovery key and frozen source token', async () => {
  const f = await fixture(),
    p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent);
  const original = await key(f, p);
  await adopt(f);
  const before = state(f);
  assert.deepEqual(await key(f, p), original);
  assert.equal(original.sourceToken, f.progress.jobToken);
  assert.deepEqual(state(f), before);
  await mutate(f, 'books/book', { localLoreVersion: 17 });
  assert.deepEqual(await key(f, p), original);
  assert.equal((await f.parent.get()).phase, 'adopted');
});

for (const kind of ['missing', 'recreated', 'deleted', 'tombstone'])
  test('adopted creation ' + kind + ' head never grants access to old cipher', async () => {
    const f = await fixture(),
      p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent);
    await adopt(f);
    const path = 'books/book/lore/' + f.intent.loreId;
    if (kind === 'missing') await remove(f, path);
    if (kind === 'recreated') await recreate(f, path);
    if (kind === 'deleted') await mutate(f, path, { deleted: true });
    if (kind === 'tombstone')
      await mutate(
        f,
        'books/book/bookLoreTombstones/' + f.intent.loreId,
        { removed: true },
        'create',
      );
    const before = state(f);
    await assert.rejects(key(f, p));
    assert.deepEqual(state(f), before);
    assert.equal(
      (await f.service.revokeBookLoreEditRecovery(f.uid, recoveryControl(p))).phase,
      'revoked',
    );
  });

test('new recovery reservations never acquire a cancelled, cancelling or adopted creation', async () => {
  for (const phase of ['cancelling', 'cancelled', 'adopted']) {
    const f = await fixture();
    if (phase === 'adopted') await adopt(f);
    else {
      await f.parent.cancel();
      if (phase === 'cancelled') await finishCreationUploads(f.parent);
    }
    const before = state(f);
    await assert.rejects(f.service.reserveBookLoreEditRecovery(f.uid, f.intent), {
      code: 'failed-precondition',
    });
    assert.deepEqual(state(f), before);
  }
});

test('key revocation before or racing reserve never cancels creation or recreates key', async () => {
  for (const concurrent of [false, true]) {
    const f = await fixture(),
      control = {
        writeId: f.intent.writeId,
        requestHash: f.requestHash,
      };
    if (concurrent)
      await Promise.all([
        f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
        f.service.revokeBookLoreEditRecovery(f.uid, control),
      ]);
    else await f.service.revokeBookLoreEditRecovery(f.uid, control);
    const p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent);
    assert.equal(p.phase, 'revoked');
    assert.equal(f.records.has(f.c.key.path), false);
    assert.equal((await f.parent.get()).phase, 'preparing');
    await assert.rejects(key(f, p));
  }
});

test('creation references are closed and bound to the full recovery request without changing old hashes', async () => {
  const f = await fixture();
  const old = { ...f.intent };
  delete old.creation;
  assert.deepEqual(recoveryIntent(f.uid, old), old);
  assert.equal(
    recoveryRequestHash(f.uid, old),
    digest({
      domain: 'writer-lore-edit-recovery',
      schemaVersion: 1,
      uid: f.uid,
      intent: old,
    }),
  );
  const closed = recoveryIntent(f.uid, f.intent);
  assert.deepEqual(closed, f.intent);
  for (const field of ['creationId', 'startHash', 'jobToken']) {
    assert.notEqual(
      recoveryRequestHash(f.uid, {
        ...f.intent,
        creation: { ...f.intent.creation, [field]: 'e'.repeat(64) },
      }),
      f.requestHash,
    );
  }
  const noDb = new Proxy(
    {},
    {
      get() {
        throw Error('Unexpected I/O');
      },
    },
  );
  const service = createBookLoreWriteRecoveryService({ db: noDb });
  for (const creation of [
    null,
    {},
    { ...f.intent.creation, creationId: 'analysis-creation-' + 'c'.repeat(64) },
    { ...f.intent.creation, jobToken: 'a'.repeat(64) },
    { ...f.intent.creation, extra: 'PRIVATE' },
  ]) {
    await assert.rejects(service.reserveBookLoreEditRecovery(f.uid, { ...f.intent, creation }), {
      code: 'invalid-argument',
    });
  }
});

test('initial creation recovery cannot substitute a lore ID, creation reference or another book', async () => {
  const f = await fixture();
  await mutate(
    f,
    'books/other',
    {
      authorId: f.uid,
      deleting: false,
      status: 'draft',
      hasLoreResources: true,
    },
    'create',
  );
  const before = state(f);
  for (const input of [
    { ...f.intent, loreId: 'different-head' },
    { ...f.intent, bookId: 'other' },
    {
      ...f.intent,
      creation: { ...f.intent.creation, creationId: 'lore-creation-' + 'e'.repeat(64) },
    },
    { ...f.intent, creation: { ...f.intent.creation, startHash: 'e'.repeat(64) } },
  ]) {
    await assert.rejects(f.service.reserveBookLoreEditRecovery(f.uid, input), {
      code: 'failed-precondition',
    });
    assert.deepEqual(state(f), before);
  }
});
