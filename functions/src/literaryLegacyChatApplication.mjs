import {
  workId,
  workFail,
  workClosed,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { literaryApplicationIdentity } from './literaryApplicationIndex.mjs';
import {
  readLiteraryLegacyChatOrigin,
  literaryLegacyChatIndexId,
  literaryLegacyChatManifests,
} from './literaryLegacyChatIndex.mjs';
const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('failed-precondition', 'Prova de aceite inválida.');
  return value;
};
const counter = (value) => {
  if (!Number.isSafeInteger(value) || value < 0)
    workFail('failed-precondition', 'Contador de aceite inválido.');
  return value;
};
const closed = (value, keys) => {
  workClosed(value, keys);
  if (Object.keys(value).length !== keys.length)
    workFail('failed-precondition', 'Metadados de aceite incompletos.');
};
export const LITERARY_LEGACY_CHAT_APPLICATION_FIELDS = Object.freeze([
  'version',
  'ownerId',
  'target',
  'resource',
  'operationId',
  'source',
  'native',
  'destinationIdentity',
  'afterHash',
  'receipt',
  'origins',
  'historical',
]);
export const literaryLegacyChatApplicationId = (c, operationId) =>
  digest({
    domain: 'literary-legacy-chat-application-v1',
    uid: c.uid,
    target: c.target,
    operationId: workId(operationId),
  });
export const literaryLegacyChatAppliedSourceIdentity = (c, native) =>
  digest({
    domain: 'literary-legacy-chat-applied-source-v1',
    uid: c.uid,
    target: c.target,
    native,
  });
export function normalizeLiteraryLegacyChatApplication(c, value) {
  closed(value, LITERARY_LEGACY_CHAT_APPLICATION_FIELDS);
  closed(value.target, ['kind', 'id']);
  closed(value.resource, ['kind', 'id']);
  closed(value.source, ['id', 'identityToken', 'versionToken']);
  closed(value.native, [
    'conversationId',
    'messageId',
    'messageInstance',
    'generationAttempt',
    'scopeToken',
    'conversationToken',
    'messageBirth',
  ]);
  closed(value.receipt, ['fingerprint', 'updatedAt', 'wordCount', 'credits']);
  closed(value.origins, ['manifest', 'historyManifests', 'unversionedInputs']);
  if (
    value.version !== 1 ||
    value.ownerId !== c.uid ||
    value.target.kind !== 'book' ||
    value.target.id !== c.target.id ||
    value.resource.kind !== 'chapter' ||
    value.historical !== true ||
    value.origins.unversionedInputs !== true
  )
    workFail('failed-precondition', 'Aceite de outro escopo.');
  const chapterId = workId(value.resource.id),
    native = value.native,
    data = { bookId: c.target.id, chapterId, conversationId: workId(native.conversationId) };
  const tuple = native.messageBirth;
  if (!Array.isArray(tuple) || tuple.length !== 2 || counter(tuple[1]) >= 1e9)
    workFail('failed-precondition', 'Origem nativa inválida.');
  const origin = {
    conversationId: data.conversationId,
    messageId: workId(native.messageId),
    messageInstance: native.messageInstance === null ? null : workId(native.messageInstance),
    generationAttempt: native.generationAttempt === null ? null : workId(native.generationAttempt),
    scopeToken: hash(native.scopeToken),
    conversationToken: hash(native.conversationToken),
    messageBirth: [counter(tuple[0]), tuple[1]],
  };
  const id = literaryLegacyChatIndexId(c.uid, data, origin.messageId);
  if (
    value.source.id !== id ||
    value.source.identityToken !== literaryLegacyChatAppliedSourceIdentity(c, origin)
  )
    workFail('failed-precondition', 'Identidade da origem aplicada inválida.');
  const manifests = literaryLegacyChatManifests(
    {
      context:
        value.origins.manifest === null
          ? {}
          : { writing: { version: 1, manifest: value.origins.manifest } },
      historyOrigins: value.origins.historyManifests,
    },
    data,
  );
  return {
    version: 1,
    ownerId: c.uid,
    target: { kind: 'book', id: c.target.id },
    resource: { kind: 'chapter', id: chapterId },
    operationId: workId(value.operationId),
    source: {
      id,
      identityToken: hash(value.source.identityToken),
      versionToken: hash(value.source.versionToken),
    },
    native: origin,
    destinationIdentity: hash(value.destinationIdentity),
    afterHash: hash(value.afterHash),
    receipt: {
      fingerprint: hash(value.receipt.fingerprint),
      updatedAt: counter(value.receipt.updatedAt),
      wordCount: counter(value.receipt.wordCount),
      credits: counter(value.receipt.credits),
    },
    origins: { ...manifests, unversionedInputs: true },
    historical: true,
  };
}
// Native apply has already authorized the source body and computed these hashes.
// Read all identities before the caller starts its atomic manuscript/credit/receipt writes.
export async function prepareLiteraryLegacyChatApplication(
  tx,
  c,
  { data, sourceRow, fingerprint, result, suggestionHash, afterHash },
) {
  const header = sourceRow.data(),
    origin = await readLiteraryLegacyChatOrigin(tx, c.db, c.uid, data);
  if (origin.parent.data().deleting || ['editing', 'deleting'].includes(origin.parent.data().busy))
    workFail('failed-precondition', 'Conclua a operação da conversa antes de aplicar.');
  const book = await readWorkMetadata(tx, c.ref, []),
    chapter = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + data.chapterId), []),
    native = {
      conversationId: data.conversationId,
      messageId: data.messageId,
      messageInstance: header.messageInstance ?? null,
      generationAttempt: header.generationAttempt ?? null,
      scopeToken: origin.scopeToken,
      conversationToken: origin.conversationToken,
      messageBirth: literaryNativeBirth(sourceRow),
    },
    operationId = workId(data.requestId),
    id = literaryLegacyChatApplicationId(c, operationId),
    ref = c.db.doc(c.path + '/literaryLegacyChatApplications/' + id);
  if ((await readWorkMetadata(tx, ref, [])).exists)
    workFail('already-exists', 'Este aceite já tem um índice.');
  const value = normalizeLiteraryLegacyChatApplication(c, {
    version: 1,
    ownerId: c.uid,
    target: c.target,
    resource: { kind: 'chapter', id: data.chapterId },
    operationId,
    source: {
      id: literaryLegacyChatIndexId(c.uid, data, data.messageId),
      identityToken: literaryLegacyChatAppliedSourceIdentity(c, native),
      versionToken: hash(suggestionHash),
    },
    native,
    destinationIdentity: literaryApplicationIdentity(c, {
      book,
      node: { kind: 'chapter', id: data.chapterId },
      row: chapter,
    }),
    afterHash: hash(afterHash),
    receipt: {
      fingerprint,
      updatedAt: result.updatedAt,
      wordCount: result.wordCount,
      credits: result.credits,
    },
    origins: { ...literaryLegacyChatManifests(header, data), unversionedInputs: true },
    historical: true,
  });
  // Stored in the durable native sibling receipt; no response DTO changes.
  const marker = { version: 1, indexId: id, metadataToken: digest(value) };
  return {
    marker,
    commit() {
      tx.create(ref, value);
    },
  };
}
