import test from 'node:test';
import assert from 'node:assert/strict';
import { adventureDeletionDb } from './helpers/adventureDeletionDb.mjs';
import { editorChatGenerationFixture } from './helpers/editorChatGenerationFixture.mjs';
import { editorChatConversationFixture } from './helpers/editorChatConversationFixture.mjs';
import { editorChatFixture } from './helpers/editorChatFixture.mjs';
import { createAdventureDeletionService } from '../src/adventureDeletion.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { createDeletionChat } from './helpers/adventureDeletionChatFixture.mjs';
import { digest } from '../src/workProgressContracts.mjs';
const uid = 'author';
const step = (p) => ({
  deletionId: p.deletionId,
  deletionToken: p.deletionToken,
  expectedCheckpoint: p.checkpoint,
  operationId: 'controls-cleanup-step-' + String(p.checkpoint).padStart(8, '0'),
});
const job = (f, p) => f.records.get('users/' + uid + '/adventureDeletions/' + p.deletionId);
async function begin(f) {
  const api = createAdventureDeletionService({ db: f.db, now: () => 9000 }),
    s = await api.getAdventureDeletionSource(uid, { adventureId: f.target.id });
  return {
    api,
    p: (
      await api.startAdventureDeletion(uid, {
        adventureId: s.adventureId,
        adventureToken: s.adventureToken,
        sourceToken: s.sourceToken,
        expectedRevision: s.revision,
        operationId: 'controls-cleanup-start-0001',
      })
    ).progress,
  };
}
async function until(f, api, p, phase) {
  for (let n = 0; p.phase !== phase; n++) {
    assert.ok(n < 500);
    p = (await api.advanceAdventureDeletion(uid, step(p))).progress;
  }
  return p;
}
const convPath = (f) => 'users/' + uid + '/editorChats/' + f.conversation.conversationId;

test('derived chat bodies are retired by metadata while own questions remain readable and historical receipts stay unchanged', async () => {
  const f = await editorChatGenerationFixture({
      kind: 'adventure',
      database: adventureDeletionDb(),
    }),
    sent = await f.generate(await f.request()),
    bodyPath = convPath(f) + '/turnBodies/' + sent.turn.turnId,
    questionPath = convPath(f) + '/turnQuestions/' + sent.turn.turnId,
    question = structuredClone(f.records.get(questionPath)),
    receipts = structuredClone(
      [...f.records].filter(([p]) => p.includes('/editorChatOperations/')),
    );
  const b = await begin(f),
    p = await until(f, b.api, b.p, 'controls');
  f.events.length = 0;
  const final = await until(f, b.api, p, 'verify');
  assert.equal(f.records.has(bodyPath), false);
  assert.deepEqual(f.records.get(questionPath), question);
  for (const [path, value] of receipts) assert.deepEqual(f.records.get(path), value);
  assert.deepEqual(job(f, final).certified, [
    'quiescence',
    'media',
    'images',
    'children',
    'controls',
    'activity',
  ]);
  assert.equal(
    f.events.some((e) => e.method === 'get' && e.path === bodyPath),
    false,
  );
  const read = await f.get(sent.turn.turnId);
  assert.equal(read.question, '  Pergunta própria\n');
  assert.equal(read.answer, null);
  assert.equal(
    f.events.some((e) => e.method === 'get' && e.path === bodyPath),
    false,
  );
});

test('headless ready context is retired only after the native ready receipt and original scope hash are proved', async () => {
  const f = await editorChatConversationFixture({
      kind: 'adventure',
      database: adventureDeletionDb(),
    }),
    header = 'users/' + uid + '/editorChatContexts/' + f.ready.contextId,
    body = 'users/' + uid + '/editorChatContextBodies/' + f.ready.contextId;
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(header)));
  const b = await begin(f),
    p = await until(f, b.api, b.p, 'controls');
  assert.ok(f.records.has(body));
  const result = await b.api.advanceAdventureDeletion(uid, step(p));
  assert.equal(result.progress.deletedDocuments - p.deletedDocuments, 1);
  assert.equal(f.records.has(body), false);
  assert.equal(f.records.has(header), false);
  await until(f, b.api, result.progress, 'verify');
});

