import {
  ADVENTURE_RESTORE_CHUNK_BYTES,
  ADVENTURE_RESTORE_SEED,
  chunkId,
  chunkChain,
  closed,
  inconsistent,
  restoreHash,
  sha256,
  nativeToken,
} from './adventureRestoreContracts.mjs';
export const restoreContext = (loaded, operationId) => ({
  schemaVersion: 1,
  ownerId: loaded.uid,
  restoreId: loaded.id,
  jobToken: loaded.view.jobToken,
  createdByOperationId: operationId,
});
export async function readAdventureRestoreChunk(store, tx, loaded, index) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= loaded.job.uploadedChunks)
    inconsistent();
  const ref = store.db.doc(loaded.ref.path + '/chunks/' + chunkId(index)),
    snapshot = await tx.get(ref),
    value = await store.artifact(tx, loaded, 'chunks', snapshot);
  closed(value, [
    'schemaVersion',
    'ownerId',
    'restoreId',
    'jobToken',
    'createdByOperationId',
    'index',
    'byteLength',
    'chunkHash',
    'chunkBase64',
    'previousChainHash',
    'chainHash',
  ]);
  const expected = Math.min(
    ADVENTURE_RESTORE_CHUNK_BYTES,
    loaded.job.source.byteLength - index * ADVENTURE_RESTORE_CHUNK_BYTES,
  );
  if (
    value.index !== index ||
    snapshot.id !== chunkId(index) ||
    value.byteLength !== expected ||
    typeof value.chunkBase64 !== 'string' ||
    value.chunkBase64.length > 4 * Math.ceil(ADVENTURE_RESTORE_CHUNK_BYTES / 3)
  )
    inconsistent();
  restoreHash(value.chunkHash);
  restoreHash(value.previousChainHash);
  restoreHash(value.chainHash);
  const bytes = Buffer.from(value.chunkBase64, 'base64');
  if (
    bytes.length !== expected ||
    bytes.toString('base64') !== value.chunkBase64 ||
    sha256(bytes) !== value.chunkHash ||
    value.chainHash !== chunkChain(value.previousChainHash, index, value.chunkHash, bytes.length) ||
    (index === 0 && value.previousChainHash !== ADVENTURE_RESTORE_SEED)
  )
    inconsistent();
  return {
    bytes,
    snapshot,
    proof: {
      index,
      byteLength: bytes.length,
      chunkHash: value.chunkHash,
      chunkToken: nativeToken(snapshot),
      previousChainHash: value.previousChainHash,
      chainHash: value.chainHash,
    },
  };
}
export async function readAdventureRestoreProof(store, tx, loaded, index, chunk) {
  if (!Number.isSafeInteger(index) || index < 0 || index >= loaded.job.checkedChunks)
    inconsistent();
  const snapshot = await tx.get(
      store.db.doc(loaded.ref.path + '/integrityProofs/' + chunkId(index)),
    ),
    value = await store.artifact(tx, loaded, 'integrityProofs', snapshot);
  closed(value, [
    'schemaVersion',
    'ownerId',
    'restoreId',
    'jobToken',
    'createdByOperationId',
    'index',
    'byteLength',
    'chunkHash',
    'chunkToken',
    'previousChainHash',
    'chainHash',
  ]);
  for (const key of [
    'index',
    'byteLength',
    'chunkHash',
    'chunkToken',
    'previousChainHash',
    'chainHash',
  ]) {
    if (value[key] !== chunk.proof[key]) inconsistent();
  }
  return { value, snapshot };
}
