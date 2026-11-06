import test from 'node:test';
import assert from 'node:assert/strict';
import { composeEditorialContract } from '../src/literaryEditorialComposition.mjs';
const decision = (id, status, supersedes = null, category = 'requirement') => ({
  id,
  status,
  supersedes,
  category,
  text: 'Decisão ' + id,
  source: 'Autor',
});
test('a proposal cannot revoke an approved decision', () => {
  const contract = {
    fields: { narrator: 'Primeira pessoa' },
    decisions: [decision('a', 'approved'), decision('b', 'proposal', 'a')],
  };
  const before = structuredClone(contract);
  const result = composeEditorialContract(contract);
  assert.deepEqual(
    result.activeApproved.map((row) => row.id),
    ['a'],
  );
  assert.deepEqual(
    result.unresolved.map((row) => row.id),
    ['b'],
  );
  assert.deepEqual(result.supersededIds, []);
  assert.deepEqual(contract, before);
});
test('an approved replacement closes its ancestry while preserving the recorded history', () => {
  const result = composeEditorialContract({
    fields: {},
    decisions: [
      decision('a', 'approved'),
      decision('b', 'proposal', 'a'),
      decision('c', 'approved', 'b'),
    ],
  });
  assert.deepEqual(
    result.activeApproved.map((row) => row.id),
    ['c'],
  );
  assert.deepEqual(new Set(result.supersededIds), new Set(['a', 'b']));
});
test('approved hypotheses stay distinct from confirmed requirements and preferences', () => {
  const result = composeEditorialContract({
    fields: {},
    decisions: [
      decision('a', 'approved', null, 'hypothesis'),
      decision('b', 'approved', null, 'preference'),
    ],
  });
  assert.match(result.instruction, /HIPÓTESES DE TRABALHO APROVADAS/);
  assert.match(result.instruction, /não acontecimentos comprovados/);
  assert.equal(result.activeApproved.length, 2);
});
