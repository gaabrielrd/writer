import { GenerationError, validateId } from './generation.mjs';
import { digest } from './sceneContracts.mjs';
import {
  bookRestoreCoverStorageContext,
  bookRestoreStorageProof,
} from './bookRestoreCoverStorageContracts.mjs';
const fail = () => {
  throw new GenerationError(
    'failed-precondition',
    'A origem da imagem mudou. Atualize a biblioteca antes de tentar novamente.',
  );
};
function closed(v, keys, optional = []) {
  return (
    !!v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    keys.every((k) => Object.hasOwn(v, k)) &&
    Object.keys(v).every((k) => keys.includes(k) || optional.includes(k))
  );
}
// Keep this reader independent of restore orchestration: imageLibrary is also
// reached by scene/lore modules while their hashing contracts are initializing.
function birth(snapshot) {
  const value = snapshot?.createTime;
  if (
    !value ||
    !Number.isSafeInteger(value.seconds) ||
    value.seconds < 0 ||
    !Number.isInteger(value.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    fail();
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
/** Pure typed provenance; installation of an adventure image does not imply activation. */
export function validateRestoredImageOrigin(value) {
  const v1 = value?.schemaVersion === 1;
  if (
    !closed(
      value,
      v1
        ? ['schemaVersion', 'restoreId', 'jobToken', 'activationOperationId', 'bookId']
        : [
            'schemaVersion',
            'restoreId',
            'jobToken',
            'installationOperationId',
            'target',
            'assetId',
          ],
    ) ||
    (!v1 && value.schemaVersion !== 2) ||
    typeof value.jobToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.jobToken) ||
    [value.restoreId, v1 ? value.activationOperationId : value.installationOperationId].some(
      (id) => typeof id !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(id),
    )
  )
    fail();
  if (v1) validateId(value.bookId);
  else {
    if (
      !closed(value.target, ['kind', 'id']) ||
      value.target.kind !== 'adventure' ||
      typeof value.assetId !== 'string' ||
      !/^[a-f0-9]{64}$/.test(value.assetId)
    )
      fail();
    validateId(value.target.id);
  }
  return structuredClone(value);
}
/** Server-owned library provenance only; no request path, generation or context is trusted. */
export function restoredImageRemovalPlan(uid, id, record) {
  if (!Object.hasOwn(record, 'restoreOrigin') && !Object.hasOwn(record, 'restoreStorage'))
    return null;
  try {
    const o = validateRestoredImageOrigin(record.restoreOrigin),
      s = record.restoreStorage;
    if (
      !closed(s, ['schemaVersion', 'contentHash', 'byteLength', 'proof'], ['publishedProof']) ||
      s.schemaVersion !== 1 ||
      record.id !== id ||
      !['preparing', 'active', 'deleting', 'deleted'].includes(record.state) ||
      record.path !== 'book-covers/' + uid + '/' + id + '.png'
    )
      fail();
    const context = bookRestoreCoverStorageContext({
        ownerId: uid,
        restoreId: o.restoreId,
        jobToken: o.jobToken,
        imageId: id,
        contentHash: s.contentHash,
        byteLength: s.byteLength,
      }),
      proof = bookRestoreStorageProof(s.proof),
      publishedProof = Object.hasOwn(s, 'publishedProof')
        ? bookRestoreStorageProof(s.publishedProof)
        : null;
    if (
      publishedProof !== null &&
      (publishedProof.generation !== proof.generation ||
        publishedProof.metageneration !== String(BigInt(proof.metageneration) + 1n))
    )
      fail();
    return { context, proof, publishedProof };
  } catch {
    fail();
  }
}
export function restoredImageRemovalClaim(snapshot, value) {
  return { birth: birth(snapshot), value: structuredClone(value) };
}
export function verifyRestoredImageRemovalClaim(snapshot, claim) {
  if (!snapshot.exists || digest(birth(snapshot)) !== digest(claim.birth)) fail();
  const value = snapshot.data();
  // Concurrent removers can both confirm the same incarnation after the first finalizes.
  const comparable =
    value.state === 'deleted'
      ? { ...value, state: claim.value.state, updatedAt: claim.value.updatedAt }
      : value;
  if (digest(comparable) !== digest(claim.value)) fail();
  return value;
}
