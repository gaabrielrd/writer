import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatConversationFixture } from './helpers/editorChatConversationFixture.mjs';
import { uid, signed, reason } from './helpers/editorChatFixture.mjs';
import { createEditorChatApplyService } from '../src/editorChatApply.mjs';
import { createWorkHistoryService } from '../src/workHistory.mjs';
import { createWorkProgressService } from '../src/workProgress.mjs';
import { createAdventureBlocksService } from '../src/adventureBlocks.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { editorChatTextHash } from '../src/editorChatContracts.mjs';
import { resolveChatGeneration } from '../src/chatGeneration.mjs';

const after = '<p>Texto novo aplicado</p>';
const base = (s) => ({ sourceToken: s.sourceToken, revision: s.revision, bodyHash: s.contentHash });
const convPath = (f) => `users/${uid}/editorChats/${f.conversation.conversationId}`;
async function fixture(kind = 'book', block = false, { world = false } = {}) {
  const f = await editorChatConversationFixture({
    kind,
    block,
    world,
    async setup(current) {
      const scenes = createScenesService({ db: current.db, now: () => 500 });
      const sceneId =
        current.resource.kind === 'block'
          ? current.records.get(`${current.path}/sceneBlocks/${current.resource.id}`).sceneId
          : current.resource.id;
      const scene = await scenes.getScene(uid, { target: current.target, sceneId });
      const source = await scenes.getSceneGroup(uid, { target: current.target, parentId: null });
      const group = await scenes.createSceneGroup(uid, {
        target: current.target,
        operationId: 'apply-count-group-first',
        title: 'Composição',
      });
      await scenes.moveScene(uid, {
        target: current.target,
        operationId: 'apply-count-move-first',
        sceneId,
        expectedRevision: scene.revision,
        parentId: group.id,
        expectedSourceStructureRevision: source.group.structureRevision,
        expectedTargetStructureRevision: group.structureRevision,
      });
      const saved = await createWorkHistoryService({ db: current.db }).getWorkVersionSource(
        uid,
        current.scope,
      );
      current.prepare = await signed({ ...current.prepare, base: base(saved) });
    },
  });
  f.records.set(`users/${uid}`, { credits: 5 });
  const turn = await f.seedTurn('apply-turn', {
    answer: { text: 'Explicação', suggestion: 'Texto novo aplicado' },
  });
  const history = createWorkHistoryService({ db: f.db });
  const progress = createWorkProgressService({ db: f.db, now: () => 4000 });
  const count = await progress.prepareWorkWordCount(uid, {
    target: f.target,
    operationId: 'apply-count-first',
    limit: 50,
  });
  assert.equal(count.complete, true);
  const source = await history.getWorkVersionSource(uid, f.resourceScope);
  const request = await signed({
    action: 'applySuggestion',
    ...f.scope,
    operationId: 'apply-first',
    turnId: turn.turnId,
    suggestionHash: await editorChatTextHash('Texto novo aplicado'),
    base: base(source),
    after,
    placement: 'original',
  });
  const apply = createEditorChatApplyService({ db: f.db, now: () => 5000 });
  return { ...f, turn, history, progress, request, apply };
}
const bodyReads = (f) =>
  f.events.filter((e) => e.method === 'get' && e.path?.includes('/turnBodies/'));

