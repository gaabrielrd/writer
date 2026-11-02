import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc } from 'firebase/firestore';
import {
  applicationPreparationFixture,
  prepareApplication,
  cleanupApplication,
} from '../../functions/test/helpers/loreAnalysisApplicationPreparationFixture.mjs';
import { applicationPaths } from '../../functions/src/loreAnalysisApplicationContracts.mjs';
import {
  applicationChildren,
  analysisChildPaths,
} from '../../functions/src/loreAnalysisApplicationChildContracts.mjs';
import { loadApplication } from '../../functions/src/loreAnalysisApplicationStore.mjs';
import { readPreparedApplicationMember } from '../../functions/src/loreAnalysisApplicationProduction.mjs';
import { createBookLoreEditAdoptionService } from '../../functions/src/bookLoreEditAdoption.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from '../../functions/test/helpers/bookLoreDeletionFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-analysis-preparation';
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
const payloadIds = async () =>
  (await admin.collection('books/book/bookResourceBodies').orderBy('__name__').get()).docs.map(
    (d) => d.id,
  );
async function preparedReference(f, index) {
  return admin.runTransaction(async (tx) => {
    const l = await loadApplication(tx, applicationPaths(admin, f.uid, f.control.id), f.control);
    return readPreparedApplicationMember(tx, l, index);
  });
}
async function until(f, predicate, p = f.initial) {
  for (let index = 0; index < 2000; index++) {
    if (await predicate(p)) return p;
    p = (await f.step(p)).progress;
  }
  throw Error('Native milestone not reached');
}
test('SDK 50 mixed members reach ready with native child bindings and cleanup after revocation, without application or debit', async () => {
  const changes = [
      { scope: 'local', entityId: 'arthur', input: { summary: '\ufeffConfirmed 🌙' } },
      { scope: 'local', input: { name: 'New local', category: 'location', summary: 'Port' } },
      { scope: 'global', entityId: 'universe:world:global', input: { summary: 'Global changed' } },
      ...Array.from({ length: 47 }, (_, index) => ({
        scope: 'global',
        input: { name: 'Global new ' + index, category: 'other', summary: 'Summary ' + index },
      })),
    ],
    f = await applicationPreparationFixture(admin, { mode: 'v2', globals: true, changes }),
    source = await data(f.seed.path),
    originalPayloads = await payloadIds(),
    [a, b] = await Promise.all([f.step(f.initial), f.step(f.initial)]);
  assert.deepEqual(a, b);
  const ready = await prepareApplication(f, a.progress),
    context = await data(f.path);
  assert.equal(ready.preparedCount, 50);
  assert.equal((await data('users/author')).credits, 5);
  assert.equal((await data('books/book')).localLoreVersion, 0);
  assert.equal((await data('universes/world')).loreVersion, 0);
  assert.deepEqual(await data(f.seed.path), source);
  assert.equal(
    (await admin.doc('books/book/lore/' + context.members[1].targetId).get()).exists,
    false,
  );
  for (const child of applicationChildren(context)) {
    const at = analysisChildPaths(admin, f.uid, child),
      [root, owner, proof] = await Promise.all([at.root.get(), at.owner.get(), at.proof.get()]),
      event = await admin
        .doc(f.path + '/events/' + String(owner.data().unitRevision).padStart(16, '0'))
        .get();
    assert.equal(root.createTime.isEqual(owner.createTime), true);
    assert.equal(proof.createTime.isEqual(owner.createTime), true);
    assert.equal(event.createTime.isEqual(owner.createTime), true);
  }
  const reference = await preparedReference(f, 1);
  await assert.rejects(() =>
    createBookLoreEditAdoptionService({ db: admin }).adoptBookLoreEditGeneration(
      f.uid,
      reference.edit,
    ),
  );
  const firstChild = applicationChildren(context)[0],
    at = analysisChildPaths(admin, f.uid, firstChild);
  for (const client of [
    env.authenticatedContext(f.uid).firestore(),
    env.unauthenticatedContext().firestore(),
  ]) {
    await assertFails(getDoc(doc(client, at.owner.path)));
    await assertFails(setDoc(doc(client, at.owner.path), { forged: true }));
    await assertFails(deleteDoc(doc(client, at.proof.path)));
    await assertFails(getDoc(doc(client, f.path + '/prepared/0001')));
  }
  await admin.doc('books/book').update({ authorId: 'other' });
  assert.equal((await cleanupApplication(f)).phase, 'cancelled');
  assert.deepEqual(await payloadIds(), originalPayloads);
  assert.deepEqual(await data(f.seed.path), source);
  assert.equal((await data('users/author')).credits, 5);
  const replay = await f.step(f.initial);
  assert.deepEqual(replay.receipt, a.receipt);
  assert.equal(replay.progress.phase, 'cancelled');
});
test('SDK native parent checkpoint failure rolls back an appended part, then retry and whole-book cleanup preserve receipts', async () => {
  const f = await applicationPreparationFixture(admin),
    context = await data(f.path),
    m = context.members[0],
    fieldPath = 'users/author/bookLoreFieldUploads/' + m.children.uploads[0].uploadId,
    p = await until(f, async () => (await data(fieldPath))?.phase === 'uploading'),
    originalRoot = await data(fieldPath),
    originalState = await data(f.path + '/state/current'),
    collision = admin.doc('collisions/occupied'),
    run = admin.runTransaction.bind(admin);
  await collision.create({ occupied: true });
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'update')
              return (ref, value) => {
                target.update(ref, value);
                if (ref.path === f.path + '/state/current')
                  target.create(collision, { forceFailure: true });
                return target;
              };
            const value = target[key];
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
      ),
    );
  try {
    await assert.rejects(
      () => f.step(p),
      (error) => error.code === 6,
    );
  } finally {
    admin.runTransaction = run;
  }
  assert.deepEqual(await data(fieldPath), originalRoot);
  assert.deepEqual(await data(f.path + '/state/current'), originalState);
  const chunks = await admin
    .collection('books/book/bookResourceChunks')
    .where('bodyId', '==', originalRoot.context.manifest.bodyId)
    .get();
  assert.equal(chunks.empty, true);
  const success = await f.step(p),
    state = await admin.doc(f.path + '/state/current').get(),
    field = await admin.doc(fieldPath).get(),
    part = (
      await admin
        .collection('books/book/bookResourceChunks')
        .where('bodyId', '==', originalRoot.context.manifest.bodyId)
        .get()
    ).docs[0];
  assert.equal(part.createTime.isEqual(state.updateTime), true);
  assert.equal(field.updateTime.isEqual(state.updateTime), true);
  const deletion = bookLoreDeletionFixture(admin);
  await markBookDeleting(deletion);
  assert.equal((await finishBookLoreDeletion(deletion)).complete, true);
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.equal((await payloadIds()).length, 0);
  assert.equal((await f.get()).phase, 'cancelled');
  assert.deepEqual((await f.step(p)).receipt, success.receipt);
  assert.equal((await data('users/author')).credits, 5);
});
test('SDK owner proof recreation prevents production and cleanup from claiming the foreign replacement', async () => {
  const f = await applicationPreparationFixture(admin),
    p = (await f.step(f.initial)).progress,
    context = await data(f.path),
    child = applicationChildren(context)[0],
    at = analysisChildPaths(admin, f.uid, child),
    [owner, proof] = await Promise.all([at.owner.get(), at.proof.get()]);
  await admin.runTransaction(async (tx) => {
    tx.delete(at.owner);
    tx.delete(at.proof);
  });
  await admin.runTransaction(async (tx) => {
    tx.create(at.owner, owner.data());
    tx.create(at.proof, proof.data());
  });
  await assert.rejects(() => f.step(p));
  let current = await f.cancel(),
    blocked = false;
  assert.equal(current.phase, 'cancelling');
  for (let index = 0; index < 10 && !blocked; index++) {
    try {
      current = (await f.cleanupStep(current)).progress;
    } catch (error) {
      assert.equal(error.code, 'failed-precondition');
      blocked = true;
    }
  }
  assert.equal(blocked, true);
  assert.deepEqual(await data(at.owner.path), owner.data());
  assert.equal((await f.get()).phase, 'cancelling');
  assert.equal((await data('users/author')).credits, 5);
});
