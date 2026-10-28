import { GenerationError, validateId } from './generation.mjs';
import { digest } from './sceneContracts.mjs';
import { born, restoreId } from './bookRestoreUploadContracts.mjs';
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
    restoreId(o.restoreId);
    restoreId(o.activationOperationId);
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
  return { birth: born(snapshot), value: structuredClone(value) };
}
export function verifyRestoredImageRemovalClaim(snapshot, claim) {
  if (!snapshot.exists || digest(born(snapshot)) !== digest(claim.birth)) fail();
  const value = snapshot.data();
  // Concurrent removers can both confirm the same incarnation after the first finalizes.
  const comparable =
    value.state === 'deleted'
      ? { ...value, state: claim.value.state, updatedAt: claim.value.updatedAt }
      : value;
  if (digest(comparable) !== digest(claim.value)) fail();
  return value;
}
