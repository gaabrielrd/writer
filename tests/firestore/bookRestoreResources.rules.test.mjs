import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, collection, getDocs } from 'firebase/firestore';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { BOOK_RESTORE_NATIVE_V4 } from '../../functions/src/bookRestoreArtifacts.mjs';
import { bookRestoreResourcePath } from '../../functions/src/bookRestoreResourcePaths.mjs';
import {
  resourcesRestoreFixture,
  finishRestoreResources,
} from '../../functions/test/helpers/bookRestoreResourcesFixture.mjs';
import { uploadArchiveRestore } from '../../functions/test/helpers/bookRestoreContentFixture.mjs';
import { finishRestoreStructure } from '../../functions/test/helpers/bookRestoreStructureFixture.mjs';
import { finishRestoreLore } from '../../functions/test/helpers/bookRestoreLoreFixture.mjs';
import { bookLegacyFixture } from '../../functions/test/helpers/bookLegacyFixture.mjs';
import { hash } from '../../functions/test/helpers/bookContentFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  cleanupLegacyRestore,
  legacyMutation as mutation,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-restore-resources',
  uid = 'author',
  id = 'restore-resources-sdk01',
  root = 'users/' + uid + '/bookRestores/' + id;
let env,
  admin,
  api,
  deletes = [];
const factory = () =>
  createBookRestoreUploadService({
    db: {
      doc: (...a) => admin.doc(...a),
      collection: (...a) => admin.collection(...a),
      async runTransaction(fn) {
        let removed;
        const result = await admin.runTransaction(async (tx) => {
          removed = [];
          const observed = new Proxy(tx, {
            get(target, key) {
              if (key === 'delete')
                return (ref) => {
                  removed.push(ref.path);
                  return tx.delete(ref);
                };
              const member = Reflect.get(target, key, target);
              return typeof member === 'function' ? member.bind(target) : member;
            },
          });
          return fn(observed);
        });
        deletes.push(removed);
        return result;
      },
    },
  });
