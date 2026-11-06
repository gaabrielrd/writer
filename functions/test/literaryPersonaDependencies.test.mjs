import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';
import { readLiteraryPersona } from '../src/literaryPersona.mjs';
import { normalizeLiteraryPersonaDependencies } from '../src/literaryPersonaDependencies.mjs';
import { createLiteraryAutocompleteService } from '../src/literaryAutocomplete.mjs';
import { digest } from '../src/workProgressContracts.mjs';
const target = { kind: 'book', id: 'book' },
  resource = { kind: 'chapter', id: 'chapter' };
function fixture() {
  const f = studioDb(),
    profile = {
      ...structuredClone(DEFAULT_PERSONAS[0]),
      id: 'custom-voice',
      name: 'PRIVATE PROFILE NAME',
      instructions: 'PRIVATE PROFILE INSTRUCTION',
      createdAt: 1,
      updatedAt: 1,
    };
  f.records.set('users/author/aiPersonas/' + profile.id, profile);
  f.records.set('users/author', { credits: 5 });
  f.records.set('books/book', { authorId: 'author', updatedAt: 1, personaId: profile.id });
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    content: '<p>Texto.</p>',
    updatedAt: 1,
    personaComplement: {
      personaId: DEFAULT_PERSONAS[1].id,
      overrides: [{ traitId: 'tension', value: 70 }],
    },
  });
  const c = workScope(f.db, 'author', { target }, []);
  const read = (options = {}) =>
    f.db.runTransaction((tx) => readLiteraryPersona(tx, c, resource, options));
  return { ...f, c, profile, read };
}
test('native persona dependencies preserve composite proofs without instructions, names or compiled text', async () => {
  const f = fixture(),
    value = await f.read({ full: true }),
    deps = value.dependencies;
  assert.ok(value.instruction.includes('PRIVATE PROFILE INSTRUCTION'));
  assert.equal(JSON.stringify(deps).includes('PRIVATE'), false);
  assert.equal(deps.identityToken, value.metadata.identityToken);
  assert.equal(deps.versionToken, value.metadata.versionToken);
  assert.equal(deps.profiles[0].kind, 'custom');
  assert.equal(deps.profiles[1].kind, 'preset');
  assert.equal(deps.bindings[1].value.overrides[0].value, 70);
  assert.deepEqual(normalizeLiteraryPersonaDependencies(deps), deps);
});
test('closed persona metadata cannot gain instructions, swap scopes or silently alter captured traits', async () => {
  const f = fixture(),
    original = (await f.read()).dependencies;
  for (const mutate of [
    (v) => {
      v.instructions = 'private';
    },
    (v) => {
      v.bindings[0].scopeId = 'another-book';
    },
    (v) => {
      v.resource.id = 'another-chapter';
    },
    (v) => {
      v.bindings[1].value.overrides[0].value = 90;
    },
    (v) => {
      v.profiles[0].revision++;
    },
    (v) => {
      v.profiles[0].capturedStamp = null;
    },
    (v) => {
      v.profiles[0].name = 'private';
    },
    (v) => {
      v.ownerId = 'other';
    },
  ]) {
    const value = structuredClone(original);
    mutate(value);
    assert.throws(() => normalizeLiteraryPersonaDependencies(value));
  }
});
test('new autocomplete stores the native persona origins separately from its private prompt', async () => {
  const f = fixture(),
    api = createLiteraryAutocompleteService({
      db: f.db,
      now: () => 1000,
      generator: async () => ({ text: 'Continuação.' }),
    });
  const response = await api.prepareLiteraryAutocomplete('author', {
    target,
    requestId: 'persona-deps-autocomplete-001',
    chapterId: 'chapter',
    beforeHash: digest('<p>Texto.</p>'),
    textBeforeCursor: 'Texto.',
  });
  assert.equal(response.state, 'ready');
  const stored = f.records.get(
    'books/book/literaryAutocompleteRequests/persona-deps-autocomplete-001',
  );
  assert.ok(stored.personaDependencies.profiles[0].identityToken);
  assert.equal(JSON.stringify(stored.personaDependencies).includes('PRIVATE'), false);
  assert.equal(stored.personaDependencies.identityToken, stored.persona.identityToken);
  assert.equal(f.records.get('users/author').credits, 5);
});
