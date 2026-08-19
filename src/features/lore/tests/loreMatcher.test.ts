import { describe, expect, it } from 'vitest';
import { findLoreMatches } from '../model/loreMatcher';
import type { LoreEntity } from '../model/loreEntity';

describe('loreMatcher', () => {
  const sampleEntities: LoreEntity[] = [
    {
      id: 'e-1',
      bookId: 'b-1',
      name: 'Rei Arthur',
      aliases: ['Pendragon', 'O Rei'],
      category: 'character',
      summary: 'Lendário monarca britânico.',
      details: 'Portador da espada Excalibur.',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'e-2',
      bookId: 'b-1',
      name: 'Arthur',
      aliases: [],
      category: 'character',
      summary: 'Nome comum.',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'e-3',
      bookId: 'b-1',
      name: 'Camelot',
      aliases: ['Cidadela da Luz'],
      category: 'location',
      summary: 'A capital do reino.',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'e-4',
      bookId: 'b-1',
      name: 'Excalibur',
      aliases: ['Espada Sagrada'],
      category: 'concept',
      summary: 'A espada forjada em Avalon.',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'e-5',
      bookId: 'b-1',
      name: 'João',
      aliases: ['Joãozinho'],
      category: 'character',
      summary: 'Personagem com acentuação.',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  it('retorna array vazio quando o texto ou a lista de entidades e vazia', () => {
    expect(findLoreMatches('', sampleEntities)).toEqual([]);
    expect(findLoreMatches('Texto qualquer', [])).toEqual([]);
    expect(
      findLoreMatches('Texto', [{ id: '1', name: '', aliases: [] } as unknown as LoreEntity]),
    ).toEqual([]);
  });

  it('encontra ocorrencia exata pelo nome da entidade', () => {
    const text = 'Em Camelot, tudo era pacífico.';
    const matches = findLoreMatches(text, sampleEntities);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.entityName).toBe('Camelot');
    expect(matches[0]?.matchedText).toBe('Camelot');
    expect(matches[0]?.startIndex).toBe(3);
    expect(matches[0]?.endIndex).toBe(10);
  });

  it('encontra ocorrencias case-insensitive e por aliases', () => {
    const text = 'O guerreiro pendragon empunhava a Espada Sagrada com bravura.';
    const matches = findLoreMatches(text, sampleEntities);

    expect(matches).toHaveLength(2);
    expect(matches[0]?.entityName).toBe('Rei Arthur');
    expect(matches[0]?.matchedText).toBe('pendragon');
    expect(matches[1]?.entityName).toBe('Excalibur');
    expect(matches[1]?.matchedText).toBe('Espada Sagrada');
  });

  it('prioriza termos mais longos para evitar sobreposicoes parciais', () => {
    const text = 'O Rei Arthur caminhava pelos campos.';
    const matches = findLoreMatches(text, sampleEntities);

    expect(matches).toHaveLength(1);
    expect(matches[0]?.entityName).toBe('Rei Arthur');
    expect(matches[0]?.matchedText).toBe('Rei Arthur');
  });

  it('nao faz match de palavras embutidas dentro de outras (fronteira de palavra)', () => {
    // "Arthur" nao deve casar em "Arthuriano", "João" nao deve casar em "Feijão"
    const text = 'O conto arthuriano e o prato de feijão estavam na mesa.';
    const matches = findLoreMatches(text, sampleEntities);

    expect(matches).toHaveLength(0);
  });

  it('reconhece termos com acentuacao no inicio, meio ou fim', () => {
    const text = 'Ontem, João e Joãozinho foram a Camelot.';
    const matches = findLoreMatches(text, sampleEntities);

    expect(matches).toHaveLength(3);
    expect(matches[0]?.matchedText).toBe('João');
    expect(matches[1]?.matchedText).toBe('Joãozinho');
    expect(matches[2]?.matchedText).toBe('Camelot');
  });
});
