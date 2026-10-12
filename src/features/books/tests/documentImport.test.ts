import { describe, expect, it } from 'vitest';
import {
  createParsedChapter,
  mergeImportedChapters,
  splitImportedChapter,
} from '../model/documentImport';

describe('revisão de importação', () => {
  it('preserva o título da próxima seção ao unir capítulos e escapa marcações literais', () => {
    const first = createParsedChapter('Parte 1', '<p>Primeira cena.</p>', 0, [
      { html: '<p>Primeira cena.</p>', text: 'Primeira cena.', page: 2 },
    ]);
    const next = createParsedChapter('Parte 2: <Goblin> & aliados', '<p>Outra cena.</p>', 1, [
      { html: '<p>Outra cena.</p>', text: 'Outra cena.', page: 3 },
    ]);
    const result = mergeImportedChapters(first, next);
    expect(result.content).toContain('<h2>Parte 2: &lt;Goblin&gt; &amp; aliados</h2>');
    expect(result.blocks?.[1]?.text).toBe(next.title);
    expect(result.sourcePages).toEqual([2, 3]);
  });
  const blocks = [
    { html: '<p>Primeira cena.</p>', text: 'Primeira cena.', page: 2 },
    {
      html: '<blockquote><p>Leia aos jogadores.</p></blockquote>',
      text: 'Leia aos jogadores.',
      page: 3,
    },
    { html: '<p>Última cena.</p>', text: 'Última cena.', page: 3 },
  ];
  it('divide por blocos, preservando conteúdo, seleção, páginas e identidade', () => {
    const chapter = {
      ...createParsedChapter('A chegada', blocks.map((b) => b.html).join(''), 0, blocks),
      selected: false,
    };
    const result = splitImportedChapter(chapter, 1);
    expect(result.map((c) => c.sourcePages)).toEqual([[2], [3]]);
    expect(result[0]!.id).toBe(chapter.id);
    expect(result[1]!.id).not.toBe(chapter.id);
    expect(result.every((c) => !c.selected)).toBe(true);
    expect(result.map((c) => c.content).join('')).toBe(chapter.content);
    expect(result[1]!.wordCount).toBe(5);
  });
  it('une capítulos sem perder formatação e recalcula a contagem', () => {
    const original = createParsedChapter(
      'A chegada',
      blocks.map((b) => b.html).join(''),
      0,
      blocks,
    );
    const [first, next] = splitImportedChapter(original, 1);
    const result = mergeImportedChapters(first!, next!);
    expect(result.content).toBe(original.content);
    expect(result.sourcePages).toEqual([2, 3]);
    expect(result.wordCount).toBe(original.wordCount);
    expect(result.title).toBe(original.title);
  });
  it('recusa divisões que criariam capítulos vazios e mantém documentos sem blocos', () => {
    const chapter = createParsedChapter('Cena', '<p>Uma cena.</p>', 0, blocks);
    for (const at of [0, -1, 3, 9]) expect(splitImportedChapter(chapter, at)).toEqual([chapter]);
    const plain = createParsedChapter('Cena', '<p>Uma cena.</p>', 0);
    expect(splitImportedChapter(plain, 1)).toEqual([plain]);
    expect(mergeImportedChapters(plain, plain).content).toBe('<p>Uma cena.</p><p>Uma cena.</p>');
  });
});
