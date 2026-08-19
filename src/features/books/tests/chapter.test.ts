import { describe, expect, it } from 'vitest';
import { countWords } from '../model/chapter';

describe('chapter model & countWords', () => {
  it('retorna 0 para string vazia ou apenas espacos', () => {
    expect(countWords('')).toBe(0);
    expect(countWords('   \n\t  ')).toBe(0);
  });

  it('conta palavras em texto simples', () => {
    expect(countWords('Era uma vez um reino distante.')).toBe(6);
  });

  it('ignora tags HTML ao contar palavras', () => {
    expect(countWords('<p>O <strong>cavaleiro</strong> desembainhou a <em>espada</em>.</p>')).toBe(
      5,
    );
  });
});
