import test from 'node:test';
import assert from 'node:assert/strict';
import {
  captureLiteraryGenerationDependencies,
  normalizeLiteraryGenerationDependencies,
} from '../src/literaryGenerationDependencies.mjs';
const hash = 'a'.repeat(64);
const proof = () => ({
  bookBirth: [10, 20],
  contractRevision: 2,
  plans: [{ id: 'p', identityToken: hash, revision: 1, label: 'PRIVATE PLAN TITLE' }],
  references: [
    {
      reference: {
        kind: 'chapter',
        id: 'c',
        scopeId: 'book',
        sourceToken: hash,
        revision: 3,
        purpose: 'source',
      },
      identityToken: hash,
      versionToken: hash,
      bodyToken: hash,
      label: 'PRIVATE SOURCE TITLE',
    },
  ],
  documents: [{ text: 'PRIVATE MANUSCRIPT' }],
  providerKey: 'PRIVATE KEY',
});
test('generation metadata copies only native identity/version fields, never labels, text or transport secrets', () => {
  const input = proof(),
    value = captureLiteraryGenerationDependencies(input);
  assert.equal(value.version, 1);
  assert.equal(value.plans[0].identityToken, hash);
  assert.equal(value.references[0].bodyToken, hash);
  assert.equal(JSON.stringify(value).includes('PRIVATE'), false);
  value.bookBirth[0] = 99;
  assert.equal(input.bookBirth[0], 10);
});
test('unknown fields, missing identities, malformed stamps, duplicate sources and excess budgets are rejected', () => {
  const valid = captureLiteraryGenerationDependencies(proof());
  for (const change of [
    (v) => {
      v.labels = ['private'];
    },
    (v) => {
      delete v.plans[0].identityToken;
    },
    (v) => {
      v.bookBirth[1] = 1e9;
    },
    (v) => {
      v.references[0].bodyToken = 'guess';
    },
    (v) => {
      v.plans.push({ ...v.plans[0] });
    },
    (v) => {
      v.references.push(structuredClone(v.references[0]));
    },
    (v) => {
      v.references = Array.from({ length: 25 }, () => structuredClone(v.references[0]));
    },
    (v) => {
      v.references[0].reference.purpose = 'approved';
    },
  ]) {
    const value = structuredClone(valid);
    change(value);
    assert.throws(() => normalizeLiteraryGenerationDependencies(value));
  }
});
test('a legacy proof without stable plan identity is not silently upgraded from ID and revision', () => {
  const value = proof();
  delete value.plans[0].identityToken;
  assert.throws(() => captureLiteraryGenerationDependencies(value));
});
