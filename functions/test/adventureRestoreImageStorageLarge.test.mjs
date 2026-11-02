import test from 'node:test';
import assert from 'node:assert/strict';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import {
  imageStorageFixture,
  storageStep,
  finishImageStorage,
  storageRows,
} from './helpers/adventureRestoreImageStorageFixture.mjs';
import { cleanup } from './helpers/adventureRestoreTransferFixture.mjs';
test('materializes and cancels the admitted 16 MiB PNG boundary using all 256 proven private frames', async () => {
  const base = await sharp({ create: { width: 3, height: 4, channels: 4, background: '#123456' } })
      .png()
      .toBuffer(),
    limit = 16 * 1024 * 1024,
    padding = [];
  let remaining = limit - base.length;
  while (remaining) {
    let size = Math.min(65536, remaining - 12);
    if (remaining - size - 12 > 0 && remaining - size - 12 < 12) size -= 12;
    const chunk = Buffer.alloc(size + 12);
    chunk.writeUInt32BE(size, 0);
    chunk.write('wrIT', 4, 'ascii');
    chunk.writeUInt32BE(crc32(chunk.subarray(4, size + 8)), size + 8);
    padding.push(chunk);
    remaining -= chunk.length;
  }
  const image = Buffer.concat([base.subarray(0, -12), ...padding, base.subarray(-12)]);
  assert.equal(image.length, limit);
  assert.equal((await sharp(image).metadata()).width, 3);
  const { f, p } = await imageStorageFixture({ image }),
    reserved = await storageStep(f, p),
    end = await finishImageStorage(f, reserved),
    v = storageRows(f)[0][1],
    path = 'book-covers/' + f.uid + '/' + v.asset.imageId + '.png';
  assert.equal(end.staging.imageFrames, 256);
  assert.equal(end.staging.storagePrepared, 1);
  assert.deepEqual(f.storage.version(path).bytes, image);
  assert.equal(f.storage.events.filter((e) => e.method === 'save' && e.bytes > 0).length, 1);
  const cancelled = await cleanup(f, end, 50);
  assert.equal(cancelled.state, 'cancelled');
  assert.equal(f.storage.version(path).bytes.length, 0);
  assert.equal(f.storage.versions.get(path).size, 1);
});
