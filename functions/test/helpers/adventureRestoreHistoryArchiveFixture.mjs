import { createHash } from 'node:crypto';
import { emptyAdventureArchive } from './adventureRestoreArchiveFixture.mjs';
import {
  encodeAdventureBackup,
  decodeAdventureBackup,
} from '../../src/adventureBackupContainer.mjs';
import {
  adventurePackageEnd,
  createAdventurePackageCounts,
  countAdventurePackageRecord,
  adventurePackageSection,
} from '../../src/adventureBackupPackage.mjs';
import {
  ADVENTURE_HISTORY_SEED,
  adventureHistoryBodyManifest,
  adventureHistoryDigestLine,
  adventureHistoryManifest,
} from '../../src/adventureArchiveHistory.mjs';
const sha = (value) => createHash('sha256').update(value).digest('hex');
export async function historyAdventureArchive() {
  const base = await emptyAdventureArchive(),
    original = [];
  for await (const row of decodeAdventureBackup({
    size: base.length,
    read: async (o, n) => base.subarray(o, o + n),
  }))
    original.push(row);
  const versionId = 'history-only-version-0001',
    data = Buffer.from('a'.repeat(65535) + '🌙'),
    header = {
      schemaVersion: 1,
      kind: 'version',
      parentId: null,
      id: versionId,
      data: {
        resource: { kind: 'scene', id: 'history-only-scene-0001' },
        createdAt: 1000,
        reason: 'manual',
        wordCount: 1,
        byteLength: data.length,
        chunkCount: 2,
        contentHash: sha(data),
      },
    },
    headerBytes = Buffer.from(JSON.stringify(header)),
    headerManifest = {
      byteLength: headerBytes.length,
      chunkCount: 1,
      contentHash: sha(headerBytes),
    },
    body = adventureHistoryBodyManifest(versionId, headerManifest.contentHash, {
      byteLength: data.length,
      chunkCount: 2,
      contentHash: sha(data),
    }),
    historyDigest = sha(
      ADVENTURE_HISTORY_SEED + adventureHistoryDigestLine(versionId, headerManifest, body),
    ),
    rows = original.slice(1, -1).flatMap((row) =>
      row.kind === 'adventure-history'
        ? [
            { kind: 'adventure-version', id: versionId, part: 0, payload: headerBytes },
            {
              kind: 'adventure-version-body',
              id: versionId,
              part: 0,
              payload: Buffer.from(JSON.stringify(body)),
            },
            ...[data.subarray(0, 65536), data.subarray(65536)].map((payload, part) => ({
              kind: 'adventure-version-text',
              id: versionId,
              part,
              payload,
            })),
            {
              ...row,
              payload: Buffer.from(
                JSON.stringify(adventureHistoryManifest(1, 3, data.length, historyDigest)),
              ),
            },
          ]
        : [row],
    ),
    counts = createAdventurePackageCounts(),
    parts = [];
  for (const row of rows)
    countAdventurePackageRecord(counts, adventurePackageSection(row.kind), row);
  for await (const bytes of encodeAdventureBackup([
    original[0],
    ...rows,
    adventurePackageEnd(original[0].id, counts),
  ]))
    parts.push(bytes);
  return Buffer.concat(parts);
}
