import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createDeletionChat } from '../../functions/test/helpers/adventureDeletionChatFixture.mjs';
import { createAdventureDeletionService } from '../../functions/src/adventureDeletion.mjs';
import { createStudioService } from '../../functions/src/studio.mjs';
import { createWorkProgressService } from '../../functions/src/workProgress.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';
import { adventureImageUseKey } from '../../functions/src/adventureBlockImages.mjs';
const require = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = require('firebase-admin/firestore'),
  uid = 'author',
  projectId = 'demo-writer-deletion-final';
let env, db, api;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? '')) throw Error('Local demo emulator only');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  db = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
  api = createAdventureDeletionService({ db });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await db?.terminate();
  await env?.cleanup();
});
const step = (p) => ({
  deletionId: p.deletionId,
  deletionToken: p.deletionToken,
  expectedCheckpoint: p.checkpoint,
  operationId: 'native-final-step-' + String(p.checkpoint).padStart(8, '0'),
});
const job = (p) => db.doc('users/' + uid + '/adventureDeletions/' + p.deletionId);
const reservation = (p) => db.doc('adventureDeletionReservations/' + p.adventureId);
async function begin(target) {
  const s = await api.getAdventureDeletionSource(uid, { adventureId: target.id }),
    input = {
      adventureId: target.id,
      adventureToken: s.adventureToken,
      sourceToken: s.sourceToken,
      expectedRevision: s.revision,
      operationId: 'native-final-start-0001',
    };
  const initial = await api.startAdventureDeletion(uid, input);
  return { input, initial };
}
async function drive(p, done) {
  for (let n = 0; !(await done(p)); n++) {
    assert.ok(n < 1000);
    p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  }
  return p;
}
const terminal = (p) =>
  drive(p, async (v) => v.phase === 'verify' && (await job(v).get()).data().part === 4);
const finish = (p) => drive(p, (v) => v.complete);

test('native terminal commit converges concurrently, preserves a later book and readable questions, and rejects a recreated root', async () => {
  const own = await createDeletionChat(db, { prefix: 'a-native-final', generation: 'byok' }),
    question = await db.doc(own.questionPath).get(),
    { input, initial } = await begin(own.target),
    book = await createDeletionChat(db, {
      kind: 'book',
      prefix: 'z-native-final-book',
      generation: 'byok',
    });
  // Declared storage fixtures exercise multiple account pages with real native clocks.
  const body = (await db.doc(book.bodyPath).get()).data(),
    head = (await db.doc(book.parent + '/turns/' + book.turn.turnId).get()).data(),
    batch = db.batch();
  for (let n = 0; n < 12; n++) {
    const turnId = 'native-book-extra-' + String(n).padStart(3, '0');
    batch.create(db.doc(book.parent + '/turnBodies/' + turnId), { ...body, turnId });
    batch.create(db.doc(book.parent + '/turns/' + turnId), {
      ...head,
      turnId,
      summary: { ...head.summary, turnId },
    });
  }
  await batch.commit();
  const kept = await db.doc(book.bodyPath).get(),
    p = await terminal(initial.progress),
    root = await db.doc('adventures/' + own.target.id).get(),
    request = step(p),
    [first, concurrent] = await Promise.all([
      api.advanceAdventureDeletion(uid, request),
      api.advanceAdventureDeletion(uid, request),
    ]);
  assert.deepEqual(first, concurrent);
  assert.equal(first.progress.complete, true);
  assert.equal(first.progress.deletedDocuments, p.deletedDocuments + 1);
  assert.equal((await root.ref.get()).exists, false);
  const finalJob = await job(first.progress).get(),
    reserved = await reservation(first.progress).get(),
    receipt = await db
      .doc('users/' + uid + '/adventureDeletionOperations/' + request.operationId)
      .get();
  assert.ok(finalJob.updateTime.isEqual(receipt.createTime));
  assert.ok(reserved.updateTime.isEqual(receipt.createTime));
  assert.ok(finalJob.createTime.isEqual(reserved.createTime));
  assert.equal(reserved.data().state, 'deleted');
  assert.deepEqual(await api.advanceAdventureDeletion(uid, request), first);
  const oldStart = await api.startAdventureDeletion(uid, input);
  assert.deepEqual(oldStart.receipt, initial.receipt);
  assert.deepEqual(oldStart.progress, first.progress);
  const restarted = createAdventureDeletionService({ db });
  assert.equal(
    (await restarted.getAdventureDeletion(uid, { adventureId: own.target.id })).deletion.complete,
    true,
  );
  assert.equal((await restarted.listAdventureDeletions(uid)).items[0].complete, true);
  const ownTurn = await own.conversations.dispatch(uid, {
    action: 'getTurn',
    ...own.turnScope,
    turnId: own.turn.turnId,
  });
  assert.equal(ownTurn.question, '  Own private question\n');
  assert.equal(ownTurn.answer, null);
  assert.ok((await question.ref.get()).updateTime.isEqual(question.updateTime));
  assert.ok((await kept.ref.get()).updateTime.isEqual(kept.updateTime));
  assert.equal((await db.collection(book.parent + '/turnBodies').get()).size, 13);
  assert.ok(
    (
      await book.generationApi.dispatch(uid, {
        action: 'getByokInput',
        ...book.turnScope,
        turnId: book.turn.turnId,
        attemptToken: book.turn.attemptToken,
      })
    ).input,
  );
  await assert.rejects(
    () =>
      createStudioService({ db }).createAdventure(uid, {
        operationId: own.target.id,
        title: 'Replacement',
      }),
    (e) => e.details?.reason === 'adventure-deleted',
  );
  await root.ref.create(root.data());
  await assert.rejects(() => restarted.getAdventureDeletion(uid, { adventureId: own.target.id }), {
    code: 'failed-precondition',
  });
  assert.equal(
    await restarted.getAdventureDeletionSource(uid, { adventureId: own.target.id }),
    null,
  );
});

