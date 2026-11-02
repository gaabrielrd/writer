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
import { createBookLoreRemovalTransportService } from '../../functions/src/bookLoreRemovalTransport.mjs';
import { createBookLoreEditTransportService } from '../../functions/src/bookLoreEditTransport.mjs';
import { removalBatchFixture } from '../../functions/test/helpers/bookLoreRemovalBatchFixture.mjs';
import { prepareBookLoreRemovalBatch } from '../../functions/src/bookLoreRemovalStart.mjs';
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
  const fresh = { bookId: 'book', name: 'Other', category: 'other', isPublic: false };
  // Existing sibling is seeded before the native barrier; SDK writers close afterwards.
  await sourceInspectionFixture(admin, { mode: 'inline', id: 'preserved', data: fresh });
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
  assert.equal(book.data().hasLoreResources, true);
  const blocked = writeBatch(client);
  blocked.update(doc(client, root), { localLoreVersion: 2 });
  blocked.set(doc(client, 'books/book/lore/blocked-new'), fresh);
  await assertFails(blocked.commit());
  assert.equal((await admin.doc('books/book/lore/blocked-new').get()).exists, false);
  const rejected = writeBatch(client);
  rejected.update(doc(client, root), { localLoreVersion: 2 });
  rejected.set(doc(client, 'books/book/lore/entity'), fresh);
  await assertFails(rejected.commit());
  assert.equal((await data(root)).localLoreVersion, 1);
  await assertFails(getDoc(doc(client, f.tombstonePath)));
  await assertFails(setDoc(doc(client, f.tombstonePath), {}));
  await assertFails(getDoc(doc(client, f.path)));
  await assertFails(setDoc(doc(client, f.path + '/events/forged'), {}));
  const done = await finishRemoval(f, p);
  await scopedEmpty(f);
  assert.equal((await admin.doc('books/book/lore/preserved').get()).exists, true);
  assert.equal((await admin.doc(root).get()).exists, true);
  assert.equal((await data(root)).localLoreVersion, 1);
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

