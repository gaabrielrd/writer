import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { EditorState, TextSelection } from '@tiptap/pm/state';
import {
  buildLoreDecorations,
  getMentionRange,
  mentionCandidates,
  plainTextContent,
} from '../model/richDocument';
import { findLoreMatches, type LoreEntity } from '@/features/lore';

const entity: LoreEntity = {
  id: 'arthur',
  bookId: 'book',
  name: 'Rei Arthur',
  aliases: ['Arthur'],
  summary: 'Rei',
  category: 'character',
  details: '',
  relations: [],
  isPublic: true,
  createdAt: 1,
  updatedAt: 1,
};
const schema = getSchema([StarterKit]);
function state(text: string, node = 'paragraph', from = text.length + 1, to = from) {
  const doc = schema.node('doc', null, [
    schema.node(node, null, text ? schema.text(text) : undefined),
  ]);
  return EditorState.create({ schema, doc, selection: TextSelection.create(doc, from, to) });
}

describe('rich document', () => {
  it('decora termos divididos por marcas sem modificar o documento nem o texto', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, [
        schema.text('Rei '),
        schema.text('Arthur', [schema.marks.bold!.create()]),
        schema.text(' escreve.'),
      ]),
    ]);
    const before: unknown = doc.toJSON();
    const marks = buildLoreDecorations(doc, [entity]).find();
    expect(marks).toHaveLength(1);
    expect(marks[0]).toMatchObject({ from: 1, to: 11 });
    expect(doc.toJSON()).toEqual(before);
    expect(buildLoreDecorations(doc, []).find()).toHaveLength(0);
  });

  it('respeita parágrafos e ignora blocos de código', () => {
    const doc = schema.node('doc', null, [
      schema.node('paragraph', null, schema.text('Arthur')),
      schema.node('codeBlock', null, schema.text('Arthur')),
      schema.node('paragraph', null, schema.text('Arthur')),
    ]);
    expect(buildLoreDecorations(doc, [entity]).find()).toHaveLength(2);
  });

  it('detecta @ apenas no parágrafo ativo e aceita nomes compostos', () => {
    expect(getMentionRange(state('Olá @Rei Art'))).toEqual({ from: 5, to: 13, query: 'Rei Art' });
    expect(getMentionRange(state('@'))).toEqual({ from: 1, to: 2, query: '' });
    expect(getMentionRange(state('email@site.com'))).toBeNull();
    expect(getMentionRange(state(`@${'a'.repeat(51)}`))).toBeNull();
    expect(getMentionRange(state('@Arthur', 'codeBlock'))).toBeNull();
    expect(getMentionRange(state('@Arthur', 'paragraph', 1, 8))).toBeNull();
  });

  it('busca nomes e aliases sem diferenciar maiúsculas e preserva texto de IA literal', () => {
    expect(mentionCandidates([entity], ' ARTH ')).toEqual([entity]);
    expect(mentionCandidates([entity], 'Avalon')).toEqual([]);
    expect(mentionCandidates([entity], 'personagem')).toEqual([entity]);
    expect(mentionCandidates([entity], 'PERSONAGENS')).toEqual([entity]);
    expect(mentionCandidates([entity], 'character')).toEqual([entity]);
    expect(mentionCandidates([entity], 'locais')).toEqual([]);
    expect(mentionCandidates([{ ...entity, category: 'location' }], 'local')).toHaveLength(1);
    expect(mentionCandidates([{ ...entity, category: 'concept' }], 'itens')).toHaveLength(1);
    expect(mentionCandidates([{ ...entity, category: 'other' }], 'outros')).toHaveLength(1);
    expect(plainTextContent('<script>x</script>\r\n\r\nfim')).toEqual([
      { type: 'paragraph', content: [{ type: 'text', text: '<script>x</script>' }] },
      { type: 'paragraph', content: [] },
      { type: 'paragraph', content: [{ type: 'text', text: 'fim' }] },
    ]);
  });

  it('mantém escolha global de termos longos em 15 mil palavras com muitas repetições', () => {
    const text = 'Rei Arthur viu Arthur voltar '.repeat(3000).trim();
    const matches = findLoreMatches(text, [entity]);
    expect(text.split(/\s+/)).toHaveLength(15000);
    expect(matches).toHaveLength(6000);
    expect(matches[0]?.matchedText).toBe('Rei Arthur');
    expect(matches[1]?.matchedText).toBe('Arthur');
    for (let index = 1; index < matches.length; index++)
      expect(matches[index]!.startIndex).toBeGreaterThanOrEqual(matches[index - 1]!.endIndex);
  });
});
