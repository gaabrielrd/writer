import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { before, beforeEach, after, test } from 'node:test';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import { createDeletionChat } from '../../functions/test/helpers/adventureDeletionChatFixture.mjs';
import { createAdventureDeletionService } from '../../functions/src/adventureDeletion.mjs';
import { createWorkProgressService } from '../../functions/src/workProgress.mjs';
import { createWorkHistoryService } from '../../functions/src/workHistory.mjs';
import { signed } from '../../functions/test/helpers/editorChatFixture.mjs';
import { digest } from '../../functions/src/workProgressContracts.mjs';
const require = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore } = require('firebase-admin/firestore'),
  uid = 'author',
  projectId = 'demo-writer-deletion-controls';
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
  operationId: 'native-controls-step-' + String(p.checkpoint).padStart(8, '0'),
});
const job = (p) => db.doc('users/' + uid + '/adventureDeletions/' + p.deletionId);
async function begin(target) {
  const s = await api.getAdventureDeletionSource(uid, { adventureId: target.id });
  return (
    await api.startAdventureDeletion(uid, {
      adventureId: target.id,
      adventureToken: s.adventureToken,
      sourceToken: s.sourceToken,
      expectedRevision: s.revision,
      operationId: 'native-controls-start-0001',
    })
  ).progress;
}
async function until(p, phase) {
  for (let n = 0; p.phase !== phase; n++) {
    assert.ok(n < 500);
    p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  }
  return p;
}

test('native chat cleanup removes 10/3/0 bodies, preserves readable questions and later book work, and atomically invalidates activity cursors', async () => {
  const own = await createDeletionChat(db, { prefix: 'a-native-controls', generation: 'byok' }),
    progress = createWorkProgressService({ db });
  await progress.recordWorkActivity(uid, {
    target: own.target,
    resource: own.scope.resource,
    operationId: 'native-controls-activity-own',
    expectedActivityRevision: 0,
  });
  const originalBody = (await db.doc(own.bodyPath).get()).data(),
    originalHead = (await db.doc(own.parent + '/turns/' + own.turn.turnId).get()).data(),
    originalQuestion = (await db.doc(own.questionPath).get()).data(),
    batch = db.batch();
  for (let n = 0; n < 12; n++) {
    const turnId = 'native-extra-turn-' + String(n).padStart(3, '0');
    batch.create(db.doc(own.parent + '/turnBodies/' + turnId), { ...originalBody, turnId });
    batch.create(db.doc(own.parent + '/turns/' + turnId), {
      ...originalHead,
      turnId,
      summary: { ...originalHead.summary, turnId },
    });
    batch.create(db.doc(own.parent + '/turnQuestions/' + turnId), { ...originalQuestion, turnId });
  }
  await batch.commit();
  let p = await begin(own.target);
  const book = await createDeletionChat(db, {
    kind: 'book',
    prefix: 'z-native-controls-book',
    generation: 'byok',
  });
  await progress.recordWorkActivity(uid, {
    target: book.target,
    resource: book.scope.resource,
    operationId: 'native-controls-activity-book',
    expectedActivityRevision: 1,
  });
  const keep = await db.doc(book.bodyPath).get(),
    question = await db.doc(own.questionPath).get(),
    activity = await db.doc('users/' + uid + '/workActivityState/current').get(),
    otherRow = await db.doc('users/' + uid + '/workActivity/' + digest(book.target)).get();
  p = await until(p, 'controls');
  p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal((await job(p).get()).data().part, 1);
  const firstRequest = step(p),
    before = p.deletedDocuments,
    [first, same] = await Promise.all([
      api.advanceAdventureDeletion(uid, firstRequest),
      api.advanceAdventureDeletion(uid, firstRequest),
    ]);
  assert.deepEqual(first, same);
  p = first.progress;
  const sizes = [p.deletedDocuments - before];
  while ((await job(p).get()).data().part === 1) {
    const before = p.deletedDocuments;
    p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
    sizes.push(p.deletedDocuments - before);
  }
  assert.deepEqual(sizes, [10, 3, 0]);
  assert.equal((await db.collection(own.parent + '/turnQuestions').get()).size, 13);
  const read = await own.conversations.dispatch(uid, {
    action: 'getTurn',
    ...own.turnScope,
    turnId: own.turn.turnId,
  });
  assert.equal(read.question, '  Own private question\n');
  assert.equal(read.answer, null);
  assert.ok((await db.doc(own.questionPath).get()).updateTime.isEqual(question.updateTime));
  assert.ok((await db.doc(book.bodyPath).get()).updateTime.isEqual(keep.updateTime));
  p = await until(p, 'activity');
  const r = step(p),
    result = await api.advanceAdventureDeletion(uid, r);
  assert.equal(result.progress.phase, 'verify');
  const state = await activity.ref.get(),
    receipt = await db.doc('users/' + uid + '/adventureDeletionOperations/' + r.operationId).get();
  assert.equal(state.data().revision, activity.data().revision + 1);
  assert.equal(state.data().accessedAt, activity.data().accessedAt);
  assert.ok(state.updateTime.isEqual(receipt.createTime));
  assert.equal(
    (await db.doc('users/' + uid + '/workActivity/' + digest(own.target)).get()).exists,
    false,
  );
  assert.ok((await otherRow.ref.get()).updateTime.isEqual(otherRow.updateTime));
  const byok = await book.generationApi.dispatch(uid, {
    action: 'getByokInput',
    ...book.turnScope,
    turnId: book.turn.turnId,
    attemptToken: book.turn.attemptToken,
  });
  assert.ok(byok.input);
});

