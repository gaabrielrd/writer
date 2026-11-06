import { workId, workFail, digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  editorChatClosed,
  editorChatHashToken,
  verifyEditorChatClosure,
  normalizeEditorChatReceipt,
  canonicalEditorChatJSON,
} from './editorChatContracts.mjs';
import { literaryWritingScope } from './literaryWritingContext.mjs';
import { literaryApplicationIdentity } from './literaryApplicationIndex.mjs';
import {
  literaryChatTurnIndexId,
  normalizeLiteraryChatHistoryOrigins,
} from './literaryChatTurnIndex.mjs';
import { normalizeLiteraryPersonaDependencies } from './literaryPersonaDependencies.mjs';
import { normalizeLiteraryChatLoreDependencies } from './literaryChatLoreDependencies.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
const same = (left, right) => canonicalEditorChatJSON(left) === canonicalEditorChatJSON(right);
export const literaryNativeChatApplicationId = (c, operationId) =>
  digest({
    domain: 'literary-native-chat-application-v1',
    uid: c.uid,
    target: c.target,
    operationId: workId(operationId),
  });
export function literaryNativeChatApplicationReceipt(value) {
  const receipt = normalizeEditorChatReceipt(value);
  if (
    receipt.action !== 'applySuggestion' ||
    receipt.outcome !== 'confirmed' ||
    receipt.result?.kind !== 'apply'
  )
    workFail('failed-precondition', 'O recibo não confirma uma aplicação nativa.');
  // Native receipt DTOs contain identifiers, counters and hashes, never text.
  return receipt;
}
export async function normalizeLiteraryAppliedChatOrigins(c, resource, raw) {
  if (raw === null) return null;
  editorChatClosed(raw, [
    'sourceToken',
    'closureHash',
    'closureManifest',
    'contextOrigins',
    'historyOrigins',
  ]);
  if (raw.closureManifest?.version !== 1)
    workFail('failed-precondition', 'Fechamento aplicado inválido.');
  const closure = await verifyEditorChatClosure(
    { schemaVersion: 1, leaves: raw.closureManifest.leaves, closureHash: raw.closureHash },
    { ownerId: c.uid, target: c.target, resource },
  );
  let direct = null;
  if (raw.contextOrigins !== null) {
    const value = raw.contextOrigins;
    editorChatClosed(value, [
      'contextId',
      'contextToken',
      'sourceToken',
      'closureHash',
      'closureManifest',
      'personaDependencies',
      ...(Object.hasOwn(value, 'loreDependencies') ? ['loreDependencies'] : []),
    ]);
    if (value.closureManifest?.version !== 1 || value.sourceToken !== raw.sourceToken)
      workFail('failed-precondition', 'A captura direta não corresponde ao turno aplicado.');
    const own = await verifyEditorChatClosure(
      { schemaVersion: 1, leaves: value.closureManifest.leaves, closureHash: value.closureHash },
      { ownerId: c.uid, target: c.target, resource },
    );
    if (own.leaves.some((leaf) => !closure.leaves.some((parent) => same(parent, leaf))))
      workFail('failed-precondition', 'O turno aplicado perdeu origens diretas.');
    const persona = normalizeLiteraryPersonaDependencies(value.personaDependencies);
    if (
      persona.ownerId !== c.uid ||
      !same(persona.target, c.target) ||
      !same(persona.resource, resource)
    )
      workFail('failed-precondition', 'Persona aplicada de outro escopo.');
    direct = {
      contextId: workId(value.contextId),
      contextToken: editorChatHashToken(value.contextToken),
      sourceToken: editorChatHashToken(value.sourceToken),
      closureHash: own.closureHash,
      closureManifest: { version: 1, leaves: own.leaves },
      personaDependencies: persona,
      ...(Object.hasOwn(value, 'loreDependencies')
        ? { loreDependencies: normalizeLiteraryChatLoreDependencies(value.loreDependencies, own) }
        : {}),
    };
  }
  return {
    sourceToken: editorChatHashToken(raw.sourceToken),
    closureHash: closure.closureHash,
    closureManifest: { version: 1, leaves: closure.leaves },
    contextOrigins: direct,
    historyOrigins: normalizeLiteraryChatHistoryOrigins(raw.historyOrigins),
  };
}
export async function prepareLiteraryNativeChatApplication(
  tx,
  db,
  uid,
  { request, turn, receipt },
) {
  if (request.target.kind !== 'book') return { commit() {} };
  if (request.resource.kind !== 'scene')
    workFail('failed-precondition', 'Destino nativo não suportado.');
  const c = literaryWritingScope(db, uid, request.target),
    confirmation = literaryNativeChatApplicationReceipt(receipt);
  if (
    confirmation.operationId !== request.operationId ||
    confirmation.requestHash !== request.requestHash ||
    confirmation.result.conversationId !== request.conversationId ||
    confirmation.result.conversationToken !== request.conversationToken ||
    confirmation.result.turnId !== request.turnId
  )
    workFail('failed-precondition', 'O recibo não corresponde ao turno aplicado.');
  const sourceId = literaryChatTurnIndexId(uid, request.conversationId, request.turnId),
    book = await readWorkMetadata(tx, c.ref, []),
    sourceRow = await readWorkMetadata(tx, turn.ref, []),
    targetRow = await readWorkMetadata(tx, db.doc(c.path + '/scenes/' + request.resource.id), []);
  const record = await readWorkMetadata(tx, db.doc(c.path + '/literaryChatTurns/' + sourceId), [
    'version',
    'ownerId',
    'target',
    'resource',
    'conversationId',
    'conversationToken',
    'turnId',
    'attemptToken',
    'sourceToken',
    'closureHash',
    'closureManifest',
    'contextOrigins',
    'historyOrigins',
  ]);
  let origins = null;
  if (record.exists) {
    const data = record.data();
    if (
      data.version !== 1 ||
      data.ownerId !== uid ||
      !same(data.target, c.target) ||
      !same(data.resource, request.resource) ||
      data.conversationId !== request.conversationId ||
      data.conversationToken !== request.conversationToken ||
      data.turnId !== request.turnId ||
      data.attemptToken !== turn.summary.attemptToken ||
      data.sourceToken !== turn.summary.sourceToken ||
      data.closureHash !== turn.record.closureHash ||
      !same(data.closureManifest, turn.record.closureManifest)
    )
      workFail('failed-precondition', 'O índice do turno aplicado está inconsistente.');
    origins = await normalizeLiteraryAppliedChatOrigins(c, request.resource, {
      sourceToken: data.sourceToken,
      closureHash: data.closureHash,
      closureManifest: data.closureManifest,
      contextOrigins: data.contextOrigins,
      historyOrigins: data.historyOrigins,
    });
  }
  const value = {
    version: 1,
    ownerId: uid,
    target: c.target,
    resource: { kind: 'scene', id: workId(request.resource.id) },
    operationId: workId(request.operationId),
    requestHash: editorChatHashToken(request.requestHash),
    source: {
      kind: 'chat',
      id: sourceId,
      identityToken: literaryApplicationIdentity(c, {
        book,
        node: { kind: 'chat', id: sourceId },
        row: sourceRow,
      }),
      versionToken: editorChatHashToken(turn.record.closureHash),
    },
    native: {
      conversationId: workId(request.conversationId),
      conversationToken: editorChatHashToken(request.conversationToken),
      turnId: workId(request.turnId),
      attemptToken: editorChatHashToken(turn.summary.attemptToken),
    },
    destinationIdentity: literaryApplicationIdentity(c, {
      book,
      node: request.resource,
      row: targetRow,
    }),
    suggestionHash: editorChatHashToken(request.suggestionHash),
    afterHash: confirmation.result.contentHash,
    revision: confirmation.result.revision,
    receiptToken: digest(confirmation),
    origins,
    historical: true,
  };
  const ref = db.doc(
    c.path + '/literaryChatApplications/' + literaryNativeChatApplicationId(c, request.operationId),
  );
  if ((await readWorkMetadata(tx, ref, [])).exists)
    workFail('already-exists', 'O aceite nativo já tem um índice.');
  const normalized = await normalizeLiteraryNativeChatApplication(c, value);
  const clock = await prepareLiteraryDependencyWrite(tx, c);
  return {
    commit() {
      tx.create(ref, normalized);
      clock.commit();
    },
  };
}

