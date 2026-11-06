import { workFail, readWorkMetadata } from './workProgressContracts.mjs';
import { verifyEditorChatClosure, canonicalEditorChatJSON } from './editorChatContracts.mjs';
import {
  literaryChatTurnIndexId,
  normalizeLiteraryChatHistoryOrigins,
} from './literaryChatTurnIndex.mjs';
import { projectLiteraryImpactChatOrigins } from './literaryImpactChatContext.mjs';
const same = (left, right) => canonicalEditorChatJSON(left) === canonicalEditorChatJSON(right);
export async function readLiteraryImpactChatTurn(tx, c, graph, { id, data }) {
  if (
    data.version !== 1 ||
    data.ownerId !== c.uid ||
    data.target?.kind !== 'book' ||
    data.target.id !== c.target.id ||
    data.resource?.kind !== 'scene' ||
    literaryChatTurnIndexId(c.uid, data.conversationId, data.turnId) !== id
  )
    workFail('failed-precondition', 'Origem do índice privado de turno inválida.');
  const path = 'users/' + c.uid + '/editorChats/' + data.conversationId;
  const conversation = (
    await readWorkMetadata(tx, c.db.doc(path), [
      'schemaVersion',
      'ownerId',
      'conversationId',
      'summary.conversationToken',
      'summary.target',
      'summary.resource',
      'summary.state',
      'cleanupId',
    ])
  ).data();
  if (
    !conversation ||
    conversation.schemaVersion !== 1 ||
    conversation.ownerId !== c.uid ||
    conversation.conversationId !== data.conversationId ||
    conversation.summary?.conversationToken !== data.conversationToken ||
    !same(conversation.summary.target, c.target) ||
    !same(conversation.summary.resource, data.resource)
  )
    return { links: [], issues: ['native-chat-conversation-unavailable-or-changed'] };
  if (
    ['deleting', 'deleted'].includes(conversation.summary.state) &&
    conversation.cleanupId !== null
  ) {
    data.nativeState = 'retired';
    return { links: [], issues: [] };
  }
  if (conversation.summary.state !== 'open' || conversation.cleanupId !== null)
    return { links: [], issues: ['native-chat-conversation-unavailable-or-changed'] };
  const current = (
    await readWorkMetadata(tx, c.db.doc(path + '/turns/' + data.turnId), [
      'schemaVersion',
      'ownerId',
      'conversationId',
      'conversationToken',
      'turnId',
      'closureHash',
      'closureManifest',
      'summary.attemptToken',
      'summary.sourceToken',
      'summary.state',
      'summary.revision',
    ])
  ).data();
  if (
    !current ||
    current.schemaVersion !== 1 ||
    current.ownerId !== c.uid ||
    current.conversationId !== data.conversationId ||
    current.conversationToken !== data.conversationToken ||
    current.turnId !== data.turnId ||
    current.summary?.attemptToken !== data.attemptToken ||
    current.summary?.sourceToken !== data.sourceToken ||
    current.closureHash !== data.closureHash ||
    !same(current.closureManifest, data.closureManifest)
  )
    return { links: [], issues: ['native-chat-turn-unavailable-or-changed'] };
  data.nativeState = current.summary.state;
  data.nativeRevision = current.summary.revision;
  if (data.closureManifest?.version !== 1)
    workFail('failed-precondition', 'Fechamento do turno inválido.');
  const closure = await verifyEditorChatClosure(
      { schemaVersion: 1, leaves: data.closureManifest.leaves, closureHash: data.closureHash },
      { ownerId: c.uid, target: c.target, resource: data.resource },
    ),
    links = [],
    issues = [],
    collection = 'literaryChatTurns',
    consumer = graph.node('chat', id),
    record = { collection, id };
  if (data.contextOrigins) {
    const direct = data.contextOrigins;
    if (direct.sourceToken !== data.sourceToken || direct.closureManifest?.version !== 1)
      workFail('failed-precondition', 'Contexto direto do turno inconsistente.');
    const directClosure = await verifyEditorChatClosure(
      { schemaVersion: 1, leaves: direct.closureManifest.leaves, closureHash: direct.closureHash },
      { ownerId: c.uid, target: c.target, resource: data.resource },
    );
    if (
      directClosure.leaves.some((leaf) => !closure.leaves.some((included) => same(included, leaf)))
    )
      workFail('failed-precondition', 'O turno perdeu origens de seu contexto direto.');
    const projected = projectLiteraryImpactChatOrigins(graph, c, {
      id,
      collection,
      closure: directClosure,
      data: { ...direct, resource: data.resource },
    });
    links.push(...projected.links);
    issues.push(...projected.issues);
  } else issues.push('native-chat-direct-context-not-indexed');
  for (const origin of normalizeLiteraryChatHistoryOrigins(data.historyOrigins)) {
    const historyId = literaryChatTurnIndexId(c.uid, data.conversationId, origin.turnId);
    links.push({
      from: graph.node('chat', historyId),
      to: consumer,
      relation: 'source',
      record,
      capture: {
        scheme: 'native-chat-turn',
        originToken: data.conversationToken,
        identityToken: origin.attemptToken,
        versionToken: origin.closureHash,
        revision: null,
      },
    });
    const history = (
      await readWorkMetadata(tx, c.db.doc(c.path + '/literaryChatTurns/' + historyId), [
        'version',
        'ownerId',
        'conversationId',
        'conversationToken',
        'turnId',
        'attemptToken',
        'closureHash',
      ])
    ).data();
    if (
      !history ||
      history.version !== 1 ||
      history.ownerId !== c.uid ||
      history.conversationId !== data.conversationId ||
      history.conversationToken !== data.conversationToken ||
      history.turnId !== origin.turnId ||
      history.attemptToken !== origin.attemptToken ||
      history.closureHash !== origin.closureHash
    )
      issues.push('native-chat-history-origin-not-indexed');
  }
  return { links, issues: [...new Set(issues)] };
}
