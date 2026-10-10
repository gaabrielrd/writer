import type { PublicBook, PublicBookContent } from '../../../src/features/books/model/publicBook';
import { renderRichText } from '../../../src/shared/lib/sanitizeRichText';
import { author, books, chapters, lore, FIXTURE_TIME } from './data';

export const PUBLIC_FIXTURE_BOOK_ID = 'visual-public-atlas';
interface Publication {
  book: PublicBook;
  content: PublicBookContent;
}
const publications = new Map<string, Publication>([
  [
    PUBLIC_FIXTURE_BOOK_ID,
    {
      book: {
        id: PUBLIC_FIXTURE_BOOK_ID,
        title: books[0].title,
        authorName: author.displayName ?? 'Autora de Exemplo',
        revisionId: 'fixture-revision-1',
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
    },
  ],
]);
const subscribers = new Map<string, Set<(book: PublicBook | null) => void>>();
export function setFixturePublication(bookId: string, publication: Publication | null): void {
  if (publication) publications.set(bookId, structuredClone(publication));
  else publications.delete(bookId);
  for (const listener of subscribers.get(bookId) ?? [])
    listener(structuredClone(publication?.book ?? null));
}
export function getPublicBook(bookId: string): Promise<PublicBook | null> {
  return Promise.resolve(structuredClone(publications.get(bookId)?.book ?? null));
}
export function getPublicBookContent(book: PublicBook): Promise<PublicBookContent> {
  const publication = publications.get(book.id);
  if (!publication || publication.book.revisionId !== book.revisionId)
    return Promise.reject(
      Object.assign(new Error('Publicação indisponível.'), { code: 'permission-denied' }),
    );
  return Promise.resolve(structuredClone(publication.content));
}
export function subscribePublicBook(
  bookId: string,
  onChange: (book: PublicBook | null) => void,
): () => void {
  // A denied Firestore listener terminates until the reader explicitly retries.
  if (!publications.has(bookId)) return () => {};
  const listeners = subscribers.get(bookId) ?? new Set();
  listeners.add(onChange);
  subscribers.set(bookId, listeners);
  return () => {
    listeners.delete(onChange);
  };
}
export function isPublicBookUnavailable(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'permission-denied'
  );
}
export function publicReadingPath(bookId: string, chapterId?: string): string {
  return `/read/${encodeURIComponent(bookId)}${chapterId ? `?chapter=${encodeURIComponent(chapterId)}` : ''}`;
}
export function publicReadingUrl(bookId: string, chapterId?: string): string {
  return new URL(publicReadingPath(bookId, chapterId), window.location.origin).href;
}
export async function copyPublicReadingLink(bookId: string, chapterId?: string): Promise<void> {
  await navigator.clipboard.writeText(publicReadingUrl(bookId, chapterId));
}
