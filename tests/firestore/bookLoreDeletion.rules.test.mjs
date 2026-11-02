import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import { before, beforeEach, after, test } from 'node:test';
import {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds,
} from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, updateDoc } from 'firebase/firestore';
import {
  adoptionFixture,
  adoptFixture,
} from '../../functions/test/helpers/bookLoreEditAdoptionFixture.mjs';
import {
  compilationFixture,
  advanceCompilation,
} from '../../functions/test/helpers/bookLoreEditCompilationFixture.mjs';
import {
  fieldUploadFixture,
  uploadAll,
} from '../../functions/test/helpers/bookLoreFieldUploadFixture.mjs';
import {
  sourceInspectionFixture,
  inspectionControl,
} from '../../functions/test/helpers/bookLoreSourceInspectionFixture.mjs';
import { getEditReservation } from '../../functions/test/helpers/bookLoreEditReservationFixture.mjs';
import { seedBookLoreRead } from '../../functions/test/helpers/bookLoreReadFixture.mjs';
import {
  bookLoreDeletionFixture,
  markBookDeleting,
  finishBookLoreDeletion,
} from '../../functions/test/helpers/bookLoreDeletionFixture.mjs';
import { resourcePayloadChunkPath } from '../../functions/src/bookResourcePayloadPaths.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-book-lore-deletion';
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
const deletionState = (f) => data(f.path + '/state/current');
const empty = async (f) => {
  for (const name of ['lore', 'bookLoreSegments', 'bookResourceBodies', 'bookResourceChunks'])
    assert.equal(
      (
        await admin
          .collection('books/' + f.bookId + '/' + name)
          .select()
          .limit(1)
          .get()
      ).empty,
      true,
      name,
    );
};
async function until(f, condition) {
  for (let i = 0; i < 1000; i++) {
    if (condition(await deletionState(f))) return;
    await f.step();
  }
  throw Error('Deletion checkpoint not reached');
}
async function adopted(options = {}) {
  const f = await adoptionFixture(admin, { mode: 'inline', ...options });
  await adoptFixture(f);
  return { ...f, ...bookLoreDeletionFixture(admin, { uid: f.uid, bookId: f.bookId }) };
}
async function snapshotOf(paths) {
  return Promise.all(
    paths.map(async (path) => {
      const s = await admin.doc(path).get();
      return {
        path,
        exists: s.exists,
        value: s.data(),
        birth: s.createTime?.toMillis(),
        update: s.updateTime?.toMillis(),
      };
    }),
  );
}

test('SDK deletes an adopted book atomically, resumes aliases and preserves success and private fences', async () => {
  const f = await adopted(),
    root = 'books/' + f.bookId,
    publicPath = 'publicBooks/' + f.bookId,
    revisionPath = publicPath + '/revisions/old',
    client = env.authenticatedContext(f.uid).firestore(),
    anonymous = env.unauthenticatedContext().firestore();
  await admin
    .doc(root)
    .update({ status: 'published', publicationPrivacyVersion: 0, historyRevision: 0 });
  await admin.doc(publicPath).create({ revisionId: 'old' });
  await admin
    .doc(revisionPath)
    .create({ createdAt: 1000, chapterCount: 0, loreCount: 1, privacyVersion: 0 });
  await assertSucceeds(getDoc(doc(anonymous, publicPath)));
  await assert.rejects(() => f.step());
  assert.equal((await admin.doc(f.path).get()).exists, false);
  await markBookDeleting(f);
  await assertFails(getDoc(doc(anonymous, publicPath)));
  await assertFails(getDoc(doc(anonymous, revisionPath)));
  await assertFails(updateDoc(doc(client, root), { deleting: false }));
  await until(f, (s) => s?.phase === 'bodies' && s.body !== null);
  const s = await deletionState(f),
    body = s.body,
    inventory = root + '/bookResourceInventory/' + body.bodyId + '/state/current',
    chunk = resourcePayloadChunkPath(f.bookId, body.bodyId, body.index),
    outer = 'users/' + f.uid + '/sceneOperations/' + f.operationId,
    paths = [root, f.path, f.path + '/state/current', outer, inventory, chunk],
    before = await snapshotOf(paths),
    run = admin.runTransaction.bind(admin);
  assert.equal((await data(inventory)).phase, 'collecting');
  admin.runTransaction = (fn) =>
    run((tx) =>
      fn(
        new Proxy(tx, {
          get(target, key) {
            if (key === 'set')
              return (ref, ...args) => {
                const result = target.set(ref, ...args);
                if (ref.path === outer) throw Error('injected SDK deletion failure');
                return result;
              };
            const value = Reflect.get(target, key, target);
            return typeof value === 'function' ? value.bind(target) : value;
          },
        }),
      ),
    );
  try {
    await assert.rejects(() => f.step(), /injected SDK deletion failure/);
  } finally {
    admin.runTransaction = run;
  }
  assert.deepEqual(await snapshotOf(paths), before);
  const operationId = f.operationId;
  f.request.operationId = 'alias-delete-operation';
  const result = await finishBookLoreDeletion(f);
  assert.equal(result.complete, true);
  await empty(f);
  assert.equal((await admin.doc(root).get()).exists, false);
  assert.equal((await data(f.path)).operationId, operationId);
  assert.equal(
    (await data('users/' + f.uid + '/sceneOperations/alias-delete-operation')).checkpointId,
    operationId,
  );
  assert.equal((await getEditReservation(f)).phase, 'adopted');
  for (const collection of ['bookResourceLeases', 'bookResourceInventory', 'bookLoreGenerations'])
    assert.equal(
      (
        await admin
          .collection(root + '/' + collection)
          .select()
          .limit(1)
          .get()
      ).empty,
      false,
      collection,
    );
  assert.equal((await data(inventory)).phase, 'collected');
  assert.equal((await admin.doc('deletedBooks/' + f.bookId).get()).exists, true);
  await assertFails(getDoc(doc(client, f.path)));
  await assertFails(setDoc(doc(client, f.path), { schemaVersion: 1 }));
  await assertFails(getDoc(doc(client, f.path + '/state/current')));
  await assertFails(setDoc(doc(client, f.path + '/events/forged'), {}));
  assert.deepEqual(await f.step(), result);
  assert.equal((await admin.doc(root).get()).exists, false);
});

