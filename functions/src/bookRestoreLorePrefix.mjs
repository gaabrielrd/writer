import { digest } from './sceneContracts.mjs';
import { born, bornEqual, inconsistent, sum } from './bookRestoreUploadContracts.mjs';
import {
  readBookRestoreArtifact,
  readBookRestoreArtifactReceipt,
} from './bookRestoreArtifacts.mjs';
/** Capture a genuine inline prefix. Never delete it while building its replacement. */
export async function captureBookRestoreLorePrefix(tx, db, loaded, item, preparation) {
  const offset = preparation.relationOffset;
  if (!offset) return null;
  if (
    !item.loreRelations ||
    offset >= item.loreRelations.count ||
    offset % 64 !== 0 ||
    offset > preparation.loreRelationCount
  )
    inconsistent();
  const artifact = await readBookRestoreArtifact(tx, db, loaded, 'lore', item.value.id),
    { relations, ...base } = artifact.value,
    expected = {
      ...item.value.data,
      bookId: loaded.job.bookId,
      createdAt: preparation.timestamp,
      updatedAt: preparation.timestamp,
    };
  if (!Array.isArray(relations) || relations.length !== offset || digest(base) !== digest(expected))
    inconsistent();
  const journal = await tx.get(
    db.doc(loaded.ref.path + '/materializationArtifacts/' + digest(['lore', item.value.id])),
  );
  return {
    schemaVersion: 1,
    relations: offset,
    counted: preparation.loreRelationCount,
    operationId: journal.data().lastOperationId,
    birth: born(artifact.snapshot),
    update: born({ createTime: artifact.snapshot.updateTime }),
    valueHash: digest(artifact.value),
  };
}
/** Reauthorize identity every unit; read all prefix bytes only before the atomic replacement. */
export async function verifyBookRestoreLorePrefix(
  tx,
  db,
  loaded,
  entityId,
  preparation,
  legacy,
  full = false,
) {
  if (!legacy) return;
  const artifact = await readBookRestoreArtifact(tx, db, loaded, 'lore', entityId, {
    metadataOnly: !full,
  });
  const receipt = await readBookRestoreArtifactReceipt(tx, db, loaded, legacy.operationId),
    old = receipt.data().receipt.preparation;
  if (
    receipt.data().receipt.action !== 'advanceBookRestoreLore' ||
    !bornEqual(receipt, { createTime: legacy.update }) ||
    old?.relationOffset !== legacy.relations ||
    old.loreRelationCount !== legacy.counted ||
    old.loreItemIndex !== preparation.loreItemIndex ||
    old.loreCount !== preparation.loreCount ||
    old.lorePayload != null ||
    preparation.loreRelationCount !==
      sum(legacy.counted, Math.max(preparation.relationOffset - legacy.relations, 0))
  )
    inconsistent();
  if (
    !bornEqual(artifact.snapshot, { createTime: legacy.birth }) ||
    !bornEqual({ createTime: artifact.snapshot.updateTime }, { createTime: legacy.update }) ||
    (full && digest(artifact.value) !== legacy.valueHash)
  )
    inconsistent();
}
/** Preserve the already-counted prefix while the new representation is replayed from zero. */
export function newlyPreparedLoreRelations(before, after, legacy) {
  if (!legacy) return after - before;
  return Math.max(after - legacy.relations, 0) - Math.max(before - legacy.relations, 0);
}
