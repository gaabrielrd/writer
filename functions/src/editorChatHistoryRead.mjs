// History is private. A manifest is permission input; a body is never permission input.
import {
  editorChatClosed,
  editorChatFail,
  editorChatId,
  editorChatText,
  editorChatTextHash,
  editorChatRevision,
  editorChatHashToken,
  canonicalEditorChatJSON,
  normalizeEditorChatDTO,
  verifyEditorChatClosure,
  verifyEditorChatSnapshot,
  mergeEditorChatClosures,
  selectEditorChatHistoryMetadata,
  assertEditorChatEnvelope,
} from './editorChatContracts.mjs';
import {
  authorizeEditorChatManifest,
  readEditorChatLore,
  editorChatNativeStamp,
  readEditorChatPersona,
} from './editorChatContextRead.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
const same = (a, b) => canonicalEditorChatJSON(a) === canonicalEditorChatJSON(b);
const fail = () => editorChatFail('inconsistent');
const requireOpen = (conversation) => {
  if (conversation.summary.state !== 'open') editorChatFail('conversation-unavailable');
};
export const editorChatTurnRef = (db, uid, conversationId, turnId) =>
  db.doc(`users/${uid}/editorChats/${conversationId}/turns/${editorChatId(turnId)}`);
const childRef = (db, uid, conversationId, kind, id) =>
  db.doc(`users/${uid}/editorChats/${conversationId}/${kind}/${id}`);

export function editorChatModelAnswer(answer) {
  editorChatClosed(answer, ['text', 'suggestion']);
  const text = editorChatText(answer.text, 24000);
  const suggestion =
    answer.suggestion === null ? null : editorChatText(answer.suggestion, 16000, true);
  if (text.length + (suggestion?.length ?? 0) > 24000) fail();
  return text + (suggestion === null ? '' : '\n\n[[SUGESTAO]]' + suggestion + '[[/SUGESTAO]]');
}

function validateProof(v) {
  // This flat coherence snapshot is not an authorization cache for inherited leaves.
  editorChatClosed(v, ['source', 'environment', 'persona']);
  normalizeEditorChatDTO('source', v.source);
  editorChatClosed(v.environment, ['localVersion', 'world', 'authorization']);
  editorChatRevision(v.environment.localVersion);
  if (v.environment.world !== null) {
    const w = v.environment.world;
    editorChatClosed(w, ['id', 'available', 'scopeToken', 'loreVersion', 'privacyVersion']);
    editorChatText(w.id, 1500, true);
    if (typeof w.available !== 'boolean') fail();
    if (w.scopeToken !== null) editorChatHashToken(w.scopeToken);
    for (const key of ['loreVersion', 'privacyVersion'])
      if (w[key] !== null) editorChatRevision(w[key]);
  }
  if (v.environment.authorization !== null) {
    editorChatClosed(v.environment.authorization, ['token', 'epoch']);
    editorChatHashToken(v.environment.authorization.token);
    editorChatRevision(v.environment.authorization.epoch);
  }
  editorChatClosed(v.persona, ['bindings', 'profiles']);
  if (
    !Array.isArray(v.persona.bindings) ||
    v.persona.bindings.length > 2 ||
    !Array.isArray(v.persona.profiles) ||
    v.persona.profiles.length !== 2
  )
    fail();
  for (const b of v.persona.bindings) {
    editorChatClosed(b, ['scopeKind', 'scopeId', 'identityToken', 'value', 'personaRevision']);
    if (!['book', 'chapter', 'adventure', 'scene'].includes(b.scopeKind)) fail();
    editorChatText(b.scopeId, 1500, true);
    editorChatHashToken(b.identityToken);
    editorChatRevision(b.personaRevision);
    if (b.value !== null) {
      if (typeof b.value === 'string') editorChatText(b.value, 100, true);
      else {
        editorChatClosed(b.value, ['personaId', 'overrides']);
        editorChatText(b.value.personaId, 100, true);
        if (!Array.isArray(b.value.overrides) || b.value.overrides.length > 16) fail();
        for (const o of b.value.overrides) {
          editorChatClosed(o, ['traitId', 'value']);
          editorChatText(o.traitId, 100, true);
          if (!Number.isInteger(o.value) || o.value < 0 || o.value > 100) fail();
        }
      }
    }
  }
  for (const p of v.persona.profiles)
    if (p !== null) {
      editorChatClosed(p, ['kind', 'id', 'identityToken', 'revision', 'capturedStamp']);
      if (!['preset', 'custom'].includes(p.kind)) fail();
      editorChatText(p.id, 100, true);
      editorChatHashToken(p.identityToken);
      editorChatRevision(p.revision);
      if (p.capturedStamp !== null) {
        editorChatClosed(p.capturedStamp, ['seconds', 'nanoseconds']);
        if (
          !Number.isSafeInteger(p.capturedStamp.seconds) ||
          !Number.isInteger(p.capturedStamp.nanoseconds) ||
          p.capturedStamp.nanoseconds < 0 ||
          p.capturedStamp.nanoseconds >= 1e9
        )
          fail();
      }
    }
}

