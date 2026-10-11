import { describe, expect, it } from 'vitest';
import { actName, filterChapterTitle, groupChapters, romanNumeral } from '../model/act';

describe('atos', () => {
  it.each([
    [1, 'I'],
    [4, 'IV'],
    [9, 'IX'],
    [14, 'XIV'],
    [49, 'XLIX'],
    [3999, 'MMMCMXCIX'],
  ])('numera %s como %s', (number, text) => {
    expect(romanNumeral(number)).toBe(text);
  });
  it.each([0, -1, 1.5, Infinity])('recusa numeral inválido %s', (value) =>
    expect(() => romanNumeral(value)).toThrow(),
  );
  it('usa a posição de todos os atos, inclusive os nomeados', () => {
    expect(actName({ id: 'a', name: ' ', order: 3 })).toBe('III');
    expect(actName({ id: 'b', name: '  Virada  ', order: 2 })).toBe('Virada');
  });
  it('ordena por ato e por capítulo e mantém livros antigos e vínculos órfãos visíveis', () => {
    const chapters = [
      { id: 'c', order: 1 },
      { id: 'b', order: 9, actId: 'act' },
      { id: 'a', order: 3, actId: 'act' },
      { id: 'd', order: 2, actId: 'missing' },
    ];
    const groups = groupChapters(chapters, [
      { id: 'empty', name: null, order: 1 },
      { id: 'act', name: null, order: 2 },
    ]);
    expect(groups.map((group) => group.chapters.map((chapter) => chapter.id))).toEqual([
      [],
      ['a', 'b'],
      ['c', 'd'],
    ]);
    expect(
      groupChapters(chapters, [])
        .flatMap((group) => group.chapters)
        .map((chapter) => chapter.id),
    ).toEqual(['c', 'd', 'a', 'b']);
    expect(chapters[0]?.id).toBe('c');
  });
  it('filtra por parte do nome, sem caixa ou acentos', () => {
    expect(filterChapterTitle('Prólogo: Ação', ' ACAO ')).toBe(true);
    expect(filterChapterTitle('Prólogo', '')).toBe(true);
    expect(filterChapterTitle('Prólogo', 'fim')).toBe(false);
  });
});
