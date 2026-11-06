import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { workScope } from '../src/workProgressContracts.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';
import {
  readLiteraryPersona,
  authorizeLiteraryPersona,
  literaryPersonaIsCurrent,
} from '../src/literaryPersona.mjs';
const target = { kind: 'book', id: 'book' },
  resource = { kind: 'chapter', id: 'chapter' };
function fixture() {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    createdAt: 1,
    updatedAt: 1,
    personaId: DEFAULT_PERSONAS[0].id,
  });
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    title: 'Capítulo',
    createdAt: 1,
    updatedAt: 1,
  });
  return { ...f, c: workScope(f.db, 'author', { target }, []) };
}
test('the native book persona and chapter complement are compiled by the established resolver', async () => {
  const f = fixture();
  f.records.set('books/book/chapters/chapter', {
    ...f.records.get('books/book/chapters/chapter'),
    personaComplement: { personaId: DEFAULT_PERSONAS[1].id, overrides: [] },
  });
  const value = await f.db.runTransaction((tx) =>
    readLiteraryPersona(tx, f.c, resource, { full: true }),
  );
  assert.match(value.instruction, new RegExp(DEFAULT_PERSONAS[0].name));
  assert.match(value.instruction, new RegExp(DEFAULT_PERSONAS[1].name));
  assert.equal(
    await f.db.runTransaction((tx) => literaryPersonaIsCurrent(tx, f.c, resource, value.metadata)),
    true,
  );
});
test('changing a binding makes an old persona historical without withdrawing an existing profile', async () => {
  const f = fixture(),
    captured = await f.db.runTransaction((tx) =>
      readLiteraryPersona(tx, f.c, resource, { full: true }),
    );
  f.records.set('books/book', {
    ...f.records.get('books/book'),
    personaId: DEFAULT_PERSONAS[2].id,
    personaRevision: 1,
  });
  await f.db.runTransaction((tx) => authorizeLiteraryPersona(tx, f.c, resource, captured.metadata));
  assert.equal(
    await f.db.runTransaction((tx) =>
      literaryPersonaIsCurrent(tx, f.c, resource, captured.metadata),
    ),
    false,
  );
});
test('editing a custom profile invalidates it; withdrawing that profile revokes derived access', async () => {
  const f = fixture(),
    id = 'custom-literary-persona';
  f.records.set('users/author/aiPersonas/' + id, {
    ...structuredClone(DEFAULT_PERSONAS[0]),
    id,
    name: 'Voz própria',
    revision: 1,
    archived: false,
    createdAt: 1,
    updatedAt: 2,
  });
  f.records.set('books/book', { ...f.records.get('books/book'), personaId: id });
  const captured = await f.db.runTransaction((tx) =>
    readLiteraryPersona(tx, f.c, resource, { full: true }),
  );
  f.records.set('users/author/aiPersonas/' + id, {
    ...f.records.get('users/author/aiPersonas/' + id),
    revision: 2,
    instructions: 'Uma voz mais concisa.',
  });
  await f.db.runTransaction((tx) => authorizeLiteraryPersona(tx, f.c, resource, captured.metadata));
  assert.equal(
    await f.db.runTransaction((tx) =>
      literaryPersonaIsCurrent(tx, f.c, resource, captured.metadata),
    ),
    false,
  );
  f.records.set('users/author/aiPersonas/' + id, {
    ...f.records.get('users/author/aiPersonas/' + id),
    archived: true,
  });
  await assert.rejects(
    f.db.runTransaction((tx) => authorizeLiteraryPersona(tx, f.c, resource, captured.metadata)),
    { code: 'permission-denied' },
  );
});
