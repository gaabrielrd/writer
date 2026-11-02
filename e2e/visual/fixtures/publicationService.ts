import { actName, groupChapters } from '../../../src/features/books/model/act';
import { listActs } from './bookService';
import { getBook, listChapters, updateBook } from './bookService';
import { listLoreEntities } from './loreService';
import { setFixturePublication } from './publicBookService';
import { renderRichText } from '../../../src/shared/lib/sanitizeRichText';
import { FIXTURE_TIME } from './data';
import { resolveChapterContent } from '../../../src/features/books/services/chapterCompositionService';
let sequence = 1;
export async function publishBook(bookId: string, authorName: string): Promise<void> {
  if (!authorName.trim()) throw new Error('Informe o nome público do autor.');
  const book = await getBook(bookId);
  if (!book) throw new Error('Livro fictício não encontrado.');
  const [rawChapters, lore] = await Promise.all([listChapters(bookId), listLoreEntities(bookId)]);
  const chapters = await Promise.all(
    rawChapters.map((chapter) => resolveChapterContent(bookId, chapter)),
  );
  const acts = await listActs(bookId);
  const ordered = groupChapters(chapters, acts).filter((group) => group.chapters.length > 0);
  const publicActs = ordered.flatMap((group) =>
    group.act ? [{ ...group.act, name: actName(group.act) }] : [],
  );
  await updateBook(bookId, { status: 'published' });
  setFixturePublication(bookId, {
    book: {
      id: bookId,
      title: book.title,
      ...(publicActs.length ? { hasActs: true } : {}),
      authorName: authorName.trim(),
      revisionId: `fixture-revision-${++sequence}`,
      publishedAt: FIXTURE_TIME,
    },
    content: {
      acts: publicActs,
      chapters: ordered
        .flatMap((group) => group.chapters)
        .map(({ id, title, content, actId }, index) => ({
          ...(actId ? { actId } : {}),
          id,
          title,
          order: index + 1,
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
