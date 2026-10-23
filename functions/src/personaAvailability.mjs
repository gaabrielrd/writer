import { readWorkMetadata } from './workProgressContracts.mjs';
import { bookBackupIdentity } from './bookBackupContext.mjs';
import {
  projectPersonaRestoreOrigin,
  projectPersonaRestoreBatch,
  isPersonaRestoreBatchAvailable,
} from './personaAvailabilityContracts.mjs';
const receiptFields = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'jobToken',
  'fingerprint',
  'receipt.schemaVersion',
  'receipt.operationId',
  'receipt.action',
  'receipt.state',
  'receipt.expectedCheckpoint',
  'receipt.checkpoint',
];
const same = (a, b) => a.seconds === b.seconds && a.nanoseconds === b.nanoseconds;
function receipt(value, uid, batch, id, action, state) {
  const r = value?.receipt;
  return (
    value?.schemaVersion === 1 &&
    value.ownerId === uid &&
    value.restoreId === batch.restoreId &&
    value.jobToken === batch.jobToken &&
    typeof value.fingerprint === 'string' &&
    /^[a-f0-9]{64}$/.test(value.fingerprint) &&
    r?.schemaVersion === 1 &&
    r.operationId === id &&
    r.action === action &&
    r.state === state &&
    Number.isSafeInteger(r.expectedCheckpoint) &&
    r.expectedCheckpoint >= 0 &&
    Number.isSafeInteger(r.checkpoint) &&
    r.checkpoint === r.expectedCheckpoint + 1
  );
}
export async function readAvailablePersonaMetadata(tx, db, uid, id, fields = []) {
  if (
    typeof uid !== 'string' ||
    !uid ||
    uid.includes('/') ||
    typeof id !== 'string' ||
    !/^[a-zA-Z0-9-]{1,100}$/.test(id)
  )
    throw new TypeError('Escopo de persona inválido.');
  const snapshot = await readWorkMetadata(tx, db.doc('users/' + uid + '/aiPersonas/' + id), [
    ...new Set([...fields, 'restoreOrigin']),
  ]);
  if (!snapshot.exists) return null;
  let origin;
  try {
    origin = projectPersonaRestoreOrigin({ ...snapshot.data(), id: snapshot.id });
  } catch {
    return null;
  }
  if (origin === null) return snapshot;
  const batchSnapshot = await readWorkMetadata(
    tx,
    db.doc('users/' + uid + '/aiPersonaRestoreBatches/' + origin.bookId),
    [
      'schemaVersion',
      'ownerId',
      'bookId',
      'restoreId',
      'jobToken',
      'state',
      'profileCount',
      'createdByOperationId',
      'lastOperationId',
    ],
  );
  let batch;
  try {
    batch = projectPersonaRestoreBatch(batchSnapshot.data());
  } catch {
    return null;
  }
  if (!isPersonaRestoreBatchAvailable(uid, origin, batch)) return null;
  const [first, last] = await Promise.all([
    readWorkMetadata(
      tx,
      db.doc('users/' + uid + '/bookRestoreOperations/' + batch.createdByOperationId),
      receiptFields,
    ),
    readWorkMetadata(
      tx,
      db.doc('users/' + uid + '/bookRestoreOperations/' + batch.lastOperationId),
      receiptFields,
    ),
  ]);
  if (
    !receipt(
      first.data(),
      uid,
      batch,
      batch.createdByOperationId,
      'advanceBookRestorePersonaLibrary',
      'content-verified',
    ) ||
    !receipt(last.data(), uid, batch, batch.lastOperationId, 'activateBookRestore', 'activated')
  )
    return null;
  try {
    const b = bookBackupIdentity(batchSnapshot),
      f = bookBackupIdentity(first),
      l = bookBackupIdentity(last);
    if (
      !b ||
      !f ||
      !l ||
      !same(b.created, f.created) ||
      !same(f.created, f.updated) ||
      !same(l.created, l.updated) ||
      !same(b.updated, l.created)
    )
      return null;
  } catch {
    return null;
  }
  return snapshot;
}
