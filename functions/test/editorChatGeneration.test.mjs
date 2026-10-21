import test from 'node:test';
import assert from 'node:assert/strict';
import { editorChatGenerationFixture, byok } from './helpers/editorChatGenerationFixture.mjs';
import { uid, reason, signed } from './helpers/editorChatFixture.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';
const turnPath = (f, id) => `users/${uid}/editorChats/${f.conversation.conversationId}/turns/${id}`;
const contextPath = (f, id) => `users/${uid}/editorChatContexts/${id}`;
const bodyReads = (f) =>
  f.events.filter((e) => e.method === 'get' && e.path?.includes('/turnBodies/'));
const controls = (f, turn, operationId) => ({
  ...f.scope,
  turnId: turn.turnId,
  attemptToken: turn.attemptToken,
  operationId,
});
const quota = (f) => f.records.get(`users/${uid}/chapterChatLimits/current`);

test('revocation while started is delivered prevents the first provider call', async () => {
  const f = await editorChatGenerationFixture({ world: true });
  const result = await f.generate(await f.request(), {
    stream(event) {
      if (event.type === 'started') f.records.get('universes/world').deleting = true;
    },
  });
  assert.equal(result.turn.state, 'blocked');
  assert.equal(f.calls.length, 0);
  assert.equal(quota(f).count, 1);
});

test('transport abort before claim has no effect; after claim it stops without provider and retry still recognizes receipt', async () => {
  const f = await editorChatGenerationFixture();
  const controller = new AbortController(),
    request = await f.request();
  controller.abort();
  await assert.rejects(
    f.generate(request, { signal: controller.signal }),
    reason('operation-canceled'),
  );
  assert.equal(quota(f), undefined);
  assert.equal(f.records.get(contextPath(f, request.contextId)).summary.phase, 'ready');
  const afterClaim = new AbortController();
  const stopped = await f.generate(request, {
    signal: afterClaim.signal,
    stream(event) {
      if (event.type === 'started') afterClaim.abort();
    },
  });
  assert.equal(stopped.turn.state, 'stopped');
  assert.equal(f.calls.length, 0);
  assert.equal(quota(f).count, 1);
  assert.deepEqual(
    (await f.generate(request, { signal: controller.signal })).receipt,
    stopped.receipt,
  );
});

test('provider timeout is a neutral terminal failure with no automatic regeneration', async () => {
  const f = await editorChatGenerationFixture({
    generator: async () => {
      throw new DOMException('SECRET', 'TimeoutError');
    },
  });
  const request = await f.request(),
    result = await f.generate(request);
  assert.equal(result.turn.state, 'failed');
  assert.equal(result.turn.failureReason, 'provider-timeout');
  await f.generate(request);
  assert.equal(f.calls.length, 1);
  assert.equal(quota(f).count, 1);
});

test('BYOK completion after revocation settles blocked without opening body or storing the supplied answer', async () => {
  const f = await editorChatGenerationFixture({ world: true }),
    pending = await f.generate(await f.request({ generation: byok }));
  f.records.get('universes/world').deleting = true;
  f.events.length = 0;
  const completed = await f.generationMutate({
    action: 'completeBYOK',
    ...controls(f, pending.turn, 'revoked-completion'),
    rawAnswer: 'PRIVATE result',
  });
  assert.equal(completed.current.state, 'blocked');
  assert.equal(bodyReads(f).length, 0);
  assert.equal(JSON.stringify([...f.records]).includes('PRIVATE result'), false);
});

