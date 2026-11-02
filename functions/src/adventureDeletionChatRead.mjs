import { readWorkMetadata } from './workProgressContracts.mjs';
import {
  editorChatProjectToken,
  editorChatControlToken,
  editorChatRequestHash,
  normalizeEditorChatReceipt,
  normalizeEditorChatDTO,
  normalizeEditorChatTarget,
  normalizeEditorChatResource,
  editorChatHashToken,
} from './editorChatContracts.mjs';
import {
  adventureDeletionInconsistent as invalid,
  adventureDeletionBorn as born,
  adventureDeletionSameBirth as sameBirth,
  adventureDeletionImmutable as immutable,
  adventureDeletionOperationPath,
} from './adventureDeletionContracts.mjs';

export const chatScopeFields = (prefix) => [
  prefix + '.target.kind',
  prefix + '.target.id',
  prefix + '.resource.kind',
  prefix + '.resource.id',
  prefix + '.projectToken',
  prefix + '.resourceToken',
];
export const contextHeaderFields = [
  'schemaVersion',
  'ownerId',
  'contextId',
  'birthNonce',
  'summary',
  'cleanupId',
];
const resultFields = [
  'kind',
  'contextId',
  'contextToken',
  'conversationId',
  'conversationToken',
  'turnId',
  'attemptToken',
  'revision',
  'phase',
  'state',
];
const operationFields = [
  'schemaVersion',
  'ownerId',
  'operationId',
  'action',
  'requestHash',
  'state',
  'receipt.schemaVersion',
  'receipt.operationId',
  'receipt.action',
  'receipt.requestHash',
  'receipt.outcome',
  'receipt.confirmedAt',
  ...resultFields.map((k) => 'receipt.result.' + k),
];
export const ownChatScope = (scope, p, token) =>
  scope.target.kind === 'adventure' &&
  scope.target.id === p.adventureId &&
  scope.projectToken === token;
export function chatScope(value) {
  try {
    const target = normalizeEditorChatTarget(value?.target);
    return {
      target,
      resource: normalizeEditorChatResource(value.resource, target),
      projectToken: editorChatHashToken(value.projectToken),
      resourceToken: editorChatHashToken(value.resourceToken),
    };
  } catch {
    invalid();
  }
}
export async function adventureChatScope(tx, db, p) {
  const first = await readWorkMetadata(
    tx,
    db.doc(adventureDeletionOperationPath(p.ownerId, p.deletionId)),
    ['schemaVersion'],
  );
  return {
    token: await editorChatProjectToken({
      ownerId: p.ownerId,
      target: { kind: 'adventure', id: p.adventureId },
      createdAt: p.sourceBirth,
    }),
    barrier: born(first),
  };
}
const compare = (a, b) =>
  a.seconds === b.seconds
    ? Math.sign(a.nanoseconds - b.nanoseconds)
    : a.seconds < b.seconds
      ? -1
      : 1;
export function assertChatCreatedBefore(first, next) {
  if (compare(born(first), born(next)) > 0) invalid();
}
export function assertChatBeforeDeletion(snapshot, p, scope) {
  const start = born(snapshot),
    end = born(snapshot, true);
  if (
    compare(start, p.sourceBirth) < 0 ||
    compare(end, start) < 0 ||
    compare(end, scope.barrier) > 0
  )
    invalid();
}
export async function contextHeader(tx, db, uid, id) {
  const snapshot = await readWorkMetadata(
    tx,
    db.doc('users/' + uid + '/editorChatContexts/' + id),
    contextHeaderFields,
  );
  if (!snapshot.exists) return null;
  const v = snapshot.data();
  try {
    const s = normalizeEditorChatDTO('context', v.summary);
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== uid ||
      v.contextId !== id ||
      s.contextId !== id ||
      s.ownerId !== uid ||
      !Object.hasOwn(v, 'cleanupId') ||
      (v.cleanupId !== null && typeof v.cleanupId !== 'string') ||
      (await editorChatControlToken('context', {
        ownerId: uid,
        contextId: id,
        birthNonce: v.birthNonce,
        projectToken: s.projectToken,
        resourceToken: s.resourceToken,
      })) !== s.contextToken
    )
      invalid();
    return { snapshot, record: v, summary: s, scope: chatScope(s) };
  } catch {
    invalid();
  }
}
async function originalReceipt(tx, db, uid, action, filters) {
  let q = db.collection('users/' + uid + '/editorChatOperations').where('action', '==', action);
  for (const [field, value] of filters) q = q.where('receipt.result.' + field, '==', value);
  const rows = await tx.get(
    q
      .select(...operationFields)
      .orderBy('__name__')
      .limit(2),
  );
  if (rows.docs.length !== 1) invalid();
  const snapshot = rows.docs[0],
    v = snapshot.data();
  immutable(snapshot);
  try {
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== uid ||
      v.operationId !== snapshot.id ||
      v.action !== action ||
      v.state !== 'settled'
    )
      invalid();
    const receipt = normalizeEditorChatReceipt(v.receipt, {
      action,
      operationId: snapshot.id,
      requestHash: v.requestHash,
    });
    if (receipt.outcome !== 'confirmed') invalid();
    return { snapshot, receipt, hash: v.requestHash };
  } catch {
    invalid();
  }
}
export async function orphanContextScope(tx, db, uid, snapshot, value) {
  const scope = chatScope(value.frozen?.source),
    op = await originalReceipt(tx, db, uid, 'advanceContext', [
      ['contextId', snapshot.id],
      ['phase', 'ready'],
    ]),
    r = op.receipt.result;
  if (
    r.revision < 1 ||
    r.contextToken !== value.contextToken ||
    !sameBirth(op.snapshot, { createTime: snapshot.updateTime }) ||
    (await editorChatRequestHash({
      action: 'advanceContext',
      target: scope.target,
      resource: scope.resource,
      contextId: snapshot.id,
      contextToken: value.contextToken,
      expectedRevision: r.revision - 1,
      operationId: op.snapshot.id,
    })) !== op.hash
  )
    invalid();
  return scope;
}
export async function orphanConversationScope(tx, db, uid, conversationId, value) {
  const scope = chatScope(value.context?.source),
    op = await originalReceipt(tx, db, uid, 'createConversation', [
      ['conversationId', conversationId],
    ]);
  if (
    op.receipt.result.conversationToken !== value.conversationToken ||
    (await editorChatRequestHash({
      action: 'createConversation',
      target: scope.target,
      resource: scope.resource,
      conversationId,
      operationId: op.snapshot.id,
      projectToken: scope.projectToken,
      resourceToken: scope.resourceToken,
    })) !== op.hash
  )
    invalid();
  return { scope, snapshot: op.snapshot };
}
export async function assertOrphanTurnBirth(tx, db, uid, snapshot, value) {
  const op = await originalReceipt(tx, db, uid, 'send', [
    ['conversationId', value.conversationId],
    ['turnId', value.turnId],
  ]);
  const r = op.receipt.result;
  if (
    !sameBirth(snapshot, op.snapshot) ||
    r.conversationToken !== value.conversationToken ||
    r.attemptToken !== value.attemptToken
  )
    invalid();
}
