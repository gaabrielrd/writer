import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createBookRestoreUploadService } from '../../functions/src/bookRestoreUpload.mjs';
import { createWorkHistoryService } from '../../functions/src/workHistory.mjs';
import {
  readyRestoreDraft,
  finishRestoreDraft,
  draftRestoreFixture,
} from '../../functions/test/helpers/bookRestoreDraftFixture.mjs';
import {
  legacyMutation as mutation,
  cleanupLegacyRestore,
} from '../../functions/test/helpers/bookLegacyRestoreFixture.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-finalize-draft',
  uid = 'author',
  id = 'finalize-draft-sdk01',
  root = 'users/' + uid + '/bookRestores/' + id;
let env, admin, api;
const factory = () => createBookRestoreUploadService({ db: admin });
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
});
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
const ready = async (options = {}) =>
  finishRestoreDraft(
    factory,
    uid,
    id,
    await readyRestoreDraft(factory, uid, id, draftRestoreFixture(options)),
  );
test('SDK finalizes exact counted draft metadata once, rolls back occupied header and preserves native bodies', async () => {
  const content = '\ufeff<p>Um <b>dois</b></p><script>hidden words</script><p>três 🌙</p>',
    initial = await ready({ content }),
    versionId = initial.preparation.draft.versionId,
    ref = admin.doc('books/' + initial.bookId + '/workVersions/' + versionId),
    before = await admin.doc(root).get(),
    bodies = await admin
      .collection('books/' + initial.bookId + '/workVersionBodies')
      .where('versionId', '==', versionId)
      .get(),
    request = mutation(id, initial, 'draft-sdk-finalize01');
  await ref.create({ foreign: true });
  await assert.rejects(() => api.finalizeBookRestoreDraft(uid, request));
  const unchanged = await admin.doc(root).get();
  assert.deepEqual(unchanged.data(), before.data());
  assert.ok(unchanged.updateTime.isEqual(before.updateTime));
  assert.equal((await ref.get()).data().foreign, true);
  assert.equal(
    (await admin.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId).get())
      .exists,
    false,
  );
  await ref.delete();
  const response = await api.finalizeBookRestoreDraft(uid, request),
    p = response.progress,
    version = await ref.get(),
    journals = await admin
      .collection(root + '/materializationArtifacts')
      .where('kind', '==', 'history-version')
      .get(),
    journal = journals.docs.find((d) => d.data().id === versionId),
    receipt = await admin
      .doc('users/' + uid + '/bookRestoreOperations/' + request.operationId)
      .get();
  assert.equal(p.preparation.phase, 'cover');
  assert.equal(version.data().wordCount, 3);
  assert.equal(version.data().draft.chapter.createdAt, 111);
  assert.equal(version.data().draft.persona.instructions, '\ufeff  Draft exact\nOnly here  ');
  assert.ok(version.createTime.isEqual(journal.createTime));
  assert.ok(version.createTime.isEqual(receipt.createTime));
  for (const body of bodies.docs)
    assert.ok((await body.ref.get()).updateTime.isEqual(body.updateTime));
  assert.deepEqual((await api.finalizeBookRestoreDraft(uid, request)).receipt, response.receipt);
  assert.equal((await admin.doc('books/' + p.bookId).get()).exists, false);
  // Synthetic root proves the existing readers; production activation is still pending.
  const book = admin.doc('books/' + p.bookId),
    target = { kind: 'book', id: p.bookId },
    history = createWorkHistoryService({ db: admin });
  await book.create({ authorId: uid, title: 'Synthetic root' });
  const read = await history.readWorkVersion(uid, { target, versionId });
  assert.equal(read.chunks.map((c) => c.content).join(''), content);
  const listed = await history.listWorkVersions(uid, { target, order: 'id', limit: 50 });
  assert.deepEqual(listed.items.find((v) => v.id === versionId).draft, read.version.draft);
  await assert.rejects(() => history.readWorkVersion('other', { target, versionId }));
  await book.delete();
  const terminal = await cleanupLegacyRestore(api, uid, id, p, { limit: 5 });
  assert.equal(terminal.state, 'cancelled');
  assert.equal((await ref.get()).exists, false);
  assert.deepEqual((await api.finalizeBookRestoreDraft(uid, request)).receipt, response.receipt);
});
test('SDK final masked proof refuses a body recreated after counted reading before the version commit', async () => {
  const initial = await ready({ content: 'a'.repeat(70000) }),
    run = admin.runTransaction.bind(admin),
    request = mutation(id, initial, 'draft-sdk-final-aba02'),
    path = 'books/' + initial.bookId + '/workVersions/' + initial.preparation.draft.versionId;
  let injected = false;
  admin.runTransaction = async (operation, ...args) => {
    const result = await run(operation, ...args);
    if (!injected && result?.ref?.path?.includes('/workVersionBodies/')) {
      injected = true;
      await result.ref.delete();
      await result.ref.create(result.value);
    }
    return result;
  };
  try {
    await assert.rejects(() => api.finalizeBookRestoreDraft(uid, request));
    assert.equal(injected, true);
    assert.equal((await admin.doc(path).get()).exists, false);
    assert.equal((await admin.doc(root).get()).data().checkpoint, initial.checkpoint);
    assert.equal(
      (await admin.doc('users/' + uid + '/bookRestoreOperations/' + request.operationId).get())
        .exists,
      false,
    );
  } finally {
    admin.runTransaction = run;
  }
});
