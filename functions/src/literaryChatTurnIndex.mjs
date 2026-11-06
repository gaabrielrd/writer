import { workId, workFail, digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  verifyEditorChatClosure,
  editorChatHashToken,
  canonicalEditorChatJSON,
  editorChatClosed,
} from './editorChatContracts.mjs';
import { literaryWritingScope } from './literaryWritingContext.mjs';
import { literaryChatContextIndexId } from './literaryChatContextIndex.mjs';
import { normalizeLiteraryPersonaDependencies } from './literaryPersonaDependencies.mjs';
import { normalizeLiteraryChatLoreDependencies } from './literaryChatLoreDependencies.mjs';
import {
  prepareLiteraryDependencyWrite,
  prepareLiteraryDependencyCleanup,
} from './literaryDependencyClock.mjs';
const same = (left, right) => canonicalEditorChatJSON(left) === canonicalEditorChatJSON(right);
export const literaryChatTurnIndexId = (uid, conversationId, turnId) =>
  digest({
    domain: 'literary-native-chat-turn-index-v1',
    uid: workId(uid),
    conversationId: workId(conversationId),
    turnId: workId(turnId),
  });
const noop = () => ({ count: 0, commit() {} });
export function normalizeLiteraryChatHistoryOrigins(value) {
  if (!Array.isArray(value) || value.length > 10)
    workFail('failed-precondition', 'Histórico de origens do chat inválido.');
  const seen = new Set();
  return value.map((entry) => {
    editorChatClosed(entry, ['turnId', 'attemptToken', 'closureHash']);
    const turnId = workId(entry.turnId);
    if (seen.has(turnId)) workFail('failed-precondition', 'Origem histórica repetida.');
    seen.add(turnId);
    return {
      turnId,
      attemptToken: editorChatHashToken(entry.attemptToken),
      closureHash: editorChatHashToken(entry.closureHash),
    };
  });
}
// Source context bodies have already been authorized for generation by the native
// claim. Only its closed book-side metadata is copied; deleted input contexts do
// not remove provenance independently retained by the assistant turn.
export async function prepareLiteraryChatTurnIndex(
  tx,
  db,
  uid,
  { conversation, context, record, history },
) {
  if (conversation.summary.target.kind !== 'book') return noop();
  const target = conversation.summary.target,
    resource = conversation.summary.resource,
    c = literaryWritingScope(db, uid, target);
  const closure = await verifyEditorChatClosure(
    { schemaVersion: 1, leaves: record.closureManifest.leaves, closureHash: record.closureHash },
    { ownerId: uid, target, resource },
  );
  const origins = normalizeLiteraryChatHistoryOrigins(history.origins);
  if (
    !same(
      origins.map((entry) => entry.turnId),
      history.history.turnIds,
    )
  )
    workFail('failed-precondition', 'As origens não correspondem ao histórico selecionado.');
  const contextRef = db.doc(
    c.path + '/literaryChatContexts/' + literaryChatContextIndexId(uid, context.summary.contextId),
  );
  const captured = await readWorkMetadata(tx, contextRef, [
    'version',
    'ownerId',
    'target',
    'resource',
    'contextId',
    'contextToken',
    'sourceToken',
    'closureHash',
    'closureManifest',
    'personaDependencies',
    'loreDependencies',
  ]);
  let contextOrigins = null;
  if (captured.exists) {
    const data = captured.data();
    if (
      data.version !== 1 ||
      data.ownerId !== uid ||
      !same(data.target, target) ||
      !same(data.resource, resource) ||
      data.contextId !== context.summary.contextId ||
      data.contextToken !== context.summary.contextToken ||
      data.sourceToken !== record.summary.sourceToken ||
      data.closureHash !== context.record.closureHash ||
      !same(data.closureManifest, context.record.closureManifest)
    )
      workFail('failed-precondition', 'A origem privada do contexto está inconsistente.');
    const direct = await verifyEditorChatClosure(
      { schemaVersion: 1, leaves: data.closureManifest.leaves, closureHash: data.closureHash },
      { ownerId: uid, target, resource },
    );
    if (direct.leaves.some((leaf) => !closure.leaves.some((included) => same(included, leaf))))
      workFail('failed-precondition', 'O turno não preserva o fechamento do contexto.');
    contextOrigins = {
      contextId: data.contextId,
      contextToken: data.contextToken,
      sourceToken: data.sourceToken,
      closureHash: data.closureHash,
      closureManifest: { version: 1, leaves: direct.leaves },
      personaDependencies: normalizeLiteraryPersonaDependencies(data.personaDependencies),
      ...(data.loreDependencies === undefined
        ? {}
        : {
            loreDependencies: normalizeLiteraryChatLoreDependencies(data.loreDependencies, direct),
          }),
    };
  }
  const conversationId = workId(record.conversationId),
    turnId = workId(record.turnId),
    id = literaryChatTurnIndexId(uid, conversationId, turnId),
    ref = db.doc(c.path + '/literaryChatTurns/' + id);
  if ((await readWorkMetadata(tx, ref, [])).exists)
    workFail('already-exists', 'O índice privado do turno já existe.');
  const next = {
    version: 1,
    ownerId: uid,
    target,
    resource,
    conversationId,
    conversationToken: editorChatHashToken(record.conversationToken),
    turnId,
    attemptToken: editorChatHashToken(record.summary.attemptToken),
    sourceToken: editorChatHashToken(record.summary.sourceToken),
    closureHash: closure.closureHash,
    closureManifest: { version: 1, leaves: closure.leaves },
    contextOrigins,
    historyOrigins: origins,
  };
  const clock = await prepareLiteraryDependencyWrite(tx, c);
  return {
    commit() {
      tx.create(ref, next);
      clock.commit();
    },
  };
}
// Paged native cleanup calls this before writing. Token mismatches protect later
// incarnations and an old conversation never advances a foreign book root.
export async function prepareLiteraryChatTurnIndexCleanup(tx, db, uid, conversation, turnIds) {
  if (conversation.summary.target.kind !== 'book') return noop();
  if (!Array.isArray(turnIds) || turnIds.length > 23)
    workFail('failed-precondition', 'Página de limpeza inválida.');
  const bookId = workId(conversation.summary.target.id),
    conversationId = workId(conversation.summary.conversationId),
    rows = [];
  for (const turnId of turnIds) {
    const ref = db.doc(
        'books/' +
          bookId +
          '/literaryChatTurns/' +
          literaryChatTurnIndexId(uid, conversationId, turnId),
      ),
      row = await readWorkMetadata(tx, ref, [
        'version',
        'ownerId',
        'target',
        'conversationId',
        'conversationToken',
        'turnId',
      ]),
      data = row.data();
    if (
      data &&
      data.version === 1 &&
      data.ownerId === uid &&
      data.target?.kind === 'book' &&
      data.target.id === bookId &&
      data.conversationId === conversationId &&
      data.conversationToken === conversation.summary.conversationToken &&
      data.turnId === turnId
    )
      rows.push(ref);
  }
  if (!rows.length) return noop();
  const root = await readWorkMetadata(tx, db.doc('books/' + bookId), ['authorId']);
  const clock =
    root.data()?.authorId === uid
      ? await prepareLiteraryDependencyCleanup(tx, db, 'books/' + bookId)
      : noop();
  return {
    count: rows.length,
    commit() {
      rows.forEach((ref) => tx.delete(ref));
      clock.commit();
    },
  };
}
