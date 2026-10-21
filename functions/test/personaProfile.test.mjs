import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_PERSONAS,
  resolvePersonaProfile,
  resolveWritingPersona,
  validatePersona,
} from '../src/personaProfile.mjs';

test('adventure persona uses the same inherited traits and explicit scene overrides as books', () => {
  const base = DEFAULT_PERSONAS[0];
  const complement = {
    personaId: DEFAULT_PERSONAS[1].id,
    overrides: [{ traitId: 'tension', value: 7 }],
  };
  const before = structuredClone(DEFAULT_PERSONAS);
  const profile = resolvePersonaProfile(DEFAULT_PERSONAS, base.id, complement);
  assert.equal(profile.traits.find((trait) => trait.id === 'tension').value, 7);
  assert.equal(
    profile.traits.find((trait) => trait.id === 'humor').value,
    base.traits.find((trait) => trait.id === 'humor').value,
  );
  const book = resolveWritingPersona(DEFAULT_PERSONAS, base.id, complement);
  const adventure = resolveWritingPersona(DEFAULT_PERSONAS, base.id, complement, 'adventure');
  assert.match(book.instruction, /Persona do livro:/);
  assert.match(book.instruction, /Complemento do capítulo:/);
  assert.match(adventure.instruction, /Persona da aventura:/);
  assert.match(adventure.instruction, /Complemento da cena:/);
  assert.doesNotMatch(adventure.instruction, /capítulo|livro/);
  assert.deepEqual(JSON.parse(adventure.version).slice(0, 5), JSON.parse(book.version).slice(0, 5));
  assert.deepEqual(DEFAULT_PERSONAS, before);
});

test('private legacy custom IDs remain valid and absent profiles do not silently fall back', () => {
  const custom = {
    ...structuredClone(DEFAULT_PERSONAS[0]),
    id: 'minha-persona',
    name: 'Voz própria',
  };
  assert.equal(validatePersona(custom).id, custom.id);
  assert.match(
    resolveWritingPersona([custom], custom.id, null, 'adventure').instruction,
    /Voz própria/,
  );
  assert.throws(() => resolveWritingPersona(DEFAULT_PERSONAS, custom.id, null, 'adventure'));
  assert.throws(() =>
    resolveWritingPersona(
      DEFAULT_PERSONAS,
      null,
      { personaId: DEFAULT_PERSONAS[0].id, overrides: [{ traitId: 'removed-trait', value: 7 }] },
      'adventure',
    ),
  );
  assert.deepEqual(resolveWritingPersona([], null, null, 'adventure'), {
    instruction: '',
    version: '',
  });
});