export async function readEditorChatTurnMetadata(tx, db, uid, conversation, turnId) {
  const ref = editorChatTurnRef(db, uid, conversation.summary.conversationId, turnId);
  const record = (await tx.get(ref)).data();
  if (!record || record.ownerId !== uid) editorChatFail('turn-unavailable');
  try {
    editorChatClosed(record, [
      'schemaVersion',
      'ownerId',
      'conversationId',
      'conversationToken',
      'turnId',
      'summary',
      'closureManifest',
      'closureHash',
      'proofCoverage',
      'questionChars',
      'modelAnswerChars',
      'questionHash',
    ]);
    const summary = normalizeEditorChatDTO('turn', record.summary);
    if (
      record.schemaVersion !== 1 ||
      record.conversationId !== conversation.summary.conversationId ||
      record.conversationToken !== conversation.summary.conversationToken ||
      record.turnId !== turnId ||
      summary.turnId !== turnId ||
      summary.conversationId !== record.conversationId ||
      summary.closureHash !== record.closureHash
    )
      fail();
    editorChatClosed(record.closureManifest, ['version', 'leaves']);
    if (record.closureManifest.version !== 1) fail();
    const closure = await verifyEditorChatClosure({
      schemaVersion: 1,
      leaves: record.closureManifest.leaves,
      closureHash: record.closureHash,
    });
    const q = editorChatRevision(record.questionChars),
      a = editorChatRevision(record.modelAnswerChars);
    if (
      q < 1 ||
      q > 4000 ||
      a > 24000 + '\n\n[[SUGESTAO]][[/SUGESTAO]]'.length ||
      (summary.state !== 'done' && a !== 0)
    )
      fail();
    editorChatHashToken(record.questionHash);
    validateProof(record.proofCoverage);
    if (
      record.proofCoverage.source.projectToken !== conversation.summary.projectToken ||
      record.proofCoverage.source.sourceToken !== summary.sourceToken ||
      record.proofCoverage.source.resourceToken !== conversation.summary.resourceToken ||
      !same(record.proofCoverage.source.target, conversation.summary.target) ||
      !same(record.proofCoverage.source.resource, conversation.summary.resource)
    )
      fail();
    assertEditorChatEnvelope(record);
    return { ref, record, summary, closure };
  } catch {
    fail();
  }
}

export async function readEditorChatOwnQuestion(tx, db, uid, conversation, turn) {
  requireOpen(conversation);
  const value = (
    await tx.get(
      childRef(db, uid, conversation.summary.conversationId, 'turnQuestions', turn.summary.turnId),
    )
  ).data();
  try {
    editorChatClosed(value, [
      'schemaVersion',
      'ownerId',
      'conversationId',
      'conversationToken',
      'turnId',
      'attemptToken',
      'question',
      'questionHash',
    ]);
    if (
      value.schemaVersion !== 1 ||
      value.ownerId !== uid ||
      value.conversationId !== conversation.summary.conversationId ||
      value.conversationToken !== conversation.summary.conversationToken ||
      value.turnId !== turn.summary.turnId ||
      value.attemptToken !== turn.summary.attemptToken ||
      value.questionHash !== turn.record.questionHash
    )
      fail();
    const question = editorChatText(value.question, 4000, true);
    if (
      question.length !== turn.record.questionChars ||
      (await editorChatTextHash(question)) !== value.questionHash
    )
      fail();
    assertEditorChatEnvelope(value);
    return question;
  } catch {
    fail();
  }
}

