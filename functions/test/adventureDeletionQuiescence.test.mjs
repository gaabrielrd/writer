import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureDeletionDb } from './helpers/adventureDeletionDb.mjs';
import { editorChatConversationFixture } from './helpers/editorChatConversationFixture.mjs';
import { editorChatGenerationFixture, byok } from './helpers/editorChatGenerationFixture.mjs';
import { createAdventureDeletionService } from '../src/adventureDeletion.mjs';
import { readEditorChatContext } from '../src/editorChatContext.mjs';
const uid = 'author';
async function begin(f) {
  const api = createAdventureDeletionService({ db: f.db, now: () => 8000 }),
    s = await api.getAdventureDeletionSource(uid, { adventureId: f.target.id });
  const request = {
    adventureId: s.adventureId,
    adventureToken: s.adventureToken,
    sourceToken: s.sourceToken,
    expectedRevision: s.revision,
    operationId: 'quiescence-deletion-start-0001',
  };
  return { api, request, initial: await api.startAdventureDeletion(uid, request) };
}
const step = (p, n) => ({
  deletionId: p.deletionId,
  deletionToken: p.deletionToken,
  operationId: 'quiescence-deletion-step-' + String(n).padStart(6, '0'),
  expectedCheckpoint: p.checkpoint,
});
test('first cleanup step deletes only its context snapshot without reading text and retains a valid terminal context and retry receipt', async () => {
  const f = await editorChatConversationFixture({
      kind: 'adventure',
      database: adventureDeletionDb(),
    }),
    b = await begin(f),
    body = 'users/' + uid + '/editorChatContextBodies/' + f.ready.contextId;
  assert.ok(f.records.has(body));
  f.events.length = 0;
  const request = step(b.initial.progress, 1),
    first = await b.api.advanceAdventureDeletion(uid, request);
  assert.equal(first.progress.checkpoint, 1);
  assert.equal(first.progress.deletedDocuments, 1);
  assert.equal(f.records.has(body), false);
  const context = await f.db.runTransaction((tx) =>
    readEditorChatContext(tx, f.db, uid, f.ready.contextId, f.ready.contextToken),
  );
  assert.equal(context.summary.phase, 'deleted');
  assert.equal(context.record.source, null);
  assert.equal(context.record.proofCoverage, null);
  assert.equal(
    f.events.some((e) => e.method === 'get' && e.path === body),
    false,
  );
  const before = structuredClone(f.records);
  assert.deepEqual(await b.api.advanceAdventureDeletion(uid, request), first);
  assert.deepEqual(f.records, before);
  assert.equal(
    (await b.api.getAdventureDeletion(uid, { adventureId: f.target.id })).deletion.checkpoint,
    1,
  );
  assert.equal(JSON.stringify(first).includes('Texto próprio'), false);
});
test('source birth lets snapshot retirement resume even after the root is absent', async () => {
  const f = await editorChatConversationFixture({
      kind: 'adventure',
      database: adventureDeletionDb(),
    }),
    b = await begin(f);
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(f.path)));
  const next = await b.api.advanceAdventureDeletion(uid, step(b.initial.progress, 2));
  assert.equal(next.progress.deletedDocuments, 1);
  assert.equal(
    f.records.has('users/' + uid + '/editorChatContextBodies/' + f.ready.contextId),
    false,
  );
});
test('recreated private snapshot cannot be mistaken for the context born with it', async () => {
  const f = await editorChatConversationFixture({
      kind: 'adventure',
      database: adventureDeletionDb(),
    }),
    b = await begin(f),
    body = 'users/' + uid + '/editorChatContextBodies/' + f.ready.contextId,
    value = structuredClone(f.records.get(body));
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(body)));
  await f.db.runTransaction((tx) => tx.create(f.db.doc(body), value));
  const before = structuredClone(f.records);
  await assert.rejects(() => b.api.advanceAdventureDeletion(uid, step(b.initial.progress, 3)), {
    code: 'failed-precondition',
  });
  assert.deepEqual(f.records, before);
});
test('old receipts survive later checkpoints, while stale checkpoints, altered requests and tokens cannot resume work', async () => {
  const f = await editorChatConversationFixture({
      kind: 'adventure',
      database: adventureDeletionDb(),
    }),
    b = await begin(f);
  const r = step(b.initial.progress, 4),
    first = await b.api.advanceAdventureDeletion(uid, r),
    second = await b.api.advanceAdventureDeletion(uid, step(first.progress, 5));
  const replay = await b.api.advanceAdventureDeletion(uid, r);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.checkpoint, second.progress.checkpoint);
  for (const request of [
    { ...r, operationId: 'quiescence-late-step-0001' },
    { ...r, operationId: 'quiescence-token-step-0001', deletionToken: 'a'.repeat(64) },
  ]) {
    const before = structuredClone(f.records);
    await assert.rejects(() => b.api.advanceAdventureDeletion(uid, request), {
      code: 'failed-precondition',
    });
    assert.deepEqual(f.records, before);
  }
  await assert.rejects(() => b.api.advanceAdventureDeletion(uid, { ...r, expectedCheckpoint: 1 }), {
    code: 'invalid-argument',
  });
  await assert.rejects(() => b.api.advanceAdventureDeletion('other', r), { code: 'not-found' });
});
test('unsupported final verification keeps its checkpoint after the completed cleanup phases', async () => {
  const f = await editorChatConversationFixture({
      kind: 'adventure',
      database: adventureDeletionDb(),
    }),
    b = await begin(f);
  let p = b.initial.progress;
  for (let n = 0; n < 80 && p.phase !== 'verify'; n++) {
    p = (await b.api.advanceAdventureDeletion(uid, step(p, 10 + n))).progress;
  }
  assert.equal(p.phase, 'verify');
  assert.deepEqual(
    f.records.get('users/' + uid + '/adventureDeletions/' + p.deletionId).certified,
    ['quiescence', 'media', 'images', 'children', 'controls', 'activity'],
  );
  const before = structuredClone(f.records);
  await assert.rejects(
    () => b.api.advanceAdventureDeletion(uid, step(p, 100)),
    (e) => e.details?.reason === 'adventure-deletion-step-unavailable',
  );
  assert.deepEqual(f.records, before);
});
test('a held provider completion cannot restore context or mutate the stopped turn after quiescence', async () => {
  let entered, release;
  const paused = new Promise((r) => {
      entered = r;
    }),
    hold = new Promise((r) => {
      release = r;
    });
  const f = await editorChatGenerationFixture({
    kind: 'adventure',
    database: adventureDeletionDb(),
    generator: async () => {
      entered();
      await hold;
      return 'Late [[SUGESTAO]]Must not return[[/SUGESTAO]]';
    },
  });
  const pending = f.generate(await f.request());
  await paused;
  const b = await begin(f);
  let p = b.initial.progress;
  for (let n = 0; n < 10; n++) {
    const stored = f.records.get('users/' + uid + '/adventureDeletions/' + p.deletionId);
    if (stored.part === 2) break;
    p = (await b.api.advanceAdventureDeletion(uid, step(p, 200 + n))).progress;
  }
  const conv = 'users/' + uid + '/editorChats/' + f.conversation.conversationId;
  assert.equal(f.records.get(conv).summary.activeTurnId, null);
  const before = structuredClone(f.records);
  release();
  const result = await pending;
  assert.equal(result.turn.state, 'stopped');
  assert.deepEqual(f.records, before);
  assert.equal(
    [...f.records.keys()].some((p) => p.startsWith('users/' + uid + '/editorChatContextBodies/')),
    false,
  );
  const question = [...f.records].find(([p]) => p.startsWith(conv + '/turnQuestions/'));
  assert.ok(question);
  assert.equal(question[1].question, '  Pergunta própria\n');
});
test('pending BYOK turn is stopped without reading provider input or erasing the own question', async () => {
  const f = await editorChatGenerationFixture({
      kind: 'adventure',
      database: adventureDeletionDb(),
    }),
    sent = await f.generate(await f.request({ generation: byok })),
    b = await begin(f);
  let p = b.initial.progress;
  for (let n = 0; n < 10; n++) {
    const stored = f.records.get('users/' + uid + '/adventureDeletions/' + p.deletionId);
    if (stored.part === 2) break;
    p = (await b.api.advanceAdventureDeletion(uid, step(p, 300 + n))).progress;
  }
  f.events.length = 0;
  const read = await f.generate({
    action: 'getByokInput',
    ...f.scope,
    turnId: sent.turn.turnId,
    attemptToken: sent.turn.attemptToken,
  });
  assert.equal(read.turn.state, 'stopped');
  assert.equal(read.input, null);
  assert.equal(
    f.events.some((e) => e.method === 'get' && e.path?.includes('/turnBodies/')),
    false,
  );
});

