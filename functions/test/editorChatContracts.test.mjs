import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  EditorChatContractError,
  canonicalEditorChatJSON,
  editorChatHash,
  editorChatTextHash,
  normalizeEditorChatRequest,
  editorChatRequestHash,
  verifyEditorChatRequest,
  editorChatProjectToken,
  editorChatContainerSceneToken,
  editorChatResourceToken,
  normalizeEditorChatClosure,
  verifyEditorChatClosure,
  mergeEditorChatClosures,
  normalizeEditorChatDTO,
  normalizeEditorChatReceipt,
  normalizeEditorChatAnswer,
  normalizeEditorChatCapture,
  normalizeEditorChatPersonaId,
  normalizeEditorChatPersonaComplement,
  normalizeEditorChatJournalScope,
  assertEditorChatTurnPreflight,
  editorChatApplyCost,
  nextEditorChatRevision,
  selectEditorChatHistoryMetadata,
  EDITOR_CHAT_MUTATION_ACTIONS,
  EDITOR_CHAT_RECEIPT_KINDS,
  verifyEditorChatSnapshot,
  editorChatControlToken,
  editorChatCleanupToken,
} from '../src/editorChatContracts.mjs';
import { resolveChatGeneration } from '../src/chatGeneration.mjs';
const vectors = JSON.parse(
  readFileSync(new URL('./editorChatVectors.json', import.meta.url), 'utf8'),
);
const hash = (c) => c.repeat(64),
  target = { kind: 'adventure', id: 'adv_01' },
  resource = { kind: 'scene', id: 'scene_01' };
const reject = (fn, reason = 'invalid-request') =>
  assert.throws(
    fn,
    (e) =>
      e instanceof EditorChatContractError &&
      e.details.reason === reason &&
      !e.message.includes('secret'),
  );
const rejected = async (fn, reason) =>
  assert.rejects(
    async () => fn(),
    (e) => e.details?.reason === reason,
  );
for (const v of vectors.vectors)
  test('independent canonical SHA256: ' + v.name, async () => {
    assert.equal(canonicalEditorChatJSON(v.value), v.canonical);
    assert.equal(await editorChatHash(v.value), v.hash);
  });
for (const v of vectors.raw)
  test('independent raw UTF8 SHA256: ' + v.name, async () => {
    assert.equal(await editorChatTextHash(v.value), v.hash);
  });
for (const name of [
  'project-native-nanos-1',
  'project-native-nanos-2',
  'container-scene-first-birth',
  'container-scene-recreated',
  'orphan-block-original-scene',
  'orphan-block-new-scene',
])
  test('native identity helper: ' + name, async () => {
    const v = vectors.vectors.find((v) => v.name === name),
      { version, ...value } = v.value;
    assert.equal(version, 1);
    const fn = name.startsWith('project')
      ? editorChatProjectToken
      : name.startsWith('container')
        ? editorChatContainerSceneToken
        : editorChatResourceToken;
    assert.equal(await fn(value), v.hash);
  });
const mutation = (name) => {
  const v = vectors.vectors.find((v) => v.name === 'request-' + name);
  return { action: v.value.action, ...structuredClone(v.value.request), requestHash: v.hash };
};
for (const name of ['prepare', 'send', 'apply'])
  test('wire fingerprint, not echoed prose: ' + name, async () => {
    const request = mutation(name),
      before = structuredClone(request);
    assert.equal(await editorChatRequestHash(request), request.requestHash);
    assert.deepEqual(await verifyEditorChatRequest(request), normalizeEditorChatRequest(request));
    assert.deepEqual(request, before);
    await rejected(
      () => verifyEditorChatRequest({ ...request, requestHash: hash('0') }),
      'invalid-request',
    );
    reject(() => normalizeEditorChatRequest({ ...request, key: 'secret' }));
  });
