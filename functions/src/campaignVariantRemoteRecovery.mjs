import { validateId } from './generation.mjs';
import { assertCampaignNotDeleted } from './campaignDeletionGuard.mjs';
import { workId, workRevision } from './workProgressContracts.mjs';
import {
  captureScope,
  encodeBaseCursor,
  decodeBaseCursor,
  limit,
} from './campaignBaseContracts.mjs';
import {
  hashId,
  digest,
  fail,
  operationDescriptor,
  verifyOperation,
  budget,
} from './campaignLoreContracts.mjs';

const fields = [
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'baseId',
  'operationId',
  'state',
  'closed',
  'revision',
];
function scopeInput(data) {
  return {
    campaignId: workId(data.campaignId),
    campaignToken: hashId(data.campaignToken),
    baseId: hashId(data.baseId),
  };
}
const scopeOf = (uid, data) => ({ schemaVersion: 1, ownerId: uid, ...data });
function matching(value, uid, scope) {
  return (
    value?.schemaVersion === 1 &&
    value.ownerId === uid &&
    value.campaignId === scope.campaignId &&
    value.campaignToken === scope.campaignToken &&
    value.baseId === scope.baseId
  );
}
function statusToken(uid, scope, id, snapshot) {
  const stamp = snapshot.updateTime;
  if (
    !stamp ||
    !Number.isSafeInteger(stamp.seconds) ||
    !Number.isInteger(stamp.nanoseconds) ||
    stamp.nanoseconds < 0 ||
    stamp.nanoseconds >= 1e9
  )
    fail('failed-precondition', 'Não foi possível conferir o pedido.');
  return digest({
    uid,
    ...scope,
    operationId: id,
    updateTime: { seconds: stamp.seconds, nanoseconds: stamp.nanoseconds },
  });
}
export function createCampaignVariantRemoteRecoveryService({ db }) {
  return {
    async listCampaignLoreOperations(uid, data) {
      captureScope(uid, data, ['campaignId', 'campaignToken', 'baseId', 'cursor', 'limit']);
      const scope = scopeInput(data),
        size = limit(data.limit),
        cursorScope = { uid, ...scope },
        cursor = decodeBaseCursor(data.cursor, cursorScope);
      return db.runTransaction(async (tx) => {
        await assertCampaignNotDeleted(tx, db, uid, scope.campaignId);
        let q = db
          .collection(`users/${uid}/campaignVariantOperations`)
          .where('campaignId', '==', scope.campaignId)
          .where('campaignToken', '==', scope.campaignToken)
          .where('baseId', '==', scope.baseId)
          .orderBy('__name__')
          .limit(size + 1)
          .select(...fields);
        if (cursor) q = q.startAfter(cursor.key);
        const docs = (await tx.get(q)).docs,
          items = [];
        for (const doc of docs.slice(0, size)) {
          const op = doc.data();
          if (
            !matching(op, uid, scope) ||
            op.operationId !== doc.id ||
            !['prepared', 'committed', 'canceled'].includes(op.state)
          )
            fail('failed-precondition', 'Pedido inconsistente.');
          if (op.closed === true || op.state === 'canceled') continue;
          const revision = op.state === 'committed' ? workRevision(op.revision) : null;
          if (revision === 0) fail('failed-precondition', 'Revisão inconsistente.');
          items.push({
            operationId: doc.id,
            state: op.state,
            revision,
            statusToken: statusToken(uid, scope, doc.id, doc),
          });
        }
        return budget({
          ...scopeOf(uid, scope),
          items,
          nextCursor:
            docs.length > size
              ? encodeBaseCursor({ version: 1, scope: cursorScope, key: docs[size - 1].id })
              : null,
        });
      });
    },
    async resolveCampaignLoreRemoteOperation(uid, data) {
      captureScope(uid, data, [
        'campaignId',
        'campaignToken',
        'baseId',
        'operationId',
        'statusToken',
        'resolutionId',
        'intent',
      ]);
      const scope = scopeInput(data),
        input = {
          ...scope,
          operationId: validateId(data.operationId),
          statusToken: hashId(data.statusToken),
          resolutionId: validateId(data.resolutionId),
          intent: data.intent,
        };
      if (!['confirm', 'cancel'].includes(input.intent))
        fail('invalid-argument', 'Intenção inválida.');
      const fingerprint = digest(input),
        receiptRef = db.doc(
          `users/${uid}/campaignVariantResolutionOperations/${input.resolutionId}`,
        );
      return db.runTransaction(async (tx) => {
        await assertCampaignNotDeleted(tx, db, uid, scope.campaignId);
        const prior = (await tx.get(receiptRef)).data();
        if (prior) {
          if (prior.schemaVersion !== 1)
            fail('failed-precondition', 'Versão da resolução não suportada.');
          if (prior.ownerId !== uid || prior.fingerprint !== fingerprint)
            fail('invalid-argument', 'Resolução utilizada com outro pedido.');
          return prior.result;
        }
        const ref = db.doc(`users/${uid}/campaignVariantOperations/${input.operationId}`),
          snapshot = await tx.get(ref),
          op = snapshot.data();
        let result = {
          schemaVersion: 1,
          ownerId: uid,
          request: input,
          outcome: 'rejected',
          state: null,
          reason: 'operation-changed',
          revision: null,
        };
        if (
          op &&
          matching(op, uid, scope) &&
          statusToken(uid, scope, input.operationId, snapshot) === input.statusToken &&
          op.closed !== true
        ) {
          const descriptor = operationDescriptor(uid, op, op.action);
          verifyOperation(op, descriptor);
          if (op.operationId !== input.operationId)
            fail('failed-precondition', 'Identidade do pedido inconsistente.');
          const applicable =
            input.intent === 'confirm' ? op.state === 'committed' : op.state === 'prepared';
          if (applicable) {
            const revision = input.intent === 'confirm' ? workRevision(op.revision) : null;
            if (revision === 0) fail('failed-precondition', 'Revisão inconsistente.');
            const next = {
              ...op,
              state: input.intent === 'confirm' ? 'committed' : 'canceled',
              closed: true,
            };
            delete next.key;
            result = {
              ...result,
              outcome: 'resolved',
              state: input.intent === 'confirm' ? 'confirmed' : 'canceled',
              reason: null,
              revision,
            };
            tx.set(ref, next);
          }
        }
        tx.create(receiptRef, { schemaVersion: 1, ownerId: uid, fingerprint, result });
        return result;
      });
    },
  };
}