test('a full page retires ten contexts atomically and resumes only after all metadata reads', async () => {
  const f = await editorChatConversationFixture({
    kind: 'adventure',
    database: adventureDeletionDb(),
  });
  const { createEditorChatContextService } = await import('../src/editorChatContext.mjs');
  const { signed } = await import('./helpers/editorChatFixture.mjs');
  const contexts = createEditorChatContextService({ db: f.db, now: () => 4000 });
  for (let n = 0; n < 12; n++) {
    const { requestHash: ignored, ...input } = f.prepare;
    void ignored;
    await contexts.dispatch(
      uid,
      await signed({
        ...input,
        contextId: 'extra-context-' + n,
        operationId: 'extra-context-' + n,
      }),
    );
  }
  const b = await begin(f);
  let p = b.initial.progress;
  const sizes = [];
  for (let n = 0; n < 3; n++) {
    const before = p.deletedDocuments;
    p = (await b.api.advanceAdventureDeletion(uid, step(p, 500 + n))).progress;
    sizes.push(p.deletedDocuments - before);
  }
  assert.deepEqual(sizes, [10, 3, 0]);
  assert.equal(f.records.get('users/' + uid + '/adventureDeletions/' + p.deletionId).part, 1);
  assert.equal(
    [...f.records.keys()].some((path) =>
      path.startsWith('users/' + uid + '/editorChatContextBodies/'),
    ),
    false,
  );
});