test('cancel carries original mutation hash and no plaintext', async () => {
  assert.deepEqual(normalizeEditorChatRequest(vectors.cancel), vectors.cancel);
  await rejected(() => editorChatRequestHash(vectors.cancel), 'invalid-request');
  reject(() => normalizeEditorChatRequest({ ...vectors.cancel, prompt: 'secret' }));
});
test('canonical JSON rejects non-JSON, malformed UTF16, cycles and accessors', () => {
  const cycle = {};
  cycle.self = cycle;
  const sparse = [0, 1];
  delete sparse[0];
  for (const v of [
    undefined,
    NaN,
    Infinity,
    1.1,
    BigInt(1),
    '\ud800',
    new Date(),
    cycle,
    sparse,
    Object.defineProperty({}, 'x', {
      enumerable: true,
      get: () => {
        throw Error('secret');
      },
    }),
  ])
    reject(() => canonicalEditorChatJSON(v));
  assert.notEqual(canonicalEditorChatJSON('é'), canonicalEditorChatJSON('e\u0301'));
});
test('source identity requires exact native nanoseconds and real block container', async () => {
  const v = structuredClone(
    vectors.vectors.find((v) => v.name === 'orphan-block-original-scene').value,
  );
  delete v.version;
  await rejected(() => editorChatResourceToken({ ...v, containerScene: null }), 'invalid-request');
  await rejected(
    () => editorChatResourceToken({ ...v, createdAt: { seconds: 1, nanoseconds: 1e9 } }),
    'invalid-request',
  );
  assert.notEqual(
    await editorChatProjectToken({
      ownerId: 'u',
      target,
      createdAt: { seconds: 1, nanoseconds: 1 },
    }),
    await editorChatProjectToken({
      ownerId: 'u',
      target,
      createdAt: { seconds: 1, nanoseconds: 2 },
    }),
  );
});
test('requests close optional/default fields and preserve separate PM/persisted hashes', () => {
  const r = mutation('prepare');
  assert.notEqual(r.capture.editorHash, r.base.bodyHash);
  assert.deepEqual(normalizeEditorChatRequest(r).capture, r.capture);
  assert.equal(
    normalizeEditorChatRequest({ action: 'listConversations', target, resource }).limit,
    25,
  );
  for (const bad of [null, 0, 51, NaN, 1.1])
    reject(() =>
      normalizeEditorChatRequest({
        action: 'listMessages',
        target,
        resource,
        conversationId: 'c',
        conversationToken: hash('b'),
        limit: bad,
      }),
    );
  reject(() =>
    normalizeEditorChatRequest({
      action: 'listConversations',
      target,
      resource,
      projectToken: hash('a'),
    }),
  );
  reject(() =>
    normalizeEditorChatRequest({
      ...r,
      target: { kind: 'book', id: 'b' },
      resource: { kind: 'block', id: 'bl' },
    }),
  );
  reject(() => normalizeEditorChatRequest({ ...r, contextId: 'another' }));
  for (const value of [undefined, NaN, -1, 1.1, Number.MAX_SAFE_INTEGER + 1])
    reject(() =>
      normalizeEditorChatRequest({ ...mutation('send'), expectedContextRevision: value }),
    );
  reject(() => nextEditorChatRevision(Number.MAX_SAFE_INTEGER));
});
test('text and byte boundaries never trim or truncate manuscript/prompt', () => {
  const r = mutation('prepare'),
    capture = { ...r.capture, text: 'x'.repeat(18000), surroundingText: ' '.repeat(22000) };
  assert.equal(normalizeEditorChatCapture(capture).text.length, 18000);
  reject(() => normalizeEditorChatCapture({ ...capture, text: capture.text + 'x' }));
  reject(() =>
    normalizeEditorChatCapture({ ...capture, surroundingText: capture.surroundingText + 'x' }),
  );
  const send = { ...mutation('send'), prompt: ' '.repeat(3999) + 'x' };
  assert.equal(normalizeEditorChatRequest(send).prompt, send.prompt);
  reject(() => normalizeEditorChatRequest({ ...send, prompt: send.prompt + 'x' }));
  const apply = { ...mutation('apply'), after: 'é'.repeat(400000) };
  assert.equal(normalizeEditorChatRequest(apply).after, apply.after);
  reject(
    () => normalizeEditorChatRequest({ ...apply, after: apply.after + 'x' }),
    'body-too-large',
  );
});
test('legacy custom persona IDs remain valid; reserved unknown presets and forged complements fail', () => {
  assert.equal(normalizeEditorChatPersonaId('minha-persona'), 'minha-persona');
  assert.equal(normalizeEditorChatPersonaId('custom-id'), 'custom-id');
  reject(() => normalizeEditorChatPersonaId('preset-invented'));
  const c = { personaId: 'minha-persona', overrides: [{ traitId: 'sensory', value: 0 }] };
  assert.deepEqual(normalizeEditorChatPersonaComplement(c), c);
  reject(() =>
    normalizeEditorChatPersonaComplement({ ...c, overrides: [...c.overrides, ...c.overrides] }),
  );
  reject(() =>
    normalizeEditorChatPersonaComplement({ ...c, overrides: [{ traitId: 'sensory', value: 101 }] }),
  );
  const op = {
    action: 'setAdventurePersonaBinding',
    operationId: 'p',
    requestHash: hash('0'),
    adventureId: 'a',
    adventureToken: hash('a'),
    sceneId: null,
    expectedBindingToken: hash('b'),
    value: { personaId: 'minha-persona' },
  };
  assert.deepEqual(normalizeEditorChatRequest(op).value, op.value);
  reject(() => normalizeEditorChatRequest({ ...op, value: { personaComplement: null } }));
  assert.deepEqual(
    normalizeEditorChatRequest({ ...op, sceneId: 'scene', value: { personaComplement: c } }).value,
    { personaComplement: c },
  );
});
test('closure normalizes permutations/dedup and keeps transitive leaf dependencies', async () => {
  const c = vectors.closure;
  assert.deepEqual(await normalizeEditorChatClosure([...c.leaves].reverse().concat(c.leaves)), c);
  assert.deepEqual(await verifyEditorChatClosure(c), c);
  const one = await normalizeEditorChatClosure(c.leaves.slice(0, 1));
  const two = await normalizeEditorChatClosure(c.leaves.slice(1));
  assert.deepEqual(await mergeEditorChatClosures(one, two, one), c);
  await rejected(() => verifyEditorChatClosure({ ...c, closureHash: hash('0') }), 'inconsistent');
  const local = {
    kind: 'lore',
    reference: { kind: 'book', scopeId: 'other', entityId: 'e' },
    scopeToken: hash('a'),
    entityIdentityToken: hash('b'),
  };
  await rejected(
    async () => verifyEditorChatClosure(await normalizeEditorChatClosure([local]), { target }),
    'provenance-revoked',
  );
});
test('closure exact count and independent byte boundaries are enforced before provider', async () => {
  const leaf = (i) => ({
    kind: 'lore',
    reference: { kind: 'universe', scopeId: 'w', entityId: 'e' + i },
    scopeToken: hash('a'),
    entityIdentityToken: hash('b'),
  });
  assert.equal(
    (await normalizeEditorChatClosure(Array.from({ length: 128 }, (_, i) => leaf(i)))).leaves
      .length,
    128,
  );
  await rejected(
    () => normalizeEditorChatClosure(Array.from({ length: 129 }, (_, i) => leaf(i))),
    'context-rebase-required',
  );
  for (const v of vectors.closureBytes) {
    if (v.expected === 'accept') {
      const result = await normalizeEditorChatClosure(v.value.leaves);
      assert.deepEqual(result, v.value);
      assert.equal(new TextEncoder().encode(canonicalEditorChatJSON(result)).length, v.bytes);
    } else
      await rejected(() => normalizeEditorChatClosure(v.value.leaves), 'context-rebase-required');
  }
});
const contextResult = {
  kind: 'context',
  contextId: 'op',
  contextToken: hash('a'),
  revision: 1,
  phase: 'local',
};
function receipt(action, result, operationId = 'op') {
  return {
    schemaVersion: 1,
    operationId,
    action,
    requestHash: hash('d'),
    outcome: 'confirmed',
    confirmedAt: 1,
    result,
  };
}
test('metadata receipts are action-discriminated, exact-operation and historical', () => {
  const rows = {
    context: contextResult,
    conversation: {
      kind: 'conversation',
      conversationId: 'c',
      conversationToken: hash('b'),
      revision: 2,
      state: 'open',
    },
    turn: {
      kind: 'turn',
      conversationId: 'c',
      conversationToken: hash('b'),
      turnId: 'op',
      attemptToken: hash('c'),
      revision: 1,
      state: 'running',
    },
    apply: {
      kind: 'apply',
      conversationId: 'c',
      conversationToken: hash('b'),
      turnId: 't',
      resourceToken: hash('c'),
      revision: 2,
      contentHash: hash('d'),
      bodyBytes: 3,
      wordCount: 1,
      projectRevision: 5,
      chargedCredits: 1,
    },
    cleanup: {
      kind: 'cleanup',
      cleanupId: 'op',
      cleanupToken: hash('b'),
      revision: 1,
      state: 'deleting',
      phase: 'turn-bodies',
      deletedDocuments: 0,
    },
    'persona-binding': {
      kind: 'persona-binding',
      adventureId: 'a',
      adventureToken: hash('a'),
      sceneId: null,
      sceneToken: null,
      personaRevision: 1,
      bindingToken: hash('b'),
    },
  };
  for (const action of EDITOR_CHAT_MUTATION_ACTIONS) {
    const result = structuredClone(rows[EDITOR_CHAT_RECEIPT_KINDS[action]]);
    if (action === 'deleteContext') result.phase = 'context-body';
    const r = receipt(action, result);
    assert.deepEqual(
      normalizeEditorChatReceipt(r, {
        action,
        operationId: 'op',
        requestHash: hash('d'),
        maxRevision: 5,
      }),
      r,
    );
    reject(() => normalizeEditorChatReceipt({ ...r, after: 'secret' }), 'inconsistent');
    reject(() => normalizeEditorChatReceipt(r, { operationId: 'different' }), 'inconsistent');
    reject(() => normalizeEditorChatReceipt(r, { requestHash: hash('0') }), 'inconsistent');
  }
  const r = receipt('advanceContext', contextResult);
  reject(() => normalizeEditorChatReceipt(r, { maxRevision: 0 }), 'inconsistent');
  reject(() => normalizeEditorChatReceipt(r, { contextId: 'other' }), 'inconsistent');
  reject(
    () => normalizeEditorChatReceipt({ ...r, result: { ...r.result, prompt: 'secret' } }),
    'inconsistent',
  );
});
test('send fence and historical receipt return no fabricated turn/body', () => {
  const canceled = { ...receipt('send', { kind: 'fence' }), outcome: 'canceled' };
  const result = { receipt: canceled, turn: null, delivery: null, byokInput: null };
  assert.deepEqual(normalizeEditorChatDTO('sendResult', result), result);
  reject(
    () => normalizeEditorChatDTO('sendResult', { ...result, delivery: 'byok' }),
    'inconsistent',
  );
  const old = receipt('send', {
    kind: 'turn',
    conversationId: 'c',
    conversationToken: hash('b'),
    turnId: 'op',
    attemptToken: hash('c'),
    revision: 1,
    state: 'running',
  });
  assert.deepEqual(normalizeEditorChatDTO('sendResult', { ...result, receipt: old }).turn, null);
});
async function frozenFixture() {
  const closure = await normalizeEditorChatClosure([
    { kind: 'target', target, resource, projectToken: hash('a'), resourceToken: hash('b') },
  ]);
  const frozen = {
    schemaVersion: 1,
    matcherVersion: 1,
    capturedAt: 1,
    source: {
      target,
      resource,
      projectToken: hash('a'),
      resourceToken: hash('b'),
      containerScene: null,
      parent: null,
      sourceToken: hash('c'),
      revision: 7,
      bodyHash: hash('d'),
      title: 'Cena',
      projectTitle: 'Aventura',
      titleTruncated: false,
      projectTitleTruncated: false,
    },
    capture: mutation('prepare').capture,
    lore: [],
    persona: {
      bindingHash: hash('e'),
      profileHash: hash('f'),
      capturedAt: 1,
      base: null,
      complement: null,
      instruction: '',
    },
    includedEntityCount: 0,
    omittedEntityCount: 0,
    closure,
  };
  return { ...frozen, contextHash: await editorChatHash(frozen) };
}
test('explicit snapshot verifies content and manifest without treating PM hash as source hash', async () => {
  const value = await frozenFixture();
  assert.deepEqual(await verifyEditorChatSnapshot(value), value);
  await rejected(() => verifyEditorChatSnapshot({ ...value, capturedAt: 2 }), 'inconsistent');
  reject(
    () => normalizeEditorChatDTO('frozenContext', { ...value, key: 'secret' }),
    'inconsistent',
  );
  reject(
    () =>
      normalizeEditorChatDTO('source', { ...value.source, resource: { kind: 'block', id: 'bl' } }),
    'inconsistent',
  );
});
test('TurnPage is metadata-only and blocked turn never projects derived body', async () => {
  const frozen = await frozenFixture();
  const turn = {
    schemaVersion: 1,
    turnId: 't',
    conversationId: 'c',
    revision: 1,
    attemptToken: hash('a'),
    state: 'done',
    provider: 'platform',
    generation: resolveChatGeneration(mutation('send').generation),
    contextHash: frozen.contextHash,
    closureHash: frozen.closure.closureHash,
    sourceToken: hash('c'),
    suggestionAvailable: false,
    paid: false,
    failureReason: null,
    createdAt: 1,
    updatedAt: 1,
  };
  const page = {
    schemaVersion: 1,
    ownerId: 'author',
    conversationId: 'c',
    conversationToken: hash('a'),
    conversationRevision: 2,
    items: [turn],
    nextCursor: null,
  };
  assert.deepEqual(normalizeEditorChatDTO('turnPage', page), page);
  reject(
    () =>
      normalizeEditorChatDTO('turnPage', {
        ...page,
        items: [{ turn, question: 'secret', answer: null }],
      }),
    'inconsistent',
  );
  const blocked = { turn, question: 'Minha pergunta', presentation: 'blocked', answer: null };
  assert.deepEqual(normalizeEditorChatDTO('turnRead', blocked), blocked);
  reject(
    () => normalizeEditorChatDTO('turnRead', { ...blocked, answer: { text: 'secret' } }),
    'inconsistent',
  );
  reject(() => normalizeEditorChatDTO('toString', {}), 'inconsistent');
});
test('journal is metadata-only with original fingerprint and explicit cancellation intent', () => {
  const row = {
    schemaVersion: 1,
    ownerId: 'author',
    target,
    resource,
    projectToken: null,
    resourceToken: null,
    action: 'send',
    operationId: 'op',
    requestHash: hash('a'),
    contextId: 'ctx',
    contextToken: null,
    conversationId: 'c',
    conversationToken: hash('b'),
    turnId: 'op',
    attemptToken: null,
    cleanupId: null,
    cleanupToken: null,
    expectedRevision: null,
    state: 'uncertain',
    intent: 'cancel',
    generation: mutation('send').generation,
    localGeneration: 1,
  };
  assert.deepEqual(normalizeEditorChatDTO('journal', row), row);
  reject(() => normalizeEditorChatDTO('journal', { ...row, prompt: 'secret' }), 'inconsistent');
  reject(() => normalizeEditorChatDTO('journal', { ...row, intent: 'retry' }), 'inconsistent');
  const setter = {
    ...row,
    action: 'setAdventurePersonaBinding',
    resource: null,
    projectToken: hash('a'),
    resourceToken: null,
    generation: null,
  };
  assert.deepEqual(normalizeEditorChatDTO('journal', setter), setter);
  assert.deepEqual(normalizeEditorChatJournalScope({ target, resource: null }), {
    target,
    resource: null,
  });
  const sceneSetter = { ...setter, resource };
  assert.deepEqual(normalizeEditorChatDTO('journal', sceneSetter), sceneSetter);
  for (const bad of [
    { ...setter, action: 'send' },
    { ...setter, target: { kind: 'book', id: 'b' } },
    { ...setter, projectToken: null },
    { ...setter, resourceToken: hash('b') },
    { ...setter, resource: { kind: 'block', id: 'b' } },
  ])
    reject(() => normalizeEditorChatDTO('journal', bad), 'inconsistent');
  reject(() =>
    normalizeEditorChatJournalScope({ target: { kind: 'book', id: 'b' }, resource: null }),
  );
});