test('an unattributed temporary orphan preserves every byte and refuses to guess its project from an opaque ID', async () => {
  const f = await editorChatFixture('adventure', false, adventureDeletionDb());
  const context = (await f.call(f.prepare)).current,
    header = 'users/' + uid + '/editorChatContexts/' + context.contextId,
    body = 'users/' + uid + '/editorChatContextBodies/' + context.contextId;
  await f.db.runTransaction((tx) => tx.delete(f.db.doc(header)));
  const b = await begin(f),
    p = await until(f, b.api, b.p, 'controls'),
    before = structuredClone(f.records);
  f.events.length = 0;
  await assert.rejects(() => b.api.advanceAdventureDeletion(uid, step(p)), {
    code: 'failed-precondition',
  });
  assert.deepEqual(f.records, before);
  assert.equal(
    f.events.some((e) => e.method === 'get' && e.path === body),
    false,
  );
});

for (const missing of ['turn', 'conversation'])
  test(
    'an orphan turn body with missing ' +
      missing +
      ' is retired using original native receipts without recreating its parents',
    async () => {
      const f = await editorChatGenerationFixture({
          kind: 'adventure',
          database: adventureDeletionDb(),
        }),
        sent = await f.generate(await f.request()),
        parent = missing === 'turn' ? convPath(f) + '/turns/' + sent.turn.turnId : convPath(f),
        body = convPath(f) + '/turnBodies/' + sent.turn.turnId,
        question = convPath(f) + '/turnQuestions/' + sent.turn.turnId;
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(parent)));
      const b = await begin(f),
        p = await until(f, b.api, b.p, 'controls');
      await until(f, b.api, p, 'verify');
      assert.equal(f.records.has(body), false);
      assert.equal(f.records.has(parent), false);
      assert.ok(f.records.has(question));
    },
  );

for (const broken of ['body-birth', 'ready-receipt-birth', 'scope', 'revision'])
  test(
    'a headless context with changed ' + broken + ' cannot be adopted by the cleanup',
    async () => {
      const f = await editorChatConversationFixture({
          kind: 'adventure',
          database: adventureDeletionDb(),
        }),
        header = 'users/' + uid + '/editorChatContexts/' + f.ready.contextId,
        body = 'users/' + uid + '/editorChatContextBodies/' + f.ready.contextId;
      await f.db.runTransaction((tx) => tx.delete(f.db.doc(header)));
      const b = await begin(f),
        p = await until(f, b.api, b.p, 'controls');
      if (broken === 'scope') f.records.get(body).frozen.source.resource.id = 'different-scope';
      else if (broken === 'revision')
        [...f.records.values()].find(
          (v) => v.action === 'advanceContext' && v.receipt?.result.phase === 'ready',
        ).receipt.result.revision = 0;
      else {
        const path =
            broken === 'body-birth'
              ? body
              : [...f.records].find(
                  ([key, v]) =>
                    key.includes('/editorChatOperations/') &&
                    v.action === 'advanceContext' &&
                    v.receipt?.result.phase === 'ready',
                )[0],
          value = structuredClone(f.records.get(path));
        await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
        await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      }
      const before = structuredClone(f.records);
      await assert.rejects(() => b.api.advanceAdventureDeletion(uid, step(p)), {
        code: 'failed-precondition',
      });
      assert.deepEqual(f.records, before);
    },
  );

test('activity retirement invalidates only the account cursor revision and preserves other project rows and accessedAt', async () => {
  const f = await editorChatGenerationFixture({
      kind: 'adventure',
      database: adventureDeletionDb(),
    }),
    progress = createWorkProgressService({ db: f.db, now: () => 7000 });
  await progress.recordWorkActivity(uid, {
    target: f.target,
    resource: f.resource,
    operationId: 'activity-before-cleanup-0001',
    expectedActivityRevision: 0,
  });
  const other = { kind: 'book', id: 'other-book' },
    otherPath = 'users/' + uid + '/workActivity/' + digest(other);
  f.records.set(otherPath, { target: other, kind: 'book', resource: null, accessedAt: 123 });
  const originalState = structuredClone(
    f.records.get('users/' + uid + '/workActivityState/current'),
  );
  const b = await begin(f),
    p = await until(f, b.api, b.p, 'activity'),
    request = step(p),
    first = await b.api.advanceAdventureDeletion(uid, request),
    after = structuredClone(f.records);
  assert.equal(first.progress.phase, 'verify');
  assert.equal(f.records.has('users/' + uid + '/workActivity/' + digest(f.target)), false);
  assert.deepEqual(f.records.get('users/' + uid + '/workActivityState/current'), {
    ...originalState,
    revision: originalState.revision + 1,
  });
  assert.deepEqual(await b.api.advanceAdventureDeletion(uid, request), first);
  assert.deepEqual(f.records, after);
  assert.ok(f.records.has(otherPath));
  assert.equal(await progress.resolveWorkResume(uid, { target: f.target }), null);
});