test('SDK cancellation of partial inline work, standalone upload and inspection commits with the book cursor', async () => {
  const base = await compilationFixture(admin, {
    mode: 'inline',
    changes: [],
    removals: ['summary'],
    sourceOptions: { data: { name: 'N', category: 'other', details: 'x'.repeat(100000) } },
  });
  let p = base.progress,
    child;
  for (let i = 0; i < 1000; i++) {
    const j = await data(base.c.path),
      w = j.compilation?.inlineWork;
    child = w ? await data('users/author/bookLoreFieldUploads/' + w.uploadId) : null;
    if (w?.target.field === 'details' && child?.nextIndex > 0 && child.phase === 'uploading') break;
    p = (await advanceCompilation(base, p)).progress;
  }
  assert.equal(child?.phase, 'uploading');
  assert.ok(child.nextIndex > 0);
  const ordinary = await fieldUploadFixture(admin, {
    loreId: 'other-lore',
    uploadId: 'ordinary-upload',
    value: 'x'.repeat(100000),
  });
  await uploadAll(ordinary);
  const inspection = await sourceInspectionFixture(admin, {
      inspectionId: 'pending-inspection',
      existingSeed: base.source.seed,
    }),
    started = await inspection
      .factory()
      .startBookLoreSourceInspection(inspection.uid, inspection.intent);
  await inspection
    .factory()
    .advanceBookLoreSourceInspection(inspection.uid, inspectionControl(inspection, started));
  const f = { ...base, ...bookLoreDeletionFixture(admin) };
  await markBookDeleting(f);
  await finishBookLoreDeletion(f);
  await empty(f);
  assert.equal((await getEditReservation(base)).phase, 'cancelled');
  assert.equal((await data(ordinary.c.path)).phase, 'cancelled');
  assert.equal((await data(inspection.c.path)).phase, 'cancelled');
  assert.equal((await admin.doc(inspection.c.stateRef.path).get()).exists, false);
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.ok((await deletionState(f)).coordinatedUnits > 0);
});

test('SDK removes a legacy body above 128 parts in bounded batches with its header last', async () => {
  const seed = await seedBookLoreRead(admin, {
      data: { name: 'N', category: 'other', details: '🌙'.repeat(2300000) },
    }),
    f = bookLoreDeletionFixture(admin),
    count = seed.base.prepared.manifest.chunkCount;
  assert.ok(count > 128);
  await markBookDeleting(f);
  let before = count,
    complete = false,
    removed = 0;
  for (let i = 0; i < 1000; i++) {
    const result = await f.step(),
      current = (
        await admin
          .collection('books/book/bookResourceChunks')
          .select()
          .limit(count + 1)
          .get()
      ).size;
    assert.ok(before - current >= 0 && before - current <= 16);
    if (current > 0) assert.equal((await admin.doc(seed.base.path).get()).exists, true);
    if (before > current) removed += before - current;
    before = current;
    if (result.complete) {
      complete = true;
      break;
    }
  }
  assert.equal(complete, true);
  assert.equal(removed, count);
  await empty(f);
  assert.equal((await admin.doc('books/book').get()).exists, false);
});

for (const artifact of ['body', 'part'])
  test(
    'SDK native birth prevents a recreated ' + artifact + ' from joining an earlier deletion',
    async () => {
      const f = await adopted();
      await markBookDeleting(f);
      await until(f, (s) => s?.phase === 'bodies' && s.body !== null);
      const body = (await deletionState(f)).body,
        path =
          artifact === 'body'
            ? 'books/' + f.bookId + '/bookResourceBodies/' + body.bodyId
            : resourcePayloadChunkPath(f.bookId, body.bodyId, body.index),
        ref = admin.doc(path),
        before = await ref.get(),
        value = before.data();
      await ref.delete();
      await ref.create(value);
      const recreated = await ref.get();
      assert.equal(recreated.createTime.isEqual(before.createTime), false);
      await assert.rejects(() => f.step());
      assert.deepEqual((await ref.get()).data(), value);
      assert.equal((await admin.doc('books/' + f.bookId).get()).exists, true);
    },
  );
