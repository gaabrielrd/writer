import { createHash } from 'node:crypto';
import { adventureImportDb } from './adventureImportDb.mjs';
import { createAdventureRestoreTransferService } from '../../src/adventureRestoreTransfer.mjs';
export const uid = 'author';
export const id = 'adventure-restore-test-0001';
export const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const request = (bytes, operationId = id) => ({
  operationId,
  source: {
    format: 'writer-adventure-archive',
    version: 1,
    byteLength: bytes.length,
    sha256: hash(bytes),
  },
  reviewHash: 'a'.repeat(64),
});
export const mutation = (p, operationId, extra = {}) => ({
  restoreId: p.restoreId,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
export function chunkRequest(
  p,
  bytes,
  index,
  operationId = 'adventure-upload-' + String(index).padStart(6, '0'),
) {
  const value = bytes.subarray(index * 65536, (index + 1) * 65536);
  return mutation(p, operationId, {
    index,
    chunkHash: hash(value),
    chunkBase64: value.toString('base64'),
  });
}
export function transferFixture(bytes = Buffer.alloc(131079, 65)) {
  const f = adventureImportDb({ nativeUpdates: true }),
    api = createAdventureRestoreTransferService({ db: f.db, now: () => 2000 });
  return {
    ...f,
    api,
    bytes,
    uid,
    id,
    input: request(bytes),
    path: 'users/' + uid + '/adventureRestores/' + id,
  };
}
export async function upload(f) {
  let p = (await f.api.startAdventureRestore(f.uid, f.input)).progress;
  for (let index = 0; index < Math.ceil(f.bytes.length / 65536); index++)
    p = (await f.api.appendAdventureRestoreChunk(f.uid, chunkRequest(p, f.bytes, index))).progress;
  return p;
}
export async function verify(f, p, limit = 1) {
  let n = 0;
  while (['uploaded', 'checking'].includes(p.state))
    p = (
      await f.api.advanceAdventureRestoreIntegrity(
        f.uid,
        mutation(p, 'adventure-integrity-' + String(n++).padStart(6, '0'), { limit }),
      )
    ).progress;
  return p;
}
export async function cleanup(f, p, limit = 2) {
  let n = 0;
  if (p.state !== 'cancelling')
    p = (await f.api.cancelAdventureRestore(f.uid, mutation(p, 'adventure-cancel-0001'))).progress;
  while (p.state !== 'cancelled') {
    if (n > 10000) throw Error('unbounded cleanup');
    p = (
      await f.api.advanceAdventureRestoreCleanup(
        f.uid,
        mutation(p, 'adventure-cleanup-' + String(n++).padStart(6, '0'), { limit }),
      )
    ).progress;
  }
  return p;
}