for (const [kind, block] of [
  ['book', false],
  ['adventure', false],
  ['adventure', true],
])
  test(`apply uses actual text/aggregate/progress writers for ${kind}/${block ? 'block' : 'scene'}`, async () => {
    const f = await fixture(kind, block);
    const before = (await f.history.getWorkVersionSource(uid, f.resourceScope)).content;
    const result = await f.apply.dispatch(uid, f.request);
    assert.equal(result.current.chargedCredits, 1);
    assert.equal(result.current.wordCount, 3);
    const saved = await f.history.getWorkVersionSource(uid, f.resourceScope);
    assert.equal(saved.content, after);
    assert.notEqual(saved.content, before);
    assert.equal(saved.contentHash, result.current.contentHash);
    assert.equal(saved.revision, result.current.revision);
    assert.equal(f.records.get(`users/${uid}`).credits, 4);
    assert.equal(f.records.get(`${convPath(f)}/turns/apply-turn`).summary.paid, true);
    const view = await f.progress.getWorkProgress(uid, { target: f.target });
    assert.equal(view.manuscript.wordCount, block ? 5 : 3);
    assert.equal(f.records.get(f.path).sceneRevision, result.current.projectRevision);
    assert.equal(JSON.stringify(result.receipt).includes(after), false);
    assert.equal(
      [...f.records.keys()].some((p) => p.includes('/workVersions/')),
      false,
    );
  });

test('retry preserves the charged receipt and explicit paid reapplication is free with fresh CAS', async () => {
  const f = await fixture();
  const first = await f.apply.dispatch(uid, f.request);
  const afterFirst = structuredClone([...f.records]);
  assert.deepEqual(await f.apply.dispatch(uid, f.request), {
    receipt: first.receipt,
    current: null,
  });
  assert.deepEqual([...f.records], afterFirst);
  const source = await f.history.getWorkVersionSource(uid, f.resourceScope);
  const next = await signed({
    ...f.request,
    operationId: 'apply-again',
    base: base(source),
    placement: 'retargeted',
    after: '<p>Outra aplicação</p>',
  });
  const result = await f.apply.dispatch(uid, next);
  assert.equal(result.current.chargedCredits, 0);
  assert.equal(first.receipt.result.chargedCredits, 1);
  assert.equal(f.records.get(`users/${uid}`).credits, 4);
  assert.equal(
    (await f.progress.getWorkProgress(uid, { target: f.target })).manuscript.wordCount,
    2,
  );
});

test('BYOK application uses frozen provider and costs zero', async () => {
  const f = await fixture();
  const record = f.records.get(`${convPath(f)}/turns/apply-turn`);
  record.summary.provider = 'byok';
  record.summary.generation = resolveChatGeneration({
    version: 1,
    provider: 'openai_byok',
    model: 'gpt-6-luna',
    reasoning: 'auto',
  });
  f.records.set(`users/${uid}`, { credits: 0 });
  const result = await f.apply.dispatch(uid, f.request);
  assert.equal(result.current.chargedCredits, 0);
  assert.equal(f.records.get(`users/${uid}`).credits, 0);
  assert.equal(f.records.get(`${convPath(f)}/turns/apply-turn`).summary.paid, false);
});

for (const scenario of [
  'balance',
  'hash',
  'cas',
  'html',
  'not-done',
  'conversation',
  'invalid-balance',
])
  test(`failed ${scenario} preserves text, ledger, balance and paid state`, async () => {
    const f = await fixture();
    let request = f.request;
    let expected = 'suggestion-unavailable';
    if (scenario === 'balance') {
      f.records.get(`users/${uid}`).credits = 0;
      expected = 'insufficient-credits';
    }
    if (scenario === 'hash') request = await signed({ ...request, suggestionHash: 'b'.repeat(64) });
    if (scenario === 'cas') {
      request = await signed({
        ...request,
        base: { ...request.base, sourceToken: 'b'.repeat(64) },
      });
      expected = 'revision-conflict';
    }
    if (scenario === 'html') {
      request = await signed({ ...request, after: '<p onclick="attack()">Texto</p>' });
      expected = 'unsafe-document';
    }
    if (scenario === 'not-done') {
      await f.seedTurn('apply-turn', { state: 'running' });
    }
    if (scenario === 'conversation') {
      f.records.get(convPath(f)).summary.state = 'deleting';
      expected = 'conversation-unavailable';
    }
    if (scenario === 'invalid-balance') {
      f.records.get(`users/${uid}`).credits = 'five';
      expected = 'inconsistent';
    }
    const before = structuredClone([...f.records]);
    await assert.rejects(f.apply.dispatch(uid, request), reason(expected));
    assert.deepEqual([...f.records], before);
  });

