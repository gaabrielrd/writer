import { workFail, readWorkMetadata } from './workProgressContracts.mjs';
import {
  readEditorChatSource,
  readEditorChatEnvironment,
  readEditorChatLoreOrigin,
} from './editorChatContextRead.mjs';
import { literaryChatLoreVersionToken } from './literaryChatLoreDependencies.mjs';
import {
  literaryChatTurnIndexId,
  normalizeLiteraryChatHistoryOrigins,
} from './literaryChatTurnIndex.mjs';
export async function verifyLiteraryImpactNativeChatSource(tx, c, link) {
  const { from, capture } = link;
  if (
    !capture ||
    !['native-chat-target', 'native-chat-lore', 'native-chat-turn'].includes(capture.scheme) ||
    capture.originToken === null ||
    capture.identityToken === null ||
    capture.versionToken === null ||
    capture.revision !== null
  )
    return null;
  if (capture.scheme === 'native-chat-target') {
    if (from.kind !== 'scene' || from.scopeKind !== 'book' || from.scopeId !== c.target.id)
      return null;
    const actual = await readEditorChatSource(tx, c.db, c.uid, {
      target: c.target,
      resource: { kind: 'scene', id: from.id },
    });
    return {
      sourceAvailable: true,
      identityMatches: capture.identityToken === actual.source.resourceToken,
      capturedGrantMatches: capture.originToken === actual.source.projectToken,
      versionMatches: capture.versionToken === actual.source.sourceToken,
    };
  }
  if (capture.scheme === 'native-chat-turn') return verifyHistoricalTurn(tx, c, link);
  if (
    !['localLore', 'globalLore'].includes(from.kind) ||
    !['literaryChatContexts', 'literaryChatTurns', 'literaryChatApplications'].includes(
      link.record.collection,
    ) ||
    link.to.kind !== 'chat' ||
    link.to.scopeKind !== 'book' ||
    link.to.scopeId !== c.target.id
  )
    return null;
  if (
    (from.kind === 'localLore' && (from.scopeKind !== 'book' || from.scopeId !== c.target.id)) ||
    (from.kind === 'globalLore' && from.scopeKind !== 'universe')
  )
    workFail('permission-denied', 'O lore pertence a outro escopo.');
  // The inventory reconstructed this edge from the native private header first.
  // Do not accept a replacement resource or open frozen context/response bodies.
  const index = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/' + link.record.collection + '/' + link.record.id),
    ['version', 'ownerId', 'target', 'resource', 'source.id'],
  );
  const value = index.data();
  if (
    !value ||
    value.version !== 1 ||
    value.ownerId !== c.uid ||
    value.target?.kind !== 'book' ||
    value.target.id !== c.target.id ||
    value.resource?.kind !== 'scene' ||
    link.to.id !==
      (link.record.collection === 'literaryChatApplications' ? value.source?.id : link.record.id)
  )
    return { sourceAvailable: false };
  const source = await readEditorChatSource(tx, c.db, c.uid, {
      target: c.target,
      resource: value.resource,
    }),
    environment = await readEditorChatEnvironment(tx, c.db, source, { includeLiterary: false });
  const reference = {
    kind: from.kind === 'globalLore' ? 'universe' : 'book',
    scopeId: from.scopeId,
    entityId: from.id,
  };
  const current = await readEditorChatLoreOrigin(tx, c.db, source, environment, reference),
    leaf = current.leaf;
  const versionToken = literaryChatLoreVersionToken({
    reference,
    originToken: leaf.scopeToken,
    identityToken: leaf.entityIdentityToken,
    capturedStamp: current.capturedStamp,
  });
  return {
    sourceAvailable: true,
    identityMatches: capture.identityToken === leaf.entityIdentityToken,
    capturedGrantMatches: capture.originToken === leaf.scopeToken,
    versionMatches: capture.versionToken === versionToken,
    manuscriptRead: false,
    wholeUnitRead: false,
    editorialReview: false,
    byteIntegrityChecked: false,
  };
}

async function verifyHistoricalTurn(tx, c, link) {
  const { from, capture } = link;
  if (
    from.kind !== 'chat' ||
    from.scopeKind !== 'book' ||
    from.scopeId !== c.target.id ||
    !['literaryChatTurns', 'literaryChatApplications'].includes(link.record.collection) ||
    link.to.kind !== 'chat' ||
    link.to.scopeKind !== 'book' ||
    link.to.scopeId !== c.target.id
  )
    return null;
  const row = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/' + link.record.collection + '/' + link.record.id),
    [
      'version',
      'ownerId',
      'target',
      'resource',
      'source.id',
      'conversationId',
      'conversationToken',
      'historyOrigins',
      'native.conversationId',
      'native.conversationToken',
      'origins.historyOrigins',
    ],
  );
  const raw = row.data(),
    value =
      raw && link.record.collection === 'literaryChatApplications'
        ? {
            ...raw,
            conversationId: raw.native?.conversationId,
            conversationToken: raw.native?.conversationToken,
            historyOrigins: raw.origins?.historyOrigins ?? [],
          }
        : raw;
  if (
    !value ||
    value.version !== 1 ||
    value.ownerId !== c.uid ||
    value.target?.kind !== 'book' ||
    value.target.id !== c.target.id ||
    link.to.id !==
      (link.record.collection === 'literaryChatApplications' ? value.source?.id : link.record.id)
  )
    return { sourceAvailable: false };
  const origin = normalizeLiteraryChatHistoryOrigins(value.historyOrigins).find(
    (entry) => literaryChatTurnIndexId(c.uid, value.conversationId, entry.turnId) === from.id,
  );
  if (!origin) return { sourceAvailable: false };
  const path = 'users/' + c.uid + '/editorChats/' + value.conversationId;
  const conversation = (
    await readWorkMetadata(tx, c.db.doc(path), [
      'ownerId',
      'conversationId',
      'summary.conversationToken',
      'summary.state',
      'summary.target',
      'summary.resource',
      'cleanupId',
    ])
  ).data();
  if (
    !conversation ||
    conversation.ownerId !== c.uid ||
    conversation.conversationId !== value.conversationId ||
    conversation.summary?.state !== 'open' ||
    conversation.cleanupId !== null ||
    conversation.summary.target?.kind !== 'book' ||
    conversation.summary.target.id !== c.target.id ||
    conversation.summary.resource?.kind !== value.resource?.kind ||
    conversation.summary.resource?.id !== value.resource?.id
  )
    return { sourceAvailable: false };
  const record = (
    await readWorkMetadata(tx, c.db.doc(path + '/turns/' + origin.turnId), [
      'ownerId',
      'conversationId',
      'conversationToken',
      'turnId',
      'summary.attemptToken',
      'summary.state',
      'closureHash',
    ])
  ).data();
  if (
    !record ||
    record.ownerId !== c.uid ||
    record.conversationId !== value.conversationId ||
    record.turnId !== origin.turnId ||
    record.summary?.state !== 'done'
  )
    return { sourceAvailable: false };
  return {
    sourceAvailable: true,
    identityMatches:
      capture.identityToken === record.summary.attemptToken &&
      capture.originToken === record.conversationToken &&
      record.conversationToken === conversation.summary.conversationToken,
    capturedGrantMatches: capture.originToken === conversation.summary.conversationToken,
    versionMatches: capture.versionToken === record.closureHash,
    manuscriptRead: false,
    wholeUnitRead: false,
    editorialReview: false,
    byteIntegrityChecked: false,
  };
}
