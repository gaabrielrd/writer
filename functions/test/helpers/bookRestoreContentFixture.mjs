import { source } from './bookContentFixture.mjs';
import { sha256 } from '../../src/bookRestoreUploadContracts.mjs';
import { legacyMutation as mutation } from './bookLegacyRestoreFixture.mjs';
export async function uploadArchiveRestore(api, uid, id, records) {
  const src = await source(records),
    bytes = await src.read(0, src.size);
  return { progress: await uploadSealedArchiveRestore(api, uid, id, bytes), source: src, bytes };
}
export async function uploadSealedArchiveRestore(api, uid, id, bytes) {
  let progress = (
    await api.startBookRestore(uid, {
      operationId: id,
      source: {
        format: 'writer-book-archive',
        version: 1,
        byteLength: bytes.length,
        sha256: sha256(bytes),
      },
      reviewHash: 'a'.repeat(64),
    })
  ).progress;
  await api.getBookRestoreRecoveryKey(uid, {
    restoreId: id,
    jobToken: progress.jobToken,
    reviewHash: progress.reviewHash,
  });
  for (let i = 0; i < Math.ceil(bytes.length / 65536); i++) {
    const part = bytes.subarray(i * 65536, (i + 1) * 65536);
    progress = (
      await api.appendBookRestoreChunk(
        uid,
        mutation(id, progress, id + '-upload-' + i, {
          index: i,
          chunkHash: sha256(part),
          chunkBase64: Buffer.from(part).toString('base64'),
        }),
      )
    ).progress;
  }
  let unit = 0;
  while (progress.state !== 'bytes-verified') {
    if (unit > 1000) throw new Error('Integrity did not finish');
    progress = (
      await api.advanceBookRestoreIntegrity(
        uid,
        mutation(id, progress, id + '-hash-' + unit++, { limit: 16 }),
      )
    ).progress;
  }
  return progress;
}
