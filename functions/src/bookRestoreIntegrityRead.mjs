import { digest } from './sceneContracts.mjs';
import { BOOK_BACKUP_LIMITS } from './bookBackupContainer.mjs';
export const BOOK_RESTORE_READ_BYTES =
  BOOK_BACKUP_LIMITS.maxMetadataBytes + BOOK_BACKUP_LIMITS.maxPayloadBytes;
import {
  inconsistent,
  invalid,
  born,
  chunkId,
  decodeRestoreBytes,
  integer,
  BOOK_RESTORE_CHUNK_BYTES,
} from './bookRestoreUploadContracts.mjs';
export function restoreChunkProof(snapshot, loaded, index) {
  const value = snapshot.data(),
    job = loaded.job;
  if (
    !snapshot.exists ||
    snapshot.id !== chunkId(index) ||
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== job.ownerId ||
    value.restoreId !== job.restoreId ||
    value.jobToken !== loaded.view.jobToken ||
    value.index !== index ||
    index >= job.uploadedChunks ||
    value.byteLength !==
      Math.min(BOOK_RESTORE_CHUNK_BYTES, job.source.byteLength - index * BOOK_RESTORE_CHUNK_BYTES)
  )
    inconsistent();
  let bytes;
  try {
    bytes = decodeRestoreBytes(value.chunkBase64, value.chunkHash);
  } catch {
    inconsistent();
  }
  if (bytes.length !== value.byteLength) inconsistent();
  return {
    bytes,
    proof: {
      schemaVersion: 1,
      ownerId: job.ownerId,
      restoreId: job.restoreId,
      jobToken: loaded.view.jobToken,
      index,
      byteLength: value.byteLength,
      chunkHash: value.chunkHash,
      chunkToken: digest({
        born: born(snapshot),
        updated: born({ createTime: snapshot.updateTime }),
      }),
    },
  };
}
export function checkRestoreProof(value, loaded, index) {
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== loaded.job.ownerId ||
    value.restoreId !== loaded.job.restoreId ||
    value.jobToken !== loaded.view.jobToken ||
    value.index !== index ||
    index >= loaded.job.checkedChunks ||
    value.byteLength !==
      Math.min(
        BOOK_RESTORE_CHUNK_BYTES,
        loaded.job.source.byteLength - index * BOOK_RESTORE_CHUNK_BYTES,
      ) ||
    !/^[a-f0-9]{64}$/.test(value.chunkHash) ||
    !/^[a-f0-9]{64}$/.test(value.chunkToken)
  )
    inconsistent();
  return value;
}
/** Internal capability for validators. No HTTP/callable exports raw uploaded bytes. */
export async function createVerifiedBookRestoreSource({ db, uid, id, token, load }) {
  const first = await db.runTransaction((tx) => load(tx, uid, id, token));
  if (first.job.state !== 'bytes-verified') inconsistent();
  const size = first.job.source.byteLength;
  return {
    size,
    async read(offset, length) {
      integer(offset);
      integer(length);
      if (
        length > BOOK_RESTORE_READ_BYTES ||
        !Number.isSafeInteger(offset + length) ||
        offset + length > size
      )
        invalid('invalid-range');
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, id, token);
        if (loaded.job.state !== 'bytes-verified' || loaded.job.source.byteLength !== size)
          inconsistent();
        if (length === 0) return new Uint8Array();
        const from = Math.floor(offset / BOOK_RESTORE_CHUNK_BYTES),
          to = Math.floor((offset + length - 1) / BOOK_RESTORE_CHUNK_BYTES);
        const items = [];
        for (let index = from; index <= to; index++) {
          const [chunk, proof] = await Promise.all([
            tx.get(db.doc(loaded.ref.path + '/chunks/' + chunkId(index))),
            tx.get(db.doc(loaded.ref.path + '/integrityProofs/' + chunkId(index))),
          ]);
          const current = restoreChunkProof(chunk, loaded, index),
            checked = checkRestoreProof(proof.data(), loaded, index);
          if (digest(current.proof) !== digest(checked)) inconsistent();
          items.push({ index, bytes: current.bytes });
        }
        const bytes = new Uint8Array(length);
        for (const item of items) {
          const begin = Math.max(offset, item.index * BOOK_RESTORE_CHUNK_BYTES),
            end = Math.min(offset + length, (item.index + 1) * BOOK_RESTORE_CHUNK_BYTES);
          bytes.set(
            item.bytes.subarray(
              begin - item.index * BOOK_RESTORE_CHUNK_BYTES,
              end - item.index * BOOK_RESTORE_CHUNK_BYTES,
            ),
            begin - offset,
          );
        }
        return bytes;
      });
    },
  };
}
