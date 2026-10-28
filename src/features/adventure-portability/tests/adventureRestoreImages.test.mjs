// @vitest-environment node
import { it, expect } from 'vitest';
import { streamAdventureArchive } from '../index';
import { imageDataFixture } from './adventureImageFixture.mjs';
import {
  transferFixture,
  cleanup,
} from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import {
  prepareAdventureImages,
  finishImages,
} from '../../../../functions/test/helpers/adventureRestoreImageFixture.mjs';
it('restores the actual Writer archive with independent scene/block images from one original image, all exact frames and native cleanup', async () => {
  const source = await imageDataFixture(2),
    parts = [];
  const stream = streamAdventureArchive(source.id, source.scanApi, { guard: () => {} });
  for (;;) {
    const next = await stream.next();
    if (next.done) break;
    parts.push(next.value);
  }
  const bytes = Buffer.concat(parts),
    f = transferFixture(),
    p = await prepareAdventureImages(f.api, f.uid, bytes),
    before = structuredClone([...f.records].filter(([k]) => k.startsWith('adventures/'))),
    end = await finishImages(f, p),
    definitions = [...f.records].filter(([k]) => k.startsWith(f.path + '/preparedRoot/image-')),
    assets = definitions.filter(([k]) => /\/image-[a-f0-9]{64}$/.test(k)).map(([, v]) => v),
    bindings = definitions.filter(([k]) => k.includes('/image-binding-')).map(([, v]) => v);
  expect(end.staging.imageBindings).toBe(3);
  expect(end.staging.imageAssets).toBe(2);
  expect(end.staging.imageFrames).toBe(6);
  expect(end.staging.imageBytes).toBe(source.bytes.length * 2);
  expect(bindings.filter((v) => v.image === null)).toHaveLength(1);
  expect(new Set(assets.map((v) => v.imageId)).size).toBe(2);
  expect(new Set(assets.map((v) => v.assetId)).size).toBe(2);
  for (const asset of assets) {
    const chunks = definitions
      .filter(([k]) => k.startsWith(f.path + '/preparedRoot/image-bytes-' + asset.assetId + '-'))
      .map(([, v]) => v)
      .sort((a, b) => a.index - b.index);
    expect(chunks.map((v) => v.bytes.length)).toEqual([65536, 65536, 8936]);
    expect(Buffer.concat(chunks.map((v) => Buffer.from(v.bytes)))).toEqual(source.bytes);
    expect(asset.name).toBe('PRIVATE_PNG 🌙');
  }
  expect([...f.records].filter(([k]) => k.startsWith('adventures/'))).toEqual(before);
  expect([...f.records.keys()].some((k) => k.includes('/imageLibrary/'))).toBe(false);
  const cancelled = await cleanup(f, end, 50);
  expect(cancelled.staging.cleanedArtifacts).toBe(end.staging.artifactCount);
  expect([...f.records.keys()].some((k) => k.startsWith(f.path + '/preparedRoot/'))).toBe(false);
}, 60000);
