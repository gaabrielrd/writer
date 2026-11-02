import { createHash } from 'node:crypto';
import { sceneAdventureArchive } from './adventureRestoreSceneArchiveFixture.mjs';
import { historyAdventureArchive } from './adventureRestoreHistoryArchiveFixture.mjs';
import {
  encodeAdventureBackup,
  decodeAdventureBackup,
} from '../../src/adventureBackupContainer.mjs';
import { adventureCoreRecordIdentity } from '../../src/adventureArchiveCore.mjs';
import {
  ADVENTURE_DRAFTS_SEED,
  adventureDraftsManifest,
} from '../../src/adventureArchiveDrafts.mjs';
import {
  adventurePackageEnd,
  createAdventurePackageCounts,
  countAdventurePackageRecord,
  adventurePackageSection,
} from '../../src/adventureBackupPackage.mjs';
import { splitHistoryContent } from '../../src/workHistoryContracts.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
export async function historyDraftAdventureArchive({
  draftContent = 'PRIVATE_DRAFT 🌙'.repeat(5000),
  historyContent,
} = {}) {
  const baseBytes = await sceneAdventureArchive(),
    base = await historyAdventureArchive({
      baseBytes,
      ...(historyContent === undefined ? {} : { content: historyContent }),
    }),
    rows = [];
  for await (const row of decodeAdventureBackup({
    size: base.length,
    read: async (o, n) => base.subarray(o, o + n),
  }))
    rows.push(row);
  const head = rows.find(
      (r) =>
        r.kind === 'adventure-resource' &&
        JSON.parse(Buffer.from(r.payload).toString()).kind === 'scene',
    ),
    scene = JSON.parse(Buffer.from(head.payload).toString()),
    body = rows.find(
      (r) =>
        r.kind === 'adventure-resource' &&
        JSON.parse(Buffer.from(r.payload).toString()).kind === 'scene-body',
    ),
    parts = splitHistoryContent(draftContent),
    resource = { kind: 'scene', id: scene.id },
    header = {
      schemaVersion: 1,
      resource,
      baseRevision: 1,
      savedAt: 1234,
      layout: 'utf8-parts',
      byteLength: Buffer.byteLength(draftContent),
      chunkCount: parts.length,
      contentHash: sha(Buffer.from(draftContent)),
      current: { headHash: sha(head.payload), bodyHash: sha(body.payload) },
    },
    id = (
      await adventureCoreRecordIdentity(
        { family: 'resources', kind: 'scene', parentId: null },
        scene.id,
      )
    ).id,
    payload = Buffer.from(JSON.stringify(header)),
    digest = sha(
      ADVENTURE_DRAFTS_SEED +
        JSON.stringify([
          'draft',
          id,
          sha(payload),
          header.byteLength,
          parts.length,
          header.contentHash,
        ]) +
        '\n',
    );
  const prepared = rows.slice(1, -1).flatMap((row) =>
      row.kind === 'adventure-drafts'
        ? [
            { kind: 'adventure-draft', id, part: 0, payload },
            ...parts.map((s, part) => ({
              kind: 'adventure-draft-text',
              id,
              part,
              payload: Buffer.from(s),
            })),
            {
              ...row,
              payload: Buffer.from(
                JSON.stringify(adventureDraftsManifest(1, header.byteLength, digest)),
              ),
            },
          ]
        : [row],
    ),
    counts = createAdventurePackageCounts(),
    output = [];
  for (const row of prepared)
    countAdventurePackageRecord(counts, adventurePackageSection(row.kind), row);
  for await (const bytes of encodeAdventureBackup([
    rows[0],
    ...prepared,
    adventurePackageEnd(rows[0].id, counts),
  ]))
    output.push(bytes);
  return Buffer.concat(output);
}
