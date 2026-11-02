import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import {
  draftRestoreFixture,
  readyRestoreDraft,
  finishRestoreDraft,
} from './helpers/bookRestoreDraftFixture.mjs';
import { legacyMutation as mutation } from './helpers/bookLegacyRestoreFixture.mjs';
test('finalizes a 20 MiB explicit draft with exact count and 320 immutable text parts', async () => {
  const f = adventureImportDb({ nativeUpdates: true }),
    uid = 'author',
    id = 'large-finalize-001',
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 }),
    content = 'palavra '.repeat(2621440),
    ready = await readyRestoreDraft(factory, uid, id, draftRestoreFixture({ content })),
    prepared = await finishRestoreDraft(factory, uid, id, ready),
    response = await factory().finalizeBookRestoreDraft(
      uid,
      mutation(id, prepared, 'finalize-large-draft01'),
    ),
    p = response.progress,
    version = f.records.get('books/' + p.bookId + '/workVersions/' + p.preparation.draft.versionId);
  assert.equal(version.byteLength, 20 * 1024 * 1024);
  assert.equal(version.chunkCount, 320);
  assert.equal(version.wordCount, 2621440);
  assert.equal(
    version.contentHash,
    f.records.get('users/' + uid + '/bookRestores/' + id + '/preparedDrafts/current').contentHash,
  );
  assert.equal(p.preparation.phase, 'cover');
  assert.equal(f.records.has('books/' + p.bookId), false);
});
