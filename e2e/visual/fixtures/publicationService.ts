import { getBook, listChapters, updateBook } from './bookService';
import { listLoreEntities } from './loreService';
import { setFixturePublication } from './publicBookService';
import { renderRichText } from '../../../src/shared/lib/sanitizeRichText';
import { FIXTURE_TIME } from './data';
let sequence = 1;
export async function publishBook(bookId: string, authorName: string): Promise<void> {
  if (!authorName.trim()) throw new Error('Informe o nome público do autor.');
  const book = await getBook(bookId);
  if (!book) throw new Error('Livro fictício não encontrado.');
  const [chapters, lore] = await Promise.all([listChapters(bookId), listLoreEntities(bookId)]);
  await updateBook(bookId, { status: 'published' });
  setFixturePublication(bookId, {
    book: {
      id: bookId,
      title: book.title,
      authorName: authorName.trim(),
      revisionId: `fixture-revision-${++sequence}`,
      publishedAt: FIXTURE_TIME,
    },
    content: {
      chapters: chapters.map(({ id, title, order, content }) => ({
        id,
        title,
        order,
        content: renderRichText(content),
      })),
      lore: lore
        .filter((entity) => entity.isPublic)
        .map(({ id, name, aliases, category, summary }) => ({
          id,
          name,
          aliases,
          category,
          summary,
          isPublic: true,
        })),
    },
  });
}
export async function unpublishBook(bookId: string): Promise<void> {
  if (await getBook(bookId)) await updateBook(bookId, { status: 'draft' });
  setFixturePublication(bookId, null);
}
