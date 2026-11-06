import { readLiteraryImpactNativeAuditPage } from '../../functions/src/literaryImpactNativeAudit.mjs';
import { workScope } from '../../functions/src/workProgressContracts.mjs';
import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { initializeTestEnvironment, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { createLiteraryImpactService } from '../../functions/src/literaryImpact.mjs';
const { Firestore } = createRequire(new URL('../../functions/package.json', import.meta.url))(
  'firebase-admin/firestore',
);
const projectId = 'demo-writer-literary-impact-controller';
let environment, admin;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127\.0\.0\.1:\d+$/.test(address ?? ''))
    throw new Error('Use somente o emulador demo local.');
  const [host, port] = address.split(':');
  environment = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => environment.clearFirestore());
after(async () => {
  await admin?.terminate();
  await environment?.cleanup();
});
async function fixture() {
  await admin.doc('books/book').create({
    authorId: 'author',
    title: 'PRIVATE',
    status: 'draft',
    updatedAt: 10,
    createdAt: 10,
    wordCount: 0,
  });
  const api = createLiteraryImpactService({ db: admin, now: () => 1000 }),
    target = { kind: 'book', id: 'book' },
    jobId = 'impact-native-000001',
    requestHash = 'a'.repeat(64);
  const intent = {
    target,
    bookIds: ['book'],
    sources: [{ kind: 'book', id: 'book', scopeKind: 'book', scopeId: 'book' }],
    prepareIndices: false,
  };
  const scope = await api.getLiteraryImpactScope('author', intent),
    start = {
      ...intent,
      jobId,
      expectedBookToken: scope.bookToken,
      expectedScopeToken: scope.scopeToken,
      requestHash,
    };
  const get = () => api.getLiteraryImpact('author', { target, jobId });
  const wire = async (operationId) => {
    const frame = await get();
    return {
      target,
      jobId,
      operationId,
      expectedOriginToken: frame.originToken,
      expectedRevision: frame.revision,
      requestHash,
    };
  };
  return { api, target, jobId, start, requestHash, get, wire };
}

test('real SDK binds control and receipt birth, freezes graph with control update and replays an advance exactly once', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact('author', f.start);
  const [control, receipt] = await admin.getAll(
    admin.doc('books/book/literaryImpactControls/' + f.jobId),
    admin.doc('books/book/literaryOperations/' + f.jobId),
  );
  assert.ok(control.createTime.isEqual(receipt.createTime));
  const wire = await f.wire('impact-native-step-0001'),
    first = await f.api.advanceLiteraryImpact('author', wire);
  assert.equal(first.phase, 'collecting');
  assert.equal((await f.get()).current, true);
  const [after, graph] = await admin.getAll(
    control.ref,
    admin.doc('books/book/literaryImpactJobs/' + f.jobId),
  );
  assert.ok(graph.createTime.isEqual(after.updateTime));
  assert.deepEqual(await f.api.advanceLiteraryImpact('author', wire), first);
  const next = await f.wire('impact-native-race-0001');
  const race = await Promise.allSettled([
    f.api.advanceLiteraryImpact('author', next),
    f.api.advanceLiteraryImpact('author', { ...next, operationId: 'impact-native-race-0002' }),
  ]);
  assert.equal(race.filter((value) => value.status === 'fulfilled').length, 1);
  assert.equal((await f.get()).revision, next.expectedRevision + 1);
  for (const uid of ['author', 'other', null]) {
    const db = uid
      ? environment.authenticatedContext(uid).firestore()
      : environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, control.ref.path)));
    await assertFails(setDoc(doc(db, control.ref.path), { phase: 'done' }));
  }
});

test('real native root mutation without a logical counter invalidates map, while cancellation can still close its original graph', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact('author', f.start);
  await f.api.advanceLiteraryImpact('author', await f.wire('impact-native-step-0001'));
  await admin.doc('books/book').update({ title: 'Changed without updatedAt' });
  const wire = await f.wire('impact-native-step-0002');
  assert.equal((await f.get()).current, false);
  assert.equal((await f.api.advanceLiteraryImpact('author', wire)).phase, 'stale');
  const current = await f.get();
  await f.api.cancelLiteraryImpact('author', {
    target: f.target,
    jobId: f.jobId,
    operationId: 'impact-native-cancel-001',
    expectedOriginToken: current.originToken,
    requestHash: f.requestHash,
  });
  assert.equal((await f.get()).phase, 'canceled');
  assert.equal(
    (await admin.doc('books/book/literaryImpactJobs/' + f.jobId).get()).data().state,
    'canceled',
  );
});

test('real negative cancellation fences a start not yet observed and never creates a graph or prepares indexes', async () => {
  const f = await fixture();
  await f.api.cancelLiteraryImpact('author', {
    target: f.target,
    jobId: f.jobId,
    operationId: 'impact-native-cancel-001',
    start: f.start,
    requestHash: f.requestHash,
  });
  assert.equal((await f.api.startLiteraryImpact('author', f.start)).phase, 'canceled');
  assert.equal((await admin.doc('books/book/literaryImpactJobs/' + f.jobId).get()).exists, false);
  assert.equal(
    (await admin.collection('books/book/literaryPublicationGuideDependencies').get()).size,
    0,
  );
});

