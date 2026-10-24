import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import {
  creationAdoptionFixture,
  adoptCreation,
} from '../../functions/test/helpers/bookLoreCreationAdoptionFixture.mjs';
import {
  nextAdoptionFixture,
  adoptFixture,
} from '../../functions/test/helpers/bookLoreEditAdoptionFixture.mjs';
import { createBookLoreReadService } from '../../functions/src/bookLoreRead.mjs';
import { readGenerationSection } from '../../functions/test/helpers/bookLoreGenerationFixture.mjs';
import { sourceInspectionFixture } from '../../functions/test/helpers/bookLoreSourceInspectionFixture.mjs';
import {
  removalFixture,
  finishRemoval,
} from '../../functions/test/helpers/bookLoreRemovalFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from '../../functions/test/helpers/bookLoreDeletionFixture.mjs';
import { finishCreationUploads } from '../../functions/test/helpers/bookLoreCreationUploadFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-creation-activation';
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
const get = (f) =>
  createBookLoreReadService({ db: admin }).getBookLoreRead(f.uid, {
    bookId: f.bookId,
    id: f.loreId,
  });
async function finishBook(f) {
  const deletion = bookLoreDeletionFixture(admin, { uid: f.uid, bookId: f.bookId });
  await markBookDeleting(deletion);
  assert.equal((await finishBookLoreDeletion(deletion)).complete, true);
  assert.equal((await admin.doc('books/' + f.bookId).get()).exists, false);
  assert.equal(
    (
      await admin
        .collection('books/' + f.bookId + '/bookResourceBodies')
        .limit(1)
        .get()
    ).size,
    0,
  );
  assert.equal(
    (
      await admin
        .collection('books/' + f.bookId + '/bookResourceChunks')
        .limit(1)
        .get()
    ).size,
    0,
  );
}
test('SDK creation activation couples the head, generation, receipt and creator proofs and preserves success through reedit, removal and book deletion', async () => {
  const details = '\ufeffliteral 🌙\r\n'.repeat(8000),
    relations = Array.from({ length: 65 }, (_, i) => ({
      targetEntityId: 'related-' + i,
      relationType: 'r',
    })),
    f = await creationAdoptionFixture(admin, {
      changes: [
        { target: { field: 'name' }, value: '\ufeffName 🌙' },
        { target: { field: 'category' }, value: 'other' },
        { target: { field: 'details' }, value: details },
        { target: { field: 'relations', page: 0, count: 64 }, value: relations.slice(0, 64) },
        { target: { field: 'relations', page: 1, count: 1 }, value: relations.slice(64) },
      ],
      relations: { present: true, count: 65 },
    }),
    [a, b] = await Promise.all([adoptCreation(f), adoptCreation(f)]),
    p = await f.parent.get(),
    head = await admin.doc(f.headPath).get(),
    j = await data(f.c.path),
    root = await admin.doc('books/book').get(),
    generation = 'books/book/bookLoreGenerations/' + j.generationId,
    paths = [
      f.parent.c.path + '/adoptions/current',
      f.parent.c.path + '/adoptionProofs/current',
      f.c.path + '/operations/' + f.adoptRequest.operationId,
      f.c.path + '/operationProofs/' + f.adoptRequest.operationId,
      generation + '/events/0000000000000001',
      generation + '/proofs/0000000000000001',
    ];
  assert.deepEqual(a.receipt, b.receipt);
  assert.equal(root.data().localLoreVersion, 1);
  assert.equal(root.updateTime.isEqual(head.createTime), true);
  for (const path of paths)
    assert.equal((await admin.doc(path).get()).createTime.isEqual(head.createTime), true);
  assert.equal(
    (await admin.doc(generation + '/state/current').get()).updateTime.isEqual(head.createTime),
    true,
  );
  assert.equal(head.data().createdAt, p.adoption.timestamp);
  assert.equal(Object.hasOwn(head.data(), 'isPublic'), false);
  const api = createBookLoreReadService({ db: admin }),
    v = await get(f);
  assert.equal(await readGenerationSection(api, f.source.seed, v, 'field', 'details'), details);
  assert.deepEqual(
    await readGenerationSection(api, f.source.seed, v, 'relations', undefined, 0),
    relations.slice(0, 64),
  );
  assert.deepEqual(
    await readGenerationSection(api, f.source.seed, v, 'relations', undefined, 1),
    relations.slice(64),
  );
  const client = env.authenticatedContext(f.uid).firestore();
  await assertFails(getDoc(doc(client, paths[0])));
  await assertFails(setDoc(doc(client, f.headPath), head.data()));
  await assert.rejects(() => f.parent.cancel());
  const next = await nextAdoptionFixture(f, {
    changes: [{ target: { field: 'details' }, value: 'second edition' }],
  });
  await adoptFixture(next);
  assert.equal((await data(f.headPath)).createdAt, head.data().createdAt);
  assert.equal((await data('books/book')).localLoreVersion, 2);
  assert.equal(
    await readGenerationSection(api, f.source.seed, await get(f), 'field', 'details'),
    'second edition',
  );
  assert.deepEqual(await f.parent.get(), p);
  const source = await sourceInspectionFixture(admin, {
      uid: f.uid,
      bookId: f.bookId,
      id: f.loreId,
      inspectionId: 'sdk-remove-created-inspection',
      existingSeed: f.source.seed,
    }),
    removal = await removalFixture(admin, { source });
  await finishRemoval(removal);
  assert.equal(await get(f), null);
  assert.deepEqual(await f.parent.get(), p);
  assert.equal((await adoptCreation(f)).receipt.phase, 'adopted');
  assert.equal((await admin.doc(f.headPath).get()).exists, false);
  await finishBook(f);
  assert.deepEqual(await f.parent.get(), p);
  assert.deepEqual(await f.parent.start(), p);
  assert.equal((await adoptCreation(f)).receipt.phase, 'adopted');
  assert.equal((await admin.doc(f.headPath).get()).exists, false);
});
test('SDK creation activation races another attempt and cancellation with only one native winner', async () => {
  const f = await creationAdoptionFixture(admin),
    other = await creationAdoptionFixture(admin, {
      parent: f.parent,
      editId: 'sdk-competing-attempt',
    }),
    results = await Promise.allSettled([adoptCreation(f), adoptCreation(other), f.parent.cancel()]),
    successful = results.filter((x) => x.status === 'fulfilled');
  assert.equal(successful.length, 1);
  let p = await f.parent.get();
  if (p.phase === 'adopted') {
    assert.equal((await data('books/book')).localLoreVersion, 1);
    assert.equal((await admin.doc(f.headPath).get()).exists, true);
    assert.equal(p.adoption.editId, results[0].status === 'fulfilled' ? f.editId : other.editId);
    await assert.rejects(() => f.parent.cancel());
    await finishBook(f);
    assert.equal((await f.parent.get()).phase, 'adopted');
  } else {
    p = await finishCreationUploads(f.parent, p);
    assert.equal(p.phase, 'cancelled');
    assert.equal((await admin.doc(f.headPath).get()).exists, false);
    assert.equal(Object.hasOwn(await data('books/book'), 'localLoreVersion'), false);
  }
});
test('SDK creation activation rolls every writer back with a failed head write and retries safely', async () => {
  const f = await creationAdoptionFixture(admin),
    before = await data(f.c.path),
    root = await data('books/book'),
    run = admin.runTransaction.bind(admin);
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'create')
              return (ref, v) => {
                target.create(ref, v);
                if (ref.path === f.headPath) throw Error('injected creation head failure');
              };
            const method = target[key];
            return typeof method === 'function' ? method.bind(target) : method;
          },
        }),
      ),
    );
  await assert.rejects(() => adoptCreation(f), /injected/);
  admin.runTransaction = run;
  assert.deepEqual(await data(f.c.path), before);
  assert.deepEqual(await data('books/book'), root);
  assert.equal((await f.parent.get()).phase, 'preparing');
  for (const suffix of ['/adoptions/current', '/adoptionProofs/current'])
    assert.equal((await admin.doc(f.parent.c.path + suffix).get()).exists, false);
  assert.equal((await admin.doc(f.headPath).get()).exists, false);
  assert.equal(
    (await data('books/book/bookLoreGenerations/' + before.generationId + '/state/current')).phase,
    'preparing',
  );
  assert.equal((await adoptCreation(f)).progress.phase, 'adopted');
  await finishBook(f);
  assert.equal((await f.parent.get()).phase, 'adopted');
});
test('SDK creation activation requires original native proof and head births while historical success never recreates the head', async () => {
  for (const artifact of ['head', 'adoption-proof']) {
    const f = await creationAdoptionFixture(admin, {
      creationId: 'sdk-birth-' + artifact,
      editId: 'sdk-attempt-' + artifact,
    });
    await adoptCreation(f);
    const p = await f.parent.get(),
      path = artifact === 'head' ? f.headPath : f.parent.c.path + '/adoptionProofs/current',
      old = await admin.doc(path).get();
    await admin.doc(path).delete();
    await admin.doc(path).create(old.data());
    await assert.rejects(() => get(f));
    assert.deepEqual(await data(path), old.data());
    if (artifact === 'head') {
      assert.deepEqual(await f.parent.get(), p);
      await admin.doc(f.headPath).delete();
      assert.equal((await adoptCreation(f)).receipt.phase, 'adopted');
      assert.equal((await admin.doc(f.headPath).get()).exists, false);
    } else {
      await assert.rejects(() => f.parent.get());
      await assert.rejects(() => adoptCreation(f));
    }
  }
});

test('SDK missing creator activation proofs deny receipt-only confirmation after preserving complete history through book deletion', async () => {
  const f = await creationAdoptionFixture(admin);
  await adoptCreation(f);
  const p = await f.parent.get();
  assert.equal((await get(f)).id, f.loreId);
  await finishBook(f);
  assert.deepEqual(await f.parent.get(), p);
  assert.equal((await adoptCreation(f)).receipt.phase, 'adopted');
  const request = { editId: f.editId, startHash: f.startHash };
  assert.equal((await f.factory().getBookLoreEditReservation(f.uid, request)).phase, 'adopted');
  await admin.runTransaction(async (tx) => {
    tx.delete(admin.doc(f.parent.c.path + '/adoptions/current'));
    tx.delete(admin.doc(f.parent.c.path + '/adoptionProofs/current'));
  });
  await assert.rejects(() => adoptCreation(f));
  await assert.rejects(() => f.factory().getBookLoreEditReservation(f.uid, request));
  assert.equal((await admin.doc(f.headPath).get()).exists, false);
  assert.equal((await admin.doc('books/book').get()).exists, false);
});
