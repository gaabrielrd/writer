import { describe, expect, it } from 'vitest';
import { getSchema } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import type { LoreEntity } from '@/features/lore';
import { buildChapterMinimap, minimapViewport } from '../model/chapterMinimap';

const schema = getSchema([StarterKit]);
const entity: LoreEntity = {
  id: 'arthur',
  bookId: 'book',
  name: 'Rei Arthur',
  aliases: ['Arthur'],
  category: 'character',
  summary: 'Rei',
  details: '',
  relations: [],
  isPublic: false,
  createdAt: 1,
  updatedAt: 1,
};

describe('estrutura do minimapa', () => {
  it('mapeia títulos, parágrafos, aliases, marcas inline e blocos aninhados na ordem do texto', () => {
    const doc = schema.node('doc', null, [
      schema.node('heading', { level: 2 }, schema.text('Encontro')),
      schema.node('paragraph', null, [
        schema.text('Rei '),
        schema.text('Arthur', [schema.marks.bold!.create()]),
      ]),
      schema.node(
        'blockquote',
        null,
        schema.node('paragraph', null, schema.text('Arthur voltou.')),
      ),
      schema.node(
        'bulletList',
        null,
        schema.node('listItem', null, schema.node('paragraph', null, schema.text('Fim'))),
      ),
      schema.node('codeBlock', null, schema.text('Arthur')),
      schema.node('paragraph'),
    ]);
    const before: unknown = doc.toJSON();
    const map = buildChapterMinimap(doc, [entity]);
    expect(map.map(({ kind }) => kind)).toEqual([
      'heading',
      'paragraph',
      'entity',
      'paragraph',
      'entity',
      'paragraph',
      'block',
      'paragraph',
    ]);
    expect(map[0]).toMatchObject({ position: 1, level: 2, label: 'Título nível 2: Encontro' });
    expect(map.filter(({ kind }) => kind === 'entity')).toHaveLength(2);
    for (const occurrence of map.filter(({ kind }) => kind === 'entity')) {
      expect(doc.textBetween(occurrence.position, occurrence.position + occurrence.length)).toMatch(
        /Arthur/,
      );
      expect(occurrence.category).toBe('character');
    }
    expect(map.at(-1)?.label).toBe('Parágrafo: vazio');
    expect(doc.toJSON()).toEqual(before);
    expect(buildChapterMinimap(doc, []).some(({ kind }) => kind === 'entity')).toBe(false);
  });

  it('não cria destinos em capítulo vazio ou só com espaços', () => {
    for (const content of [undefined, schema.text('   ')]) {
      expect(
        buildChapterMinimap(schema.node('doc', null, schema.node('paragraph', null, content)), [
          entity,
        ]),
      ).toEqual([]);
    }
  });

  it('mantém cada ocorrência acessível em um capítulo de 15 mil palavras', () => {
    const doc = schema.node(
      'doc',
      null,
      Array.from({ length: 300 }, () =>
        schema.node('paragraph', null, schema.text('Arthur chegou ao castelo ontem. '.repeat(10))),
      ),
    );
    const map = buildChapterMinimap(doc, [entity]);
    expect(map.filter(({ kind }) => kind === 'paragraph')).toHaveLength(300);
    expect(map.filter(({ kind }) => kind === 'entity')).toHaveLength(3000);
  });

  it('projeta a área visível no início, meio, fim e fora do manuscrito', () => {
    expect(minimapViewport(100, 1000, 80, 400)).toEqual({ start: 0, end: 0.3 });
    expect(minimapViewport(-400, 1000, 0, 200)).toEqual({ start: 0.4, end: 0.6 });
    expect(minimapViewport(-900, 1000, 0, 200)).toEqual({ start: 0.9, end: 1 });
    expect(minimapViewport(900, 1000, 0, 200)).toEqual({ start: 0, end: 0 });
    expect(minimapViewport(0, 0, 0, 0)).toEqual({ start: 0, end: 0 });
  });
});
