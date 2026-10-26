import test from 'node:test';
import assert from 'node:assert/strict';
import {
  readBookPersonaAvailability as read,
  currentBookPersonaAvailability as current,
} from '../src/bookPersonaAvailability.mjs';
import { serializeBookBackupStructure } from '../src/bookBackupStructure.mjs';
import { validateBookBackupJSONItem as validate } from '../src/bookBackupSchema.mjs';
const marker = { schemaVersion: 1, personaId: 'custom-missing', reason: 'profile-not-recorded' };
test('absence metadata is closed, inert, identity-bound and never resolves a profile', () => {
  assert.equal(read(undefined), null);
  assert.deepEqual(read(marker), marker);
  assert.deepEqual(current(marker, 'custom-missing'), marker);
  assert.equal(current(marker, 'custom-other'), null);
  for (const value of [
    null,
    {},
    [],
    { ...marker, schemaVersion: 2 },
    { ...marker, personaId: 'bad/id' },
    { ...marker, reason: 'available' },
    { ...marker, key: 'NEVER_STORE' },
  ])
    assert.throws(() => read(value));
  const chapter = {
    title: 'C',
    order: 1,
    personaComplement: { personaId: 'custom-missing', overrides: [] },
    personaAvailability: marker,
  };
  assert.deepEqual(
    JSON.parse(serializeBookBackupStructure('chapter', chapter).json).personaAvailability,
    marker,
  );
  assert.equal(
    JSON.parse(
      serializeBookBackupStructure('chapter', {
        ...chapter,
        personaComplement: { personaId: 'custom-other', overrides: [] },
      }).json,
    ).personaAvailability,
    undefined,
  );
  assert.deepEqual(chapter.personaAvailability, marker);
});
test('portable schema accepts only explicit matching absence, never a malformed or mismatched authorization claim', () => {
  const chapter = {
    title: 'C',
    order: 1,
    personaComplement: { personaId: 'custom-missing', overrides: [] },
    personaAvailability: marker,
  };
  assert.doesNotThrow(() => validate('chapter', chapter, 'book'));
  for (const value of [
    null,
    { ...marker, personaId: 'custom-other' },
    { ...marker, authToken: 'NEVER_STORE' },
  ])
    assert.throws(() => validate('chapter', { ...chapter, personaAvailability: value }, 'book'), {
      code: 'invalid-record',
    });
  assert.throws(
    () =>
      validate(
        'book-metadata',
        {
          book: {
            title: 'B',
            personaId: 'custom-missing',
            personaAvailability: { ...marker, reason: 'legacy-overrides' },
          },
          progress: {},
          cover: { kind: 'none' },
        },
        'book',
      ),
    { code: 'invalid-record' },
  );
});
