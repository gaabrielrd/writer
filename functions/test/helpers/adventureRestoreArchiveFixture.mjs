import { createHash } from 'node:crypto';
import { encodeAdventureBackup } from '../../src/adventureBackupContainer.mjs';
import {
  adventurePackageHeader,
  adventurePackageEnd,
  createAdventurePackageCounts,
  countAdventurePackageRecord,
  adventurePackageSection,
} from '../../src/adventureBackupPackage.mjs';
import {
  adventureCoreRecordIdentity,
  adventureCoreCounts,
  adventureCoreDigestSeed,
  adventureCoreDigestLine,
  adventureCoreManifest,
  adventureNullPersona,
} from '../../src/adventureArchiveCore.mjs';
import {
  adventureHistoryManifest,
  ADVENTURE_HISTORY_SEED,
} from '../../src/adventureArchiveHistory.mjs';
import {
  adventureDraftsManifest,
  ADVENTURE_DRAFTS_SEED,
} from '../../src/adventureArchiveDrafts.mjs';
import {
  adventureImagesManifest,
  ADVENTURE_IMAGES_SEED,
} from '../../src/adventureArchiveImages.mjs';
const sha = (b) => createHash('sha256').update(b).digest('hex');
/** Small contract fixture for the real SDK; native writer corpus is tested separately through Vitest. */
export async function emptyAdventureArchive({
  invalidRoot = false,
  universeOrigin = { kind: 'none' },
} = {}) {
  const id = 'original-empty-adventure-0001',
    rows = [],
    counts = createAdventurePackageCounts(),
    hashes = Object.fromEntries(
      ['structure', 'resources', 'lore', 'personas', 'universe'].map((s) => [
        s,
        createHash('sha256').update(adventureCoreDigestSeed(s)),
      ]),
    );
  function row(kind, value, recordId = id) {
    rows.push({ kind, id: recordId, part: 0, payload: Buffer.from(JSON.stringify(value)) });
  }
  async function unit(section, scope, nativeId, value) {
    const identity = await adventureCoreRecordIdentity(scope, nativeId),
      payload = Buffer.from(JSON.stringify(value));
    hashes[section].update(
      adventureCoreDigestLine(identity, {
        byteLength: payload.length,
        chunkCount: 1,
        contentHash: sha(payload),
      }),
    );
    row(identity.kind, value, identity.id);
  }
  await unit('structure', { family: 'structure', kind: 'adventure' }, id, {
    schemaVersion: 1,
    kind: 'adventure',
    data: {
      title: 'PRIVATE_EMPTY_TITLE',
      status: invalidRoot ? 'wrong' : 'draft',
      ...(universeOrigin.kind === 'none' ? {} : { universeId: universeOrigin.id }),
    },
  });
  const resourceCounts = adventureCoreCounts('resources');
  for (const kind of ['progress', 'arc-order', 'event-order', 'scene-control']) {
    const nativeId =
      kind === 'progress'
        ? 'current'
        : kind === 'scene-control'
          ? 'unassigned'
          : sha(JSON.stringify({ kind: kind === 'arc-order' ? 'arc' : 'event' }));
    await unit('resources', { family: 'resources', kind, parentId: null }, nativeId, {
      schemaVersion: 1,
      kind,
      parentId: null,
      id: nativeId,
      present: false,
      data: {},
    });
    resourceCounts[kind]++;
  }
  row(
    'adventure-resources',
    adventureCoreManifest('resources', 4, hashes.resources.digest('hex'), resourceCounts),
  );
  row(
    'adventure-lore-end',
    adventureCoreManifest('lore', 0, hashes.lore.digest('hex'), adventureCoreCounts('lore')),
  );
  await unit(
    'personas',
    { family: 'personas', scope: 'adventure' },
    id,
    adventureNullPersona('adventure', id),
  );
  row(
    'adventure-personas',
    adventureCoreManifest('personas', 1, hashes.personas.digest('hex'), { adventure: 1, scene: 0 }),
  );
  await unit('universe', { family: 'universe' }, id, {
    schemaVersion: 1,
    origin: universeOrigin,
  });
  row('adventure-history', adventureHistoryManifest(0, 0, 0, sha(ADVENTURE_HISTORY_SEED)));
  row('adventure-drafts', adventureDraftsManifest(0, 0, sha(ADVENTURE_DRAFTS_SEED)));
  row('adventure-images', adventureImagesManifest(0, 0, 0, sha(ADVENTURE_IMAGES_SEED)));
  for (const record of rows)
    countAdventurePackageRecord(counts, adventurePackageSection(record.kind), record);
  const parts = [];
  for await (const part of encodeAdventureBackup([
    adventurePackageHeader(id),
    ...rows,
    adventurePackageEnd(id, counts),
  ]))
    parts.push(part);
  return Buffer.concat(parts);
}
