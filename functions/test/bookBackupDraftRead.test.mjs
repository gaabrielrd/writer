import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import { createBookBackupDraftService } from '../src/bookBackupDraftRead.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';
import { encodeBookBackupDraftPersona } from '../src/bookBackupDraft.mjs';
import { digest } from '../src/workProgressContracts.mjs';
function fixture() {
  const f = studioDb(),
    profile = {
      ...structuredClone(DEFAULT_PERSONAS[0]),
      id: 'custom-draft',
      archived: true,
      instructions: '\ufeff Own draft style ',
      apiKey: 'DO NOT COPY',
    };
  profile.traits[0].key = 'DO NOT COPY';
  f.records.set('books/book', { authorId: 'author', title: 'Book', createdAt: 1, updatedAt: 2 });
  f.records.set('users/author/aiPersonas/custom-draft', profile);
  return {
    ...f,
    profile,
    root: createBookBackupReadService(f),
    api: createBookBackupDraftService(f),
  };
}
const source = (f) => f.root.getBookBackupSource('author', { bookId: 'book' });
const read = (f, pin, extra = {}, uid = 'author') =>
  f.api.getBookBackupDraftPersona(uid, {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    personaId: 'custom-draft',
    ...extra,
  });
test('explicit removed-chapter style resolves only owned archived profile without chapter lookup/writes/private fields', async () => {
  const f = fixture(),
    before = structuredClone(f.records),
    pin = await source(f),
    result = await read(f, pin);
  assert.equal(result.profile.id, 'custom-draft');
  assert.equal(result.profile.archived, true);
  assert.equal(result.profile.instructions, f.profile.instructions);
  assert.equal(result.profileHash, digest(JSON.stringify(result.profile)));
  assert.equal(JSON.stringify(result).includes('DO NOT COPY'), false);
  assert.equal(f.reads.length, 0);
  assert.deepEqual(f.metadataReads, [
    { path: 'users/author/aiPersonas/custom-draft', fields: ['restoreOrigin'] },
  ]);
  assert.deepEqual(f.records, before);
});
test('preset is captured from pure catalogue, never a user document of same ID', async () => {
  const f = fixture(),
    pin = await source(f),
    preset = DEFAULT_PERSONAS[1];
  f.records.set('users/author/aiPersonas/' + preset.id, {
    ...preset,
    instructions: 'MUST NOT COPY',
  });
  const result = await read(f, pin, { personaId: preset.id });
  assert.equal(result.profile.instructions, preset.instructions);
  assert.equal(f.metadataReads.length, 0);
});
test('native edit/recreation of declared profile invalidates old token with book source unchanged', async () => {
  for (const recreate of [false, true]) {
    const f = fixture(),
      pin = await source(f),
      original = await read(f, pin),
      ref = f.db.doc('users/author/aiPersonas/custom-draft');
    if (recreate) {
      await f.db.runTransaction(async (tx) => tx.delete(ref));
      await f.db.runTransaction(async (tx) => tx.create(ref, f.profile));
    } else await f.db.runTransaction(async (tx) => tx.update(ref, { instructions: 'Changed' }));
    assert.deepEqual(await source(f), pin);
    await assert.rejects(read(f, pin, { expectedPersonaToken: original.personaToken }), {
      code: 'failed-precondition',
      details: { reason: 'book-backup-draft-persona-changed' },
    });
  }
});
test('missing/foreign/malformed persona fails instead of silently dropping explicit style', async () => {
  const f = fixture(),
    pin = await source(f);
  f.records.delete('users/author/aiPersonas/custom-draft');
  f.records.set('users/other/aiPersonas/custom-draft', f.profile);
  await assert.rejects(read(f, pin), { code: 'failed-precondition' });
  f.records.set('users/author/aiPersonas/custom-draft', { ...f.profile, traits: [] });
  await assert.rejects(read(f, pin), { code: 'failed-precondition' });
  f.records.set('users/author/aiPersonas/custom-draft', { ...f.profile, id: 'custom-wrong' });
  await assert.rejects(read(f, pin), { code: 'failed-precondition' });
});
test('root isolation/deleting/source and closed arguments prevent using a profile as an access grant', async () => {
  const f = fixture(),
    pin = await source(f);
  await assert.rejects(read(f, pin, {}, 'other'), { code: 'not-found' });
  await assert.rejects(read(f, pin, {}, ''), { code: 'unauthenticated' });
  for (const extra of [
    { personaId: '../x' },
    { path: 'users/other' },
    { expectedPersonaToken: null },
    { ownerId: 'other' },
  ])
    await assert.rejects(read(f, pin, extra), { code: 'invalid-argument' });
  await f.db.runTransaction(async (tx) => tx.update(f.db.doc('books/book'), { title: 'Changed' }));
  await assert.rejects(read(f, pin), { code: 'failed-precondition' });
  f.records.get('books/book').deleting = true;
  await assert.rejects(read(f, pin), { code: 'not-found' });
});
test('maximum legal profile is bounded and all known text is preserved without truncation', () => {
  const profile = structuredClone(DEFAULT_PERSONAS[0]);
  profile.id = 'custom-' + 'x'.repeat(93);
  profile.name = '\u0000'.repeat(79) + 'x';
  profile.description = '\u0000'.repeat(500);
  profile.instructions = '\u0000'.repeat(5999) + 'x';
  profile.traits = [
    ...profile.traits,
    ...Array.from({ length: 8 }, (_, i) => ({
      id: 'custom-' + i,
      name: 'Trait ' + i,
      description: '\u0000'.repeat(299) + 'x',
      low: '\u0000'.repeat(199) + 'x',
      high: '\u0000'.repeat(199) + 'x',
      value: 100,
    })),
  ];
  profile.traits = profile.traits.map((trait, index) => ({
    ...trait,
    id: index < 8 ? trait.id : 'custom-' + String(index).padStart(2, '0') + 'x'.repeat(91),
    name: String(index).padStart(2, '0') + '\u0000'.repeat(77) + 'x',
    description: '\u0000'.repeat(299) + 'x',
    low: '\u0000'.repeat(199) + 'x',
    high: '\u0000'.repeat(199) + 'x',
    value: 100,
  }));
  const result = encodeBookBackupDraftPersona(profile);
  assert.ok(result.bytes.length < 262144);
  assert.equal(result.profile.instructions, profile.instructions);
  assert.equal(result.profile.traits.length, 16);
});