async function authorizeTurn(tx, db, uid, conversation, turn) {
  try {
    return await authorizeEditorChatManifest(
      tx,
      db,
      uid,
      { target: conversation.summary.target, resource: conversation.summary.resource },
      turn.record.closureManifest,
      turn.record.closureHash,
    );
  } catch (error) {
    if (error.details?.reason === 'inconsistent') throw error;
    editorChatFail('provenance-revoked');
  }
}
async function readAuthorizedBody(tx, db, uid, conversation, turn) {
  const value = (
    await tx.get(
      childRef(db, uid, conversation.summary.conversationId, 'turnBodies', turn.summary.turnId),
    )
  ).data();
  try {
    editorChatClosed(value, [
      'schemaVersion',
      'ownerId',
      'conversationId',
      'conversationToken',
      'turnId',
      'attemptToken',
      'context',
      'systemInstruction',
      'historyMessages',
      'history',
      'answer',
    ]);
    if (
      value.schemaVersion !== 1 ||
      value.ownerId !== uid ||
      value.conversationId !== conversation.summary.conversationId ||
      value.conversationToken !== conversation.summary.conversationToken ||
      value.turnId !== turn.summary.turnId ||
      value.attemptToken !== turn.summary.attemptToken
    )
      fail();
    assertEditorChatEnvelope(value);
    const context = await verifyEditorChatSnapshot(value.context);
    if (
      context.contextHash !== turn.summary.contextHash ||
      !same(context.source, turn.record.proofCoverage.source) ||
      context.source.sourceToken !== turn.summary.sourceToken ||
      context.source.projectToken !== conversation.summary.projectToken ||
      context.source.resourceToken !== conversation.summary.resourceToken
    )
      fail();
    for (const leaf of context.closure.leaves)
      if (!turn.closure.leaves.some((l) => same(l, leaf))) fail();
    editorChatText(value.systemInstruction);
    const history = normalizeEditorChatDTO('history', value.history);
    if (
      !Array.isArray(value.historyMessages) ||
      value.historyMessages.length !== history.recordCount
    )
      fail();
    let chars = 0;
    value.historyMessages.forEach((m, i) => {
      editorChatClosed(m, ['role', 'text']);
      if (m.role !== (i % 2 ? 'assistant' : 'user')) fail();
      chars += editorChatText(m.text, 32000).length;
    });
    if (chars !== history.characterCount) fail();
    if ((turn.summary.state === 'done') !== (value.answer !== null)) fail();
    if (value.answer !== null) {
      const modelAnswer = editorChatModelAnswer(value.answer);
      if (
        modelAnswer.length !== turn.record.modelAnswerChars ||
        (value.answer.suggestion !== null) !== turn.summary.suggestionAvailable
      )
        fail();
    }
    return { ...value, context, history };
  } catch {
    fail();
  }
}
async function freshness(tx, db, uid, authorized, body, turn) {
  if (!same(authorized.source.source, body.context.source)) return 'stale';
  for (const snapshot of body.context.lore) {
    const current = await readEditorChatLore(
      tx,
      db,
      authorized.source,
      authorized.environment,
      snapshot.reference,
    );
    if (
      snapshot.capturedRevision !== null
        ? snapshot.capturedRevision !== current.record.revision
        : !same(snapshot.capturedStamp, editorChatNativeStamp(current.snapshot, 'updateTime'))
    )
      return 'stale';
  }
  for (const profile of [body.context.persona.base, body.context.persona.complement])
    if (profile?.kind === 'custom') {
      const snapshot = await readWorkMetadata(tx, db.doc(`users/${uid}/aiPersonas/${profile.id}`), [
        'revision',
      ]);
      if (snapshot.data()?.revision !== profile.revision) return 'stale';
    }
  // Context capture may be older even if its selected origins have not changed.
  if (!same(authorized.environment, turn.record.proofCoverage.environment)) return 'stale';
  try {
    const persona = await readEditorChatPersona(tx, db, authorized.source);
    if (!same(persona.proof.bindings, turn.record.proofCoverage.persona.bindings)) return 'stale';
  } catch (error) {
    // A newly selected profile is not an origin of the old answer. Never revoke the old body for it.
    if (error.details?.reason === 'provenance-revoked') return 'stale';
    return 'unknown';
  }
  return 'current';
}

export async function readEditorChatAuthorizedTurn(
  tx,
  db,
  uid,
  conversation,
  turn,
  { includeBody = true } = {},
) {
  requireOpen(conversation);
  const authorized = await authorizeTurn(tx, db, uid, conversation, turn);
  if (!includeBody) return { authorized, body: null, freshness: 'unknown' };
  const body = await readAuthorizedBody(tx, db, uid, conversation, turn);
  return { authorized, body, freshness: await freshness(tx, db, uid, authorized, body, turn) };
}

export async function selectEditorChatModelHistory(tx, db, uid, conversation) {
  requireOpen(conversation);
  const path = `users/${uid}/editorChats/${conversation.summary.conversationId}/turns`;
  const page = await tx.get(
    db
      .collection(path)
      .where('summary.state', '==', 'done')
      .orderBy('summary.createdAt', 'desc')
      .orderBy('__name__', 'desc')
      .limit(11),
  );
  const turns = [];
  for (const doc of page.docs)
    turns.push(await readEditorChatTurnMetadata(tx, db, uid, conversation, doc.id));
  const history = selectEditorChatHistoryMetadata(
    turns.map((t) => ({
      turnId: t.summary.turnId,
      state: t.summary.state,
      questionChars: t.record.questionChars,
      modelAnswerChars: t.record.modelAnswerChars,
    })),
    page.docs.length === 11,
  );
  const selected = history.turnIds.map((id) => turns.find((t) => t.summary.turnId === id));
  const closure = await mergeEditorChatClosures(...selected.map((t) => t.closure));
  if (selected.length) {
    try {
      await authorizeEditorChatManifest(
        tx,
        db,
        uid,
        { target: conversation.summary.target, resource: conversation.summary.resource },
        { version: 1, leaves: closure.leaves },
        closure.closureHash,
      );
    } catch (error) {
      if (error.details?.reason === 'inconsistent') throw error;
      editorChatFail('history-revoked');
    }
  }
  // Every selected origin was proved before the first derived turn body is opened.
  const messages = [];
  for (const turn of selected) {
    const question = await readEditorChatOwnQuestion(tx, db, uid, conversation, turn);
    const body = await readAuthorizedBody(tx, db, uid, conversation, turn);
    messages.push(
      { role: 'user', text: question },
      { role: 'assistant', text: editorChatModelAnswer(body.answer) },
    );
  }
  return { history, messages, closure };
}
