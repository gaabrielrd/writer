import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  coverPng,
  coverRestoreFixture,
  readyRestoreCover,
  finishRestoreCover,
} from './helpers/bookRestoreCoverFixture.mjs';
test('prepares the admitted 16 MiB cover payload in 256 exact private frames without a total buffer in progress', async () => {
  const f = adventureImportDb({ nativeUpdates: true }),
    uid = 'author',
    id = 'large-cover-0001',
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 }),
    bytes = Buffer.alloc(16 * 1024 * 1024, 57);
  coverPng.copy(bytes);
  const initial = await readyRestoreCover(factory, uid, id, coverRestoreFixture({ bytes })),
    p = await finishRestoreCover(factory, uid, id, initial),
    definition = f.records.get('users/' + uid + '/bookRestores/' + id + '/preparedCovers/current'),
    parts = [...f.records].filter(([k]) =>
      k.startsWith('users/' + uid + '/bookRestores/' + id + '/preparedCoverChunks/'),
    );
  assert.equal(p.preparation.cover.parts, 256);
  assert.equal(p.preparation.cover.bytes, bytes.length);
  assert.equal(parts.length, 256);
  assert.ok(parts.every(([, v]) => v.bytes.length === 65536));
  assert.equal(definition.cover.contentHash, createHash('sha256').update(bytes).digest('hex'));
  assert.equal(p.preparation.cover.pending, null);
  assert.equal(f.records.has('books/' + p.bookId), false);
  assert.ok(JSON.stringify(p.preparation.cover).length < 1024);
});