test('a lost advance acknowledgement resumes the original operation without repeating retirement', async () => {
  const f = await editorChatConversationFixture({
      kind: 'adventure',
      database: adventureDeletionDb(),
    }),
    b = await begin(f);
  let lose = true;
  const db = {
    ...f.db,
    runTransaction: async (callback) => {
      const result = await f.db.runTransaction(callback);
      if (lose) {
        lose = false;
        throw Error('Lost acknowledgement after commit');
      }
      return result;
    },
  };
  const api = createAdventureDeletionService({ db, now: () => 9000 }),
    request = step(b.initial.progress, 600);
  await assert.rejects(() => api.advanceAdventureDeletion(uid, request), /Lost acknowledgement/);
  const confirmed = await api.advanceAdventureDeletion(uid, request);
  assert.equal(confirmed.progress.checkpoint, 1);
  assert.equal(confirmed.progress.deletedDocuments, 1);
  const before = structuredClone(f.records);
  assert.deepEqual(await api.advanceAdventureDeletion(uid, request), confirmed);
  assert.deepEqual(f.records, before);
});

test('closed advance input rejects extra fields, invalid checkpoints and missing authentication before mutations', async () => {
  const f = await editorChatConversationFixture({
      kind: 'adventure',
      database: adventureDeletionDb(),
    }),
    b = await begin(f);
  const request = step(b.initial.progress, 700),
    before = structuredClone(f.records);
  for (const patch of [
    { ownerId: uid },
    { expectedCheckpoint: -1 },
    { expectedCheckpoint: 0.5 },
    { deletionToken: 'bad' },
    { deletionId: '../bad' },
  ])
    await assert.rejects(() => b.api.advanceAdventureDeletion(uid, { ...request, ...patch }), {
      code: 'invalid-argument',
    });
  await assert.rejects(() => b.api.advanceAdventureDeletion(null, request), {
    code: 'unauthenticated',
  });
  assert.deepEqual(f.records, before);
});
