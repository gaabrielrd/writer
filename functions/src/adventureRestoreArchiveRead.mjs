import {
  closed,
  inconsistent,
  immutable,
  bornEqual,
  born,
  updated,
  compareStamp,
  restoreId,
  restoreHash,
  nativeToken,
  chunkId,
  chunkChain,
  ADVENTURE_RESTORE_CHUNK_BYTES,
} from './adventureRestoreContracts.mjs';
import { adventureValidationIndexId } from './adventureRestoreValidationIndex.mjs';
export const archiveArtifactFields = [
  'schemaVersion',
  'ownerId',
  'restoreId',
  'jobToken',
  'createdByOperationId',
];
export const archiveChunkFields = [
  ...archiveArtifactFields,
  'index',
  'byteLength',
  'chunkHash',
  'previousChainHash',
  'chainHash',
];
export const archiveProofFields = [...archiveChunkFields, 'chunkToken'];
export const archiveStateFields = [...archiveArtifactFields, 'updatedByOperationId', 'checkpoint'];
export function archivePage(store, l, name, after, fields, limit = 8) {
  let q = store.db
    .collection(l.ref.path + '/' + name)
    .select(...fields)
    .orderBy('__name__')
    .limit(limit);
  if (after !== null) q = q.startAfter(after);
  return q;
}
/** Metadata proof permits deletion only, never consumption of an omitted payload. */
export async function readArchiveArtifact(store, tx, loaded, name, snapshot, action) {
  if (!snapshot.exists || !snapshot.ref.path.startsWith(loaded.ref.path + '/' + name + '/'))
    inconsistent();
  immutable(snapshot);
  const v = snapshot.data();
  if (
    v.schemaVersion !== 1 ||
    v.ownerId !== loaded.uid ||
    v.restoreId !== loaded.id ||
    v.jobToken !== loaded.view.jobToken
  )
    inconsistent();
  restoreId(v.createdByOperationId);
  const op = await tx.get(store.refs.op(loaded.uid, v.createdByOperationId));
  if (
    !op.exists ||
    !bornEqual(op, snapshot) ||
    compareStamp(born(op), updated(loaded.snapshot)) > 0
  )
    inconsistent();
  const receipt = store.operation(op, loaded);
  if (
    receipt.action !== action ||
    !op.data().effects.some((e) => e.collection === name && e.id === snapshot.id)
  )
    inconsistent();
  return { value: v, receipt, op };
}
export async function readArchiveChunkPair(store, tx, l, snapshot, index) {
  const chunk = await readArchiveArtifact(
      store,
      tx,
      l,
      'chunks',
      snapshot,
      'appendAdventureRestoreChunk',
    ),
    v = chunk.value;
  closed(v, archiveChunkFields);
  const length = Math.min(
    ADVENTURE_RESTORE_CHUNK_BYTES,
    l.job.source.byteLength - index * ADVENTURE_RESTORE_CHUNK_BYTES,
  );
  for (const key of ['chunkHash', 'previousChainHash', 'chainHash']) restoreHash(v[key]);
  if (
    snapshot.id !== chunkId(index) ||
    v.index !== index ||
    v.byteLength !== length ||
    v.chainHash !== chunkChain(v.previousChainHash, index, v.chunkHash, length) ||
    chunk.receipt.sequence !== index ||
    chunk.receipt.uploadedChunks !== index + 1 ||
    chunk.receipt.uploadedBytes !==
      Math.min(l.job.source.byteLength, (index + 1) * ADVENTURE_RESTORE_CHUNK_BYTES)
  )
    inconsistent();
  const proofRows = await tx.get(
    archivePage(store, l, 'integrityProofs', null, archiveProofFields)
      .where('index', '==', index)
      .limit(2),
  );
  if (proofRows.docs.length !== 1) inconsistent();
  const proof = proofRows.docs[0],
    checked = await readArchiveArtifact(
      store,
      tx,
      l,
      'integrityProofs',
      proof,
      'advanceAdventureRestoreIntegrity',
    ),
    p = checked.value;
  closed(p, archiveProofFields);
  if (
    proof.id !== snapshot.id ||
    p.index !== index ||
    p.chunkToken !== nativeToken(snapshot) ||
    ['byteLength', 'chunkHash', 'previousChainHash', 'chainHash'].some((k) => p[k] !== v[k]) ||
    checked.receipt.checkedChunks <= index ||
    compareStamp(born(proof), born(snapshot)) < 0
  )
    inconsistent();
  return { proof, byteLength: length };
}
export async function readArchiveIndex(store, tx, l, snap, name) {
  const { value: v, receipt } = await readArchiveArtifact(
    store,
    tx,
    l,
    name,
    snap,
    'advanceAdventureRestoreValidation',
  );
  if (name === 'validationIndex') {
    closed(v, [...archiveArtifactFields, 'key', 'sourceItemIndex']);
    if (
      adventureValidationIndexId(v.key) !== snap.id ||
      (v.sourceItemIndex !== null &&
        (!Number.isSafeInteger(v.sourceItemIndex) ||
          v.sourceItemIndex < 0 ||
          v.sourceItemIndex >= l.job.validation.items))
    )
      inconsistent();
  } else {
    closed(v, [...archiveArtifactFields, 'index']);
    if (
      !Number.isSafeInteger(v.index) ||
      v.index < 0 ||
      v.index >= l.job.validation.items ||
      snap.id !== chunkId(v.index) ||
      receipt.validation.items <= v.index
    )
      inconsistent();
  }
}
export async function readArchiveValidationState(store, tx, l, snapshot) {
  const v = closed(snapshot.data(), archiveStateFields),
    pointer = l.job.validation.snapshot;
  if (
    !snapshot.exists ||
    snapshot.id !== 'current' ||
    !pointer ||
    v.schemaVersion !== 1 ||
    v.ownerId !== l.uid ||
    v.restoreId !== l.id ||
    v.jobToken !== l.view.jobToken ||
    v.createdByOperationId !== pointer.birthOperationId ||
    v.updatedByOperationId !== pointer.operationId ||
    v.checkpoint !== pointer.checkpoint
  )
    inconsistent();
  const first = await tx.get(store.refs.op(l.uid, pointer.birthOperationId)),
    last =
      first.id === pointer.operationId
        ? first
        : await tx.get(store.refs.op(l.uid, pointer.operationId));
  if (
    !first.exists ||
    !last.exists ||
    !bornEqual(snapshot, first) ||
    compareStamp(born(first), born(last)) > 0 ||
    JSON.stringify(updated(snapshot)) !== JSON.stringify(born(last))
  )
    inconsistent();
  const a = store.operation(first, l),
    b = store.operation(last, l);
  if (
    a.action !== 'advanceAdventureRestoreValidation' ||
    b.action !== a.action ||
    a.checkpoint > b.checkpoint ||
    b.checkpoint !== pointer.checkpoint ||
    !first.data().effects.some((e) => e.collection === 'validationState' && e.id === 'current') ||
    !last
      .data()
      .effects.some(
        (e) => e.collection === 'validationState' && e.id === 'current' && e.hash === pointer.hash,
      )
  )
    inconsistent();
}
