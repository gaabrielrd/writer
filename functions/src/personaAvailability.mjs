import { readWorkMetadata } from './workProgressContracts.mjs';
import { bookBackupIdentity } from './bookBackupContext.mjs';
import {
  projectPersonaRestoreOrigin,
  parsePersonaRestoreOrigin,
  projectPersonaRestoreBatch,
  personaRestoreProjectId,
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
export async function readPersonaRestoreBatchProof(tx, db, uid, input, state) {
  if (!['preparing', 'active', 'cancelled'].includes(state))
    throw new TypeError('Estado de lote inválido.');
  if (
    typeof uid !== 'string' ||
    !uid ||
    uid.includes('/') ||
    uid.includes('\\') ||
    ['.', '..'].includes(uid)
  )
    return null;
  let origin;
  try {
    origin = parsePersonaRestoreOrigin(input);
  } catch {
    return null;
  }
  const snapshot = await readWorkMetadata(
    tx,
    db.doc('users/' + uid + '/aiPersonaRestoreBatches/' + personaRestoreProjectId(origin)),
    [
      'schemaVersion',
      'ownerId',
      origin.schemaVersion === 1 ? 'bookId' : 'target',
      'restoreId',
      'jobToken',
      'state',
      'profileCount',
      'createdByOperationId',
      'lastOperationId',
    ],
  );
  let value;
  try {
    value = projectPersonaRestoreBatch(snapshot.data());
  } catch {
    return null;
  }
  if (
    value.ownerId !== uid ||
    value.schemaVersion !== origin.schemaVersion ||
    (value.schemaVersion === 1 ? value.bookId : value.target.id) !==
      personaRestoreProjectId(origin) ||
    value.restoreId !== origin.restoreId ||
    value.jobToken !== origin.jobToken ||
    value.state !== state
  )
    return null;
  const adventure = origin.schemaVersion === 2,
    operations = adventure ? 'adventureRestoreOperations' : 'bookRestoreOperations',
    installAction = adventure
      ? 'advanceAdventureRestorePersonaLibrary'
      : 'advanceBookRestorePersonaLibrary';
  const [first, last] = await Promise.all([
    readWorkMetadata(
      tx,
      db.doc('users/' + uid + '/' + operations + '/' + value.createdByOperationId),
      receiptFields,
    ),
    readWorkMetadata(
      tx,
      db.doc('users/' + uid + '/' + operations + '/' + value.lastOperationId),
      receiptFields,
    ),
  ]);
  const [action, receiptState] =
    state === 'active'
      ? [adventure ? 'activateAdventureRestore' : 'activateBookRestore', 'activated']
      : state === 'cancelled'
        ? [adventure ? 'advanceAdventureRestoreCleanup' : 'advanceBookRestoreCleanup', 'cancelling']
        : [installAction, 'content-verified'];
  if (
    !receipt(
      first.data(),
      uid,
      value,
      value.createdByOperationId,
      installAction,
      'content-verified',
    ) ||
    !receipt(last.data(), uid, value, value.lastOperationId, action, receiptState)
  )
    return null;
  try {
    const b = bookBackupIdentity(snapshot),
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
  return { snapshot, value, first, last };
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
  return (await readPersonaRestoreBatchProof(tx, db, uid, origin, 'active')) ? snapshot : null;
}
