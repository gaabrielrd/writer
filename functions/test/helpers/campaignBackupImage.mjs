import { Readable } from 'node:stream';
import sharp from 'sharp';
import { baseFixture, uid } from './campaignBackupBase.mjs';
import { createBookBackupAssetStorage } from '../../src/bookBackupAssetStorage.mjs';
import { createCampaignBackupBaseInventoryService } from '../../src/campaignBackupBaseInventory.mjs';
import { createCampaignBackupImageService } from '../../src/campaignBackupImage.mjs';
export { uid };
export async function imageFixture() {
  const bytes = await sharp({
      create: { width: 192, height: 192, channels: 3, background: { r: 31, g: 87, b: 163 } },
    })
      .png({ compressionLevel: 0 })
      .toBuffer(),
    path = 'book-covers/author/comparison.png',
    generation = '12345678901234567890',
    versions = new Map([
      [
        generation,
        {
          bytes,
          metadata: {
            generation,
            metageneration: '1',
            size: String(bytes.length),
            contentType: 'image/png',
          },
        },
      ],
    ]),
    controls = { latest: generation, events: [], streams: [], hooks: {} };
  const bucket = () => ({
    file(name, options = {}) {
      const gen = options.generation ?? controls.latest;
      const version = () => {
        if (name !== path || !versions.has(gen)) throw new Error('private-provider-url/' + name);
        return versions.get(gen);
      };
      return {
        interceptors: [],
        async getMetadata() {
          controls.events.push({ method: 'metadata', generation: gen });
          await controls.hooks.metadata?.();
          return [structuredClone(version().metadata)];
        },
        createReadStream(range) {
          const method = range.start === undefined ? 'hash' : 'range';
          controls.events.push({ method, generation: gen, ...range });
          const stream = Readable.from(
            (async function* () {
              await controls.hooks[method]?.();
              let data = version().bytes;
              if (method === 'range') data = data.subarray(range.start, range.end + 1);
              if (controls.transform) data = controls.transform(data, method);
              for (let i = 0; i < data.length; i += 4093)
                yield Buffer.from(data.subarray(i, i + 4093));
            })(),
          );
          controls.streams.push(stream);
          return stream;
        },
      };
    },
  });
  const storage = createBookBackupAssetStorage(bucket),
    f = await baseFixture(undefined, storage);
  Object.assign(f, { bytes, generation, versions, controls, storage, storagePath: path });
  f.imageService = createCampaignBackupImageService({ db: f.db, storage });
  const inventory = createCampaignBackupBaseInventoryService({ db: f.db });
  f.refreshImage = async () => {
    const page = await inventory.listCampaignBackupBaseResources(uid, {
      ...f.anchor,
      family: 'images',
    });
    f.imageRef = page.items[0];
    f.request = { ...f.anchor, id: f.imageRef.id, resourceToken: f.imageRef.resourceToken };
    f.reference = { ...f.request, baseId: f.baseId };
  };
  f.get = (extra = {}) => f.imageService.getCampaignBackupImage(uid, { ...f.request, ...extra });
  f.chunk = (manifest, index = 0, extra = {}) =>
    f.imageService.readCampaignBackupImageChunk(uid, {
      ...f.request,
      imageToken: manifest.imageToken,
      index,
      ...extra,
    });
  f.verify = (m) =>
    f.imageService.verifyCampaignBackupImage(uid, { ...f.request, imageToken: m.imageToken });
  f.patch = (path, value) => f.db.runTransaction(async (tx) => tx.update(f.db.doc(path), value));
  f.remove = (path) => f.db.runTransaction(async (tx) => tx.delete(f.db.doc(path)));
  f.imagePath =
    f.path +
    '/images/' +
    [...f.records]
      .find(([p]) => p.startsWith(f.path + '/images/'))[0]
      .split('/')
      .at(-1);
  f.libraryPath = 'users/' + uid + '/imageLibrary/' + f.imageId;
  f.usePath = f.libraryPath + '/uses/' + f.records.get(f.imagePath).useKey;
  await f.refreshImage();
  controls.events.length = 0;
  return f;
}
