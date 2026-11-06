import test from 'node:test';
import assert from 'node:assert/strict';
import { selectImportContext, locateImportEvidence } from '../src/universeLoreImportAnalysis.mjs';

test('context selection keeps every homonym/alias match, accents and punctuation without substring false positives', () => {
  const entries = [
    { id: '1', name: 'Amélia', aliases: [] },
    { id: '2', name: 'Outra', aliases: ['Amélia'] },
    { id: '3', name: 'Rei', aliases: [] },
    { id: '4', name: 'Ann', aliases: [] },
    { id: '5', name: 'A+B', aliases: [''] },
  ];
  assert.deepEqual(
    selectImportContext('AMELIA encontrou Anna e a freira perto de A+B.', entries).map(
      (entry) => entry.id,
    ),
    ['1', '2', '5'],
  );
  assert.deepEqual(
    selectImportContext('O Rei chegou.', entries).map((entry) => entry.id),
    ['3'],
  );
  assert.deepEqual(selectImportContext('Ninguém conhecido.', entries), []);
  assert.equal(
    selectImportContext('A cidade de Porto\n\nAzul.', [{ name: 'Porto Azul', aliases: [] }]).length,
    1,
  );
});

test('evidence is attributed to actual intersecting page spans, including cross-page whitespace', () => {
  const source = {
    text: 'Arthur voltou\n\nao reino.',
    spans: [
      { start: 0, end: 13, page: 3 },
      { start: 13, end: 24, page: 4 },
    ],
  };
  assert.deepEqual(locateImportEvidence(source, 'ao reino.'), { page: 4, pages: [4] });
  assert.deepEqual(locateImportEvidence(source, source.text), { page: 3, pages: [3, 4] });
  assert.deepEqual(locateImportEvidence({ text: 'Arthur', page: 3 }, 'Arthur'), { page: 3 });
});
