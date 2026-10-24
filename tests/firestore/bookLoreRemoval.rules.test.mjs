import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, writeBatch } from 'firebase/firestore';
import {
  removalFixture,
  removalControl,
  finishRemoval,
} from '../../functions/test/helpers/bookLoreRemovalFixture.mjs';
import {
  adoptionFixture,
  adoptFixture,
} from '../../functions/test/helpers/bookLoreEditAdoptionFixture.mjs';
import { sourceInspectionFixture } from '../../functions/test/helpers/bookLoreSourceInspectionFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from '../../functions/test/helpers/bookLoreDeletionFixture.mjs';
import { resourcePayloadChunkPath } from '../../functions/src/bookResourcePayloadPaths.mjs';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
import { createBookLoreResourceInventoryService } from '../../functions/src/bookLoreResourceInventory.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-book-lore-removal';
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
const data = async (path) => (await admin.doc(path).get()).data();
const state = async (f) => (await data(f.path + '/state/current')).cleanup;
async function until(f, condition) {
  let p = await f.start();
  for (let i = 0; i < 1000 && !condition(await state(f)); i++) p = (await f.step(p)).progress;
  assert.ok(condition(await state(f)));
  return p;
}
async function scopedEmpty(f) {
  for (const [name, field] of [
    ['bookLoreSegments', 'loreId'],
    ['bookResourceBodies', 'resource.id'],
  ])
    assert.equal(
      (
        await admin
          .collection('books/' + f.bookId + '/' + name)
          .where(field, '==', f.loreId)
          .select()
          .limit(1)
          .get()
      ).empty,
      true,
    );
  assert.equal((await admin.doc('books/' + f.bookId + '/lore/' + f.loreId).get()).exists, false);
}
async function snapshots(paths) {
  return Promise.all(
    paths.map(async (path) => {
      const s = await admin.doc(path).get();
      return {
        path,
        exists: s.exists,
        value: s.data(),
        create: s.createTime?.toMillis(),
        update: s.updateTime?.toMillis(),
      };
    }),
  );
}

test('SDK withdrawal is atomic and concurrent retry preserves clocks, explicit privacy and a permanent non-reusable ID', async () => {
  const f = await removalFixture(admin, {
      data: { name: 'N', category: 'other', isPublic: true, createdAt: 1000, updatedAt: 1000 },
    }),
    root = 'books/book',
    publicPath = 'publicBooks/book',
    revision = publicPath + '/revisions/old',
    client = env.authenticatedContext(f.uid).firestore(),
    anonymous = env.unauthenticatedContext().firestore();
  await admin.doc(root).update({
    title: 'Book',
    status: 'published',
    createdAt: 1000,
    updatedAt: 1000,
    historyRevision: 0,
    publicationPrivacyVersion: 0,
  });
  await admin.doc(publicPath).create({ revisionId: 'old' });
  await admin
    .doc(revision)
    .create({ createdAt: 1000, chapterCount: 0, loreCount: 1, privacyVersion: 0 });
  await assertSucceeds(getDoc(doc(anonymous, publicPath)));
  const [p, retry] = await Promise.all([f.start(), f.start()]);
  assert.deepEqual(retry, p);
  const context = await admin.doc(f.path).get(),
    tombstone = await admin.doc(f.tombstonePath).get(),
    checkpoint = await admin.doc(f.path + '/state/current').get(),
    book = await admin.doc(root).get();
  for (const s of [tombstone, checkpoint])
    assert.equal(s.createTime.isEqual(context.createTime), true);
  assert.equal(book.updateTime.isEqual(context.createTime), true);
  assert.equal(book.data().localLoreVersion, 1);
  assert.equal(book.data().publicationPrivacyVersion, 1);
  assert.equal(book.data().status, 'draft');
  assert.equal(book.data().createdAt, 1000);
  await assertFails(getDoc(doc(anonymous, publicPath)));
  await assertFails(getDoc(doc(anonymous, revision)));
  const fresh = { bookId: 'book', name: 'Other', category: 'other', isPublic: false },
    positive = writeBatch(client);
  positive.update(doc(client, root), { localLoreVersion: 2 });
  positive.set(doc(client, 'books/book/lore/preserved'), fresh);
  await assertSucceeds(positive.commit());
  const rejected = writeBatch(client);
  rejected.update(doc(client, root), { localLoreVersion: 3 });
  rejected.set(doc(client, 'books/book/lore/entity'), fresh);
  await assertFails(rejected.commit());
  assert.equal((await data(root)).localLoreVersion, 2);
  await assertFails(getDoc(doc(client, f.tombstonePath)));
  await assertFails(setDoc(doc(client, f.tombstonePath), {}));
  await assertFails(getDoc(doc(client, f.path)));
  await assertFails(setDoc(doc(client, f.path + '/events/forged'), {}));
  const done = await finishRemoval(f, p);
  await scopedEmpty(f);
  assert.equal((await admin.doc('books/book/lore/preserved').get()).exists, true);
  assert.equal((await admin.doc(root).get()).exists, true);
  assert.equal((await data(root)).localLoreVersion, 2);
  assert.deepEqual(await f.start(), done);
});

