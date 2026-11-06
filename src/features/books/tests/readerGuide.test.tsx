import { expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReaderContent } from '../components/ReaderContent';
import { visibleReaderGuide, parseReaderGuideFields } from '../model/readerGuide';
import type {
  PublicBook,
  PublicChapter,
  PublicLoreEntity,
  ReaderGuideBoundary,
} from '../model/publicBook';
const book: PublicBook = {
  id: 'book',
  revisionId: 'edition',
  readerGuideVersion: 1,
  title: 'Livro',
  authorName: 'Autora',
  publishedAt: 1,
};
const chapters: PublicChapter[] = [
  { id: 'first', title: 'Primeiro', order: 1, content: '' },
  { id: 'last', title: 'Último', order: 2, content: '' },
];
const boundary = (chapterId = 'first'): ReaderGuideBoundary => ({
  version: 1,
  bookId: 'book',
  revisionId: 'edition',
  chapterId,
});
const person = (id: string, name = 'Ana', chapterId = 'first'): PublicLoreEntity => ({
  id,
  name,
  aliases: ['Viajante'],
  category: 'character',
  summary: 'Informação pública',
  isPublic: true,
  readerGuide: boundary(chapterId),
  certainty: 'uncertain',
  disambiguation: id,
  facts: [],
  relationships: [],
  appearances: [],
});
it('a hidden homonym suppresses ambiguous inline names without exposing its summary or disambiguation', () => {
  const allLore = [
    person('traveler'),
    { ...person('secret', 'Ana', 'last'), summary: 'Revelação oculta' },
  ];
  const visible = visibleReaderGuide(book, chapters, allLore, 'first');
  expect(visible.map((item) => item.id)).toEqual(['traveler']);
  const { container } = render(
    <ReaderContent content="<p>Ana e Viajante partiram.</p>" lore={visible} allLore={allLore} />,
  );
  expect(container).toHaveTextContent('Ana e Viajante partiram.');
  expect(screen.queryByRole('button')).not.toBeInTheDocument();
  expect(container).not.toHaveTextContent('Revelação oculta');
  expect(container.innerHTML).not.toContain('secret');
});
it('unique names still link, duplicate aliases of one identity do not create a false collision, and links/code are preserved', () => {
  const entity = { ...person('traveler'), aliases: ['Ana', 'Viajante', 'Viajante'] };
  render(
    <ReaderContent
      content='<p>Ana <a href="https://example.com">Ana</a> <code>Viajante</code></p>'
      lore={[entity]}
      allLore={[entity]}
    />,
  );
  expect(screen.getAllByRole('button', { name: 'Ver resumo de Ana' })).toHaveLength(1);
  expect(screen.getByRole('link', { name: 'Ana' })).toHaveAttribute('href', 'https://example.com/');
});
it('releases facts, relationships and appearances independently, only when their target is also visible in the same edition', () => {
  const source = person('first');
  source.facts = [
    { text: 'Talvez viaje.', certainty: 'uncertain', readerGuide: boundary() },
    { text: 'Segredo final.', certainty: 'fact', readerGuide: boundary('last') },
  ];
  source.relationships = [
    {
      targetId: 'second',
      description: 'Conhecida',
      certainty: 'uncertain',
      readerGuide: boundary(),
    },
  ];
  source.appearances = [{ kind: 'document', readerGuide: boundary('last') }];
  const entities = [source, person('second', 'Beatriz', 'last')];
  const early = visibleReaderGuide(book, chapters, entities, 'first');
  expect(early[0]).toMatchObject({
    facts: [{ text: 'Talvez viaje.', certainty: 'uncertain' }],
    relationships: [],
    appearances: [],
  });
  const late = visibleReaderGuide(book, chapters, entities, 'last');
  expect(late[0]).toMatchObject({
    facts: source.facts,
    relationships: [{ targetName: 'Beatriz · second', certainty: 'uncertain' }],
    appearances: [{ kind: 'document', chapterTitle: 'Último' }],
  });
  expect(source.relationships[0]).not.toHaveProperty('targetName');
  expect(
    visibleReaderGuide({ ...book, revisionId: 'new-edition' }, chapters, entities, 'last'),
  ).toEqual([]);
  expect(visibleReaderGuide(book, chapters, entities, 'foreign-chapter')).toEqual([]);
});
it('rejects mismatched books, editions, chapters, excess boundaries and malformed facts in published guide data', () => {
  const data = {
    readerGuide: boundary(),
    certainty: 'uncertain',
    disambiguation: '',
    facts: [],
    relationships: [],
    appearances: [],
  };
  expect(parseReaderGuideFields(book, chapters, data)).toMatchObject({ certainty: 'uncertain' });
  for (const readerGuide of [
    boundary('missing'),
    { ...boundary(), bookId: 'other' },
    { ...boundary(), revisionId: 'old' },
    { ...boundary(), private: true },
    null,
  ])
    expect(parseReaderGuideFields(book, chapters, { ...data, readerGuide })).toBeNull();
  expect(
    parseReaderGuideFields(book, chapters, {
      ...data,
      facts: [{ text: 'Dúvida', certainty: 'proven', readerGuide: boundary() }],
    }),
  ).toBeNull();
});
