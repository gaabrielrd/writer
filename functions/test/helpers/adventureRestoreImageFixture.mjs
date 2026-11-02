import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { profileAdventureArchive } from './adventureRestoreProfileArchiveFixture.mjs';
import { prepareUniverseAdventure } from './adventureRestoreUniverseFixture.mjs';
import { transferFixture, mutation } from './adventureRestoreTransferFixture.mjs';
import { finishPersonaLibrary } from './adventureRestorePersonaLibraryFixture.mjs';
import {
  decodeAdventureBackup,
  encodeAdventureBackup,
} from '../../src/adventureBackupContainer.mjs';
import {
  createAdventurePackageCounts,
  countAdventurePackageRecord,
  adventurePackageSection,
  adventurePackageEnd,
} from '../../src/adventureBackupPackage.mjs';
import {
  adventureCoreCounts,
  adventureCoreDigestSeed,
  adventureCoreDigestLine,
  adventureCoreManifest,
} from '../../src/adventureArchiveCore.mjs';
import {
  ADVENTURE_IMAGES_SEED,
  adventureImageAddressLine,
  adventureImagesManifest,
} from '../../src/adventureArchiveImages.mjs';
export const imageSHA = (bytes) => createHash('sha256').update(bytes).digest('hex');
export const smallPNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a3ioAAAAASUVORK5CYII=',
  'base64',
);
export const imageRequest = (p) =>
  mutation(p, 'image-preparation-' + String(p.checkpoint).padStart(8, '0'));
export async function imageAdventureArchive({
  image = smallPNG,
  nullImage = false,
  alt = 'PRIVATE_ALT',
  caption = 'PRIVATE_CAPTION',
} = {}) {
  const base = await profileAdventureArchive({ personas: false }),
    rows = [];
  for await (const r of decodeAdventureBackup({
    size: base.length,
    read: async (o, n) => base.subarray(o, o + n),
  }))
    rows.push(r);
  const resources = rows
      .filter((r) => r.kind === 'adventure-resource')
      .map((r) => ({
        record: { kind: r.kind, id: r.id, part: r.part },
        value: JSON.parse(Buffer.from(r.payload).toString()),
      })),
    scene = resources.find((r) => r.value.kind === 'scene').value,
    reference = nullImage ? null : { imageId: 'original-shared-image-0001', alt, caption };
  scene.data.mainBlockImage = reference;
  const counts = adventureCoreCounts('resources'),
    hash = createHash('sha256').update(adventureCoreDigestSeed('resources')),
    resourceRows = [];
  for (const { record, value } of resources) {
    const payload = Buffer.from(JSON.stringify(value)),
      manifest = {
        byteLength: payload.length,
        chunkCount: Math.ceil(payload.length / 65536),
        contentHash: imageSHA(payload),
      };
    counts[value.kind]++;
    hash.update(adventureCoreDigestLine(record, manifest));
    for (let part = 0; part < manifest.chunkCount; part++)
      resourceRows.push({
        ...record,
        part,
        payload: payload.subarray(part * 65536, (part + 1) * 65536),
      });
  }
  const json = (kind, id, value) => ({
      kind,
      id,
      part: 0,
      payload: Buffer.from(JSON.stringify(value)),
    }),
    assetId = imageSHA(adventureImageAddressLine('scene', scene.id)),
    binding = {
      schemaVersion: 1,
      resource: { kind: 'scene', id: scene.id },
      image: reference && { assetId, ...reference },
    },
    bindingRow = json('adventure-image-binding', assetId, binding),
    asset = {
      schemaVersion: 1,
      assetId,
      imageId: reference?.imageId,
      contentType: 'image/png',
      byteLength: image.length,
      chunkCount: Math.ceil(image.length / 65536),
      contentHash: imageSHA(image),
      name: 'PRIVATE_IMAGE',
      createdAt: 100,
      updatedAt: 200,
    },
    assetRow = nullImage ? null : json('adventure-image', assetId, asset),
    imageRows = [bindingRow];
  if (assetRow) {
    imageRows.push(assetRow);
    for (let part = 0; part < asset.chunkCount; part++)
      imageRows.push({
        kind: 'adventure-image-bytes',
        id: assetId,
        part,
        payload: image.subarray(part * 65536, (part + 1) * 65536),
      });
  }
  const checksum = imageSHA(
    ADVENTURE_IMAGES_SEED +
      JSON.stringify([
        'binding',
        'scene',
        scene.id,
        imageSHA(bindingRow.payload),
        assetRow ? imageSHA(assetRow.payload) : null,
        assetRow ? asset.contentHash : null,
      ]) +
      '\n',
  );
  imageRows.push(
    json(
      'adventure-images',
      rows[0].id,
      adventureImagesManifest(1, Number(!nullImage), nullImage ? 0 : image.length, checksum),
    ),
  );
  const body = rows
    .slice(1, -1)
    .flatMap((r) =>
      r.kind === 'adventure-resource' || r.kind === 'adventure-image-binding'
        ? []
        : r.kind === 'adventure-resources'
          ? [
              ...resourceRows,
              json(
                r.kind,
                r.id,
                adventureCoreManifest('resources', resources.length, hash.digest('hex'), counts),
              ),
            ]
          : r.kind === 'adventure-images'
            ? imageRows
            : [r],
    );
  const pkg = createAdventurePackageCounts(),
    out = [];
  for (const r of body) countAdventurePackageRecord(pkg, adventurePackageSection(r.kind), r);
  for await (const b of encodeAdventureBackup([
    rows[0],
    ...body,
    adventurePackageEnd(rows[0].id, pkg),
  ]))
    out.push(b);
  return Buffer.concat(out);
}
export async function prepareAdventureImages(api, uid, bytes) {
  let p = await prepareUniverseAdventure(api, uid, { kind: 'none' }, bytes);
  p = (await api.advanceAdventureRestoreUniverse(uid, imageRequest(p))).progress;
  return finishPersonaLibrary({ api, uid }, p);
}
export async function imageFixture(options = {}) {
  const f = transferFixture(),
    bytes = await imageAdventureArchive(options);
  return { f, p: await prepareAdventureImages(f.api, f.uid, bytes) };
}
export async function finishImages(f, p) {
  for (let n = 0; p.staging.phase !== 'image-bytes-ready'; n++) {
    assert.ok(n < 10000);
    p = (await f.api.advanceAdventureRestoreImages(f.uid, imageRequest(p))).progress;
  }
  return p;
}