export async function normalizeLiteraryNativeChatApplication(c, value) {
  editorChatClosed(value, [
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
  editorChatClosed(value.target, ['kind', 'id']);
  editorChatClosed(value.resource, ['kind', 'id']);
  editorChatClosed(value.source, ['kind', 'id', 'identityToken', 'versionToken']);
  editorChatClosed(value.native, ['conversationId', 'conversationToken', 'turnId', 'attemptToken']);
  if (
    value.version !== 1 ||
    value.ownerId !== c.uid ||
    value.target.kind !== 'book' ||
    value.target.id !== c.target.id ||
    value.resource.kind !== 'scene' ||
    value.source.kind !== 'chat' ||
    value.historical !== true
  )
    workFail('failed-precondition', 'Formato de aplicação nativa inválido.');
  const resource = { kind: 'scene', id: workId(value.resource.id) },
    native = {
      conversationId: workId(value.native.conversationId),
      conversationToken: editorChatHashToken(value.native.conversationToken),
      turnId: workId(value.native.turnId),
      attemptToken: editorChatHashToken(value.native.attemptToken),
    };
  if (value.source.id !== literaryChatTurnIndexId(c.uid, native.conversationId, native.turnId))
    workFail('failed-precondition', 'Identidade da resposta aplicada divergente.');
  const origins = await normalizeLiteraryAppliedChatOrigins(c, resource, value.origins);
  if (origins && origins.closureHash !== value.source.versionToken)
    workFail('failed-precondition', 'A aplicação perdeu o fechamento original.');
  if (!Number.isSafeInteger(value.revision) || value.revision < 0)
    workFail('failed-precondition', 'Revisão nativa da aplicação inválida.');
  return {
    version: 1,
    ownerId: c.uid,
    target: c.target,
    resource,
    operationId: workId(value.operationId),
    requestHash: editorChatHashToken(value.requestHash),
    source: {
      kind: 'chat',
      id: value.source.id,
      identityToken: editorChatHashToken(value.source.identityToken),
      versionToken: editorChatHashToken(value.source.versionToken),
    },
    native,
    destinationIdentity: editorChatHashToken(value.destinationIdentity),
    suggestionHash: editorChatHashToken(value.suggestionHash),
    afterHash: editorChatHashToken(value.afterHash),
    revision: value.revision,
    receiptToken: editorChatHashToken(value.receiptToken),
    origins,
    historical: true,
  };
}