test('revocation rejects before any derived body; receipt replay remains metadata-only', async () => {
  const f = await fixture('book', false, { world: true });
  const result = await f.apply.dispatch(uid, f.request);
  f.records.get('universes/world').deleting = true;
  f.events.length = 0;
  assert.deepEqual(await f.apply.dispatch(uid, f.request), {
    receipt: result.receipt,
    current: null,
  });
  assert.equal(bodyReads(f).length, 0);
  const source = await f.history.getWorkVersionSource(uid, f.resourceScope);
  const next = await signed({
    ...f.request,
    operationId: 'apply-revoked',
    base: base(source),
    placement: 'retargeted',
  });
  f.events.length = 0;
  const before = structuredClone([...f.records]);
  await assert.rejects(f.apply.dispatch(uid, next), reason('provenance-revoked'));
  assert.equal(bodyReads(f).length, 0);
  assert.deepEqual([...f.records], before);
});

test('principal retarget preserves an additional block and counts the whole scene only in aggregates', async () => {
  const f = await fixture('adventure');
  const extra = await createAdventureBlocksService({
    db: f.db,
    now: () => 4100,
  }).createAdventureBlock(uid, {
    adventureId: f.target.id,
    sceneId: f.resource.id,
    operationId: 'apply-extra-block',
    title: 'Segredo',
    content: '<p>Segredo separado</p>',
    audience: 'gm',
  });
  const path = `${f.path}/sceneBlocks/${extra.block.resource.id}`;
  const oldBlock = structuredClone(f.records.get(path));
  const oldBody = structuredClone(f.records.get(path + '/body/current'));
  const current = await f.history.getWorkVersionSource(uid, f.resourceScope);
  await assert.rejects(f.apply.dispatch(uid, f.request), reason('revision-conflict'));
  const retarget = await signed({
    ...f.request,
    operationId: 'apply-retarget',
    base: base(current),
    placement: 'retargeted',
  });
  const result = await f.apply.dispatch(uid, retarget);
  assert.equal(result.current.wordCount, 3);
  assert.equal((await f.history.getWorkVersionSource(uid, f.resourceScope)).sceneWordCount, 5);
  assert.equal(
    (await f.progress.getWorkProgress(uid, { target: f.target })).manuscript.wordCount,
    5,
  );
  assert.deepEqual(f.records.get(path), oldBlock);
  assert.deepEqual(f.records.get(path + '/body/current'), oldBody);
});

test('a durable cancel fence wins before application and a changed fingerprint cannot replay', async () => {
  const f = await fixture();
  const resolved = await f.call({
    action: 'resolveOperation',
    operationId: f.request.operationId,
    operationAction: 'applySuggestion',
    requestHash: f.request.requestHash,
    intent: 'cancel',
  });
  const before = structuredClone([...f.records]);
  f.events.length = 0;
  assert.deepEqual(await f.apply.dispatch(uid, f.request), {
    receipt: resolved.receipt,
    current: null,
  });
  assert.equal(bodyReads(f).length, 0);
  assert.deepEqual([...f.records], before);
  const other = await signed({ ...f.request, after: '<p>Outro pedido</p>' });
  await assert.rejects(f.apply.dispatch(uid, other), reason('operation-conflict'));
  assert.deepEqual([...f.records], before);
});

test('concurrent same operation has one committed application and one historical receipt', async () => {
  const f = await fixture();
  const results = await Promise.all([
    f.apply.dispatch(uid, f.request),
    f.apply.dispatch(uid, f.request),
  ]);
  assert.equal(results.filter((r) => r.current !== null).length, 1);
  assert.deepEqual(results[0].receipt, results[1].receipt);
  assert.equal(f.records.get(`users/${uid}`).credits, 4);
});
