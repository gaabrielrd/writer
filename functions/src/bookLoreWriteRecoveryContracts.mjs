import { authorize, closed, restoreHash, born, bornEqual } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { creationRef } from './bookLoreCreationContracts.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
export const BOOK_LORE_RECOVERY_METHODS = Object.freeze([
  'reserveBookLoreEditRecovery',
  'getBookLoreEditRecovery',
  'revokeBookLoreEditRecovery',
]);
export const recoveryConflict = () =>
  workFail('failed-precondition', 'A recuperação mudou ou está indisponível.');
export const recoveryInvalid = () =>
  workFail('invalid-argument', 'Controle de recuperação inválido.');
export function recoveryId(value) {
  try {
    return bookContentId(value);
  } catch {
    return recoveryInvalid();
  }
}
export function recoveryIntent(uid, input) {
  authorize(uid);
  closed(input, ['writeId', 'bookId', 'loreId', 'sourceToken', 'intentHash'], ['creation']);
  const creation = Object.hasOwn(input, 'creation') ? creationRef(input.creation) : null;
  if (
    creation &&
    (!/^lore-creation-[a-f0-9]{64}$/.test(creation.creationId) ||
      creation.jobToken !== input.sourceToken)
  )
    recoveryInvalid();
  return {
    writeId: recoveryId(input.writeId),
    bookId: recoveryId(input.bookId),
    loreId: recoveryId(input.loreId),
    sourceToken: restoreHash(input.sourceToken),
    intentHash: restoreHash(input.intentHash),
    ...(creation ? { creation } : {}),
  };
}
export const recoveryRequestHash = (uid, intent) =>
  digest({ domain: 'writer-lore-edit-recovery', schemaVersion: 1, uid, intent });
export function recoveryRequest(uid, input, requireToken = false) {
  authorize(uid);
  closed(
    input,
    ['writeId', 'requestHash', ...(requireToken ? ['jobToken'] : [])],
    requireToken ? [] : ['jobToken'],
  );
  return {
    writeId: recoveryId(input.writeId),
    requestHash: restoreHash(input.requestHash),
    ...(Object.hasOwn(input, 'jobToken') ? { jobToken: restoreHash(input.jobToken) } : {}),
  };
}
export function recoveryPaths(db, uid, id) {
  authorize(uid);
  recoveryId(id);
  const path = 'users/' + uid + '/bookLoreWriteRecoveries/' + id;
  return {
    db,
    uid,
    id,
    path,
    root: db.doc(path),
    proof: db.doc(path + '/proofs/origin'),
    key: db.doc(path + '/keys/current'),
    closed: db.doc(path + '/terminal/closed'),
    closedProof: db.doc(path + '/proofs/closed'),
  };
}
export const immutableRecovery = (snapshot) =>
  snapshot.exists && bornEqual(snapshot, { createTime: snapshot.updateTime });
export const recoveryToken = (c, root) =>
  digest({
    domain: 'writer-lore-edit-recovery-token',
    uid: c.uid,
    writeId: c.id,
    requestHash: root.data().requestHash,
    birth: born(root),
  });
export const recoveryView = (l) => ({
  schemaVersion: 1,
  writeId: l.c.id,
  requestHash: l.value.requestHash,
  jobToken: l.token,
  phase: l.closed ? 'revoked' : 'reserved',
  keyId: l.value.keyId ?? null,
  bookId: l.value.intent?.bookId ?? null,
  loreId: l.value.intent?.loreId ?? null,
  sourceToken: l.value.intent?.sourceToken ?? null,
  intentHash: l.value.intent?.intentHash ?? null,
});