before(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(host ?? '')) throw new Error('Use a local demo emulator.');
  const [address, port] = host.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host: address,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host, ssl: false, universeDomain: 'googleapis.com' });
  api = factory();
});
beforeEach(async () => {
  await env.clearFirestore();
  deletes = [];
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
async function ready() {
  const { progress } = await uploadArchiveRestore(
      api,
      uid,
      id,
      resourcesRestoreFixture({ duplicates: true }),
    ),
    validated = await finishLegacyRestore(factory, uid, id, progress),
    structure = await finishRestoreStructure(factory, uid, id, validated);
  return finishRestoreLore(factory, uid, id, structure);
}
test('SDK materializes every resource and derived index with native receipts, private access and child-first bounded cleanup', async () => {
  const initial = await ready(),
    request = mutation(id, initial, 'resources-sdk-first01'),
    first = await api.advanceBookRestoreResources(uid, request),
    p = await finishRestoreResources(factory, uid, id, first.progress),
    base = 'books/' + p.bookId,
    journals = await admin.collection(root + '/materializationArtifacts').get();
  assert.equal((await admin.doc(base).get()).exists, false);
  assert.equal((await admin.doc(base + '/workProgress/current').get()).data().countReady, false);
  assert.equal(journals.size, p.preparation.artifactCount);
  assert.equal(p.preparation.resourceCounts['scene-reference'], 3);
  assert.equal((await admin.collection(base + '/sceneLoreLinks').get()).size, 2);
  let bodyPath;
  for (const journal of journals.docs) {
    const data = journal.data(),
      suffix =
        data.kind === 'lore'
          ? 'lore/' + data.id
          : BOOK_RESTORE_NATIVE_V4[data.kind]
            ? BOOK_RESTORE_NATIVE_V4[data.kind] + '/' + data.id
            : bookRestoreResourcePath(data.kind, data.id),
      value = await admin.doc(base + '/' + suffix).get(),
      born = await admin
        .doc('users/' + uid + '/bookRestoreOperations/' + data.createdByOperationId)
        .get(),
      latest = await admin
        .doc('users/' + uid + '/bookRestoreOperations/' + data.lastOperationId)
        .get();
    assert.ok(value.createTime.isEqual(journal.createTime));
    assert.ok(value.createTime.isEqual(born.createTime));
    assert.ok(value.updateTime.isEqual(journal.updateTime));
    assert.ok(value.updateTime.isEqual(latest.createTime));
    if (data.kind === 'scene-body') bodyPath = value.ref.path;
  }
  assert.ok(bodyPath);
  for (const actor of [
    env.authenticatedContext(uid),
    env.authenticatedContext('other'),
    env.unauthenticatedContext(),
  ]) {
    const db = actor.firestore();
    await assertFails(getDoc(doc(db, bodyPath)));
    await assertFails(setDoc(doc(db, bodyPath), { content: 'replace' }));
    await assertFails(getDocs(collection(db, base + '/scenes')));
    await assertFails(getDocs(collection(db, base + '/arcs')));
    await assertFails(getDoc(doc(db, journals.docs[0].ref.path)));
  }
  await admin.doc('books/other/scenes/keep/body/current').set({ content: 'preserve' });
  deletes = [];
  const terminal = await cleanupLegacyRestore(api, uid, id, p, { limit: 3 });
  assert.equal(terminal.preparation.cleanedArtifacts, p.preparation.artifactCount);
  const native = deletes.flatMap((paths) => {
    const selected = paths.filter((path) => path.startsWith(base + '/'));
    assert.ok(selected.length <= 3);
    return selected;
  });
  for (const parent of native.filter((p) => /^books\/[^/]+\/(scenes|arcs)\/[^/]+$/.test(p)))
    for (const child of native.filter((p) => p.startsWith(parent + '/')))
      assert.ok(native.indexOf(child) < native.indexOf(parent));
  for (const name of [
    'scenes',
    'arcs',
    'timelineEvents',
    'sceneControls',
    'sceneSources',
    'sceneLoreLinks',
    'narrativeLinks',
    'narrativeControls',
  ])
    assert.equal((await admin.collection(base + '/' + name).get()).empty, true);
  assert.equal(
    (await admin.doc('books/other/scenes/keep/body/current').get()).data().content,
    'preserve',
  );
  const replay = await api.advanceBookRestoreResources(uid, request);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.state, 'cancelled');
});
test('SDK refuses an oversized scene body atomically and preserves its full validated source for later representation', async () => {
  const legacy = bookLegacyFixture(5),
    scene = legacy.scenes.scenes[0];
  scene.content = '\ufeff' + '🌙'.repeat(280000);
  scene.bodyHash = hash(scene.content);
  scene.bodyBytes = Buffer.byteLength(scene.content);
  const uploaded = await uploadLegacyRestore(api, uid, id, legacy),
    validated = await finishLegacyRestore(factory, uid, id, uploaded.progress),
    structure = await finishRestoreStructure(factory, uid, id, validated);
  let p = await finishRestoreLore(factory, uid, id, structure),
    item,
    unit = 0;
  while (true) {
    const reader = await api.openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: p.jobToken,
    });
    item = await reader.readMappedItem(p.preparation.itemIndex);
    if (item.record.kind === 'book-scene-body') break;
    p = (
      await api.advanceBookRestoreResources(uid, mutation(id, p, 'resources-sdk-before-' + unit++))
    ).progress;
    assert.ok(unit < 100);
  }
  const before = await admin.doc(root).get(),
    request = mutation(id, p, 'resources-sdk-big-body01');
  await assert.rejects(
    () => api.advanceBookRestoreResources(uid, request),
    (error) =>
      error.code === 3 && /longer than|exceeds.*maximum|maximum.*size/i.test(error.message),
  );
  const after = await admin.doc(root).get();
  assert.deepEqual(after.data(), before.data());
  assert.ok(after.updateTime.isEqual(before.updateTime));
  const reader = await api.openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: p.jobToken,
    }),
    current = await reader.readMappedItem(p.preparation.itemIndex);
  assert.equal(current.value.data.content, scene.content);
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId).get())
      .exists,
    false,
  );
  assert.equal(
    (
      await admin
        .doc('books/' + p.bookId + '/scenes/' + item.value.parentId + '/body/current')
        .get()
    ).exists,
    false,
  );
  await cleanupLegacyRestore(api, uid, id, p, { limit: 7 });
});
test('SDK keeps an unproven recreated child when cancellation happens before its parent is materialized', async () => {
  const initial = await ready(),
    p = (
      await api.advanceBookRestoreResources(uid, mutation(id, initial, 'resources-sdk-orphan01'))
    ).progress,
    journal = (
      await admin
        .collection(root + '/materializationArtifacts')
        .where('kind', '==', 'scene-body')
        .get()
    ).docs[0],
    target = admin.doc(
      'books/' + p.bookId + '/' + bookRestoreResourcePath('scene-body', journal.data().id),
    ),
    snapshot = await target.get();
  assert.equal((await admin.doc(target.path.split('/body/')[0]).get()).exists, false);
  await target.delete();
  await target.create(snapshot.data());
  const q = (await api.cancelBookRestore(uid, mutation(id, p, 'resources-sdk-orphan02'))).progress,
    before = await admin.doc(root).get();
  await assert.rejects(() =>
    api.advanceBookRestoreCleanup(uid, mutation(id, q, 'resources-sdk-orphan03', { limit: 50 })),
  );
  assert.deepEqual((await admin.doc(root).get()).data(), before.data());
  assert.equal((await target.get()).exists, true);
  assert.equal((await journal.ref.get()).exists, true);
});
