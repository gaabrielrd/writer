import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLoreClaims, resolveLoreEvidence } from '../src/loreClaimProtocol.mjs';
import { validateDetectedLore } from '../src/loreAnalysis.mjs';
const source = 'Arthur disse: talvez a carta seja falsa.';
const entity = {
  name: 'Arthur',
  category: 'character',
  summary: 'Arthur suspeita da carta.',
  details: 'A carta pode ser falsa.',
  aliases: [],
  evidence: source,
};
const claim = {
  field: 'summary',
  text: entity.summary,
  kind: 'observed',
  evidence: source,
  rationale: 'O texto observa a fala, não a falsidade da carta.',
};
const claims = (items = [claim]) => ({ version: 1, items });

test('claim kinds remain separate and attached to the actual proposed field', () => {
  const input = claims([
    claim,
    {
      ...claim,
      field: 'details',
      text: entity.details,
      kind: 'interpretation',
      rationale: 'É uma dedução incerta a partir da fala.',
    },
  ]);
  const parsed = normalizeLoreClaims(input, entity, source);
  assert.equal(parsed.items[0].kind, 'observed');
  assert.equal(parsed.items[1].kind, 'interpretation');
  assert.deepEqual(validateDetectedLore([{ ...entity, claims: input }], source)[0].claims, parsed);
});

test('missing classification preserves legacy shape and does not invent observed status', () => {
  assert.equal(normalizeLoreClaims(undefined, entity, source), undefined);
  assert.equal(Object.hasOwn(validateDetectedLore([entity], source)[0], 'claims'), false);
});

test('unknown kinds, unsupported fields, detached text, missing rationale and foreign evidence are refused', () => {
  for (const patch of [
    { kind: 'fact-certified' },
    { field: 'name' },
    { text: 'Outro conteúdo' },
    { kind: 'interpretation', rationale: '' },
    { kind: 'proposal', rationale: '' },
    { evidence: 'Origem reservada no guia, ausente do capítulo.' },
    { authorized: true },
  ])
    assert.throws(
      () => normalizeLoreClaims(claims([{ ...claim, ...patch }]), entity, source),
      TypeError,
    );
  for (const invalid of [
    null,
    [],
    { version: 2, items: [claim] },
    claims([]),
    claims([claim, claim]),
    claims(Array.from({ length: 17 }, () => claim)),
  ])
    assert.throws(() => normalizeLoreClaims(invalid, entity, source), TypeError);
  assert.throws(
    () =>
      validateDetectedLore(
        [{ ...entity, claims: claims([{ ...claim, kind: 'proposal', rationale: '' }]) }],
        source,
      ),
    { code: 'invalid-argument' },
  );
});

test('evidence preserves exact whitespace from the manuscript and permits no prose invention', () => {
  const original = 'Arthur disse:\n\n talvez a carta seja falsa.';
  assert.equal(resolveLoreEvidence(original, source), original);
  assert.throws(() => resolveLoreEvidence(source, 'Arthur provou que a carta é falsa.'), TypeError);
});