test('real SDK serializes the original advance against its permanent operation-close receipt', async () => {
  const f = await fixture();
  await f.api.startLiteraryImpact('author', f.start);
  const input = await f.wire('impact-native-fenced-001'),
    before = await f.get();
  const close = {
    target: f.target,
    jobId: f.jobId,
    operationId: input.operationId,
    method: 'advanceLiteraryImpact',
    requestHash: f.requestHash,
    expectedOriginToken: before.originToken,
  };
  const [advanced, closed] = await Promise.all([
    f.api.advanceLiteraryImpact('author', input),
    f.api.cancelLiteraryImpactOperation('author', close),
  ]);
  const receipt = (
    await admin.doc('books/book/literaryOperations/' + input.operationId).get()
  ).data();
  assert.ok(['done', 'canceled'].includes(receipt.status));
  assert.equal(closed.status, receipt.status);
  assert.deepEqual(advanced, receipt.result);
  assert.deepEqual(await f.api.advanceLiteraryImpact('author', input), receipt.result);
  assert.equal((await f.get()).revision, before.revision + Number(receipt.status === 'done'));
  assert.equal(
    (await admin.doc('books/book/literaryImpactJobs/' + f.jobId).get()).exists,
    receipt.status === 'done',
  );
});

async function nativeAudit(f) {
  const c = workScope(admin, 'author', { target: f.target }, []);
  let cursor = null;
  const items = [];
  for (let n = 0; n < 500; n++) {
    const page = await admin.runTransaction((tx) =>
      readLiteraryImpactNativeAuditPage(tx, c, { bookId: 'book', cursor }),
    );
    if (page.item) items.push(page.item);
    if (page.done) return items;
    cursor = page.cursor;
  }
  throw new Error('Native SDK audit did not finish');
}
test('real collection-group prefix bounds find phantom legacy children but exclude a neighboring UID with the same prefix', async () => {
  const f = await fixture(),
    path = 'users/author/chapterChats/book/chapters/absent/conversations/absent/messages/first';
  await admin
    .doc(path)
    .create({ id: 'first', role: 'assistant', state: 'done', answer: 'PRIVATE ANSWER' });
  await admin
    .doc(path.replace('/first', '/second'))
    .create({ id: 'second', role: 'assistant', state: 'done', answer: 'PRIVATE SECOND' });
  await admin
    .doc(path.replace('users/author/', 'users/author0/'))
    .create({ id: 'neighbor', role: 'assistant', state: 'done', answer: 'PRIVATE OTHER ACCOUNT' });
  const items = await nativeAudit(f),
    messages = items.filter((item) => item.key.includes('/messages/'));
  assert.equal(messages.length, 2);
  assert.ok(messages.every((item) => item.key.startsWith('users/author/')));
  assert.ok(
    messages.every((item) => item.issues.includes('legacy-chat-message-parent-unavailable')),
  );
  assert.equal(JSON.stringify(items).includes('PRIVATE'), false);
  assert.equal((await admin.doc('users/author/editorChatCatalogs/current').get()).exists, false);
  for (const actor of ['author', 'other', null]) {
    const db = actor
      ? environment.authenticatedContext(actor).firestore()
      : environment.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, path)));
  }
});
test('real orphan native bodies and questions remain detectable through metadata without recreating their parent or reading payloads', async () => {
  const f = await fixture(),
    base = 'users/author/editorChats/missing/';
  for (const group of ['turnBodies', 'turnQuestions'])
    await admin.doc(base + group + '/turn').create({
      schemaVersion: 1,
      ownerId: 'author',
      conversationId: 'missing',
      conversationToken: 'a'.repeat(64),
      turnId: 'turn',
      attemptToken: 'b'.repeat(64),
      answer: 'PRIVATE ANSWER',
      question: 'PRIVATE QUESTION',
    });
  await admin.doc('users/author/editorChatContextBodies/context').create({
    schemaVersion: 1,
    ownerId: 'author',
    contextId: 'context',
    contextToken: 'a'.repeat(64),
    frozen: { instructions: 'PRIVATE INSTRUCTION' },
  });
  const items = await nativeAudit(f);
  assert.equal(
    items.filter((item) => item.issues.includes('native-chat-turn-sidecar-orphan-or-mismatched'))
      .length,
    2,
  );
  assert.ok(
    items.some((item) => item.issues.includes('native-chat-context-body-orphan-or-mismatched')),
  );
  assert.equal(JSON.stringify(items).includes('PRIVATE'), false);
  assert.equal((await admin.doc('users/author/editorChats/missing').get()).exists, false);
});
test('real native conversation without a clock is observed as untracked and never silently initializes its catalog', async () => {
  const f = await fixture();
  await admin.doc('users/author/editorChats/legacy').create({
    schemaVersion: 1,
    ownerId: 'author',
    conversationId: 'legacy',
    summary: {
      target: f.target,
      resource: { kind: 'scene', id: 'scene' },
      conversationToken: 'a'.repeat(64),
      state: 'open',
    },
    cleanupId: null,
  });
  const items = await nativeAudit(f);
  assert.ok(items.some((item) => item.issues.includes('native-chat-catalog-missing')));
  assert.equal((await admin.doc('users/author/editorChatCatalogs/current').get()).exists, false);
});
