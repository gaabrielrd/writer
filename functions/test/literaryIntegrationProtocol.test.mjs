import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeLiteraryIntegrationReading,
  normalizeLiteraryIntegrationSynthesis,
  advanceLiteraryIntegrationCoverage,
} from '../src/literaryIntegrationProtocol.mjs';
const documents = [
  { id: 'manuscript:one', text: 'Ela abriu a carta. O selo estava intacto.', offsetBase: 18000 },
  { id: 'manuscript:two', text: 'O irmão já conhecia a carta.', offsetBase: 0 },
];
const output = () => ({
  complete: true,
  report: 'Conferência do trecho.',
  findings: [
    {
      severity: 'warning',
      problem: 'A aquisição de conhecimento precisa de conferência.',
      action: 'Rever a passagem.',
      evidence: [
        { sourceId: 'manuscript:one', quote: 'Ela abriu a carta.' },
        { sourceId: 'manuscript:two', quote: 'O irmão já conhecia a carta.' },
      ],
    },
  ],
  matrix: [
    {
      axis: 'knowledge',
      subject: 'A irmã',
      observation: 'A abertura permite uma descoberta.',
      certainty: 'interpretation',
      evidence: [{ sourceId: 'manuscript:one', quote: 'Ela abriu a carta.' }],
    },
  ],
});
test('integration evidence uses exact sources and original offsets without certifying an entire book', () => {
  const value = normalizeLiteraryIntegrationReading(output(), { documents });
  assert.equal(value.findings[0].evidence[0].offset, 18000);
  assert.equal(value.findings[0].evidence[1].offset, 0);
  assert.equal(value.matrix[0].status, 'proposal');
  assert.equal(value.coverage.wholeBook, false);
  assert.equal(value.coverage.wholeAct, false);
  assert.equal(value.findings[0].status, 'open');
});
test('invented quotations, source IDs, completed corrections and unsupported axes are rejected', () => {
  for (const mutate of [
    (value) => {
      value.findings[0].evidence[0].quote = 'Uma revelação que não existe.';
    },
    (value) => {
      value.findings[0].evidence[0].sourceId = 'absent';
    },
    (value) => {
      value.findings[0].status = 'resolved';
    },
    (value) => {
      value.matrix[0].axis = 'approved';
    },
    (value) => {
      value.complete = false;
    },
  ]) {
    const raw = output();
    mutate(raw);
    assert.throws(() => normalizeLiteraryIntegrationReading(raw, { documents }), TypeError);
  }
});
test('boundary diagnostics remain explicitly limited to the supplied transition windows', () => {
  const value = normalizeLiteraryIntegrationReading(output(), {
    documents,
    scope: 'chapter-boundary',
  });
  assert.equal(value.coverage.scope, 'chapter-boundary');
  assert.equal(value.coverage.wholeChapter, false);
});
test('synthesis must point to included evidence nodes and cannot manufacture evidence links', () => {
  const raw = {
    complete: true,
    report: 'Síntese.',
    findings: [],
    conclusions: [
      {
        axis: 'promise',
        observation: 'A promessa precisa de retorno.',
        evidenceIds: ['reading-1', 'reading-2'],
      },
    ],
  };
  const value = normalizeLiteraryIntegrationSynthesis(raw, {
    evidenceIds: ['reading-1', 'reading-2'],
  });
  assert.deepEqual(value.conclusions[0].evidenceIds, ['reading-1', 'reading-2']);
  assert.equal(value.conclusions[0].status, 'proposal');
  assert.equal(value.coverage.scope, 'evidence-synthesis');
  assert.throws(
    () => normalizeLiteraryIntegrationSynthesis(raw, { evidenceIds: ['reading-1'] }),
    TypeError,
  );
});
test('only contiguous nonduplicated core ranges prove complete reading of the same source', () => {
  const first = {
    sourceToken: 'a'.repeat(64),
    sourceCharacters: 200,
    segment: 0,
    segmentCount: 2,
    coreStart: 0,
    coreEnd: 100,
  };
  const state = advanceLiteraryIntegrationCoverage(null, first);
  assert.equal(state.complete, false);
  const last = { ...first, segment: 1, coreStart: 100, coreEnd: 200 };
  assert.equal(advanceLiteraryIntegrationCoverage(state, last).complete, true);
  for (const bad of [
    { ...last, coreStart: 99 },
    { ...last, coreStart: 101 },
    { ...last, sourceToken: 'b'.repeat(64) },
    { ...last, coreEnd: 199 },
    { ...last, segment: 0 },
  ]) {
    assert.throws(() => advanceLiteraryIntegrationCoverage(state, bad), TypeError);
  }
  assert.throws(() => advanceLiteraryIntegrationCoverage(null, last), TypeError);
  assert.throws(
    () => advanceLiteraryIntegrationCoverage(advanceLiteraryIntegrationCoverage(state, last), last),
    TypeError,
  );
});

test('architecture quotations remain proposals and cannot be classified as established manuscript facts', () => {
  const value = normalizeLiteraryIntegrationReading(output(), {
    documents,
    scope: 'architecture-segment',
  });
  assert.equal(value.coverage.scope, 'architecture-segment');
  assert.equal(value.coverage.wholeBook, false);
  const invalid = output();
  invalid.matrix[0].certainty = 'established';
  assert.throws(
    () =>
      normalizeLiteraryIntegrationReading(invalid, { documents, scope: 'architecture-segment' }),
    /Linha de continuidade/,
  );
});
