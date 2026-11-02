import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc, deleteDoc } from 'firebase/firestore';
import {
  adoptionFixture,
  adoptFixture,
  nextAdoptionFixture,
} from '../../functions/test/helpers/bookLoreEditAdoptionFixture.mjs';
import { createBookLoreResourceInventoryService } from '../../functions/src/bookLoreResourceInventory.mjs';
import { createBookPublicationService } from '../../functions/src/bookLorePublication.mjs';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
import { readGenerationSection } from '../../functions/test/helpers/bookLoreGenerationFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-lore-edit-adoption';
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
const bookData = {
  title: 'Book',
  status: 'draft',
  createdAt: 1000,
  updatedAt: 1000,
  historyRevision: 0,
  publicationPrivacyVersion: 0,
};
const parent = async (f) => (await admin.doc(f.c.path).get()).data();
test('SDK consent removal atomically revokes public access and protects the server lore flag and legacy book deletion', async () => {
  const f = await adoptionFixture(admin, {
      mode: 'inline',
      changes: [{ target: { field: 'isPublic' }, value: false }],
    }),
    publicPath = 'publicBooks/' + f.bookId,
    revision = publicPath + '/revisions/old',
    anonymous = env.unauthenticatedContext().firestore(),
    client = env.authenticatedContext(f.uid).firestore();
  await admin.doc(f.source.seed.bookPath).update({ ...bookData, status: 'published' });
  await admin.doc(publicPath).create({ revisionId: 'old' });
  await admin
    .doc(revision)
    .create({ createdAt: 1000, chapterCount: 0, loreCount: 1, privacyVersion: 0 });
  await assertSucceeds(getDoc(doc(anonymous, publicPath)));
  await assertSucceeds(getDoc(doc(anonymous, revision)));
  const result = await adoptFixture(f),
    head = await admin.doc(f.source.seed.path).get(),
    book = await admin.doc(f.source.seed.bookPath).get(),
    j = await parent(f),
    receipt = await admin.doc(f.c.path + '/operations/' + f.adoptRequest.operationId).get(),
    state = await admin
      .doc('books/' + f.bookId + '/bookLoreGenerations/' + j.generationId + '/state/current')
      .get();
  assert.equal(result.progress.adoption.revoked, true);
  assert.equal(book.data().status, 'draft');
  assert.equal(book.data().publicationPrivacyVersion, 1);
  assert.equal(book.data().localLoreVersion, 1);
  for (const snapshot of [head, book, state])
    assert.equal(snapshot.updateTime.isEqual(receipt.createTime), true);
  assert.equal(head.data().isPublic, false);
  assert.equal((await admin.doc(publicPath).get()).exists, false);
  await assertFails(getDoc(doc(anonymous, publicPath)));
  await assertFails(getDoc(doc(anonymous, revision)));
  await assertSucceeds(
    updateDoc(doc(client, f.source.seed.bookPath), {
      title: 'Metadata allowed',
      updatedAt: book.data().updatedAt + 1,
    }),
  );
  await assertFails(
    updateDoc(doc(client, f.source.seed.bookPath), {
      hasLoreResources: false,
      updatedAt: book.data().updatedAt + 2,
    }),
  );
  await admin.doc(f.source.seed.bookPath).update({ deleting: true });
  await admin.doc('deletedBooks/' + f.bookId).create({ authorId: f.uid });
  await assertFails(deleteDoc(doc(client, f.source.seed.bookPath)));
  const control = 'legacy-control';
  await admin
    .doc('books/' + control)
    .create({ ...book.data(), hasLoreResources: false, deleting: true });
  await admin.doc('deletedBooks/' + control).create({ authorId: f.uid });
  await assertFails(
    updateDoc(doc(client, 'books/' + control), {
      hasLoreResources: true,
      updatedAt: book.data().updatedAt + 3,
    }),
  );
  await assertFails(deleteDoc(doc(client, 'books/' + control)));
});
test('SDK a real second adoption preserves explicit consent checks and only collects retired unreferenced leased bytes', async () => {
  const f = await adoptionFixture(admin, {
    mode: 'v1',
    sourceOptions: {
      data: {
        name: 'Original',
        category: 'other',
        details: 'saved',
        isPublic: true,
        aliases: [],
        summary: 'S',
      },
    },
  });
  await admin.doc(f.source.seed.bookPath).update(bookData);
  await adoptFixture(f);
  const first = await parent(f),
    pointer = first.adoption.storage.fields.details,
    leaseRef = admin.doc('books/' + f.bookId + '/bookResourceLeases/' + pointer.manifest.bodyId),
    lease = await leaseRef.get(),
    client = env.authenticatedContext(f.uid).firestore(),
    base = 'publicBooks/' + f.bookId + '/revisions/',
    projection = { name: 'N', aliases: [], category: 'other', summary: 'S' };
  assert.equal((await admin.doc(f.source.seed.path).get()).data().isPublic, true);
  const publication = createBookPublicationService({ db: admin }),
    firstProof = await publication.getBookPublicationSource(f.uid, { bookId: f.bookId });
  await assertSucceeds(
    setDoc(doc(client, base + 'stage-1'), {
      createdAt: Math.max(Date.now(), firstProof.source.updatedAt + 1),
      chapterCount: 0,
      loreCount: 1,
      privacyVersion: 0,
      sourceLoreToken: firstProof.source.listToken,
      sourcePublicationToken: firstProof.sourceToken,
    }),
  );
  await assertFails(setDoc(doc(client, base + 'stage-1/lore/' + f.loreId), projection));
  const firstView = await createBookLoreReadService({ db: admin }).getBookLoreRead(f.uid, {
    bookId: f.bookId,
    id: f.loreId,
    tokenVersion: 2,
  });
  await publication.stageBookPublicationLore(f.uid, {
    bookId: f.bookId,
    revisionId: 'stage-1',
    ...firstProof,
    loreId: f.loreId,
    readToken: firstView.readToken,
    aliases: [],
  });
  const publicFields = (await admin.doc(base + 'stage-1/lore/' + f.loreId).get()).data();
  assert.deepEqual(Object.keys(publicFields).sort(), ['aliases', 'category', 'name', 'summary']);
  const inventory = createBookLoreResourceInventoryService({ db: admin }),
    api = createBookLoreReadService({ db: admin }),
    view = await api.getBookLoreRead(f.uid, { bookId: f.bookId, id: f.loreId });
  assert.deepEqual(
    await inventory.registerBookLoreSourceReference(f.uid, {
      bookId: f.bookId,
      loreId: f.loreId,
      sourceToken: view.readToken,
      selector: { section: 'field', field: 'details', page: 0 },
    }),
    { phase: 'registered', registered: true },
  );
  const g = await nextAdoptionFixture(f, {
    changes: [
      { target: { field: 'details' }, value: 'second literal' },
      { target: { field: 'isPublic' }, value: false },
    ],
  });
  await adoptFixture(g);
  assert.equal(
    (
      await admin
        .doc('books/' + f.bookId + '/bookLoreGenerations/' + first.generationId + '/state/current')
        .get()
    ).data().phase,
    'retired',
  );
  assert.equal((await leaseRef.get()).updateTime.isEqual(lease.updateTime), true);
  assert.equal((await leaseRef.get()).data().phase, 'reserved');
  const secondProof = await publication.getBookPublicationSource(f.uid, { bookId: f.bookId });
  await assertSucceeds(
    setDoc(doc(client, base + 'stage-2'), {
      createdAt: Math.max(Date.now(), secondProof.source.updatedAt + 1),
      chapterCount: 0,
      loreCount: 1,
      privacyVersion: 1,
      sourceLoreToken: secondProof.source.listToken,
      sourcePublicationToken: secondProof.sourceToken,
    }),
  );
  await assertFails(setDoc(doc(client, base + 'stage-2/lore/' + f.loreId), projection));
  const secondView = await api.getBookLoreRead(f.uid, {
    bookId: f.bookId,
    id: f.loreId,
    tokenVersion: 2,
  });
  await assert.rejects(
    publication.stageBookPublicationLore(f.uid, {
      bookId: f.bookId,
      revisionId: 'stage-2',
      ...secondProof,
      loreId: f.loreId,
      readToken: secondView.readToken,
      aliases: [],
    }),
    { code: 'permission-denied' },
  );
  let collected;
  for (let i = 0; i < 20; i++) {
    collected = await inventory.collectBookLoreInventoryBody(f.uid, {
      bookId: f.bookId,
      bodyId: pointer.manifest.bodyId,
    });
    if (collected.complete) break;
    assert.equal(collected.deferred, undefined);
  }
  assert.equal(collected.complete, true);
  assert.equal(
    (await admin.doc('books/' + f.bookId + '/bookResourceBodies/' + pointer.manifest.bodyId).get())
      .exists,
    false,
  );
  assert.equal((await leaseRef.get()).exists, true);
  const latest = await api.getBookLoreRead(f.uid, { bookId: f.bookId, id: f.loreId });
  assert.equal(
    await readGenerationSection(
      api,
      { uid: f.uid, bookId: f.bookId, id: f.loreId },
      latest,
      'field',
      'details',
    ),
    'second literal',
  );
});
test('SDK rollback preserves native activation and concurrent retry confirms one adoption even after deleting the root', async () => {
  const f = await adoptionFixture(admin, { mode: 'v2' }),
    j = await parent(f),
    paths = [
      f.c.path,
      f.source.seed.path,
      f.source.seed.bookPath,
      'books/' + f.bookId + '/bookLoreGenerations/' + j.generationId + '/state/current',
    ],
    before = await Promise.all(paths.map((path) => admin.doc(path).get())),
    run = admin.runTransaction.bind(admin);
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'update')
              return (ref, ...args) => {
                target.update(ref, ...args);
                if (ref.path === f.c.path) throw Error('injected adoption rollback');
                return target;
              };
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
      ),
    );
  try {
    await assert.rejects(() => adoptFixture(f), /injected adoption rollback/);
  } finally {
    admin.runTransaction = run;
  }
  for (const snapshot of before) {
    const same = await snapshot.ref.get();
    assert.deepEqual(same.data(), snapshot.data());
    assert.equal(same.updateTime.isEqual(snapshot.updateTime), true);
  }
  const results = await Promise.all([adoptFixture(f), adoptFixture(f)]);
  assert.deepEqual(results[0], results[1]);
  assert.equal((await admin.doc(f.source.seed.bookPath).get()).data().localLoreVersion, 1);
  assert.equal((await admin.doc(paths[3]).get()).data().revision, 1);
  const head = await admin.doc(f.source.seed.path).get();
  await admin.doc(f.source.seed.bookPath).delete();
  const replay = await adoptFixture(f);
  assert.deepEqual(replay.receipt, results[0].receipt);
  assert.equal((await admin.doc(f.source.seed.bookPath).get()).exists, false);
  assert.equal(
    (await admin.doc(f.source.seed.path).get()).updateTime.isEqual(head.updateTime),
    true,
  );
});