test('SDK body cleanup rollback and individual-to-book handoff preserve native receipts and historical completion', async () => {
  const base = await adoptionFixture(admin, {
    mode: 'inline',
    changes: [{ target: { field: 'details' }, value: 'x'.repeat(200000) }],
  });
  await adoptFixture(base);
  const source = await sourceInspectionFixture(admin, {
      inspectionId: 'removal-inspection',
      existingSeed: base.source.seed,
    }),
    f = await removalFixture(admin, { source }),
    p = await until(f, (s) => s.phase === 'bodies' && s.body !== null),
    body = (await state(f)).body,
    chunk = resourcePayloadChunkPath('book', body.bodyId, body.index),
    inventory = 'books/book/bookResourceInventory/' + body.bodyId + '/state/current',
    paths = [chunk, inventory, f.path, f.path + '/state/current', 'books/book'],
    before = await snapshots(paths),
    run = admin.runTransaction.bind(admin);
  assert.equal((await data(inventory)).phase, 'collecting');
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'update')
              return (ref, ...args) => {
                const result = target.update(ref, ...args);
                if (ref.path === f.path + '/state/current')
                  throw Error('injected individual SDK failure');
                return result;
              };
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
      ),
    );
  try {
    await assert.rejects(() => f.step(p), /injected individual SDK failure/);
  } finally {
    admin.runTransaction = run;
  }
  assert.deepEqual(await snapshots(paths), before);
  const request = removalControl(f, p),
    [a, b] = await Promise.all([
      f.removalFactory().advanceBookLoreRemoval(f.uid, request),
      f.removalFactory().advanceBookLoreRemoval(f.uid, request),
    ]);
  assert.deepEqual(a.receipt, b.receipt);
  assert.equal((await state(f)).revision, p.revision + 1);
  const book = bookLoreDeletionFixture(admin);
  await markBookDeleting(book);
  await assert.rejects(() => f.step(a.progress));
  for (let i = 0; i < 1000 && !(await data(f.path + '/state/current')).handoff; i++)
    await book.step();
  assert.equal((await f.get()).phase, 'handed-off');
  assert.equal((await f.get()).complete, false);
  await finishBookLoreDeletion(book);
  await scopedEmpty(f);
  assert.equal(
    (await admin.collection('books/book/bookResourceChunks').select().limit(1).get()).empty,
    true,
  );
  assert.equal((await admin.doc('books/book').get()).exists, false);
  const done = await f.get();
  assert.equal(done.complete, true);
  assert.deepEqual(await f.start(), done);
  const replay = await f.removalFactory().advanceBookLoreRemoval(f.uid, request);
  assert.deepEqual(replay.receipt, a.receipt);
  assert.equal(replay.progress.complete, true);
  assert.equal((await admin.doc(f.tombstonePath).get()).exists, true);
  assert.equal((await data(base.c.path)).phase, 'adopted');
});

test('SDK scoped removal handles 141 legacy parts in bounded units and retains the book', async () => {
  const f = await removalFixture(admin, {
      mode: 'v1',
      data: { name: 'N', category: 'other', details: '🌙'.repeat(2300000) },
    }),
    count = f.source.seed.base.prepared.manifest.chunkCount,
    header = f.source.seed.base.path;
  assert.ok(count > 128);
  let p = await f.start(),
    before = count,
    removed = 0;
  for (let i = 0; i < 1000 && !p.complete; i++) {
    p = (await f.step(p)).progress;
    const current = (
      await admin
        .collection('books/book/bookResourceChunks')
        .select()
        .limit(count + 1)
        .get()
    ).size;
    assert.ok(before - current >= 0 && before - current <= 16);
    if (current) assert.equal((await admin.doc(header).get()).exists, true);
    removed += before - current;
    before = current;
  }
  assert.equal(p.complete, true);
  assert.equal(removed, count);
  await scopedEmpty(f);
  assert.equal((await admin.doc('books/book').get()).exists, true);
});

test('SDK a recreated tombstone cannot authorize history and recreated heads remain unreadable through full lore APIs', async () => {
  const f = await removalFixture(admin),
    head = await data(f.source.seed.path);
  await f.start();
  await admin.doc(f.source.seed.path).create(head);
  await assert.rejects(() =>
    createBookLoreReadService({ db: admin }).getBookLoreRead(f.uid, {
      bookId: f.bookId,
      id: f.loreId,
    }),
  );
  const ref = admin.doc(f.tombstonePath),
    before = await ref.get(),
    value = before.data();
  await ref.delete();
  await ref.create(value);
  assert.equal((await ref.get()).createTime.isEqual(before.createTime), false);
  await assert.rejects(() => f.get());
  await assert.rejects(() => f.start());
  assert.deepEqual(await data(f.source.seed.path), head);
  assert.equal((await admin.doc('books/book').get()).exists, true);
});

test('SDK generic collector defers to native individual removal while its own controller completes cleanup', async () => {
  const base = await adoptionFixture(admin, { mode: 'inline' });
  await adoptFixture(base);
  const source = await sourceInspectionFixture(admin, {
      inspectionId: 'removal-inspection',
      existingSeed: base.source.seed,
    }),
    f = await removalFixture(admin, { source }),
    control = (await admin.collection('books/book/bookResourceInventory').select().limit(1).get())
      .docs[0],
    api = createBookLoreResourceInventoryService({ db: admin }),
    request = { bookId: 'book', bodyId: control.id };
  assert.equal((await api.collectBookLoreInventoryBody(f.uid, request)).reason, 'active-head');
  const p = await f.start(),
    before = await snapshots([control.ref.path, control.ref.path + '/state/current', 'books/book']);
  assert.equal((await api.collectBookLoreInventoryBody(f.uid, request)).reason, 'lore-removal');
  assert.deepEqual(
    await snapshots([control.ref.path, control.ref.path + '/state/current', 'books/book']),
    before,
  );
  await finishRemoval(f, p);
  await scopedEmpty(f);
});
