import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { personasRestoreFixture } from './helpers/bookRestorePersonasFixture.mjs';
import { record } from './helpers/bookContentFixture.mjs';
import {
  readyRestorePersonaLibrary,
  finishRestorePersonaLibrary,
} from './helpers/bookRestorePersonaLibraryFixture.mjs';
test('installs 501 validated profiles using bounded units rather than a 500-write activation transaction', async () => {
  const { records } = personasRestoreFixture({ extraProfiles: 499 }),
    at = records.findIndex((r) => r.kind === 'book-draft'),
    end = records.findIndex((r) => r.kind === 'book-cover');
  records.splice(at, end - at, record('book-draft', 'book', { schemaVersion: 1, state: 'none' }));
  const f = adventureImportDb({ nativeUpdates: true }),
    uid = 'author',
    id = 'many-personas-0001',
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 }),
    initial = await readyRestorePersonaLibrary(factory, uid, id, records),
    start = f.commits.length,
    p = await finishRestorePersonaLibrary(factory, uid, id, initial),
    copies = [...f.records.keys()].filter((path) =>
      path.startsWith('users/' + uid + '/aiPersonas/'),
    );
  assert.equal(p.validation.summary.totals.profiles, 501);
  assert.equal(copies.length, 501);
  assert.equal(p.preparation.personaLibrary.installed, 501);
  assert.equal(
    f.records.get('users/' + uid + '/aiPersonaRestoreBatches/' + p.bookId).state,
    'preparing',
  );
  assert.ok(f.commits.slice(start).every((writes) => writes.length <= 5));
  assert.equal(f.records.has('books/' + p.bookId), false);
});
