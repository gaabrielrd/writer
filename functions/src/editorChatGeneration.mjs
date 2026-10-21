// Claim and terminal writes are transactional; provider HTTP is deliberately outside Firestore.
import { randomBytes as secureRandomBytes } from 'node:crypto';
import {
  editorChatClosed,
  editorChatFail,
  editorChatSourceId,
  editorChatText,
  editorChatTextHash,
  editorChatRevision,
  editorChatHashToken,
  normalizeEditorChatDTO,
  normalizeEditorChatAnswer,
  verifyEditorChatRequest,
  nextEditorChatRevision,
  mergeEditorChatClosures,
  assertEditorChatEnvelope,
  assertEditorChatTurnPreflight,
} from './editorChatContracts.mjs';
import { resolveChatGeneration } from './chatGeneration.mjs';
import { chatInstruction } from './chapterChat.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import { readEditorChatContext, readEditorChatReadyContext } from './editorChatContext.mjs';
import {
  readEditorChatConversation,
  prepareEditorChatCatalogUpdate,
} from './editorChatConversations.mjs';
import {
  readEditorChatTurnMetadata,
  readEditorChatOwnQuestion,
  readEditorChatAuthorizedTurn,
  selectEditorChatModelHistory,
  editorChatModelAnswer,
  editorChatTurnRef,
} from './editorChatHistoryRead.mjs';
import { readEditorChatOperation, writeEditorChatReceipt } from './editorChatOperations.mjs';

export const EDITOR_CHAT_GENERATION_ACTIONS = Object.freeze([
  'send',
  'getByokInput',
  'stopTurn',
  'completeBYOK',
  'failBYOK',
]);
const scopeOf = (r) => ({ target: r.target, resource: r.resource });
const turnRequest = (r, turn) => ({
  ...scopeOf(r),
  conversationId: r.conversationId,
  conversationToken: r.conversationToken,
  turnId: turn.turnId,
  attemptToken: turn.attemptToken,
});
const bodyRef = (db, uid, c, id) => db.doc(`users/${uid}/editorChats/${c}/turnBodies/${id}`);
const questionRef = (db, uid, c, id) => db.doc(`users/${uid}/editorChats/${c}/turnQuestions/${id}`);
const date = (now, previous = 0) => {
  const value = Math.max(now(), previous + 1);
  if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000)
    editorChatFail('inconsistent');
  return value;
};
const resultTurn = (conversation, turn) => ({
  kind: 'turn',
  conversationId: conversation.conversationId,
  conversationToken: conversation.conversationToken,
  turnId: turn.turnId,
  attemptToken: turn.attemptToken,
  revision: turn.revision,
  state: turn.state,
});
const active = (conversation, turn) =>
  conversation.summary.state === 'open' &&
  conversation.summary.activeTurnId === turn.summary.turnId &&
  ['running', 'awaiting-byok'].includes(turn.summary.state);
const privateBodyIdentity = (uid, c, t) => ({
  schemaVersion: 1,
  ownerId: uid,
  conversationId: c.conversationId,
  conversationToken: c.conversationToken,
  turnId: t.turnId,
  attemptToken: t.attemptToken,
});
const emptySend = (receipt) => ({ receipt, turn: null, delivery: null, byokInput: null });

