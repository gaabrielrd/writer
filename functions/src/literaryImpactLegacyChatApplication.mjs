import { workFail, digest, readWorkMetadata } from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { literaryApplicationIdentity } from './literaryApplicationIndex.mjs';
import {
  literaryLegacyChatConversationPath,
  readLiteraryLegacyChatOrigin,
} from './literaryLegacyChatIndex.mjs';
import {
  LITERARY_LEGACY_CHAT_APPLICATION_FIELDS,
  normalizeLiteraryLegacyChatApplication,
  literaryLegacyChatApplicationId,
  literaryLegacyChatAppliedSourceIdentity,
} from './literaryLegacyChatApplication.mjs';
async function evidence(tx, c, { id, data }) {
  const value = normalizeLiteraryLegacyChatApplication(c, data);
  if (literaryLegacyChatApplicationId(c, value.operationId) !== id)
    workFail('failed-precondition', 'Índice de aceite inválido.');
  const namespace = literaryLegacyChatConversationPath(c.uid, {
    bookId: c.target.id,
    chapterId: value.resource.id,
    conversationId: value.native.conversationId,
  })
    .split('/')
    .slice(0, -2)
    .join('/');
  const operation = (
      await readWorkMetadata(tx, c.db.doc(namespace + '/receipts/' + value.operationId), [
        'fingerprint',
        'result.updatedAt',
        'result.wordCount',
        'result.credits',
        'literaryApplication',
      ])
    ).data(),
    marker = operation?.literaryApplication;
  if (
    !operation ||
    marker?.version !== 1 ||
    marker.indexId !== id ||
    marker.metadataToken !== digest(value) ||
    operation.fingerprint !== value.receipt.fingerprint ||
    operation.result?.updatedAt !== value.receipt.updatedAt ||
    operation.result?.wordCount !== value.receipt.wordCount ||
    operation.result?.credits !== value.receipt.credits
  )
    return { value, issues: ['legacy-chat-application-receipt-unavailable-or-changed'] };
  const book = await readWorkMetadata(tx, c.ref, []),
    row = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + value.resource.id), [
      'bookId',
      'deleting',
    ]);
  if (
    !row.exists ||
    row.data().deleting ||
    (row.data().bookId != null && row.data().bookId !== c.target.id) ||
    literaryApplicationIdentity(c, { book, node: value.resource, row }) !==
      value.destinationIdentity
  )
    return { value, issues: ['legacy-chat-application-destination-unavailable-or-recreated'] };
  return { value, issues: [] };
}
export async function readLiteraryImpactLegacyChatApplication(tx, c, graph, input) {
  const { value, issues } = await evidence(tx, c, input);
  if (issues.length) return { links: [], issues };
  const collection = 'literaryLegacyChatApplications',
    id = input.id,
    consumer = graph.node('chat', value.source.id),
    record = { collection, id },
    links = [
      {
        from: consumer,
        to: graph.node('chapter', value.resource.id),
        relation: 'target',
        record,
        capture: {
          scheme: 'legacy-chat-application-source',
          originToken: null,
          identityToken: value.source.identityToken,
          versionToken: value.source.versionToken,
          revision: null,
        },
      },
    ];
  for (const manifest of [value.origins.manifest, ...value.origins.historyManifests].filter(
    Boolean,
  ))
    links.push(...graph.manifest({ collection, id, consumer, manifest }));
  if (!value.origins.manifest) issues.push('legacy-chat-applied-manifest-not-retained');
  issues.push('legacy-chat-noncanonical-inputs-unversioned');
  return { links, issues };
}
export async function verifyLiteraryImpactLegacyChatApplicationSource(tx, c, link) {
  const { from, capture } = link;
  if (
    capture?.scheme !== 'legacy-chat-application-source' ||
    capture.originToken !== null ||
    capture.revision !== null ||
    from.kind !== 'chat' ||
    from.scopeKind !== 'book' ||
    from.scopeId !== c.target.id ||
    link.record.collection !== 'literaryLegacyChatApplications'
  )
    return null;
  const raw = (
    await readWorkMetadata(
      tx,
      c.db.doc(c.path + '/literaryLegacyChatApplications/' + link.record.id),
      LITERARY_LEGACY_CHAT_APPLICATION_FIELDS,
    )
  ).data();
  if (!raw) return { sourceAvailable: false };
  const { value, issues } = await evidence(tx, c, { id: link.record.id, data: raw });
  if (
    issues.length ||
    from.id !== value.source.id ||
    capture.identityToken !== value.source.identityToken ||
    capture.versionToken !== value.source.versionToken
  )
    return { sourceAvailable: false };
  const flags = {
    sourceAvailable: true,
    identityMatches: true,
    versionMatches: true,
    historicalApplication: true,
    manuscriptRead: false,
    wholeUnitRead: false,
    editorialReview: false,
    byteIntegrityChecked: false,
    currentManuscriptEquivalence: 'not-checked',
    derivedBodyAuthorized: false,
  };
  const preserved = () => ({
    ...flags,
    liveSourceAvailable: false,
    sourceRepresentation: 'preserved-metadata',
    identityEvidence: 'native-application-receipt',
  });
  const nativeData = {
    bookId: c.target.id,
    chapterId: value.resource.id,
    conversationId: value.native.conversationId,
  };
  let origin;
  try {
    origin = await readLiteraryLegacyChatOrigin(tx, c.db, c.uid, nativeData);
  } catch (cause) {
    if (['not-found', 'permission-denied'].includes(cause.code)) return preserved();
    throw cause;
  }
  if (
    origin.scopeToken !== value.native.scopeToken ||
    origin.conversationToken !== value.native.conversationToken ||
    origin.parent.data().deleting ||
    ['editing', 'deleting'].includes(origin.parent.data().busy)
  )
    return preserved();
  const row = await readWorkMetadata(
      tx,
      c.db.doc(
        literaryLegacyChatConversationPath(c.uid, nativeData) +
          '/messages/' +
          value.native.messageId,
      ),
      ['id', 'role', 'state', 'revoked', 'messageInstance', 'generationAttempt', 'suggestionHash'],
    ),
    actual = row.data();
  if (
    !actual ||
    actual.id !== value.native.messageId ||
    actual.role !== 'assistant' ||
    actual.state !== 'done' ||
    actual.revoked
  )
    return preserved();
  const observed = {
    ...value.native,
    messageBirth: literaryNativeBirth(row),
    messageInstance: actual.messageInstance ?? null,
    generationAttempt: actual.generationAttempt ?? null,
  };
  if (
    literaryLegacyChatAppliedSourceIdentity(c, observed) !== value.source.identityToken ||
    actual.suggestionHash !== value.source.versionToken
  )
    return preserved();
  return {
    ...flags,
    liveSourceAvailable: true,
    sourceRepresentation: 'native-metadata',
    identityEvidence: 'native-message-header',
  };
}