test('historical cleanup receipts enforce terminal state and phase together', () => {
  const result = {
    kind: 'cleanup',
    cleanupId: 'k',
    cleanupToken: hash('a'),
    revision: 2,
    state: 'deleted',
    phase: 'complete',
    deletedDocuments: 1,
  };
  const r = receipt('advanceCleanup', result);
  assert.deepEqual(normalizeEditorChatReceipt(r), r);
  for (const patch of [{ phase: 'turns' }, { state: 'deleting' }])
    reject(
      () => normalizeEditorChatReceipt({ ...r, result: { ...result, ...patch } }),
      'inconsistent',
    );
});

test('send result binds expected operation, receipt actor and complete BYOK projection', async () => {
  const context = await frozenFixture();
  const generation = resolveChatGeneration({
    version: 1,
    provider: 'openai_byok',
    model: 'gpt-4o-mini',
    reasoning: 'auto',
  });
  const turn = {
    schemaVersion: 1,
    turnId: 'op',
    conversationId: 'c',
    revision: 1,
    attemptToken: hash('c'),
    state: 'awaiting-byok',
    provider: 'byok',
    generation,
    contextHash: context.contextHash,
    closureHash: context.closure.closureHash,
    sourceToken: hash('a'),
    suggestionAvailable: false,
    paid: false,
    failureReason: null,
    createdAt: 1,
    updatedAt: 1,
  };
  const r = receipt('send', {
    kind: 'turn',
    conversationId: 'c',
    conversationToken: hash('b'),
    turnId: 'op',
    attemptToken: hash('c'),
    revision: 1,
    state: 'awaiting-byok',
  });
  const input = {
    turnId: 'op',
    attemptToken: hash('c'),
    generation,
    systemInstruction: '',
    prompt: 'Minha pergunta',
    context,
    history: [],
    closureHash: turn.closureHash,
  };
  const result = { receipt: r, turn, delivery: 'byok', byokInput: input };
  const expected = { action: 'send', operationId: 'op', requestHash: hash('d') };
  assert.deepEqual(normalizeEditorChatDTO('sendResult', result, expected), result);
  for (const patch of [
    { operationId: 'other' },
    { requestHash: hash('0') },
    { action: 'stopTurn' },
  ])
    reject(
      () => normalizeEditorChatDTO('sendResult', result, { ...expected, ...patch }),
      'inconsistent',
    );
  for (const patch of [{ conversationId: 'other' }, { attemptToken: hash('0') }])
    reject(
      () =>
        normalizeEditorChatDTO('sendResult', {
          ...result,
          receipt: { ...r, result: { ...r.result, ...patch } },
        }),
      'inconsistent',
    );
  const changedGeneration = resolveChatGeneration({
    ...generation.requested,
    model: 'other-model',
  });
  for (const patch of [
    { closureHash: hash('0') },
    { generation: changedGeneration },
    { context: { ...context, contextHash: hash('0') } },
  ]) {
    reject(
      () => normalizeEditorChatDTO('sendResult', { ...result, byokInput: { ...input, ...patch } }),
      'inconsistent',
    );
    reject(
      () => normalizeEditorChatDTO('byokRead', { turn, input: { ...input, ...patch } }),
      'inconsistent',
    );
  }
});
test('output splitter, paid policy, preflight and history budgets are observable', () => {
  assert.deepEqual(normalizeEditorChatAnswer('Texto [[SUGESTAO]]Prosa[[/SUGESTAO]]'), {
    text: 'Texto',
    suggestion: 'Prosa',
  });
  reject(() => normalizeEditorChatAnswer('x'.repeat(24001)));
  reject(() => normalizeEditorChatAnswer('[[SUGESTAO]]x'), 'provider-unavailable');
  reject(
    () => normalizeEditorChatAnswer('[[SUGESTAO]]x[[/SUGESTAO]][[SUGESTAO]]y[[/SUGESTAO]]'),
    'provider-unavailable',
  );
  assert.deepEqual(
    [
      editorChatApplyCost('platform', false),
      editorChatApplyCost('platform', true),
      editorChatApplyCost('byok', false),
    ],
    [1, 0, 0],
  );
  assert.equal(assertEditorChatTurnPreflight('x'.repeat(739998)).length, 739998);
  reject(() => assertEditorChatTurnPreflight('x'.repeat(739999)), 'body-too-large');
  const rows = Array.from({ length: 11 }, (_, i) => ({
    turnId: 't' + i,
    state: 'done',
    questionChars: 1000,
    modelAnswerChars: 2000,
  }));
  const selected = selectEditorChatHistoryMetadata(rows, true);
  assert.equal(selected.recordCount, 20);
  assert.equal(selected.characterCount, 30000);
  assert.equal(selected.omittedCharacterCount, null);
  assert.equal(selected.hasOlderHistory, true);
  assert.equal(selectEditorChatHistoryMetadata(rows, false).omittedCharacterCount, 3000);
});