for (const broken of ['target', 'alias', 'state', 'overflow'])
  test(
    'activity with inconsistent ' + broken + ' is preserved without a partial revision bump',
    async () => {
      const f = await editorChatGenerationFixture({
          kind: 'adventure',
          database: adventureDeletionDb(),
        }),
        progress = createWorkProgressService({ db: f.db, now: () => 7000 });
      await progress.recordWorkActivity(uid, {
        target: f.target,
        resource: f.resource,
        operationId: 'activity-before-cleanup-0001',
        expectedActivityRevision: 0,
      });
      const b = await begin(f),
        p = await until(f, b.api, b.p, 'activity'),
        row = 'users/' + uid + '/workActivity/' + digest(f.target);
      if (broken === 'target') f.records.get(row).target.id = 'different-project';
      if (broken === 'alias')
        f.records.set('users/' + uid + '/workActivity/alias', structuredClone(f.records.get(row)));
      if (broken === 'state') f.records.delete('users/' + uid + '/workActivityState/current');
      if (broken === 'overflow')
        f.records.get('users/' + uid + '/workActivityState/current').revision =
          Number.MAX_SAFE_INTEGER;
      const before = structuredClone(f.records);
      await assert.rejects(() => b.api.advanceAdventureDeletion(uid, step(p)), {
        code: 'failed-precondition',
      });
      assert.deepEqual(f.records, before);
    },
  );

test('book conversations created after deletion began remain intact and no derived body is hydrated during the account scan', async () => {
  const f = await editorChatGenerationFixture({
    kind: 'adventure',
    database: adventureDeletionDb(),
  });
  const own = await f.generate(await f.request()),
    b = await begin(f),
    book = await createDeletionChat(f.db, { kind: 'book', prefix: 'controls-neighbor-book' }),
    ready = await createDeletionChat(f.db, {
      kind: 'book',
      prefix: 'controls-ready-book',
      withTurn: false,
    });
  const kept = new Map([
    [book.bodyPath, structuredClone(f.records.get(book.bodyPath))],
    [book.questionPath, structuredClone(f.records.get(book.questionPath))],
    [ready.contextBodyPath, structuredClone(f.records.get(ready.contextBodyPath))],
  ]);
  const p = await until(f, b.api, b.p, 'controls');
  f.events.length = 0;
  await until(f, b.api, p, 'verify');
  assert.equal(f.records.has(convPath(f) + '/turnBodies/' + own.turn.turnId), false);
  for (const [path, value] of kept) assert.deepEqual(f.records.get(path), value);
  assert.equal(
    f.events.some(
      (e) =>
        e.method === 'get' &&
        (e.path?.includes('/turnBodies/') || e.path?.includes('/editorChatContextBodies/')),
    ),
    false,
  );
});

test('turn pages use full document cursors, remove 10/10/3/0 derived records and preserve all 23 own questions', async () => {
  const f = adventureDeletionDb(),
    a = await createDeletionChat(f.db, { prefix: 'controls-many-turns' }),
    target = a.target,
    clone = structuredClone(f.records.get(a.bodyPath)),
    headPath = a.parent + '/turns/' + a.turn.turnId,
    originalHead = structuredClone(f.records.get(headPath)),
    question = structuredClone(f.records.get(a.questionPath));
  // Declared storage fixtures retain the producer identity and original shared native birth.
  const bodyMeta = structuredClone(f.metadata.get(a.bodyPath));
  for (let n = 0; n < 22; n++) {
    const turnId = 'controls-extra-turn-' + String(n).padStart(3, '0'),
      base = a.parent + '/';
    f.records.set(base + 'turnBodies/' + turnId, { ...clone, turnId });
    f.records.set(base + 'turns/' + turnId, {
      ...originalHead,
      turnId,
      summary: { ...originalHead.summary, turnId },
    });
    f.records.set(base + 'turnQuestions/' + turnId, { ...question, turnId });
    f.metadata.set(base + 'turnBodies/' + turnId, bodyMeta);
    f.metadata.set(base + 'turns/' + turnId, bodyMeta);
  }
  const fixture = { ...f, target },
    b = await begin(fixture);
  let p = await until(f, b.api, b.p, 'controls');
  p = (await b.api.advanceAdventureDeletion(uid, step(p))).progress;
  assert.equal(job(f, p).part, 1);
  const sizes = [];
  for (let n = 0; n < 4; n++) {
    const before = p.deletedDocuments;
    p = (await b.api.advanceAdventureDeletion(uid, step(p))).progress;
    sizes.push(p.deletedDocuments - before);
  }
  assert.deepEqual(sizes, [10, 10, 3, 0]);
  assert.equal(
    [...f.records.keys()].filter((k) => k.startsWith(a.parent + '/turnQuestions/')).length,
    23,
  );
  await until(f, b.api, p, 'verify');
});

