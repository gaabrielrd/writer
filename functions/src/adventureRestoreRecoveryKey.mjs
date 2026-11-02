import { randomBytes, createHash } from 'node:crypto';
import { assertAdventureNotDeleted } from './adventureDeletionGuard.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';
import {
  authorize,
  closed,
  restoreId,
  restoreHash,
  bornEqual,
  immutable,
  digest,
  inconsistent,
  restoreFail,
} from './adventureRestoreContracts.mjs';

const KEY_FIELDS = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'adventureId',
  'startFingerprint',
  'reviewHash',
  'keyId',
  'keyFingerprint',
];
const fingerprint = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const adventureRestoreKeyRef = (store, uid, id) =>
  store.db.doc('users/' + uid + '/adventureRestoreRecoveryKeys/' + id);
export const adventureRestoreKeyMetadata = (key) =>
  Object.fromEntries(KEY_FIELDS.map((field) => [field, key[field]]));

export function newAdventureRestoreKey(uid, id, adventureId, startFingerprint, reviewHash) {
  const bytes = randomBytes(32);
  return {
    schemaVersion: 1,
    ownerId: uid,
    restoreId: id,
    adventureId,
    startFingerprint,
    reviewHash,
    keyId: randomBytes(32).toString('hex'),
    keyFingerprint: fingerprint(bytes),
    keyBase64: bytes.toString('base64'),
  };
}

export async function assertAdventureRestoreKeyAbsent(store, tx, uid, id) {
  if (typeof tx.getAll !== 'function') inconsistent();
  if ((await readWorkMetadata(tx, adventureRestoreKeyRef(store, uid, id), ['restoreId'])).exists)
    inconsistent();
}

// Native immutable birth and the initial receipt prove metadata for retirement.
// Only recovery reads and validates secret bytes. Never mint during recovery.
export async function readAdventureRestoreKey(store, tx, loaded, metadataOnly = false) {
  if (metadataOnly && typeof tx.getAll !== 'function') inconsistent();
  const start = await tx.get(store.refs.op(loaded.uid, loaded.id));
  store.operation(start, loaded, loaded.job.startFingerprint);
  const effects = start.data().effects.filter((e) => e.collection === 'recovery-key'),
    ref = adventureRestoreKeyRef(store, loaded.uid, loaded.id),
    snapshot = metadataOnly ? await readWorkMetadata(tx, ref, KEY_FIELDS) : await tx.get(ref);
  if (!effects.length) {
    if (snapshot.exists) inconsistent();
    return null;
  }
  if (effects.length !== 1 || effects[0].id !== loaded.id || !snapshot.exists) inconsistent();
  const v = closed(snapshot.data(), metadataOnly ? KEY_FIELDS : [...KEY_FIELDS, 'keyBase64']);
  if (
    v.schemaVersion !== 1 ||
    v.ownerId !== loaded.uid ||
    v.restoreId !== loaded.id ||
    v.adventureId !== loaded.job.adventureId ||
    v.startFingerprint !== loaded.job.startFingerprint ||
    v.reviewHash !== loaded.job.reviewHash ||
    digest(adventureRestoreKeyMetadata(v)) !== effects[0].hash ||
    !bornEqual(snapshot, loaded.snapshot)
  )
    inconsistent();
  restoreHash(v.keyId);
  restoreHash(v.keyFingerprint);
  immutable(snapshot);
  if (
    !metadataOnly &&
    (typeof v.keyBase64 !== 'string' ||
      !/^[A-Za-z0-9+/]{43}=$/.test(v.keyBase64) ||
      Buffer.from(v.keyBase64, 'base64').length !== 32 ||
      Buffer.from(v.keyBase64, 'base64').toString('base64') !== v.keyBase64 ||
      fingerprint(Buffer.from(v.keyBase64, 'base64')) !== v.keyFingerprint)
  )
    inconsistent();
  return { ref, value: v };
}

export function createAdventureRestoreRecoveryService(store) {
  return {
    async getAdventureRestoreRecoveryKey(uid, input) {
      authorize(uid);
      closed(input, ['restoreId', 'jobToken', 'reviewHash'], ['expectedKeyId']);
      const id = restoreId(input.restoreId),
        token = restoreHash(input.jobToken),
        reviewHash = restoreHash(input.reviewHash),
        expected = input.expectedKeyId === undefined ? undefined : restoreHash(input.expectedKeyId);
      return store.db.runTransaction(async (tx) => {
        const loaded = await store.load(tx, uid, id, token);
        if (['cancelling', 'cancelled'].includes(loaded.job.state))
          restoreFail('failed-precondition', 'state-conflict');
        await assertAdventureNotDeleted(tx, store.db, uid, loaded.job.adventureId);
        if (loaded.job.reviewHash !== reviewHash)
          restoreFail('failed-precondition', 'review-mismatch');
        const archive = await tx.get(store.db.doc(loaded.ref.path + '/archiveCleanup/current'));
        if (archive.exists) restoreFail('failed-precondition', 'recovery-key-unavailable');
        const key = await readAdventureRestoreKey(store, tx, loaded);
        if (!key) restoreFail('failed-precondition', 'recovery-key-unavailable');
        if (expected !== undefined && expected !== key.value.keyId)
          restoreFail('failed-precondition', 'key-mismatch');
        return {
          schemaVersion: 1,
          ownerId: uid,
          restoreId: id,
          adventureId: loaded.job.adventureId,
          jobToken: token,
          reviewHash,
          keyId: key.value.keyId,
          algorithm: 'AES-GCM',
          keyBase64: key.value.keyBase64,
        };
      });
    },
  };
}
