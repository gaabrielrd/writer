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
/** Server-owned library provenance only; no request path, generation or context is trusted. */
export function restoredImageRemovalPlan(uid, id, record) {
  if (!Object.hasOwn(record, 'restoreOrigin') && !Object.hasOwn(record, 'restoreStorage'))
    return null;
  try {
    const o = record.restoreOrigin,
      s = record.restoreStorage;
    if (
      !closed(o, ['schemaVersion', 'restoreId', 'jobToken', 'activationOperationId', 'bookId']) ||
      o.schemaVersion !== 1 ||
      !closed(s, ['schemaVersion', 'contentHash', 'byteLength', 'proof'], ['publishedProof']) ||
      s.schemaVersion !== 1 ||
      record.id !== id ||
      !['preparing', 'active', 'deleting', 'deleted'].includes(record.state) ||
      record.path !== 'book-covers/' + uid + '/' + id + '.png'
    )
      fail();
    if (
      [o.restoreId, o.activationOperationId].some(
        (value) => typeof value !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(value),
      )
    )
      fail();
    validateId(o.bookId);
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