test('revoked model history requires explicit new conversation and never consumes a valid fresh context', async () => {
  const f = await editorChatGenerationFixture({ world: true });
  await f.generate(await f.request());
  f.records.get(f.path).universeId = null;
  const context = await f.fresh();
  f.events.length = 0;
  const request = await f.request({ id: 'history-revoked', context });
  await assert.rejects(f.generate(request), reason('history-revoked'));
  assert.equal(bodyReads(f).length, 0);
  assert.equal(quota(f).count, 1);
  assert.equal(f.records.get(contextPath(f, context.contextId)).summary.phase, 'ready');
  const created = await f.mutate({
    action: 'createConversation',
    ...f.resourceScope,
    operationId: 'clean-conversation',
    conversationId: 'clean-conversation',
    projectToken: f.conversation.projectToken,
    resourceToken: f.conversation.resourceToken,
  });
  const clean = await signed({
    ...request,
    operationId: 'clean-send',
    conversationId: created.current.conversationId,
    conversationToken: created.current.conversationToken,
    expectedConversationRevision: created.current.revision,
  });
  const result = await f.generate(clean);
  assert.equal(result.turn.state, 'done');
  assert.equal(quota(f).count, 2);
  assert.deepEqual(f.calls[1].history, []);
});

for (const block of [false, true])
  test(`adventure ${block ? 'additional' : 'main'} uses the same private generation protocol`, async () => {
    const f = await editorChatGenerationFixture({ kind: 'adventure', block });
    const result = await f.generate(await f.request());
    assert.equal(result.turn.state, 'done');
    const read = await f.get(result.turn.turnId);
    assert.equal(read.answer.context.source.resource.kind, block ? 'block' : 'scene');
    assert.equal(quota(f).count, 1);
  });

test('platform claim is atomic, streams indexed text, settles real body and never debits credits', async () => {
  const f = await editorChatGenerationFixture();
  f.records.set(`users/${uid}`, { credits: 7 });
  const request = await f.request(),
    result = await f.generate(request, { stream: f.stream });
  assert.equal(result.receipt.result.state, 'running');
  assert.equal(result.turn.state, 'done');
  assert.equal(result.delivery, 'server-stream');
  assert.equal(result.byokInput, null);
  assert.equal(f.calls.length, 1);
  assert.deepEqual(
    f.streamEvents.map((e) => e.type),
    ['started', 'delta', 'delta', 'settled'],
  );
  assert.deepEqual(
    f.streamEvents.filter((e) => e.type === 'delta').map((e) => e.index),
    [0, 1],
  );
  assert.deepEqual(quota(f), { hour: 0, count: 1 });
  assert.equal(f.records.get(`users/${uid}`).credits, 7);
  assert.equal(f.records.get(contextPath(f, request.contextId)).summary.phase, 'consumed');
  assert.equal(f.records.has(`users/${uid}/editorChatContextBodies/${request.contextId}`), false);
  const read = await f.get(request.operationId);
  assert.equal(read.question, request.prompt);
  assert.equal(read.answer.suggestion, 'Prosa');
  const stored = f.records.get(turnPath(f, request.operationId));
  assert.equal(stored.summary.paid, false);
  assert.equal(JSON.stringify(stored).includes(request.prompt), false);
  const before = quota(f).count;
  f.events.length = 0;
  const replay = await f.generate(request);
  assert.deepEqual(replay.receipt, result.receipt);
  assert.equal(replay.turn.state, 'done');
  assert.equal(f.calls.length, 1);
  assert.equal(quota(f).count, before);
  assert.equal(bodyReads(f).length, 0);
});

test('unknown cancel fence prevents a late claim and preserves context/quota', async () => {
  const f = await editorChatGenerationFixture(),
    request = await f.request();
  const canceled = await f.call({
    action: 'resolveOperation',
    operationId: request.operationId,
    operationAction: 'send',
    requestHash: request.requestHash,
    intent: 'cancel',
  });
  const result = await f.generate(request);
  assert.deepEqual(result, {
    receipt: canceled.receipt,
    turn: null,
    delivery: null,
    byokInput: null,
  });
  assert.equal(f.calls.length, 0);
  assert.equal(quota(f), undefined);
  assert.equal(f.records.get(contextPath(f, request.contextId)).summary.phase, 'ready');
});