test('all remaining action requests validate closed metadata without I/O', () => {
  const scope = { target, resource },
    op = { operationId: 'op', requestHash: hash('a') },
    conv = { conversationId: 'c', conversationToken: hash('b') },
    ctx = { contextId: 'x', contextToken: hash('c') },
    attempt = { ...conv, turnId: 't', attemptToken: hash('d') };
  const rows = [
    { action: 'advanceContext', ...scope, ...op, ...ctx, expectedRevision: 1 },
    { action: 'getContext', ...scope, ...ctx },
    { action: 'inspectContext', ...scope, ...ctx, expectedRevision: 1 },
    {
      action: 'createConversation',
      ...scope,
      ...op,
      conversationId: 'new',
      projectToken: hash('a'),
      resourceToken: hash('b'),
    },
    {
      action: 'renameConversation',
      ...scope,
      ...op,
      ...conv,
      expectedRevision: 1,
      title: '  Novo  ',
    },
    { action: 'getAdventurePersonaBinding', adventureId: 'a', sceneId: null },
    { action: 'getTurn', ...scope, ...conv, turnId: 't' },
    { action: 'getByokInput', ...scope, ...attempt },
    { action: 'stopTurn', ...scope, ...op, ...attempt },
    { action: 'completeBYOK', ...scope, ...op, ...attempt, rawAnswer: 'Prosa' },
    { action: 'failBYOK', ...scope, ...op, ...attempt, reason: 'credential-unavailable' },
    { action: 'deleteContext', ...scope, ...op, ...ctx },
    { action: 'deleteConversation', ...scope, ...op, ...conv },
    {
      action: 'advanceCleanup',
      ...op,
      cleanupId: 'cleanup',
      cleanupToken: hash('d'),
      expectedRevision: 1,
    },
    { action: 'getCleanup', cleanupId: 'cleanup', cleanupToken: hash('d') },
  ];
  for (const row of rows) {
    const normalized = normalizeEditorChatRequest(row);
    assert.equal(normalized.action, row.action);
    reject(() => normalizeEditorChatRequest({ ...row, extra: 'secret' }));
  }
  assert.equal(
    normalizeEditorChatRequest(rows.find((r) => r.action === 'renameConversation')).title,
    'Novo',
  );
});
test('stream envelopes are closed, preserve original actor and never contain snapshots', () => {
  const delta = { type: 'delta', turnId: 't', attemptToken: hash('a'), index: 0, text: 'ação\n' };
  assert.deepEqual(normalizeEditorChatDTO('streamEvent', delta), delta);
  reject(
    () => normalizeEditorChatDTO('streamEvent', { ...delta, context: { secret: 'body' } }),
    'inconsistent',
  );
  reject(() => normalizeEditorChatDTO('streamEvent', { ...delta, index: -1 }), 'inconsistent');
});
test('snapshot cannot carry an unmanifested lore or persona body', async () => {
  const frozen = await frozenFixture();
  const value = {
    ...frozen,
    lore: [
      {
        reference: { kind: 'universe', scopeId: 'w', entityId: 'e' },
        identityToken: hash('e'),
        capturedRevision: null,
        capturedStamp: { seconds: 1, nanoseconds: 1 },
        name: 'Aria',
        aliases: [],
        category: 'character',
        summary: 'Guardião',
        detailsExcerpt: 'secret',
        aliasesOmitted: 0,
        detailsTruncated: false,
      },
    ],
    includedEntityCount: 1,
  };
  delete value.contextHash;
  const withHash = { ...value, contextHash: await editorChatHash(value) };
  await rejected(() => verifyEditorChatSnapshot(withHash), 'inconsistent');
  const p = {
    ...frozen,
    persona: {
      ...frozen.persona,
      base: { kind: 'custom', id: 'minha-persona', identityToken: hash('e'), revision: 1 },
    },
  };
  delete p.contextHash;
  await rejected(
    async () => verifyEditorChatSnapshot({ ...p, contextHash: await editorChatHash(p) }),
    'inconsistent',
  );
});