test('native final queries reopen child, image and activity work while preserving copies, then reject a copied terminal reservation', async () => {
  const target = { kind: 'adventure', id: 'native-final-reopen-project' },
    studio = createStudioService({ db }),
    progress = createWorkProgressService({ db });
  await studio.createAdventure(uid, { operationId: target.id, title: 'Own adventure' });
  await progress.recordWorkActivity(uid, {
    target,
    resource: { kind: 'project' },
    operationId: 'native-final-activity',
    expectedActivityRevision: 0,
  });
  const activityRef = db.doc('users/' + uid + '/workActivity/' + digest(target)),
    activity = (await activityRef.get()).data(),
    { initial } = await begin(target);
  let p = await terminal(initial.progress);
  const child = db.doc('adventures/' + target.id + '/scenes/missing-parent/body/current');
  await child.create({ ownerId: uid, adventureId: target.id, content: 'PRIVATE_STORAGE_FIXTURE' });
  p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(p.phase, 'children');
  assert.equal((await child.get()).exists, true);
  p = await terminal(p);
  assert.equal((await child.get()).exists, false);
  const imageId = 'native-terminal-image-0001',
    image = db.doc('users/' + uid + '/imageLibrary/' + imageId),
    resource = { kind: 'scene', id: 'final-image-scene' },
    imageData = {
      id: imageId,
      state: 'active',
      useCount: 2,
      name: 'Independent copy',
      path: 'own/native.png',
    },
    use = db.doc(image.path + '/uses/' + adventureImageUseKey(target.id, resource)),
    otherUse = db.doc(image.path + '/uses/other-project-use'),
    batch = db.batch();
  batch.create(image, imageData);
  batch.create(use, { kind: 'adventure-block', adventureId: target.id, resource });
  batch.create(otherUse, { kind: 'book-cover', bookId: 'other-book' });
  await batch.commit();
  const kept = await otherUse.get();
  p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(p.phase, 'images');
  p = await terminal(p);
  assert.deepEqual((await image.get()).data(), { ...imageData, useCount: 1 });
  assert.ok((await otherUse.get()).updateTime.isEqual(kept.updateTime));
  await activityRef.create(activity);
  const stateRef = db.doc('users/' + uid + '/workActivityState/current'),
    state = await stateRef.get();
  p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(p.phase, 'activity');
  p = await finish(p);
  assert.equal((await activityRef.get()).exists, false);
  assert.deepEqual((await stateRef.get()).data(), {
    ...state.data(),
    revision: state.data().revision + 1,
  });
  const copy = (await reservation(p).get()).data();
  await reservation(p).delete();
  await reservation(p).create(copy);
  await assert.rejects(() => api.getAdventureDeletion(uid, { adventureId: target.id }), {
    code: 'failed-precondition',
  });
});

test('a native turn body recreated behind the final scan reopens controls but its changed birth prevents adoption', async () => {
  const own = await createDeletionChat(db, {
      prefix: 'native-final-recreated-body',
      generation: 'byok',
    }),
    original = (await db.doc(own.bodyPath).get()).data(),
    { initial } = await begin(own.target),
    p = await terminal(initial.progress),
    question = await db.doc(own.questionPath).get();
  await db.doc(own.bodyPath).create(original);
  const reopened = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(reopened.phase, 'controls');
  assert.equal(reopened.complete, false);
  const before = await job(reopened).get(),
    body = await db.doc(own.bodyPath).get();
  await assert.rejects(() => api.advanceAdventureDeletion(uid, step(reopened)), {
    code: 'failed-precondition',
  });
  assert.ok((await job(reopened).get()).updateTime.isEqual(before.updateTime));
  assert.ok((await body.ref.get()).updateTime.isEqual(body.updateTime));
  assert.ok((await question.ref.get()).updateTime.isEqual(question.updateTime));
  assert.equal((await db.doc('adventures/' + own.target.id).get()).exists, true);
});
