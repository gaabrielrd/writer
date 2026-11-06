import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeLiteraryPublicationPolicy } from '../src/literaryPublicationPolicyProtocol.mjs';
import { editorialContract, emptyEditorialContract } from '../src/literaryContracts.mjs';
import { composeEditorialContract } from '../src/literaryEditorialComposition.mjs';

test('publication unit is explicit and absent legacy contracts keep their canonical shape', () => {
  const original = emptyEditorialContract();
  assert.equal(normalizeLiteraryPublicationPolicy(), null);
  assert.deepEqual(editorialContract(original), original);
  assert.equal(Object.hasOwn(editorialContract(original), 'publicationPolicy'), false);
  assert.equal(
    composeEditorialContract(original).instruction.includes('[UNIDADE DE PUBLICAÇÃO]'),
    false,
  );
  for (const unit of ['chapter', 'act', 'book']) {
    const value = { ...original, publicationPolicy: { version: 1, unit } };
    const normalized = editorialContract(value);
    assert.deepEqual(normalized.publicationPolicy, { version: 1, unit });
    const composed = composeEditorialContract(normalized);
    assert.match(composed.instruction, /UNIDADE DE PUBLICAÇÃO/);
    assert.match(composed.instruction, /Não autoriza publicação automática/);
    assert.deepEqual(composed.activeApproved, []);
  }
});

test('publication unit rejects unknown permissions instead of recording an unenforced rule', () => {
  for (const value of [
    null,
    false,
    'chapter',
    [],
    {},
    { version: 2, unit: 'book' },
    { version: 1, unit: 'scene' },
    { version: 1, unit: 'book', requirePreviousPublication: true },
    { version: 1, unit: 'act', requirePreviousPublication: 'yes' },
    { version: 1, unit: 'book', authorized: true },
    { version: 1 },
  ]) {
    assert.throws(() => normalizeLiteraryPublicationPolicy(value), TypeError);
    assert.throws(
      () => editorialContract({ ...emptyEditorialContract(), publicationPolicy: value }),
      {
        code: 'invalid-argument',
      },
    );
  }
});

test('requiring previous publication is explicit, typed and scoped to chapter or act', () => {
  for (const unit of ['chapter', 'act']) {
    for (const required of [false, true]) {
      const policy = { version: 1, unit, requirePreviousPublication: required };
      assert.deepEqual(normalizeLiteraryPublicationPolicy(policy), policy);
      const contract = editorialContract({
        ...emptyEditorialContract(),
        publicationPolicy: policy,
      });
      assert.deepEqual(contract.publicationPolicy, policy);
    }
  }
  assert.throws(
    () =>
      normalizeLiteraryPublicationPolicy({
        version: 1,
        unit: 'book',
        requirePreviousPublication: true,
      }),
    TypeError,
  );
});