test('quota is the existing shared hour/count contract, capped at 60; retry and rollover are exact', async () => {
  let clock = 5000;
  const f = await editorChatGenerationFixture({ now: () => clock }),
    request = await f.request();
  f.records.set(`users/${uid}/chapterChatLimits/current`, { hour: 0, count: 60 });
  await assert.rejects(f.generate(request), reason('chat-quota'));
  assert.equal(f.calls.length, 0);
  assert.equal(f.records.get(contextPath(f, request.contextId)).summary.phase, 'ready');
  f.records.set(`users/${uid}/chapterChatLimits/current`, { hour: 0, count: 59 });
  await f.generate(request);
  assert.deepEqual(quota(f), { hour: 0, count: 60 });
  await f.generate(request);
  assert.equal(quota(f).count, 60);
  const next = await f.fresh(),
    r = await f.request({ id: 'next-hour', context: next });
  clock = 3600005;
  await f.generate(r);
  assert.deepEqual(quota(f), { hour: 1, count: 1 });
});

test('BYOK freezes provider/input, reload reads it without quota, completion is idempotent and terminal input needs no origin', async () => {
  const f = await editorChatGenerationFixture({ world: true }),
    request = await f.request({ generation: byok });
  const result = await f.generate(request);
  assert.equal(result.turn.state, 'awaiting-byok');
  assert.equal(f.calls.length, 0);
  assert.equal(result.byokInput.prompt, request.prompt);
  assert.deepEqual(result.byokInput.generation.requested, byok);
  const get = {
    action: 'getByokInput',
    ...f.scope,
    turnId: result.turn.turnId,
    attemptToken: result.turn.attemptToken,
  };
  const recovered = await f.generate(get);
  assert.deepEqual(recovered.input, result.byokInput);
  assert.equal(quota(f).count, 1);
  const done = await signed({
    action: 'completeBYOK',
    ...controls(f, result.turn, 'complete'),
    rawAnswer: 'Resposta [[SUGESTAO]]Prosa privada[[/SUGESTAO]]',
  });
  const completed = await f.generate(done);
  assert.equal(completed.current.state, 'done');
  assert.deepEqual(await f.generate(done), { receipt: completed.receipt, current: null });
  assert.equal(quota(f).count, 1);
  f.records.delete(f.path);
  f.events.length = 0;
  const terminal = await f.generate(get);
  assert.equal(terminal.turn.state, 'done');
  assert.equal(terminal.input, null);
  assert.equal(bodyReads(f).length, 0);
  assert.equal(
    f.events.some((e) => e.path === 'universes/world'),
    false,
  );
});

test('stop by metadata after source removal fences late BYOK completion', async () => {
  const f = await editorChatGenerationFixture(),
    pending = await f.generate(await f.request({ generation: byok }));
  f.records.delete(f.path);
  f.events.length = 0;
  const stopped = await f.generationMutate({
    action: 'stopTurn',
    ...controls(f, pending.turn, 'stop'),
  });
  assert.equal(stopped.current.state, 'stopped');
  assert.equal(bodyReads(f).length, 0);
  assert.equal(quota(f).count, 1);
  await assert.rejects(
    f.generationMutate({
      action: 'completeBYOK',
      ...controls(f, pending.turn, 'late'),
      rawAnswer: 'Late answer',
    }),
    reason('revision-conflict'),
  );
  assert.equal(f.records.get(turnPath(f, pending.turn.turnId)).summary.state, 'stopped');
});

test('BYOK revocation blocks input and late result before body while preserving own question', async () => {
  const f = await editorChatGenerationFixture({ world: true }),
    pending = await f.generate(await f.request({ generation: byok }));
  f.records.get('universes/world').deleting = true;
  f.events.length = 0;
  const read = await f.generate({
    action: 'getByokInput',
    ...f.scope,
    turnId: pending.turn.turnId,
    attemptToken: pending.turn.attemptToken,
  });
  assert.equal(read.turn.state, 'blocked');
  assert.equal(read.input, null);
  assert.equal(bodyReads(f).length, 0);
  assert.equal((await f.get(pending.turn.turnId)).question, '  Pergunta própria\n');
});

