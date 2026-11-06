import test from 'node:test';
import assert from 'node:assert/strict';
import {
  literaryReviewSegments,
  normalizeLiteraryProseOutput,
  literaryPlainProseHTML,
} from '../src/literaryProseProtocol.mjs';
test('segments cover every character in their core with explicit overlap and intact unicode', () => {
  const text = 'Uma escolha muda tudo. 🪶\n'.repeat(2000),
    parts = literaryReviewSegments(text);
  assert.ok(parts.length > 1);
  assert.equal(parts.map((part) => text.slice(part.coreStart, part.coreEnd)).join(''), text);
  for (const [index, part] of parts.entries()) {
    assert.equal(part.index, index);
    assert.equal(part.text, text.slice(part.start, part.end));
    assert.ok(part.start <= part.coreStart && part.end >= part.coreEnd);
    assert.ok(!/^[\udc00-\udfff]/.test(part.text));
    assert.ok(!/[\ud800-\udbff]$/.test(part.text));
  }
});
test('findings locate literal evidence in the projected source version', () => {
  const segment = {
    index: 1,
    start: 100,
    end: 130,
    coreStart: 105,
    coreEnd: 125,
    text: 'A carta chegou.',
  };
  const raw = {
    text: '',
    complete: true,
    rationale: 'Revisão localizada.',
    findings: [
      {
        sourceId: 'manuscript',
        quote: 'carta',
        problem: 'Falta antecedente.',
        severity: 'warning',
        action: 'Conferir o envio.',
      },
    ],
  };
  const context = {
    mode: 'reviewStructure',
    documents: [{ id: 'manuscript', text: segment.text }],
    segment,
  };
  assert.equal(normalizeLiteraryProseOutput(raw, context).findings[0].offset, 102);
  raw.findings[0].quote = 'Nunca esteve aqui';
  assert.throws(() => normalizeLiteraryProseOutput(raw, context));
});
test('partial responses and review rewrites cannot become applicable proposals', () => {
  const context = { mode: 'reviewProse', documents: [], segment: literaryReviewSegments('')[0] };
  assert.throws(() =>
    normalizeLiteraryProseOutput(
      { text: 'Texto novo', complete: true, rationale: '', findings: [] },
      context,
    ),
  );
  assert.throws(() =>
    normalizeLiteraryProseOutput(
      { text: '', complete: false, rationale: '', findings: [] },
      context,
    ),
  );
  assert.throws(() =>
    normalizeLiteraryProseOutput(
      { text: '', complete: true, rationale: '', findings: [], approved: true },
      context,
    ),
  );
});
test('proposed plain text is escaped before becoming native HTML', () => {
  const html = literaryPlainProseHTML('Ela escreveu <script>alert("x")</script>.\n\nDepois saiu.');
  assert.equal(html.includes('<script>'), false);
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /<\/p><p>Depois saiu\.<\/p>/);
});
