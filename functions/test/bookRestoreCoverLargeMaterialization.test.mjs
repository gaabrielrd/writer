import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, createHash } from 'node:crypto';
import { crc32 } from 'node:zlib';
import sharp from 'sharp';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { createBookRestoreCoverStorage } from '../src/bookRestoreCoverStorage.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { bookRestoreStorageBucket } from './helpers/bookRestoreStorageBucket.mjs';
import {
  coverRestoreFixture,
  readyRestoreCover,
  finishRestoreCover,
} from './helpers/bookRestoreCoverFixture.mjs';
import { legacyMutation as mutation } from './helpers/bookLegacyRestoreFixture.mjs';

test('materializes a valid 16 MiB PNG at the admitted boundary with all 256 private parts', async () => {
  const base = await sharp(randomBytes(2000 * 2000 * 4), {
      raw: { width: 2000, height: 2000, channels: 4 },
    })
      .png({ compressionLevel: 0 })
      .toBuffer(),
    limit = 16 * 1024 * 1024,
    padding = [];
  let remaining = limit - base.length;
  assert.ok(remaining >= 12);
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
  const bytes = Buffer.concat([base.subarray(0, base.length - 12), ...padding, base.subarray(-12)]),
    f = adventureImportDb({ nativeUpdates: true }),
    storage = bookRestoreStorageBucket(),
    assets = createBookRestoreCoverStorage(storage.bucket),
    uid = 'author',
    id = 'large-materialize01',
    factory = () =>
      createBookRestoreUploadService({ db: f.db, restoreAssets: assets, now: () => 1000 });
  assert.equal(bytes.length, limit);
  assert.equal((await sharp(bytes).metadata()).width, 2000);
  const copied = await finishRestoreCover(
      factory,
      uid,
      id,
      await readyRestoreCover(factory, uid, id, coverRestoreFixture({ bytes })),
    ),
    reserved = (
      await factory().reserveBookRestoreCover(uid, mutation(id, copied, 'large-reserve-cover01'))
    ).progress,
    done = (
      await factory().materializeBookRestoreCover(
        uid,
        mutation(id, reserved, 'large-materialize-cover01'),
      )
    ).progress,
    stored = storage.version('book-covers/' + uid + '/' + done.preparation.cover.imageId + '.png');
  assert.equal(done.preparation.cover.parts, 256);
  assert.equal(done.preparation.phase, 'personas-integrate');
  assert.equal(stored.bytes.length, limit);
  assert.equal(
    createHash('sha256').update(stored.bytes).digest('hex'),
    createHash('sha256').update(bytes).digest('hex'),
  );
  assert.equal(f.records.has('books/' + done.bookId), false);
});
