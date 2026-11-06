import { workFail, digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  literaryLegacyChatIndexId,
  literaryLegacyChatConversationPath,
  readLiteraryLegacyChatOrigin,
  literaryLegacyChatManifests,
} from './literaryLegacyChatIndex.mjs';

export async function readLiteraryImpactLegacyChat(tx, c, graph, { id, data }) {
  const nativeData = {
    bookId: c.target.id,
    chapterId: data.resource?.id,
    conversationId: data.conversationId,
  };
  if (
    data.version !== 1 ||
    data.ownerId !== c.uid ||
    data.target?.kind !== 'book' ||
    data.target.id !== c.target.id ||
    data.resource?.kind !== 'chapter' ||
    literaryLegacyChatIndexId(c.uid, nativeData, data.messageId) !== id
  )
    workFail('failed-precondition', 'Índice de mensagem legada inválido.');
  let origin;
  try {
    origin = await readLiteraryLegacyChatOrigin(tx, c.db, c.uid, nativeData);
  } catch (cause) {
    if (['not-found', 'permission-denied'].includes(cause.code))
      return { links: [], issues: ['legacy-chat-native-origin-unavailable'] };
    throw cause;
  }
  if (origin.scopeToken !== data.scopeToken || origin.conversationToken !== data.conversationToken)
    return { links: [], issues: ['legacy-chat-native-origin-changed'] };
  if (
    origin.parent.data().deleting ||
    ['editing', 'deleting'].includes(origin.parent.data().busy)
  ) {
    data.nativeState = 'retired';
    return { links: [], issues: [] };
  }
  const header = (
    await readWorkMetadata(
      tx,
      c.db.doc(
        literaryLegacyChatConversationPath(c.uid, nativeData) + '/messages/' + data.messageId,
      ),
      [
        'id',
        'role',
        'state',
        'messageInstance',
        'generationAttempt',
        'revoked',
        'context.writing.version',
        'context.writing.manifest',
        'historyOrigins',
        'historySourceIds',
      ],
    )
  ).data();
  if (
    !header ||
    header.id !== data.messageId ||
    header.role !== 'assistant' ||
    header.messageInstance !== data.messageInstance ||
    header.generationAttempt !== data.generationAttempt
  )
    return { links: [], issues: ['legacy-chat-message-unavailable-or-changed'] };
  data.nativeState = header.state;
  const actual = literaryLegacyChatManifests(header, nativeData);
  if (
    digest(actual) !== digest({ manifest: data.manifest, historyManifests: data.historyManifests })
  )
    return { links: [], issues: ['legacy-chat-manifests-changed'] };
  const issues = [],
    links = [],
    consumer = graph.node('chat', id),
    collection = 'literaryLegacyChatMessages';
  if (header.revoked) issues.push('legacy-chat-origins-revoked');
  if (data.historyState !== 'captured') issues.push('legacy-chat-history-capture-pending');
  if (data.unversionedInputs !== false) issues.push('legacy-chat-noncanonical-inputs-unversioned');
  if (!data.manifest) issues.push('legacy-chat-direct-manifest-not-recorded');
  for (const manifest of [data.manifest, ...data.historyManifests].filter(Boolean))
    links.push(...graph.manifest({ collection, id, consumer, manifest }));
  // This relation describes the editing destination, not a claim that the
  // complete chapter text was read by this generation.
  links.push({
    from: graph.node('chapter', data.resource.id),
    to: consumer,
    relation: 'subject',
    record: { collection, id },
    capture: null,
  });
  return { links, issues };
}
