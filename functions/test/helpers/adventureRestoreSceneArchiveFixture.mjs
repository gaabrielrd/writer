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
  adventureCoreRecordIdentity,
  adventureCoreCounts,
  adventureCoreDigestSeed,
  adventureCoreDigestLine,
  adventureCoreManifest,
  adventureNullPersona,
} from '../../src/adventureArchiveCore.mjs';
import {
  adventureImageAddressLine,
  adventureImagesManifest,
  ADVENTURE_IMAGES_SEED,
} from '../../src/adventureArchiveImages.mjs';
import { digest } from '../../src/sceneContracts.mjs';
const sha = (value) => createHash('sha256').update(value).digest('hex');
/** Contract fixture for native staging/SDK, independent from the UI writer corpus. */
export async function sceneAdventureArchive({
  content = '<p>PRIVATE_CORPO 🌙</p>',
  archived = false,
} = {}) {
  const base = await emptyAdventureArchive(),
    rows = [];
  for await (const row of decodeAdventureBackup({
    size: base.length,
    read: async (o, n) => base.subarray(o, o + n),
  }))
    rows.push(row);
  const projectId = rows[0].id,
    sceneId = 'original-scene-source-0001';
  function jsonUnit(kind, id, value) {
    const bytes = Buffer.from(JSON.stringify(value)),
      parts = Math.ceil(bytes.length / 65536);
    return {
      identity: { kind, id },
      manifest: { byteLength: bytes.length, chunkCount: parts, contentHash: sha(bytes) },
      rows: Array.from({ length: parts }, (_, part) => ({
        kind,
        id,
        part,
        payload: bytes.subarray(part * 65536, (part + 1) * 65536),
      })),
    };
  }
  const scene = {
      schemaVersion: 1,
      kind: 'scene',
      id: sceneId,
      parentId: null,
      present: true,
      data: {
        title: 'PRIVATE_SCENE',
        parentId: null,
        stage: 'writing',
        archived,
        rankA: 'U',
        rankB: 'V',
        bodyHash: digest(content),
        mainBlockAudience: 'gm',
        mainBlockOrder: 0,
        mainBlockTitle: 'PRIVATE_MAIN',
        mainBlockType: 'scene',
        createdAt: 1000,
        updatedAt: 1001,
      },
    },
    body = {
      schemaVersion: 1,
      kind: 'scene-body',
      id: 'current',
      parentId: sceneId,
      present: true,
      data: { content, hash: digest(content) },
    },
    additions = [];
  const planning = {
    schemaVersion: 1,
    kind: 'scene-planning',
    id: 'current',
    parentId: sceneId,
    present: false,
    data: {},
  };
  for (const value of [scene, body, planning]) {
    const address = await adventureCoreRecordIdentity(
      { family: 'resources', kind: value.kind, parentId: value.parentId },
      value.id,
    );
    additions.push(jsonUnit(address.kind, address.id, value));
  }
  const resourceCounts = adventureCoreCounts('resources'),
    resourceHash = createHash('sha256').update(adventureCoreDigestSeed('resources'));
  for (const row of rows.filter((r) => r.kind === 'adventure-resource')) {
    const value = JSON.parse(Buffer.from(row.payload).toString('utf8'));
    resourceCounts[value.kind]++;
    resourceHash.update(
      adventureCoreDigestLine(row, {
        byteLength: row.payload.length,
        chunkCount: 1,
        contentHash: sha(row.payload),
      }),
    );
  }
  for (const unit of additions) {
    const value = JSON.parse(Buffer.concat(unit.rows.map((r) => r.payload)).toString());
    resourceCounts[value.kind]++;
    resourceHash.update(adventureCoreDigestLine(unit.identity, unit.manifest));
  }
  const personaAddress = await adventureCoreRecordIdentity(
      { family: 'personas', scope: 'scene' },
      sceneId,
    ),
    persona = jsonUnit(
      personaAddress.kind,
      personaAddress.id,
      adventureNullPersona('scene', sceneId),
    ),
    personaHash = createHash('sha256').update(adventureCoreDigestSeed('personas'));
  for (const row of rows.filter((r) => r.kind === 'adventure-persona'))
    personaHash.update(
      adventureCoreDigestLine(row, {
        byteLength: row.payload.length,
        chunkCount: 1,
        contentHash: sha(row.payload),
      }),
    );
  personaHash.update(adventureCoreDigestLine(persona.identity, persona.manifest));
  const binding = { schemaVersion: 1, resource: { kind: 'scene', id: sceneId }, image: null },
    bindingId = sha(adventureImageAddressLine('scene', sceneId)),
    image = jsonUnit('adventure-image-binding', bindingId, binding),
    imageHash = sha(
      ADVENTURE_IMAGES_SEED +
        JSON.stringify(['binding', 'scene', sceneId, image.manifest.contentHash, null, null]) +
        '\n',
    );
  const prepared = rows.slice(1, -1).flatMap((row) => {
      if (row.kind === 'adventure-resources')
        return [
          ...additions.flatMap((u) => u.rows),
          ...jsonUnit(
            row.kind,
            projectId,
            adventureCoreManifest('resources', 7, resourceHash.digest('hex'), resourceCounts),
          ).rows,
        ];
      if (row.kind === 'adventure-personas')
        return [
          ...persona.rows,
          ...jsonUnit(
            row.kind,
            projectId,
            adventureCoreManifest('personas', 2, personaHash.digest('hex'), {
              adventure: 1,
              scene: 1,
            }),
          ).rows,
        ];
      if (row.kind === 'adventure-images')
        return [
          ...image.rows,
          ...jsonUnit(row.kind, projectId, adventureImagesManifest(1, 0, 0, imageHash)).rows,
        ];
      return [row];
    }),
    counts = createAdventurePackageCounts(),
    parts = [];
  for (const row of prepared)
    countAdventurePackageRecord(counts, adventurePackageSection(row.kind), row);
  for await (const bytes of encodeAdventureBackup([
    rows[0],
    ...prepared,
    adventurePackageEnd(projectId, counts),
  ]))
    parts.push(bytes);
  return Buffer.concat(parts);
}
