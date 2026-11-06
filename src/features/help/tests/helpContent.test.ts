// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { findHelpArticles, helpArticles, helpTopics } from '../model/helpContent';

describe('conteúdo consultável da ajuda', () => {
  it('mantém assuntos, artigos e leituras relacionadas navegáveis', () => {
    const ids = helpArticles.map(({ id }) => id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const article of helpArticles) {
      expect(helpTopics.some(({ id }) => id === article.topic)).toBe(true);
      for (const related of article.related) {
        expect(ids, `Leitura relacionada de ${article.id}`).toContain(related);
        expect(related).not.toBe(article.id);
      }
    }
    for (const topic of helpTopics) {
      expect(helpArticles.some((article) => article.topic === topic.id)).toBe(true);
    }
  });

  it('busca sem acentos ou distinção de caixa e consulta o corpo dos artigos', () => {
    expect(findHelpArticles('  PREVIA jogadores  ').map(({ id }) => id)).toContain(
      'previas-aventura',
    );
    expect(findHelpArticles('selo partido').map(({ id }) => id)).toContain('pistas-missoes');
    expect(findHelpArticles('glossario').map(({ id }) => id)).toContain('compendio');
  });

  it('combina termos e respeita o assunto sem inventar resultados', () => {
    expect(findHelpArticles('selo partido', 'books')).toEqual([]);
    expect(findHelpArticles('termo-inexistente')).toEqual([]);
    expect(findHelpArticles('   ')).toEqual(helpArticles);
    expect(findHelpArticles('', 'campaigns').every(({ topic }) => topic === 'campaigns')).toBe(
      true,
    );
  });
});