test('private control birth nonce is frozen identity and never a client input', async () => {
  const base = {
    ownerId: 'u',
    birthNonce: hash('1'),
    projectToken: hash('a'),
    resourceToken: hash('b'),
  };
  const c = await editorChatControlToken('context', { ...base, contextId: 'ctx' });
  assert.equal(await editorChatControlToken('context', { ...base, contextId: 'ctx' }), c);
  assert.notEqual(
    await editorChatControlToken('context', { ...base, contextId: 'ctx', birthNonce: hash('2') }),
    c,
  );
  assert.notEqual(
    await editorChatControlToken('conversation', { ...base, conversationId: 'ctx' }),
    c,
  );
  const cleanup = {
    ownerId: 'u',
    cleanupId: 'k',
    birthNonce: hash('1'),
    subject: { kind: 'context', id: 'ctx', token: c },
  };
  assert.notEqual(
    await editorChatCleanupToken(cleanup),
    await editorChatCleanupToken({ ...cleanup, birthNonce: hash('2') }),
  );
  reject(() => normalizeEditorChatRequest({ ...mutation('prepare'), birthNonce: hash('1') }));
});

const controls = JSON.parse(
  readFileSync(new URL('./editorChatControlVectors.json', import.meta.url), 'utf8'),
);
for (const vector of controls.vectors)
  test('independent control birth: ' + vector.name, async () => {
    const { version, kind, ...input } = vector.value;
    assert.equal(version, 1);
    assert.equal(canonicalEditorChatJSON(vector.value), vector.canonical);
    assert.equal(await editorChatHash(vector.value), vector.hash);
    assert.equal(
      await (kind === 'cleanup'
        ? editorChatCleanupToken(input)
        : editorChatControlToken(kind, input)),
      vector.hash,
    );
  });