async function extraReady(source, contextId) {
  const current = await createWorkHistoryService({ db }).getWorkVersionSource(uid, source.scope);
  let context = (
    await source.contextApi.dispatch(
      uid,
      await signed({
        action: 'prepareContext',
        ...source.scope,
        operationId: contextId,
        contextId,
        base: {
          sourceToken: current.sourceToken,
          revision: current.revision,
          bodyHash: current.contentHash,
        },
        capture: {
          source: 'selection',
          editorHash: 'a'.repeat(64),
          from: 0,
          to: 5,
          text: 'Aria',
          surroundingText: '',
          truncated: false,
        },
      }),
    )
  ).current;
  for (let n = 0; ['local', 'global'].includes(context.phase); n++)
    context = (
      await source.contextApi.dispatch(
        uid,
        await signed({
          action: 'advanceContext',
          ...source.scope,
          operationId: contextId + '-advance-' + n,
          contextId,
          contextToken: context.contextToken,
          expectedRevision: context.revision,
        }),
      )
    ).current;
  return context;
}
test('native original request hashes and births retire orphan contexts/conversations without reconstructing parents or erasing questions', async () => {
  const source = await createDeletionChat(db, {
      prefix: 'orphan-native-controls',
      generation: 'byok',
    }),
    ready = await extraReady(source, 'orphan-native-ready-context'),
    contextParent = db.doc('users/' + uid + '/editorChatContexts/' + ready.contextId),
    body = db.doc('users/' + uid + '/editorChatContextBodies/' + ready.contextId);
  const batch = db.batch();
  batch.delete(contextParent);
  batch.delete(db.doc(source.parent));
  await batch.commit();
  let p = await begin(source.target);
  p = await until(p, 'verify');
  assert.equal((await body.get()).exists, false);
  assert.equal((await contextParent.get()).exists, false);
  assert.equal((await db.doc(source.parent).get()).exists, false);
  assert.equal((await db.doc(source.bodyPath).get()).exists, false);
  assert.equal((await db.doc(source.questionPath).get()).exists, true);
  assert.equal(p.complete, false);
});

test('native temporary orphan without a scope keeps its original snapshot and cleanup checkpoint untouched', async () => {
  const source = await createDeletionChat(db, {
      prefix: 'unattributed-native-controls',
      withTurn: false,
    }),
    contextId = 'temporary-native-context';
  const current = await createWorkHistoryService({ db }).getWorkVersionSource(uid, source.scope);
  await source.contextApi.dispatch(
    uid,
    await signed({
      action: 'prepareContext',
      ...source.scope,
      contextId,
      operationId: contextId,
      base: {
        sourceToken: current.sourceToken,
        revision: current.revision,
        bodyHash: current.contentHash,
      },
      capture: {
        source: 'selection',
        editorHash: 'b'.repeat(64),
        from: 0,
        to: 5,
        text: 'Aria',
        surroundingText: '',
        truncated: false,
      },
    }),
  );
  await db.doc('users/' + uid + '/editorChatContexts/' + contextId).delete();
  let p = await begin(source.target);
  p = await until(p, 'controls');
  const before = await job(p).get(),
    body = await db.doc('users/' + uid + '/editorChatContextBodies/' + contextId).get();
  await assert.rejects(() => api.advanceAdventureDeletion(uid, step(p)), {
    code: 'failed-precondition',
  });
  assert.ok((await job(p).get()).updateTime.isEqual(before.updateTime));
  assert.ok((await body.ref.get()).updateTime.isEqual(body.updateTime));
});
