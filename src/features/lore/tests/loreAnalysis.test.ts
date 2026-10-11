import { describe, it, expect } from 'vitest';
import { parseDetectedLore, matchingLoreEntities } from '../model/loreAnalysis';
const item = {
  name: 'Arthur',
  category: 'character',
  summary: 'Rei',
  details: 'Rei em Avalon.',
  aliases: ['Pendragon'],
  evidence: 'Arthur chegou.',
};
describe('análise estruturada', () => {
  it('preserves original whitespace and treats punctuation as literal evidence', () => {
    const source = 'Arthur (rei)\u00a0chegou\r\n\r\nao porto.';
    expect(
      parseDetectedLore(
        JSON.stringify({ entities: [{ ...item, evidence: ' Arthur (rei) chegou ao porto. ' }] }),
        source,
      )[0]?.evidence,
    ).toBe(source);
    for (const evidence of [
      'Arthur rei chegou ao porto.',
      'Arthur (rei) foi ao porto.',
      'Arthur (rei).*porto.',
      'Arthur (rei) chegou... ao porto.',
    ])
      expect(() =>
        parseDetectedLore(JSON.stringify({ entities: [{ ...item, evidence }] }), source),
      ).toThrow();
  });
  it('validates evidence and schema including empty results', () => {
    expect(
      parseDetectedLore(
        '```json\n' + JSON.stringify({ entities: [item] }) + '\n```',
        'Arthur chegou.',
      ),
    ).toEqual([item]);
    expect(parseDetectedLore('{"entities":[]}', '')).toEqual([]);
  });
  it('rejects fabricated evidence, oversized fields, categories, aliases and malformed JSON', () => {
    for (const invalid of [
      { ...item, evidence: 'inventado' },
      { ...item, summary: 'x'.repeat(141) },
      { ...item, aliases: [1] },
      { ...item, category: 'bad' },
      { ...item, details: 1 },
    ])
      expect(() =>
        parseDetectedLore(JSON.stringify({ entities: [invalid] }), 'Arthur chegou.'),
      ).toThrow();
    expect(() => parseDetectedLore('{}', '')).toThrow();
    expect(() => parseDetectedLore('{', '')).toThrow();
  });
  it('recognizes aliases and surfaces multiple destinations without silently choosing one', () => {
    const entities = [
      {
        ...item,
        id: 'local',
        bookId: 'b',
        category: 'character' as const,
        aliases: ['PENDRAGON'],
        relations: [],
        isPublic: true,
        createdAt: 1,
        updatedAt: 1,
      },
      {
        ...item,
        id: 'global',
        universeId: 'u',
        category: 'character' as const,
        relations: [],
        isPublic: false,
        createdAt: 1,
        updatedAt: 1,
      },
    ];
    expect(
      matchingLoreEntities(
        { ...item, category: 'character', name: 'Outro', aliases: ['Pendragon'] },
        entities,
      ).map((e) => e.id),
    ).toEqual(['local', 'global']);
  });
});