test('one active turn prevents another claim without consuming its new context', async () => {
  const f = await editorChatGenerationFixture(),
    pending = await f.generate(await f.request({ generation: byok }));
  const next = await f.fresh(),
    request = await f.request({ id: 'other-send', context: next });
  await assert.rejects(f.generate(request), reason('conversation-busy'));
  assert.equal(f.records.get(contextPath(f, next.contextId)).summary.phase, 'ready');
  assert.equal(quota(f).count, 1);
  const failed = await f.generationMutate({
    action: 'failBYOK',
    ...controls(f, pending.turn, 'fail'),
    reason: 'credential-unavailable',
  });
  assert.equal(failed.current.state, 'failed');
  assert.equal(failed.current.failureReason, 'provider-unavailable');
  assert.equal(quota(f).count, 1);
});

test('platform stop wins a provider response that arrives late and ignores abort', async () => {
  let entered, release;
  const waiting = new Promise((resolve) => {
    entered = resolve;
  });
  const output = new Promise((resolve) => {
    release = resolve;
  });
  const f = await editorChatGenerationFixture({
    generator: async () => {
      entered();
      return output;
    },
  });
  const request = await f.request(),
    sending = f.generate(request, { stream: f.stream });
  await waiting;
  const stored = f.records.get(turnPath(f, request.operationId));
  await f.generationMutate({ action: 'stopTurn', ...controls(f, stored.summary, 'stop') });
  release('Resposta tardia [[SUGESTAO]]Não salvar[[/SUGESTAO]]');
  const result = await sending;
  assert.equal(result.turn.state, 'stopped');
  const read = await f.get(request.operationId);
  assert.equal(read.answer, null);
  assert.equal(quota(f).count, 1);
});

test('revocation between provider chunks blocks new text and terminal completion', async () => {
  const f = await editorChatGenerationFixture({
    world: true,
    generator: async (_input, onDelta) => {
      await onDelta('Primeiro');
      f.records.get('universes/world').deleting = true;
      await onDelta('secreto');
      return 'Primeirosecreto';
    },
  });
  const result = await f.generate(await f.request(), { stream: f.stream });
  assert.equal(result.turn.state, 'blocked');
  assert.deepEqual(
    f.streamEvents.filter((e) => e.type === 'delta').map((e) => e.text),
    ['Primeiro'],
  );
  assert.equal((await f.get(result.turn.turnId)).answer, null);
  assert.equal(quota(f).count, 1);
});

test('ordinary source/lore edits during generation do not interrupt the frozen snapshot', async () => {
  const f = await editorChatGenerationFixture({
    world: true,
    generator: async (_input, onDelta) => {
      f.records.get('universes/world').loreVersion++;
      f.records.get('universes/world/lore/aria').details = 'Editada';
      f.metadata.set(`${f.path}/scenes/${f.resource.id}`, { updatedAt: 999 });
      await onDelta('Resposta');
      return 'Resposta';
    },
  });
  const result = await f.generate(await f.request(), { stream: f.stream });
  assert.equal(result.turn.state, 'done');
  const read = await f.get(result.turn.turnId);
  assert.equal(read.answer.freshness, 'stale');
  assert.equal(read.answer.context.lore[0].detailsExcerpt, 'Fato secreto');
});

test('provider errors, malformed Unicode, marker violations and chunk mismatch settle neutrally without replay', async () => {
  for (const fake of [
    async () => {
      throw new Error('SECRET credential');
    },
    async () => '\ud800',
    async () => '[[SUGESTAO]]incompleta',
    async (_input, onDelta) => {
      await onDelta('Enviado');
      return 'Diferente';
    },
  ]) {
    const f = await editorChatGenerationFixture({ generator: fake }),
      request = await f.request(),
      result = await f.generate(request);
    assert.equal(result.turn.state, 'failed');
    assert.equal(result.turn.failureReason, 'provider-unavailable');
    assert.equal(JSON.stringify([...f.records]).includes('SECRET'), false);
    assert.equal(quota(f).count, 1);
    await f.generate(request);
    assert.equal(f.calls.length, 1);
    assert.equal((await f.get(request.operationId)).answer, null);
  }
});