test('SDK dedicated transport withdraws once, fences private controls and resumes native cleanup', async () => {
  const hash = 'd'.repeat(64);
  const source = await sourceInspectionFixture(admin, {
    mode: 'v2',
    inspectionId: 'lore-removal-source-' + hash,
    data: {
      name: 'PRIVATE SDK PROSE',
      category: 'other',
      details: 'Exact 🌙'.repeat(20000),
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
  });
  const port = createBookLoreRemovalTransportService({ db: admin });
  const call = (method, input, uid = source.uid) => port.bookLoreRemoval(uid, { method, input });
  let inspected = await call('startBookLoreSourceInspection', source.intent);
  for (let i = 0; !inspected.ready && i < 1000; i++)
    inspected = (
      await call('advanceBookLoreSourceInspection', {
        inspectionId: source.inspectionId,
        startHash: inspected.startHash,
        jobToken: inspected.jobToken,
        expectedRevision: inspected.revision,
        operationId: 'sdk-inspect-' + inspected.revision,
      })
    ).progress;
  assert.equal(inspected.ready, true);
  assert.equal((await admin.doc(source.seed.path).get()).exists, true);
  const intent = {
    bookId: 'book',
    loreId: 'entity',
    removalId: 'lore-removal-' + hash,
    sourceToken: source.view.readToken,
    inspection: {
      inspectionId: source.inspectionId,
      startHash: inspected.startHash,
      jobToken: inspected.jobToken,
    },
  };
  const [first, retry] = await Promise.all([
    call('startBookLoreRemoval', intent),
    call('startBookLoreRemoval', intent),
  ]);
  assert.deepEqual(first, retry);
  const control = {
    removalId: intent.removalId,
    startHash: first.startHash,
    jobToken: first.jobToken,
  };
  assert.deepEqual(await call('getBookLoreRemoval', control), first);
  assert.equal(
    await call(
      'getBookLoreRemoval',
      { removalId: intent.removalId, startHash: first.startHash },
      'other',
    ),
    null,
  );
  assert.equal((await admin.doc(source.seed.path).get()).exists, false);
  assert.equal((await admin.doc('books/book').get()).data().localLoreVersion, 1);
  const path = 'users/author/bookLoreRemovals/' + intent.removalId;
  const context = await admin.doc(path).get(),
    tombstone = await admin.doc('books/book/bookLoreTombstones/entity').get();
  assert.equal(context.createTime.isEqual(tombstone.createTime), true);
  for (const client of [
    env.authenticatedContext(source.uid).firestore(),
    env.authenticatedContext('other').firestore(),
    env.unauthenticatedContext().firestore(),
  ]) {
    for (const privatePath of [
      path,
      path + '/state/current',
      'books/book/bookLoreTombstones/entity',
      'users/author/bookLoreSourceInspections/' + source.inspectionId,
    ]) {
      await assertFails(getDoc(doc(client, privatePath)));
      await assertFails(setDoc(doc(client, privatePath), { forged: true }));
    }
    await assertFails(
      setDoc(doc(client, source.seed.path), {
        bookId: 'book',
        name: 'Recreated',
        category: 'other',
        createdAt: 1000,
        updatedAt: 1000,
      }),
    );
  }
  let current = first;
  for (let i = 0; !current.complete && i < 1000; i++)
    current = (
      await call('advanceBookLoreRemoval', {
        ...control,
        expectedRevision: current.revision,
        operationId: 'sdk-remove-' + current.revision,
      })
    ).progress;
  assert.equal(current.complete, true);
  assert.equal((await admin.doc('books/book').get()).data().localLoreVersion, 1);
  assert.deepEqual(await call('getBookLoreRemoval', control), current);
  assert.equal(JSON.stringify(current).includes('PRIVATE SDK PROSE'), false);
});
test('SDK dedicated inspection cancellation is disjoint from edition and cannot remove a head', async () => {
  const hash = 'e'.repeat(64);
  const source = await sourceInspectionFixture(admin, {
    mode: 'inline',
    inspectionId: 'lore-removal-source-' + hash,
  });
  const port = createBookLoreRemovalTransportService({ db: admin });
  const call = (method, input) => port.bookLoreRemoval(source.uid, { method, input });
  const ready = await call('startBookLoreSourceInspection', source.intent);
  const control = {
    inspectionId: source.inspectionId,
    startHash: ready.startHash,
    jobToken: ready.jobToken,
  };
  await assert.rejects(
    createBookLoreEditTransportService({ db: admin }).bookLoreEdit(source.uid, {
      method: 'cancelBookLoreSourceInspection',
      input: { ...control, operationId: 'wrong-endpoint' },
    }),
    { code: 'invalid-argument' },
  );
  assert.deepEqual(await call('getBookLoreSourceInspection', control), ready);
  const cancelled = await call('cancelBookLoreSourceInspection', {
    ...control,
    operationId: 'cancel-own-inspection',
  });
  assert.equal(cancelled.progress.phase, 'cancelled');
  await assert.rejects(
    call('startBookLoreRemoval', {
      bookId: source.bookId,
      loreId: source.id,
      removalId: 'lore-removal-' + hash,
      sourceToken: source.view.readToken,
      inspection: control,
    }),
  );
  assert.equal((await admin.doc(source.seed.path).get()).exists, true);
  assert.equal((await admin.doc('books/book/bookLoreTombstones/entity').get()).exists, false);
});

test('SDK bulk native concurrent withdrawal shares one birth, clock and privacy revocation with private aggregate proof', async () => {
  const f = await removalBatchFixture(admin);
  const sourceHeads = await Promise.all(f.members.map((m) => admin.doc(m.source.seed.path).get()));
  assert.equal(
    sourceHeads.every((s) => s.exists),
    true,
  );
  const [a, b] = await Promise.all([f.start(), f.start()]);
  assert.deepEqual(a, b);
  assert.equal(a.localLoreVersion, 11);
  assert.match(a.jobToken, /^[a-f0-9]{64}$/);
  assert.deepEqual(
    await f.factory().getBookLoreRemovalBatch(f.uid, { ...f.control, jobToken: a.jobToken }),
    a,
  );
  await assert.rejects(
    f.factory().getBookLoreRemovalBatch(f.uid, { ...f.control, jobToken: 'f'.repeat(64) }),
    { code: 'failed-precondition' },
  );
  assert.equal(a.publicationPrivacyVersion, 5);
  assert.equal(a.timestamp, 10001);
  const record = await f.c.record.get(),
    proof = await f.c.proof.get();
  assert.equal(record.createTime.isEqual(record.updateTime), true);
  assert.equal(record.createTime.isEqual(proof.createTime), true);
  for (const m of f.members) {
    const context = await admin.doc(m.path).get(),
      tombstone = await admin.doc(m.tombstonePath).get();
    assert.equal(context.createTime.isEqual(record.createTime), true);
    assert.equal(tombstone.createTime.isEqual(record.createTime), true);
    assert.equal((await admin.doc(m.source.seed.path).get()).exists, false);
  }
  const root = await admin.doc('books/book').get();
  assert.equal(root.data().localLoreVersion, 11);
  assert.equal(root.data().publicationPrivacyVersion, 5);
  assert.equal(root.data().createdAt, 500);
  assert.equal((await admin.doc('publicBooks/book').get()).exists, false);
  assert.equal((await admin.doc(f.sibling.seed.path).get()).exists, true);
  for (const client of [
    env.authenticatedContext(f.uid).firestore(),
    env.authenticatedContext('other').firestore(),
    env.unauthenticatedContext().firestore(),
  ]) {
    for (const path of [
      f.c.record.path,
      f.c.proof.path,
      f.members[0].path,
      f.members[0].tombstonePath,
    ]) {
      await assertFails(getDoc(doc(client, path)));
      await assertFails(setDoc(doc(client, path), { forged: true }));
    }
    await assertFails(
      setDoc(doc(client, f.members[0].source.seed.path), {
        bookId: 'book',
        name: 'Forged',
        category: 'other',
        createdAt: 1000,
        updatedAt: 1000,
      }),
    );
  }
  assert.deepEqual(await f.get(), a);
  assert.equal((await admin.doc('users/author').get()).data().credits, 20);
});

test('SDK bulk native caller rollback preserves all sources and allows the original batch to retry', async () => {
  const f = await removalBatchFixture(admin);
  const before = await snapshots([
    'books/book',
    'publicBooks/book',
    ...f.members.map((m) => m.source.seed.path),
  ]);
  await assert.rejects(
    admin.runTransaction(async (tx) => {
      const plan = await prepareBookLoreRemovalBatch(
        tx,
        { db: admin, now: () => 3000 },
        f.uid,
        f.input,
      );
      plan.commit();
      throw Error('explicit caller rollback');
    }),
    /explicit caller rollback/,
  );
  assert.deepEqual(
    await snapshots([
      'books/book',
      'publicBooks/book',
      ...f.members.map((m) => m.source.seed.path),
    ]),
    before,
  );
  for (const m of f.members) assert.equal((await admin.doc(m.path).get()).exists, false);
  assert.equal((await f.c.record.get()).exists, false);
  assert.equal((await f.c.proof.get()).exists, false);
  assert.equal((await f.start()).localLoreVersion, 11);
});

test('SDK bulk native recreated aggregate pair and lost proof cannot claim original contexts', async () => {
  const f = await removalBatchFixture(admin);
  await f.start();
  const original = await f.c.record.get(),
    anchor = await f.c.proof.get();
  await admin.runTransaction(async (tx) => {
    tx.delete(f.c.record);
    tx.delete(f.c.proof);
  });
  await assert.rejects(f.get(), { code: 'failed-precondition' });
  await admin.runTransaction(async (tx) => {
    tx.create(f.c.record, original.data());
    tx.create(f.c.proof, anchor.data());
  });
  assert.equal((await f.c.record.get()).createTime.isEqual(original.createTime), false);
  await assert.rejects(f.get(), { code: 'failed-precondition' });
  await assert.rejects(f.start(), { code: 'failed-precondition' });
  assert.equal((await admin.doc('books/book').get()).data().localLoreVersion, 11);
});

test('SDK bulk native supports a 50-member unit while keeping the unrelated fiche and root', async () => {
  const f = await removalBatchFixture(admin, { count: 50, modes: ['inline'] });
  const p = await f.start();
  assert.equal(p.items.length, 50);
  assert.equal(p.localLoreVersion, 11);
  assert.equal((await admin.doc('books/book').get()).data().localLoreVersion, 11);
  assert.equal((await admin.doc(f.sibling.seed.path).get()).exists, true);
  const birth = (await f.c.record.get()).createTime;
  for (const m of f.members)
    assert.equal((await admin.doc(m.path).get()).createTime.isEqual(birth), true);
});
