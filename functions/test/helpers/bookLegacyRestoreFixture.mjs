import { sha256 } from '../../src/bookRestoreUploadContracts.mjs';
export const legacyMutation = (id, p, operationId, extra = {}) => ({
  restoreId: id,
  jobToken: p.jobToken,
  operationId,
  expectedCheckpoint: p.checkpoint,
  ...extra,
});
export async function uploadLegacyRestore(
  api,
  uid,
  id,
  value,
  { version = value?.version ?? 6 } = {},
) {
  const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  const source = {
    size: bytes.length,
    read: async (o, n) => new Uint8Array(bytes.subarray(o, o + n)),
  };
  let progress = (
    await api.startBookRestore(uid, {
      operationId: id,
      source: {
        format: 'writer-book-backup',
        version,
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
        legacyMutation(id, progress, id + '-upload-' + i, {
          index: i,
          chunkHash: sha256(part),
          chunkBase64: part.toString('base64'),
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
        legacyMutation(id, progress, id + '-hash-' + unit++, { limit: 16 }),
      )
    ).progress;
  }
  return { progress, source, bytes };
}
export async function finishLegacyRestore(
  factory,
  uid,
  id,
  progress,
  { onStep, prefix = id + '-validation-' } = {},
) {
  let unit = 0;
  while (['bytes-verified', 'validating'].includes(progress.state)) {
    if (unit > 10000) throw new Error('Validation did not finish');
    const request = legacyMutation(id, progress, prefix + unit++);
    progress = (await factory().advanceBookRestoreValidation(uid, request)).progress;
    await onStep?.(progress, request);
  }
  return progress;
}
export async function cleanupLegacyRestore(
  api,
  uid,
  id,
  progress,
  { limit = 25, prefix = id + '-cleanup-' } = {},
) {
  if (!['cancelling', 'cancelled'].includes(progress.state))
    progress = (await api.cancelBookRestore(uid, legacyMutation(id, progress, prefix + 'cancel')))
      .progress;
  let unit = 0;
  while (progress.state !== 'cancelled') {
    if (unit > 1000) throw new Error('Cleanup did not finish');
    progress = (
      await api.advanceBookRestoreCleanup(
        uid,
        legacyMutation(id, progress, prefix + unit++, { limit }),
      )
    ).progress;
  }
  return progress;
}
export function largeLegacyCursorFixture(value) {
  let nested = 1;
  for (let depth = 0; depth < 20; depth++) {
    const entries = Array.from({ length: 63 }, (_, i) => [
      '\\'.repeat(125) + String(i).padStart(3, '0'),
      i,
    ]);
    entries.push(['z'.repeat(256), nested]);
    nested = Object.fromEntries(entries);
  }
  value.universe.lore[0].details = nested;
  return value;
}