test('cleanup during provider execution cannot recreate a deleted conversation or turn', async () => {
  let entered, release;
  const waiting = new Promise((resolve) => {
      entered = resolve;
    }),
    output = new Promise((resolve) => {
      release = resolve;
    });
  const f = await editorChatGenerationFixture({
    generator: async () => {
      entered();
      return output;
    },
  });
  const request = await f.request(),
    sending = f.generate(request);
  await waiting;
  let cleanup = (
    await f.mutate({ action: 'deleteConversation', ...f.scope, operationId: 'delete' })
  ).current;
  for (let i = 0; i < 10 && cleanup.state !== 'deleted'; i++)
    cleanup = (
      await f.mutate({
        action: 'advanceCleanup',
        cleanupId: cleanup.cleanupId,
        cleanupToken: cleanup.cleanupToken,
        expectedRevision: cleanup.revision,
        operationId: 'cleanup-' + i,
      })
    ).current;
  release('Resposta descartada');
  const result = await sending;
  assert.equal(result.receipt.outcome, 'confirmed');
  assert.equal(result.turn, null);
  assert.equal(f.records.has(turnPath(f, request.operationId)), false);
  assert.equal(
    f.records.get(`users/${uid}/editorChats/${f.conversation.conversationId}`).summary.state,
    'deleted',
  );
});

test('fresh send requires explicit fresh context; consumed context is never silently regenerated', async () => {
  const f = await editorChatGenerationFixture();
  await f.generate(await f.request());
  await assert.rejects(
    f.generate(await f.request({ id: 'consumed-again' })),
    reason('revision-conflict'),
  );
  const context = await f.fresh(),
    result = await f.generate(await f.request({ id: 'new-send', context }));
  assert.equal(result.turn.state, 'done');
  assert.equal(f.calls.length, 2);
  assert.equal(quota(f).count, 2);
  assert.equal(f.calls[1].history.length, 2);
});

test('preflight budgets the actual full documents before quota, claim or provider', async () => {
  const f = await editorChatGenerationFixture({
    setup(f) {
      const profile = structuredClone(DEFAULT_PERSONAS[0]);
      profile.id = 'large-profile';
      profile.instructions = '\u0000'.repeat(6000);
      for (const trait of profile.traits) {
        trait.description = '\u0000'.repeat(300);
        trait.low = '\u0000'.repeat(200);
        trait.high = '\u0000'.repeat(200);
      }
      for (let i = 0; i < 8; i++)
        profile.traits.push({
          ...structuredClone(profile.traits[0]),
          id: 'custom-' + i,
          name: 'Extra ' + i,
        });
      f.records.set(`users/${uid}/aiPersonas/${profile.id}`, profile);
      f.records.get(f.path).personaId = profile.id;
      for (let i = 0; i < 12; i++)
        f.records.set(`${f.path}/lore/lore-${String(i).padStart(2, '0')}`, {
          name: 'Aria' + i,
          aliases: Array.from({ length: 20 }, (_, n) => ('alias' + n).padEnd(180, '\u0000')),
          category: 'character',
          summary: 'Resumo',
          details: '\u0000'.repeat(2000),
          isPublic: false,
        });
    },
  });
  const names = Array.from({ length: 12 }, (_, i) => 'Aria' + i).join(' ');
  const context = await f.fresh('large-context', {
    ...f.prepare.capture,
    text: names.padEnd(18000, '\u0000'),
    surroundingText: '\u0000'.repeat(22000),
  });
  await assert.rejects(f.generate(await f.request({ context })), reason('body-too-large'));
  assert.equal(f.calls.length, 0);
  assert.equal(quota(f), undefined);
  assert.equal(f.records.get(contextPath(f, context.contextId)).summary.phase, 'ready');
});
