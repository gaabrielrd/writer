import { webcrypto } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import { createParsedChapter } from '@/features/document-import';
import * as c from '../services/adventureImportContracts';
import { review, id, uid, installImportServer } from './importTestHelpers';
vi.mock('../services/adventureImportCallables');
vi.mock('../services/adventureImportKeyClient');
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('crypto', webcrypto);
});
it('reproduz os preimages Unicode congelados sem alterar a prosa', async () => {
  const r = await c.describeConfirmedReview(review, id);
  expect(r.start.reviewHash).toBe(
    '78e8daa3650d494acfed5bdda5e90da6c4835d0f2ca9b5e699e0c7270a098440',
  );
  expect(r.fingerprint).toBe('d1c11bea1afd5c852b98740d6a67a81f63738a53c16efcea7c402a6e7fbff8ed');
  expect(r.start.totalBodyBytes).toBe(44);
  expect(r.review.sections).toEqual(review.sections);
  expect(await c.importDigest({ z: 1, a: { b: 2, a: 1 } })).toBe(
    await c.importDigest({ a: { a: 1, b: 2 }, z: 1 }),
  );
  expect(
    await c.describeConfirmedReview({ ...review, sections: [...review.sections].reverse() }, id),
  ).not.toEqual(r);
});
it('normaliza somente metadata e conserva whitespace, newline e formato', async () => {
  const input = {
    ...review,
    project: { ...review.project, title: '  Aventura Á  ', synopsis: ' Revisão confirmada. ' },
    sections: review.sections.map((s) => ({ ...s, title: ' ' + s.title + ' ' })),
  };
  expect((await c.describeConfirmedReview(input, id)).start).toEqual(
    (await c.describeConfirmedReview(review, id)).start,
  );
  expect(c.normalizeImportSection({ title: ' T ', content: '  <p>á</p>\r\n' })).toEqual({
    title: 'T',
    content: '  <p>á</p>\r\n',
  });
});
it.each([
  () => c.normalizeImportProject({ ...review.project, title: '' }),
  () => c.normalizeImportProject({ ...review.project, title: 'x'.repeat(301) }),
  () => c.normalizeImportProject({ ...review.project, synopsis: 'x'.repeat(4001) }),
  () => c.normalizeImportProject({ ...review.project, universeId: '/private' }),
  () => c.normalizeImportSection({ title: 'x', content: 'á'.repeat(400001) }),
  () => c.normalizeImportSection({ title: 'x', content: '"'.repeat(460000) }),
  () => c.normalizeImportSection({ title: '', content: 'x' }),
  () => c.importText('x\ud800'),
  () => c.importText('x\udc00'),
  () => c.checkedImportSum(Number.MAX_SAFE_INTEGER, 1),
  () => c.validateImportSource({ ...review.source, byteLength: 0 }),
  () => c.normalizeConfirmedReview({ ...review, sections: [] }),
  () => c.normalizeConfirmedReview({ ...review, sections: [{ title: 'x', content: '<p></p>' }] }),
  () => c.importObject({ a: 1, b: 2 }, ['a']),
])('rejeita revisão inválida antes de qualquer envio %#', (bad) => expect(bad).toThrow());
it('deriva blocos seguros não PDF e preserva texto literal ao dividir', () => {
  const original = createParsedChapter(
    'Uma seção',
    '&lt;b&gt; &amp;<p>Uma <em>cena</em>.</p><ul><li>Dois</li></ul>',
    0,
  );
  const [s] = c.prepareAdventureImportSections([original]);
  expect(s!.blocks!.map((b) => b.html).join('')).toBe(s!.content);
  expect(s!.blocks![0]!.html).toContain('&lt;b&gt; &amp;');
  expect(s!.blocks![2]!.html).toBe('<ul><li>Dois</li></ul>');
  expect(original.blocks).toBeUndefined();
});
it('mantém blocos e páginas PDF quando a composição segura é idêntica', () => {
  const blocks = [{ html: '<p>Uma cena.</p>', text: 'Uma cena.', page: 4 }];
  const original = createParsedChapter('Cena', blocks[0]!.html, 0, blocks);
  expect(c.prepareAdventureImportSections([original])[0]!.blocks).toEqual(blocks);
});
it.each(['pdf', 'docx', 'md', 'markdown', 'txt', 'html'])(
  'mede os bytes originais para fonte %s sem confiar no MIME',
  async (ext) => {
    const file = new File(['fixture-source\n'], 'fonte.' + ext);
    Object.defineProperty(file, 'arrayBuffer', {
      value: () => Promise.resolve(new TextEncoder().encode('fixture-source\n').buffer),
    });
    const source = await c.sourceFromFile(file);
    expect(source.sha256).toBe(review.source.sha256);
    expect(source.byteLength).toBe(15);
  },
);
it('valida progress fechado e recusa campos, contadores, identidade e estados divergentes', async () => {
  const server = await installImportServer(),
    p = server.progress();
  expect(c.validateImportProgress(p, uid)).toEqual(p);
  for (const patch of [
    { ownerId: 'outro' },
    { phase: 'complete' },
    { uploadedSections: 3 },
    { createdAt: 2, updatedAt: 1 },
    { recoveryKeyReady: 'yes' },
    { result: { adventureId: p.adventureId, revision: 1 } },
    { cleanupComplete: true },
    { state: 'deleted', phase: 'deleted', recoveryKeyReady: true },
    { state: 'ready', phase: 'ready' },
    { extra: 'private' },
  ])
    expect(() => c.validateImportProgress({ ...p, ...patch }, uid)).toThrow();
});

it('confere exatamente o envelope final content/hash/revision e recusa mais um byte', () => {
  const base = '<p>x</p>',
    budget =
      900000 - 2048 - c.bytes(JSON.stringify({ content: base, hash: 'a'.repeat(64), revision: 1 }));
  const content = '<p>x' + '"'.repeat(Math.floor(budget / 2)) + (budget % 2 ? 'a' : '') + '</p>';
  expect(c.bytes(JSON.stringify({ content, hash: 'a'.repeat(64), revision: 1 })) + 2048).toBe(
    900000,
  );
  expect(c.normalizeImportSection({ title: 'Borda', content }).content).toBe(content);
  expect(() => c.normalizeImportSection({ title: 'Borda', content: content + 'a' })).toThrow(
    /900.000/,
  );
});
