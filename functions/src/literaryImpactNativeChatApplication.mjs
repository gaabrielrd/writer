import { workFail, digest, readWorkMetadata } from './workProgressContracts.mjs';
import { literaryApplicationIdentity } from './literaryApplicationIndex.mjs';
import {
  literaryNativeChatApplicationId,
  normalizeLiteraryNativeChatApplication,
  literaryNativeChatApplicationReceipt,
} from './literaryNativeChatApplication.mjs';
import { projectLiteraryImpactChatOrigins } from './literaryImpactChatContext.mjs';
import { verifyEditorChatClosure } from './editorChatContracts.mjs';
import { literaryChatTurnIndexId } from './literaryChatTurnIndex.mjs';

export const LITERARY_NATIVE_CHAT_APPLICATION_FIELDS = Object.freeze([
  'version',
  'ownerId',
  'target',
  'resource',
  'operationId',
  'requestHash',
  'source',
  'native',
  'destinationIdentity',
  'suggestionHash',
  'afterHash',
  'revision',
  'receiptToken',
  'origins',
  'historical',
]);
async function evidence(tx, c, { id, data }) {
  const value = await normalizeLiteraryNativeChatApplication(c, data);
  if (literaryNativeChatApplicationId(c, value.operationId) !== id)
    workFail('failed-precondition', 'Identidade da aplicação nativa inválida.');
  const operation = (
    await readWorkMetadata(
      tx,
      c.db.doc('users/' + c.uid + '/editorChatOperations/' + value.operationId),
      ['schemaVersion', 'ownerId', 'operationId', 'action', 'requestHash', 'state', 'receipt'],
    )
  ).data();
  if (
    !operation ||
    operation.schemaVersion !== 1 ||
    operation.ownerId !== c.uid ||
    operation.operationId !== value.operationId ||
    operation.action !== 'applySuggestion' ||
    operation.requestHash !== value.requestHash ||
    operation.state !== 'settled'
  )
    return { value, issues: ['native-chat-application-receipt-unavailable'] };
  const receipt = literaryNativeChatApplicationReceipt(operation.receipt);
  if (
    digest(receipt) !== value.receiptToken ||
    receipt.operationId !== value.operationId ||
    receipt.requestHash !== value.requestHash ||
    receipt.result.conversationId !== value.native.conversationId ||
    receipt.result.conversationToken !== value.native.conversationToken ||
    receipt.result.turnId !== value.native.turnId ||
    receipt.result.contentHash !== value.afterHash ||
    receipt.result.revision !== value.revision
  )
    return { value, issues: ['native-chat-application-receipt-changed'] };
  const book = await readWorkMetadata(tx, c.ref, []),
    row = await readWorkMetadata(tx, c.db.doc(c.path + '/scenes/' + value.resource.id), [
      'ownerId',
      'deleting',
    ]);
  if (
    !row.exists ||
    row.data().ownerId !== c.uid ||
    row.data().deleting ||
    literaryApplicationIdentity(c, { book, node: value.resource, row }) !==
      value.destinationIdentity
  )
    return { value, issues: ['native-chat-application-destination-unavailable-or-recreated'] };
  return { value, book, issues: [] };
}
export async function readLiteraryImpactNativeChatApplication(tx, c, graph, input) {
  const { value, issues } = await evidence(tx, c, input);
  if (issues.length) return { links: [], issues };
  const record = { collection: 'literaryChatApplications', id: input.id },
    consumer = graph.node('chat', value.source.id),
    links = [
      {
        from: consumer,
        to: graph.node('scene', value.resource.id),
        relation: 'target',
        record,
        capture: {
          scheme: 'native-chat-application-source',
          originToken: null,
          identityToken: value.source.identityToken,
          versionToken: value.source.versionToken,
          revision: null,
        },
      },
    ];
  const direct = value.origins?.contextOrigins;
  if (direct) {
    const closure = await verifyEditorChatClosure(
      { schemaVersion: 1, leaves: direct.closureManifest.leaves, closureHash: direct.closureHash },
      { ownerId: c.uid, target: c.target, resource: value.resource },
    );
    const projected = projectLiteraryImpactChatOrigins(graph, c, {
      id: input.id,
      consumerId: value.source.id,
      collection: 'literaryChatApplications',
      closure,
      data: { ...direct, resource: value.resource },
    });
    links.push(...projected.links);
    issues.push(...projected.issues);
  } else issues.push('native-chat-applied-context-not-retained');
  for (const origin of value.origins?.historyOrigins ?? []) {
    links.push({
      from: graph.node(
        'chat',
        literaryChatTurnIndexId(c.uid, value.native.conversationId, origin.turnId),
      ),
      to: consumer,
      relation: 'source',
      record,
      capture: {
        scheme: 'native-chat-turn',
        originToken: value.native.conversationToken,
        identityToken: origin.attemptToken,
        versionToken: origin.closureHash,
        revision: null,
      },
    });
    // Historical context versions are not in a native closure leaf. Retaining
    // this tuple cannot silently certify all sources of that older answer.
    issues.push('native-chat-applied-history-origins-incomplete');
  }
  return { links, issues: [...new Set(issues)] };
}
export async function verifyLiteraryImpactNativeChatApplicationSource(tx, c, link) {
  const { from, capture } = link;
  if (
    capture?.scheme !== 'native-chat-application-source' ||
    capture.originToken !== null ||
    capture.revision !== null ||
    from.kind !== 'chat' ||
    from.scopeKind !== 'book' ||
    from.scopeId !== c.target.id ||
    link.record.collection !== 'literaryChatApplications'
  )
    return null;
  const raw = (
    await readWorkMetadata(
      tx,
      c.db.doc(c.path + '/literaryChatApplications/' + link.record.id),
      LITERARY_NATIVE_CHAT_APPLICATION_FIELDS,
    )
  ).data();
  if (!raw) return { sourceAvailable: false };
  const { value, book, issues } = await evidence(tx, c, { id: link.record.id, data: raw });
  if (
    issues.length ||
    from.id !== value.source.id ||
    capture.identityToken !== value.source.identityToken ||
    capture.versionToken !== value.source.versionToken
  )
    return { sourceAvailable: false };
  const row = await readWorkMetadata(
    tx,
    c.db.doc(
      'users/' +
        c.uid +
        '/editorChats/' +
        value.native.conversationId +
        '/turns/' +
        value.native.turnId,
    ),
    [
      'schemaVersion',
      'ownerId',
      'conversationId',
      'conversationToken',
      'turnId',
      'closureHash',
      'summary.attemptToken',
      'summary.state',
    ],
  );
  const flags = {
    manuscriptRead: false,
    wholeUnitRead: false,
    editorialReview: false,
    byteIntegrityChecked: false,
    historicalApplication: true,
    currentManuscriptEquivalence: 'not-checked',
    derivedBodyAuthorized: false,
  };
  if (!row.exists)
    return {
      ...flags,
      sourceAvailable: true,
      identityMatches: true,
      versionMatches: true,
      liveSourceAvailable: false,
      sourceRepresentation: 'preserved-metadata',
      identityEvidence: 'native-application-receipt',
    };
  const actual = row.data();
  if (
    actual.schemaVersion !== 1 ||
    actual.ownerId !== c.uid ||
    actual.conversationId !== value.native.conversationId ||
    actual.turnId !== value.native.turnId
  )
    return { ...flags, sourceAvailable: false };
  return {
    ...flags,
    sourceAvailable: true,
    liveSourceAvailable: true,
    identityMatches:
      actual.conversationToken === value.native.conversationToken &&
      actual.summary?.attemptToken === value.native.attemptToken &&
      literaryApplicationIdentity(c, { book, node: from, row }) === capture.identityToken,
    versionMatches: actual.summary?.state === 'done' && actual.closureHash === capture.versionToken,
  };
}
