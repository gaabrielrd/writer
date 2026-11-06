// @vitest-environment node
import { createHash } from 'node:crypto';
import { expect, it } from 'vitest';
import { prepareLoreSources, describeLoreSources } from '../services/loreDocumentPreparation';

it('packs short pages instead of requesting one analysis for every page', async () => {
  const pages = Array.from({ length: 60 }, (_, index) => ({
    page: index + 1,
    text: `Página ${index + 1}: ` + 'Arthur explorou a floresta. '.repeat(65),
  }));
  const parts = prepareLoreSources(pages);
  expect(parts.length).toBeLessThan(15);
  expect(parts.flatMap((part) => part.spans.map((span) => span.page))).toEqual(
    expect.arrayContaining(pages.map((page) => page.page)),
  );
  const complete = pages.map((page) => page.text).join('\n\n');
  let restored = parts[0]!.text;
  for (const part of parts.slice(1)) restored += part.text.slice(300);
  expect(restored).toBe(complete);
  const description = await describeLoreSources(parts);
  let chain = '';
  parts.forEach((part, index) => {
    const hash = createHash('sha256').update(JSON.stringify(part)).digest('hex');
    expect(description.hashes[index]).toBe(hash);
    chain = createHash('sha256').update(`${chain}:${hash}`).digest('hex');
  });
  expect(description.sourceHash).toBe(chain);
  expect(description.sourceBytes).toBe(
    parts.reduce((sum, part) => sum + Buffer.byteLength(part.text), 0),
  );
});

it('prefers section and paragraph boundaries while retaining literal text and page coordinates', () => {
  const intro = 'Introdução. '.repeat(700);
  const section = '\n\n# Apêndice\n' + 'Texto literal <>& e fatos. '.repeat(600);
  const parts = prepareLoreSources([
    { page: 7, text: intro + section, sectionStarts: [intro.length] },
  ]);
  expect(parts[0]!.text).toBe(intro);
  expect(parts.map((part) => part.text).join('')).toContain('Texto literal <>& e fatos.');
  expect(parts[1]!.text.slice(0, 300)).toBe(parts[0]!.text.slice(-300));
  expect(parts.every((part) => part.spans.every((span) => span.page === 7))).toBe(true);
  const paragraphs = prepareLoreSources([{ page: null, text: intro + '\n\n' + 'B'.repeat(8000) }]);
  expect(paragraphs[0]!.text).toBe(intro);
});

it('bounds UTF-8, Unicode cuts and span inventory without truncating sparse pages', () => {
  const unicode = prepareLoreSources([{ page: 1, text: '界🧙'.repeat(9000) }]);
  for (const part of unicode) {
    expect(part.text.length).toBeLessThanOrEqual(12000);
    expect(Buffer.byteLength(part.text)).toBeLessThanOrEqual(32000);
    expect(part.text).not.toMatch(
      /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/u,
    );
    expect(part.spans[0]!.start).toBe(0);
    expect(part.spans.at(-1)!.end).toBe(part.text.length);
  }
  const pages = Array.from({ length: 501 }, (_, index) => ({ page: index + 1, text: 'A' }));
  const sparse = prepareLoreSources(pages);
  expect(sparse.every((part) => part.spans.length <= 200)).toBe(true);
  expect(new Set(sparse.flatMap((part) => part.spans.map((span) => span.page))).size).toBe(501);
  expect(prepareLoreSources([{ page: 1, text: '  ' }])).toEqual([]);
  expect(() => prepareLoreSources([{ page: null, text: 'A'.repeat(20000001) }])).toThrow(/limite/);
});
