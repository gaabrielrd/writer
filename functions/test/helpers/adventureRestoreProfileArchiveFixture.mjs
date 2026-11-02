import { createHash } from 'node:crypto';
import {
  resourceAdventureArchive,
  sourceScene,
} from './adventureRestoreResourceArchiveFixture.mjs';
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
  adventureCoreDigestLine,
  adventureCoreDigestSeed,
  adventureCoreManifest,
  adventureNullPersona,
} from '../../src/adventureArchiveCore.mjs';
import { DEFAULT_PERSONAS } from '../../src/personaProfile.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const loreFirst = 'original-lore-first-0001',
  loreSecond = 'original-lore-second-0001',
  loreDeleted = 'original-lore-deleted-0001';
export async function profileAdventureArchive({
  bodiesFirst = false,
  personas = true,
  nearNativeLimit = false,
  profilePatch = {},
  distinctSceneProfile = false,
} = {}) {
  const base = await resourceAdventureArchive({ references: 0 }),
    rows = [];
  for await (const row of decodeAdventureBackup({
    size: base.length,
    read: async (o, n) => base.subarray(o, o + n),
  }))
    rows.push(row);
  const root = rows[0].id,
    profile = { ...structuredClone(DEFAULT_PERSONAS[0]), ...profilePatch },
    sceneProfile = distinctSceneProfile
      ? { ...structuredClone(profile), id: 'custom-original-scene-persona' }
      : profile,
    resources = rows
      .filter((r) => r.kind === 'adventure-resource')
      .map((r) => JSON.parse(Buffer.from(r.payload).toString('utf8')));
  const metadata = rows.find((r) => r.kind === 'adventure-metadata'),
    definition = JSON.parse(Buffer.from(metadata.payload).toString('utf8'));
  if (personas) {
    definition.data.personaId = profile.id;
    resources.find((v) => v.kind === 'scene').data.personaComplement = {
      personaId: sceneProfile.id,
      overrides: [{ traitId: 'sensory', value: 81 }],
    };
  }
  const lore = [],
    heads = [],
    bodies = [];
  for (const id of [loreFirst, loreSecond, loreDeleted]) {
    const deleted = id === loreDeleted;
    heads.push({
      schemaVersion: 1,
      kind: 'lore',
      id,
      data: deleted
        ? { deleted: true, createdAt: 1100, updatedAt: 1200 }
        : {
            name: id === loreFirst ? 'PRIVATE_NAME' : 'PRIVATE_OTHER',
            aliases: ['PRIVATE_ALIAS'],
            category: 'character',
            summary: 'PRIVATE_SUMMARY',
            isPublic: false,
            deleted: false,
            createdAt: 1000,
            updatedAt: 1400,
          },
    });
    if (!deleted)
      bodies.push({
        schemaVersion: 1,
        kind: 'lore-body',
        id,
        data: {
          details: 'PRIVATE_DETAILS 🌙',
          structuredDetails: {
            appearance: 'PRIVATE_APPEARANCE',
            personality: 'PRIVATE_PERSONALITY',
            history: 'PRIVATE_HISTORY',
            notes: 'PRIVATE_NOTES',
          },
          relations:
            id === loreFirst
              ? [
                  {
                    targetEntityId: 'adventure:' + root + ':' + loreSecond,
                    relationType: 'ally',
                    description: 'PRIVATE_RELATION',
                  },
                  {
                    targetEntityId: 'universe:external-universe-0001:external-entity-0001',
                    relationType: 'origin',
                    description: 'PRIVATE_EXTERNAL_LINK',
                  },
                ]
              : [],
        },
      });
  }
  if (nearNativeLimit) {
    const body = bodies[0].data,
      head = heads[0].data;
    body.details = 'x'.repeat(149000);
    for (const key of Object.keys(body.structuredDetails))
      body.structuredDetails[key] = 'x'.repeat(149000);
    body.relations = Array.from({ length: 50 }, () => ({
      targetEntityId: 'adventure:' + root + ':' + loreSecond,
      relationType: 'ally',
      description: 'x'.repeat(3000),
    }));
    const entity = {
      name: head.name,
      aliases: head.aliases,
      category: head.category,
      summary: head.summary,
      ...body,
      isPublic: false,
    };
    const difference = 899900 - Buffer.byteLength(JSON.stringify(entity)),
      last = body.relations.at(-1);
    if (3000 + difference < 0 || 3000 + difference > 4000)
      throw Error('invalid near-limit fixture');
    last.description = 'x'.repeat(3000 + difference);
  }
  lore.push(...(bodiesFirst ? [...bodies, ...heads] : [...heads, ...bodies]));
  const bindings = ['adventure', 'scene'].map((scope) => {
    const bindingId = scope === 'adventure' ? root : sourceScene,
      capturedProfile = scope === 'adventure' ? profile : sceneProfile;
    return personas
      ? {
          schemaVersion: 1,
          kind: 'persona',
          scope,
          bindingId,
          personaId: capturedProfile.id,
          profile: structuredClone(capturedProfile),
        }
      : adventureNullPersona(scope, bindingId);
  });
  async function section(family, values) {
    const counts = adventureCoreCounts(family),
      hash = createHash('sha256').update(adventureCoreDigestSeed(family)),
      result = [];
    for (const value of values) {
      const scope =
        family === 'resources'
          ? { family, kind: value.kind, parentId: value.parentId }
          : family === 'lore'
            ? { family, kind: value.kind }
            : { family, scope: value.scope };
      const identity = await adventureCoreRecordIdentity(
          scope,
          family === 'personas' ? value.bindingId : value.id,
        ),
        payload = Buffer.from(JSON.stringify(value)),
        chunkCount = Math.ceil(payload.length / 65536);
      hash.update(
        adventureCoreDigestLine(identity, {
          byteLength: payload.length,
          chunkCount,
          contentHash: sha(payload),
        }),
      );
      counts[family === 'personas' ? value.scope : value.kind]++;
      for (let part = 0; part < chunkCount; part++)
        result.push({
          ...identity,
          part,
          payload: payload.subarray(part * 65536, (part + 1) * 65536),
        });
    }
    result.push({
      kind: {
        resources: 'adventure-resources',
        lore: 'adventure-lore-end',
        personas: 'adventure-personas',
      }[family],
      id: root,
      part: 0,
      payload: Buffer.from(
        JSON.stringify(adventureCoreManifest(family, values.length, hash.digest('hex'), counts)),
      ),
    });
    return result;
  }
  const resourceRows = await section('resources', resources),
    loreRows = await section('lore', lore),
    personaRows = await section('personas', bindings);
  const prepared = rows.slice(1, -1).flatMap((row) => {
    if (
      ['adventure-resource', 'adventure-lore', 'adventure-lore-body', 'adventure-persona'].includes(
        row.kind,
      )
    )
      return [];
    if (row.kind === 'adventure-resources') return resourceRows;
    if (row.kind === 'adventure-lore-end') return loreRows;
    if (row.kind === 'adventure-personas') return personaRows;
    if (row.kind === 'adventure-metadata')
      return [{ ...row, payload: Buffer.from(JSON.stringify(definition)) }];
    return [row];
  });
  const counts = createAdventurePackageCounts();
  for (const row of prepared)
    countAdventurePackageRecord(counts, adventurePackageSection(row.kind), row);
  const chunks = [];
  for await (const bytes of encodeAdventureBackup([
    rows[0],
    ...prepared,
    adventurePackageEnd(root, counts),
  ]))
    chunks.push(bytes);
  return Buffer.concat(chunks);
}
