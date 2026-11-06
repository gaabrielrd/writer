import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LITERARY_GATE_CRITERIA,
  normalizeLiteraryGate,
  literaryGateReady,
  verifyLiteraryGateEvidence,
} from '../src/literaryGateProtocol.mjs';
const gate = () => ({
  authorAccepted: false,
  notes: '',
  criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
    id,
    result: 'pass',
    rationale: 'A preparação apresenta a consequência e a fonte.',
    evidence: [{ documentId: 'plan:brief', quote: 'A carta muda a confiança.' }],
  })),
});
test('every criterion needs located evidence while author acceptance remains separate', () => {
  const value = normalizeLiteraryGate(gate());
  assert.equal(literaryGateReady(value), true);
  assert.equal(value.authorAccepted, false);
  value.criteria[0].evidence = [];
  assert.throws(() => normalizeLiteraryGate(value), /evidência/);
});
test('quotation must exist literally in the document that is cited', () => {
  const value = normalizeLiteraryGate(gate());
  assert.doesNotThrow(() =>
    verifyLiteraryGateEvidence(value, [{ id: 'plan:brief', text: 'A carta muda a confiança.' }]),
  );
  assert.throws(
    () =>
      verifyLiteraryGateEvidence(value, [{ id: 'plan:other', text: 'A carta muda a confiança.' }]),
    /literalmente/,
  );
  assert.throws(
    () =>
      verifyLiteraryGateEvidence(value, [
        { id: 'plan:brief', text: 'A carta não muda a confiança.' },
      ]),
    /literalmente/,
  );
});
test('gaps cannot be accepted and structural criteria cannot be all waived', () => {
  const value = gate();
  value.authorAccepted = true;
  value.criteria[0].result = 'gap';
  assert.throws(() => normalizeLiteraryGate(value), /pendências/);
  for (const item of value.criteria) item.result = 'notApplicable';
  assert.throws(() => normalizeLiteraryGate(value), /estrutural/);
});
test('conditional criteria may be inapplicable only with an explicit rationale', () => {
  const value = gate(),
    criterion = value.criteria.find((item) => item.id === 'ages');
  criterion.result = 'notApplicable';
  criterion.evidence = [];
  criterion.rationale = 'Nenhum intervalo etário é relevante nesta unidade.';
  assert.equal(literaryGateReady(normalizeLiteraryGate(value)), true);
  criterion.rationale = ' ';
  assert.throws(() => normalizeLiteraryGate(value));
});
test('closed contracts reject invented fields, repeated criteria and oversized quotations', () => {
  assert.throws(() => normalizeLiteraryGate({ ...gate(), ready: true }));
  const repeated = gate();
  repeated.criteria[1] = { ...repeated.criteria[0] };
  assert.throws(() => normalizeLiteraryGate(repeated));
  const oversized = gate();
  oversized.criteria[0].evidence[0].quote = 'x'.repeat(1501);
  assert.throws(() => normalizeLiteraryGate(oversized));
  assert.equal(literaryGateReady(repeated), false);
});
