// UID-scoped operations for editor chat only. No payload, permission grant or expiry.
import {
  editorChatClosed,
  editorChatFail,
  editorChatSourceId,
  editorChatId,
  normalizeEditorChatReceipt,
  normalizeEditorChatDTO,
} from './editorChatContracts.mjs';

export const editorChatOperationRef = (db, uid, id) =>
  db.doc(`users/${editorChatSourceId(uid)}/editorChatOperations/${editorChatId(id)}`);

export async function readEditorChatOperation(tx, db, uid, request) {
  const ref = editorChatOperationRef(db, uid, request.operationId);
  const value = (await tx.get(ref)).data();
  if (!value) return { ref, receipt: null, pending: false };
  try {
    editorChatClosed(value, [
      'schemaVersion',
      'ownerId',
      'operationId',
      'action',
      'requestHash',
      'state',
      'receipt',
    ]);
    if (
      value.schemaVersion !== 1 ||
      value.ownerId !== uid ||
      value.operationId !== request.operationId ||
      !['pending', 'settled'].includes(value.state) ||
      (value.state === 'settled') !== (value.receipt !== null)
    )
      editorChatFail('inconsistent');
    if (
      value.action !== (request.operationAction ?? request.action) ||
      value.requestHash !== request.requestHash
    )
      editorChatFail('operation-conflict');
    const receipt =
      value.receipt === null
        ? null
        : normalizeEditorChatReceipt(value.receipt, {
            operationId: request.operationId,
            action: value.action,
            requestHash: request.requestHash,
          });
    return { ref, receipt, pending: value.state === 'pending' };
  } catch (error) {
    editorChatFail(
      error.details?.reason === 'operation-conflict' ? 'operation-conflict' : 'inconsistent',
    );
  }
}

export function writeEditorChatReceipt(
  tx,
  operation,
  uid,
  request,
  result,
  confirmedAt,
  outcome = 'confirmed',
) {
  const receipt = normalizeEditorChatReceipt({
    schemaVersion: 1,
    operationId: request.operationId,
    action: request.operationAction ?? request.action,
    requestHash: request.requestHash,
    outcome,
    confirmedAt,
    result,
  });
  tx.set(operation.ref, {
    schemaVersion: 1,
    ownerId: uid,
    operationId: receipt.operationId,
    action: receipt.action,
    requestHash: receipt.requestHash,
    state: 'settled',
    receipt,
  });
  return receipt;
}

export async function resolveEditorChatOperation(tx, db, uid, request, now) {
  const operation = await readEditorChatOperation(tx, db, uid, request);
  if (operation.receipt)
    return normalizeEditorChatDTO('resolution', { state: 'settled', receipt: operation.receipt });
  if (operation.pending) return { state: 'pending', receipt: null };
  if (request.intent === 'observe') return { state: 'unknown', receipt: null };
  const receipt = writeEditorChatReceipt(
    tx,
    operation,
    uid,
    request,
    { kind: 'fence' },
    now,
    'canceled',
  );
  return { state: 'settled', receipt };
}