export function createEditorChatGenerationService({
  db,
  now = Date.now,
  randomBytes = secureRandomBytes,
  generator,
  platformModel = 'gemini-3.7-flash',
}) {
  if (typeof platformModel !== 'string' || !/^[a-zA-Z0-9._:-]{1,120}$/.test(platformModel))
    editorChatFail('inconsistent');
  async function attempt(tx, uid, r) {
    const conversation = await readEditorChatConversation(
      tx,
      db,
      uid,
      r.conversationId,
      r.conversationToken,
      scopeOf(r),
    );
    const turn = await readEditorChatTurnMetadata(tx, db, uid, conversation, r.turnId);
    if (turn.summary.attemptToken !== r.attemptToken) editorChatFail('identity-changed');
    return { conversation, turn };
  }
  async function finishPlan(tx, uid, conversation, turn, state, failureReason, body = null) {
    const update = await prepareEditorChatCatalogUpdate(
      tx,
      db,
      uid,
      date(now, Math.max(conversation.summary.updatedAt, turn.summary.updatedAt)),
    );
    const summary = normalizeEditorChatDTO('turn', {
      ...turn.summary,
      state,
      failureReason,
      revision: nextEditorChatRevision(turn.summary.revision),
      suggestionAvailable: state === 'done' && body.answer.suggestion !== null,
      updatedAt: update.updatedAt,
    });
    const record = {
      ...turn.record,
      summary,
      modelAnswerChars: state === 'done' ? editorChatModelAnswer(body.answer).length : 0,
    };
    const convSummary = {
      ...conversation.summary,
      activeTurnId: null,
      revision: nextEditorChatRevision(conversation.summary.revision),
      updatedAt: update.updatedAt,
    };
    assertEditorChatEnvelope(record);
    if (body) assertEditorChatEnvelope(body);
    return {
      summary,
      updatedAt: update.updatedAt,
      commit() {
        tx.set(turn.ref, record);
        if (body)
          tx.set(bodyRef(db, uid, conversation.summary.conversationId, turn.summary.turnId), body);
        tx.set(conversation.ref, { ...conversation.record, summary: convSummary });
        update.commit();
      },
    };
  }
  // Full current metadata proof before every externally delivered chunk. No body or time cache.
  async function gate(uid, r) {
    return db.runTransaction(async (tx) => {
      const { conversation, turn } = await attempt(tx, uid, r);
      if (!active(conversation, turn))
        return { ok: false, summary: turn.summary, reason: 'turn-stopped' };
      try {
        await readEditorChatAuthorizedTurn(tx, db, uid, conversation, turn, { includeBody: false });
      } catch (error) {
        if (error.details?.reason !== 'provenance-revoked') throw error;
        const plan = await finishPlan(tx, uid, conversation, turn, 'blocked', 'provenance-revoked');
        plan.commit();
        return { ok: false, summary: plan.summary, reason: 'provenance-revoked' };
      }
      return { ok: true, summary: turn.summary };
    });
  }
  async function closeAutomatic(uid, r, state, reason, raw) {
    try {
      return await db.runTransaction(async (tx) => {
        const { conversation, turn } = await attempt(tx, uid, r);
        if (!active(conversation, turn)) return turn.summary;
        let read = null;
        try {
          read = await readEditorChatAuthorizedTurn(tx, db, uid, conversation, turn, {
            includeBody: state === 'done',
          });
        } catch (error) {
          if (error.details?.reason !== 'provenance-revoked') throw error;
          state = 'blocked';
          reason = 'provenance-revoked';
        }
        const body =
          state === 'done' ? { ...read.body, answer: normalizeEditorChatAnswer(raw) } : null;
        const plan = await finishPlan(tx, uid, conversation, turn, state, reason, body);
        plan.commit();
        return plan.summary;
      });
    } catch (error) {
      if (['conversation-unavailable', 'turn-unavailable'].includes(error.details?.reason))
        return null;
      throw error;
    }
  }
  async function byokRead(uid, r) {
    return db.runTransaction(async (tx) => {
      const { conversation, turn } = await attempt(tx, uid, r);
      if (turn.summary.provider !== 'byok') editorChatFail('invalid-request');
      if (turn.summary.state !== 'awaiting-byok' || conversation.summary.state !== 'open')
        return { turn: turn.summary, input: null };
      if (conversation.summary.activeTurnId !== turn.summary.turnId) editorChatFail('inconsistent');
      let read;
      try {
        read = await readEditorChatAuthorizedTurn(tx, db, uid, conversation, turn);
      } catch (error) {
        if (error.details?.reason !== 'provenance-revoked') throw error;
        const plan = await finishPlan(tx, uid, conversation, turn, 'blocked', 'provenance-revoked');
        plan.commit();
        return { turn: plan.summary, input: null };
      }
      const prompt = await readEditorChatOwnQuestion(tx, db, uid, conversation, turn);
      const input = normalizeEditorChatDTO('byokInput', {
        turnId: r.turnId,
        attemptToken: r.attemptToken,
        generation: turn.summary.generation,
        systemInstruction: read.body.systemInstruction,
        prompt,
        context: read.body.context,
        history: read.body.historyMessages,
        closureHash: turn.summary.closureHash,
      });
      return normalizeEditorChatDTO('byokRead', { turn: turn.summary, input });
    });
  }
  async function projectSend(uid, r, receipt) {
    if (receipt.outcome === 'canceled') return emptySend(receipt);
    if (
      receipt.result.conversationId !== r.conversationId ||
      receipt.result.conversationToken !== r.conversationToken
    )
      editorChatFail('inconsistent');
    let state;
    try {
      state = await db.runTransaction(async (tx) => {
        const conversation = await readEditorChatConversation(
          tx,
          db,
          uid,
          receipt.result.conversationId,
          receipt.result.conversationToken,
          scopeOf(r),
        );
        if (conversation.summary.state !== 'open') return null;
        const turn = await readEditorChatTurnMetadata(
          tx,
          db,
          uid,
          conversation,
          receipt.result.turnId,
        );
        if (turn.summary.attemptToken !== receipt.result.attemptToken)
          editorChatFail('inconsistent');
        return turn.summary;
      });
    } catch (error) {
      if (
        !['conversation-unavailable', 'turn-unavailable', 'identity-changed'].includes(
          error.details?.reason,
        )
      )
        throw error;
      return emptySend(receipt);
    }
    if (state === null) return emptySend(receipt);
    let input = null;
    if (state.provider === 'byok' && state.state === 'awaiting-byok') {
      const current = await byokRead(uid, turnRequest(r, state));
      state = current.turn;
      input = current.input;
    }
    return normalizeEditorChatDTO(
      'sendResult',
      {
        receipt,
        turn: state,
        delivery: state.provider === 'platform' ? 'server-stream' : 'byok',
        byokInput: input,
      },
      { action: 'send', operationId: r.operationId, requestHash: r.requestHash },
    );
  }
  async function claim(uid, r, attemptToken, signal) {
    return db.runTransaction(async (tx) => {
      const operation = await readEditorChatOperation(tx, db, uid, r);
      if (operation.receipt)
        return { receipt: operation.receipt, created: false, input: null, turn: null };
      if (operation.pending) editorChatFail('operation-pending');
      if (signal?.aborted) editorChatFail('operation-canceled');
      const conversation = await readEditorChatConversation(
        tx,
        db,
        uid,
        r.conversationId,
        r.conversationToken,
        scopeOf(r),
      );
      if (conversation.summary.state !== 'open') editorChatFail('conversation-unavailable');
      if (conversation.summary.revision !== r.expectedConversationRevision)
        editorChatFail('revision-conflict');
      if (conversation.summary.activeTurnId !== null) editorChatFail('conversation-busy');
      const context = await readEditorChatContext(
        tx,
        db,
        uid,
        r.contextId,
        r.contextToken,
        scopeOf(r),
      );
      if (context.summary.revision !== r.expectedContextRevision)
        editorChatFail('revision-conflict');
      if (context.summary.phase === 'consumed') editorChatFail('context-consumed');
      if (
        context.summary.projectToken !== conversation.summary.projectToken ||
        context.summary.resourceToken !== conversation.summary.resourceToken
      )
        editorChatFail('identity-changed');
      const ready = await readEditorChatReadyContext(tx, db, uid, context, {
        requireCurrent: true,
      });
      const history = await selectEditorChatModelHistory(tx, db, uid, conversation);
      const closure = await mergeEditorChatClosures(ready.frozen.closure, history.closure);
      const turnId = r.operationId,
        ref = editorChatTurnRef(db, uid, r.conversationId, turnId);
      for (const candidate of [
        ref,
        questionRef(db, uid, r.conversationId, turnId),
        bodyRef(db, uid, r.conversationId, turnId),
      ])
        if ((await readWorkMetadata(tx, candidate, ['schemaVersion'])).exists)
          editorChatFail('operation-conflict');
      const generation = resolveChatGeneration(r.generation, platformModel);
      if (generation.requested.provider === 'platform' && typeof generator !== 'function')
        editorChatFail('provider-unavailable');
      const timestamp = date(now, conversation.summary.updatedAt);
      const update = await prepareEditorChatCatalogUpdate(tx, db, uid, timestamp);
      const state = generation.requested.provider === 'platform' ? 'running' : 'awaiting-byok';
      const summary = normalizeEditorChatDTO('turn', {
        schemaVersion: 1,
        turnId,
        conversationId: r.conversationId,
        revision: 1,
        attemptToken,
        state,
        provider: generation.requested.provider === 'platform' ? 'platform' : 'byok',
        generation,
        contextHash: ready.frozen.contextHash,
        closureHash: closure.closureHash,
        sourceToken: ready.frozen.source.sourceToken,
        suggestionAvailable: false,
        paid: false,
        failureReason: null,
        createdAt: update.updatedAt,
        updatedAt: update.updatedAt,
      });
      const questionHash = await editorChatTextHash(r.prompt);
      const identity = privateBodyIdentity(uid, conversation.summary, summary);
      const question = { ...identity, question: r.prompt, questionHash };
      const body = {
        ...identity,
        context: ready.frozen,
        systemInstruction: chatInstruction,
        historyMessages: history.messages,
        history: history.history,
        answer: null,
      };
      const record = {
        schemaVersion: 1,
        ownerId: uid,
        conversationId: r.conversationId,
        conversationToken: r.conversationToken,
        turnId,
        summary,
        closureManifest: { version: 1, leaves: closure.leaves },
        closureHash: closure.closureHash,
        proofCoverage: context.record.proofCoverage,
        questionChars: r.prompt.length,
        modelAnswerChars: 0,
        questionHash,
      };
      const convSummary = {
        ...conversation.summary,
        activeTurnId: turnId,
        revision: nextEditorChatRevision(conversation.summary.revision),
        updatedAt: update.updatedAt,
      };
      const contextRecord = {
        ...context.record,
        summary: {
          ...context.summary,
          phase: 'consumed',
          turnId,
          revision: nextEditorChatRevision(context.summary.revision),
          updatedAt: date(() => update.updatedAt, context.summary.updatedAt),
        },
      };
      const quotaRef = db.doc(`users/${uid}/chapterChatLimits/current`),
        quota = (await tx.get(quotaRef)).data();
      const quotaNow = now();
      editorChatRevision(quotaNow);
      const hour = Math.floor(quotaNow / 3600000);
      let count = 0;
      if (quota) {
        try {
          editorChatClosed(quota, ['hour', 'count']);
          editorChatRevision(quota.hour);
          editorChatRevision(quota.count);
        } catch {
          editorChatFail('inconsistent');
        }
        count = quota.hour === hour ? quota.count : 0;
      }
      // Serialize the actual stored documents, including metadata and the separate own question.
      assertEditorChatTurnPreflight({ record, question, body });
      for (const doc of [
        record,
        question,
        body,
        contextRecord,
        { ...conversation.record, summary: convSummary },
      ])
        assertEditorChatEnvelope(doc);
      if (count >= 60) editorChatFail('chat-quota');
      tx.create(ref, record);
      tx.create(questionRef(db, uid, r.conversationId, turnId), question);
      tx.create(bodyRef(db, uid, r.conversationId, turnId), body);
      tx.set(conversation.ref, { ...conversation.record, summary: convSummary });
      update.commit();
      tx.set(context.ref, contextRecord);
      tx.delete(db.doc(`users/${uid}/editorChatContextBodies/${r.contextId}`));
      tx.set(quotaRef, { hour, count: count + 1 });
      const receipt = writeEditorChatReceipt(
        tx,
        operation,
        uid,
        r,
        resultTurn(conversation.summary, summary),
        update.updatedAt,
      );
      const input = {
        turnId,
        attemptToken,
        generation,
        systemInstruction: body.systemInstruction,
        prompt: r.prompt,
        context: body.context,
        history: body.historyMessages,
        closureHash: closure.closureHash,
      };
      return { receipt, created: true, input, turn: summary };
    });
  }
  async function control(uid, r) {
    return db.runTransaction(async (tx) => {
      const operation = await readEditorChatOperation(tx, db, uid, r);
      if (operation.receipt) return { receipt: operation.receipt, current: null };
      if (operation.pending) editorChatFail('operation-pending');
      const { conversation, turn } = await attempt(tx, uid, r);
      const timestamp = date(now, turn.summary.updatedAt);
      if (r.action !== 'stopTurn' && turn.summary.provider !== 'byok')
        editorChatFail('invalid-request');
      if (!active(conversation, turn)) {
        if (r.action === 'completeBYOK') editorChatFail('revision-conflict');
        return {
          receipt: writeEditorChatReceipt(
            tx,
            operation,
            uid,
            r,
            resultTurn(conversation.summary, turn.summary),
            timestamp,
          ),
          current: turn.summary,
        };
      }
      if (r.action === 'completeBYOK' && turn.summary.state !== 'awaiting-byok')
        editorChatFail('revision-conflict');
      let state =
        r.action === 'completeBYOK'
          ? 'done'
          : r.action === 'stopTurn' || r.reason === 'user-stopped'
            ? 'stopped'
            : 'failed';
      let failureReason =
        state === 'done' ? null : state === 'stopped' ? 'turn-stopped' : 'provider-unavailable';
      let body = null;
      if (state === 'done') {
        try {
          const read = await readEditorChatAuthorizedTurn(tx, db, uid, conversation, turn);
          body = { ...read.body, answer: normalizeEditorChatAnswer(r.rawAnswer) };
        } catch (error) {
          if (error.details?.reason !== 'provenance-revoked') throw error;
          state = 'blocked';
          failureReason = 'provenance-revoked';
        }
      }
      const plan = await finishPlan(tx, uid, conversation, turn, state, failureReason, body);
      plan.commit();
      return {
        receipt: writeEditorChatReceipt(
          tx,
          operation,
          uid,
          r,
          resultTurn(conversation.summary, plan.summary),
          plan.updatedAt,
        ),
        current: plan.summary,
      };
    });
  }
  async function dispatch(uid, data, { stream, signal } = {}) {
    if (!uid) editorChatFail('auth-required');
    editorChatSourceId(uid);
    const r = await verifyEditorChatRequest(data);
    if (!EDITOR_CHAT_GENERATION_ACTIONS.includes(r.action)) editorChatFail('invalid-request');
    if (r.action === 'getByokInput') return byokRead(uid, r);
    if (r.action !== 'send') return control(uid, r);
    const claimed = await claim(
      uid,
      r,
      editorChatHashToken(randomBytes(32).toString('hex')),
      signal,
    );
    if (!claimed.created || claimed.turn.provider === 'byok')
      return projectSend(uid, r, claimed.receipt);
    const request = turnRequest(r, claimed.turn),
      controller = new AbortController();
    const combined = signal ? AbortSignal.any([signal, controller.signal]) : controller.signal;
    let partial = '',
      index = 0,
      accepting = true,
      tail = Promise.resolve();
    const emit = async (event) => {
      if (stream) await stream(normalizeEditorChatDTO('streamEvent', event));
    };
    const verifyGate = async () => {
      combined.throwIfAborted();
      const checked = await gate(uid, request);
      if (!checked.ok) {
        controller.abort();
        editorChatFail(checked.reason);
      }
      return checked.summary;
    };
    try {
      const started = await verifyGate();
      await emit({ type: 'started', turn: started });
      // Awaiting the transport is not an authorization proof for the subsequent provider input.
      await verifyGate();
      const raw = await generator(
        claimed.input,
        (chunk) => {
          if (!accepting) return Promise.reject(new Error('Generation closed'));
          tail = tail.then(async () => {
            editorChatText(chunk, 24000);
            partial += chunk;
            if (partial.length > 24000) editorChatFail('provider-unavailable');
            await verifyGate();
            await emit({
              type: 'delta',
              turnId: request.turnId,
              attemptToken: request.attemptToken,
              index: index++,
              text: chunk,
            });
          });
          return tail;
        },
        { signal: combined },
      );
      accepting = false;
      await tail;
      combined.throwIfAborted();
      editorChatText(raw, 24000, true);
      if (index > 0 && raw !== partial) editorChatFail('provider-unavailable');
      normalizeEditorChatAnswer(raw);
      const settled = await closeAutomatic(uid, request, 'done', null, raw);
      if (settled) await emit({ type: 'settled', turn: settled });
    } catch (error) {
      accepting = false;
      controller.abort();
      const stopped = signal?.aborted || error?.name === 'AbortError';
      const timeout = error?.name === 'TimeoutError';
      const settled = await closeAutomatic(
        uid,
        request,
        stopped ? 'stopped' : 'failed',
        stopped ? 'turn-stopped' : timeout ? 'provider-timeout' : 'provider-unavailable',
      );
      try {
        if (settled) await emit({ type: 'settled', turn: settled });
      } catch {
        /* No transport error is stored or echoed. */
      }
    }
    return projectSend(uid, r, claimed.receipt);
  }
  return { dispatch };
}
