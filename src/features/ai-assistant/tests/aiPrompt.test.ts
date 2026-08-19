import { describe, expect, it } from 'vitest';
import { buildLoreContext, buildAutocompletePrompt, buildActionPrompt } from '../model/aiPrompt';

describe('aiPrompt model', () => {
  const sampleLore = [
    {
      name: 'Eldoria',
      category: 'location',
      summary: 'Reino élfico nas montanhas.',
    },
    {
      name: 'Lúthien',
      category: 'character',
      summary: 'Maga guardiã do portal arcano.',
    },
  ];

  describe('buildLoreContext', () => {
    it('retorna string vazia quando nao ha entidades', () => {
      expect(buildLoreContext([])).toBe('');
    });

    it('formata lista de entidades com categoria e resumo', () => {
      const result = buildLoreContext(sampleLore);
      expect(result).toContain('[COMPÊNDIO DE LORE DO LIVRO]');
      expect(result).toContain('- Eldoria (location): Reino élfico nas montanhas.');
      expect(result).toContain('- Lúthien (character): Maga guardiã do portal arcano.');
    });

    it('limita a quantidade de entidades a 15', () => {
      const manyEntities = Array.from({ length: 20 }, (_, i) => ({
        name: `Entidade ${i}`,
        category: 'concept',
        summary: `Resumo ${i}`,
      }));
      const result = buildLoreContext(manyEntities);
      expect(result).toContain('Entidade 14');
      expect(result).not.toContain('Entidade 15');
    });
  });

  describe('buildAutocompletePrompt', () => {
    it('constroi prompt de autocomplete com instrucao de sistema e lore', () => {
      const { systemInstruction, prompt } = buildAutocompletePrompt({
        textBeforeCursor: 'As sombras avançavam sobre as colinas de Eldoria.',
        loreEntities: sampleLore,
      });

      expect(systemInstruction).toContain('assistente de escrita de ficção');
      expect(prompt).toContain('Eldoria (location)');
      expect(prompt).toContain('As sombras avançavam sobre as colinas de Eldoria.');
      expect(prompt).toContain('[CONTINUAÇÃO]:');
    });
  });

  describe('buildActionPrompt', () => {
    it('constroi prompt para continuar cena', () => {
      const { prompt } = buildActionPrompt({
        action: 'continue',
        selectedText: 'Lúthien sacou sua adaga prateada.',
        loreEntities: sampleLore,
      });

      expect(prompt).toContain('Continue a cena a partir do trecho selecionado');
      expect(prompt).toContain('Lúthien sacou sua adaga prateada.');
    });

    it('constroi prompt para aprimorar estilo', () => {
      const { prompt } = buildActionPrompt({
        action: 'improve_style',
        selectedText: 'Ele andou até a porta e abriu.',
      });

      expect(prompt).toContain('Reescreva o trecho selecionado');
      expect(prompt).toContain('Ele andou até a porta e abriu.');
    });

    it('constroi prompt para checar coerencia com lore', () => {
      const { prompt } = buildActionPrompt({
        action: 'check_consistency',
        selectedText: 'Eldoria ficava no fundo do oceano.',
        loreEntities: sampleLore,
      });

      expect(prompt).toContain('Analise o trecho selecionado em comparação com as fichas de lore');
    });

    it('constroi prompt para instrucao customizada', () => {
      const { prompt } = buildActionPrompt({
        action: 'custom',
        selectedText: 'O guerreiro sorriu.',
        customInstruction: 'Torne o tom mais sombrio e gótico.',
      });

      expect(prompt).toContain('Torne o tom mais sombrio e gótico.');
    });
  });
});
