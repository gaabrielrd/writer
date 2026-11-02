// @vitest-environment node
import { describe, expect, it } from 'vitest';
import {
  loreImportDiff,
  loreTextDiff,
  matchingImportEntities,
  validateLoreImportFiles,
  type ImportLoreFields,
} from '../model/loreImport';
const before: ImportLoreFields = {
  name: 'Arthur',
  category: 'character',
  summary: 'O rei',
  details: 'Texto antigo',
  aliases: ['Rei'],
};
describe('importação de lore', () => {
  it('aplica o limite ao total acumulado de arquivos e aceita exatamente 10 MB', () => {
    expect(() =>
      validateLoreImportFiles([
        { name: 'a.PDF', size: 5000000 },
        { name: 'b.md', size: 5000000 },
      ]),
    ).not.toThrow();
    expect(() =>
      validateLoreImportFiles([
        { name: 'a.txt', size: 5000001 },
        { name: 'b.text', size: 5000000 },
      ]),
    ).toThrow('10 MB');
    expect(() => validateLoreImportFiles([])).toThrow('pelo menos');
    expect(() => validateLoreImportFiles([{ name: 'a.txt', size: 0 }])).toThrow('vazios');
    expect(() => validateLoreImportFiles([{ name: 'a.exe', size: 1 }])).toThrow('PDF');
    expect(() =>
      validateLoreImportFiles(Array.from({ length: 51 }, () => ({ name: 'a.txt', size: 1 }))),
    ).toThrow('50');
  });
  it('identifica coincidências de nomes e apelidos sem confundir nomes parecidos', () => {
    const existing = [
      { ...before, id: 'a' },
      { ...before, name: 'Arturo', aliases: [], id: 'b' },
    ];
    expect(
      matchingImportEntities({ ...before, name: ' REI ', aliases: [] }, existing).map((v) => v.id),
    ).toEqual(['a']);
  });
  it('distingue acréscimos, remoções e ajustes preservando texto literal', () => {
    expect(loreImportDiff(before, before)).toEqual([]);
    const diff = loreImportDiff(before, { ...before, name: 'Arthur II', aliases: [], details: '' });
    expect(diff.map((v) => [v.field, v.kind])).toEqual([
      ['name', 'changed'],
      ['aliases', 'removed'],
      ['details', 'removed'],
    ]);
    expect(diff[0]).toMatchObject({ before: 'Arthur', after: 'Arthur II' });
    expect(
      loreImportDiff({ ...before, details: '' }, { ...before, details: ' Novo\ntexto ' })[0],
    ).toMatchObject({ kind: 'added', after: ' Novo\ntexto ' });
  });
});

it('word diff preserves unchanged words, whitespace, additions and removals', () => {
  const parts = loreTextDiff('Arthur governava o reino antigo.', 'Arthur protege o reino novo.');
  expect(
    parts
      .filter((v) => v.kind === 'same')
      .map((v) => v.text)
      .join(''),
  ).toContain(' o reino ');
  expect(
    parts
      .filter((v) => v.kind !== 'added')
      .map((v) => v.text)
      .join(''),
  ).toBe('Arthur governava o reino antigo.');
  expect(
    parts
      .filter((v) => v.kind !== 'removed')
      .map((v) => v.text)
      .join(''),
  ).toBe('Arthur protege o reino novo.');
  expect(loreTextDiff('', 'novo')).toEqual([{ kind: 'added', text: 'novo' }]);
  const large = loreTextDiff('antigo '.repeat(500), 'novo '.repeat(500));
  expect(
    large
      .filter((v) => v.kind !== 'added')
      .map((v) => v.text)
      .join(''),
  ).toBe('antigo '.repeat(500));
});