for (const broken of ['birth', 'attempt', 'owner', 'send-receipt'])
  test(
    'derived body with inconsistent ' + broken + ' remains preserved with its checkpoint',
    async () => {
      const f = await editorChatGenerationFixture({
          kind: 'adventure',
          database: adventureDeletionDb(),
        }),
        sent = await f.generate(await f.request()),
        path = convPath(f) + '/turnBodies/' + sent.turn.turnId;
      if (broken === 'birth') {
        const value = structuredClone(f.records.get(path));
        await f.db.runTransaction((tx) => tx.delete(f.db.doc(path)));
        await f.db.runTransaction((tx) => tx.create(f.db.doc(path), value));
      }
      if (broken === 'attempt') f.records.get(path).attemptToken = 'f'.repeat(64);
      if (broken === 'owner') f.records.get(path).ownerId = 'other';
      if (broken === 'send-receipt') {
        await f.db.runTransaction((tx) =>
          tx.delete(f.db.doc(convPath(f) + '/turns/' + sent.turn.turnId)),
        );
        const op = 'users/' + uid + '/editorChatOperations/send-first',
          value = structuredClone(f.records.get(op));
        await f.db.runTransaction((tx) => tx.delete(f.db.doc(op)));
        await f.db.runTransaction((tx) => tx.create(f.db.doc(op), value));
      }
      const b = await begin(f);
      let p = await until(f, b.api, b.p, 'controls');
      p = (await b.api.advanceAdventureDeletion(uid, step(p))).progress;
      const before = structuredClone(f.records);
      await assert.rejects(() => b.api.advanceAdventureDeletion(uid, step(p)), {
        code: 'failed-precondition',
      });
      assert.deepEqual(f.records, before);
    },
  );

for (const boundary of ['body', 'job', 'receipt'])
  test(
    'derived-body rollback at ' + boundary + ' preserves questions and all prior bodies',
    async () => {
      const f = await editorChatGenerationFixture({
        kind: 'adventure',
        database: adventureDeletionDb(),
      });
      await f.generate(await f.request());
      const b = await begin(f);
      let p = await until(f, b.api, b.p, 'controls');
      p = (await b.api.advanceAdventureDeletion(uid, step(p))).progress;
      const original = f.db.runTransaction.bind(f.db),
        before = structuredClone(f.records);
      let failed = false;
      f.db.runTransaction = (callback) =>
        original((tx) =>
          callback(
            new Proxy(tx, {
              get(target, key) {
                if (!['delete', 'set', 'create'].includes(key)) return target[key];
                return (ref, ...args) => {
                  const fail =
                    boundary === 'body'
                      ? ref.path.includes('/turnBodies/')
                      : boundary === 'job'
                        ? ref.path.includes('/adventureDeletions/')
                        : ref.path.includes('/adventureDeletionOperations/');
                  if (fail) {
                    failed = true;
                    throw Error('Chat retirement rollback');
                  }
                  return target[key](ref, ...args);
                };
              },
            }),
          ),
        );
      await assert.rejects(
        () => b.api.advanceAdventureDeletion(uid, step(p)),
        /Chat retirement rollback/,
      );
      assert.equal(failed, true);
      assert.deepEqual(f.records, before);
      f.db.runTransaction = original;
      const next = await b.api.advanceAdventureDeletion(uid, step(p));
      assert.equal(next.progress.deletedDocuments - p.deletedDocuments, 1);
    },
  );

test('lost chat-cleanup acknowledgement replays the same receipt without reading a removed response', async () => {
  const f = await editorChatGenerationFixture({
    kind: 'adventure',
    database: adventureDeletionDb(),
  });
  await f.generate(await f.request());
  const b = await begin(f);
  let p = await until(f, b.api, b.p, 'controls');
  p = (await b.api.advanceAdventureDeletion(uid, step(p))).progress;
  const original = f.db.runTransaction.bind(f.db),
    request = step(p);
  let lose = true;
  f.db.runTransaction = async (callback) => {
    const result = await original(callback);
    if (lose) {
      lose = false;
      throw Error('Lost chat-cleanup acknowledgement');
    }
    return result;
  };
  await assert.rejects(() => b.api.advanceAdventureDeletion(uid, request), /Lost chat-cleanup/);
  const before = structuredClone(f.records),
    next = await b.api.advanceAdventureDeletion(uid, request);
  assert.equal(next.progress.deletedDocuments - p.deletedDocuments, 1);
  assert.deepEqual(f.records, before);
});
