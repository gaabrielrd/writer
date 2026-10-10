import type {
  Book,
  CreateBookInput,
  UpdateBookInput,
} from '../../../src/features/books/model/book';
import {
  countWords,
  type Chapter,
  type CreateChapterInput,
  type UpdateChapterInput,
} from '../../../src/features/books/model/chapter';
import { author, books, chapters, FIXTURE_LIBRARY_STATE_KEY, FIXTURE_TIME } from './data';

const initialBooks = sessionStorage.getItem(FIXTURE_LIBRARY_STATE_KEY) === 'empty' ? [] : books;
const bookStore = new Map(initialBooks.map((book) => [book.id, structuredClone(book)]));
const chapterStore = new Map(chapters.map((chapter) => [chapter.id, structuredClone(chapter)]));
let sequence = 0;

export function listBooksByAuthor(authorId: string): Promise<Book[]> {
  if (sessionStorage.getItem(FIXTURE_LIBRARY_STATE_KEY) === 'error') {
    return Promise.reject(new Error('Falha simulada de conexão. Tente novamente.'));
  }
  return Promise.resolve(
    structuredClone([...bookStore.values()].filter((book) => book.authorId === authorId)),
  );
}

export function getBook(bookId: string): Promise<Book | null> {
  return Promise.resolve(structuredClone(bookStore.get(bookId) ?? null));
}

export function createBook(authorId: string, input: CreateBookInput): Promise<Book> {
  if (authorId !== author.uid) throw new Error('A prévia permite somente a conta fictícia.');
  const book: Book = {
    ...input,
    id: `visual-created-book-${++sequence}`,
    authorId,
    status: 'draft',
    wordCount: 0,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
  bookStore.set(book.id, book);
  return Promise.resolve(structuredClone(book));
}

export function updateBook(bookId: string, input: UpdateBookInput): Promise<void> {
  const book = bookStore.get(bookId);
  if (!book) throw new Error('Livro fictício não encontrado.');
  bookStore.set(bookId, { ...book, ...input, updatedAt: FIXTURE_TIME });
  return Promise.resolve();
}

export function deleteBook(bookId: string): Promise<void> {
  bookStore.delete(bookId);
  chapterStore.forEach((chapter) => {
    if (chapter.bookId === bookId) chapterStore.delete(chapter.id);
  });
  return Promise.resolve();
}

export function listChapters(bookId: string): Promise<Chapter[]> {
  return Promise.resolve(
    structuredClone(
      [...chapterStore.values()]
        .filter((chapter) => chapter.bookId === bookId)
        .sort((a, b) => a.order - b.order),
    ),
  );
}

export function getChapter(bookId: string, chapterId: string): Promise<Chapter | null> {
  const chapter = chapterStore.get(chapterId);
  return Promise.resolve(structuredClone(chapter?.bookId === bookId ? chapter : null));
}

export function createChapter(bookId: string, input: CreateChapterInput): Promise<Chapter> {
  const chapter: Chapter = {
    id: `visual-created-chapter-${++sequence}`,
    bookId,
    title: input.title,
    order: input.order ?? chapterStore.size + 1,
    content: input.content ?? '',
    wordCount: countWords(input.content ?? ''),
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
  chapterStore.set(chapter.id, chapter);
  return Promise.resolve(structuredClone(chapter));
}

export function updateChapter(
  bookId: string,
  chapterId: string,
  input: UpdateChapterInput,
): Promise<void> {
  const chapter = chapterStore.get(chapterId);
  if (!chapter || chapter.bookId !== bookId) throw new Error('Capítulo fictício não encontrado.');
  chapterStore.set(chapterId, {
    ...chapter,
    ...input,
    wordCount: input.wordCount ?? countWords(input.content ?? chapter.content),
    updatedAt: FIXTURE_TIME,
  });
  return Promise.resolve();
}

export function deleteChapter(bookId: string, chapterId: string): Promise<void> {
  if (chapterStore.get(chapterId)?.bookId === bookId) chapterStore.delete(chapterId);
  return Promise.resolve();
}

export function reorderChapters(bookId: string, orderedChapterIds: string[]): Promise<void> {
  orderedChapterIds.forEach((id, index) => {
    const chapter = chapterStore.get(id);
    if (chapter?.bookId === bookId) chapterStore.set(id, { ...chapter, order: index + 1 });
  });
  return Promise.resolve();
}

export function recalculateBookWordCount(bookId: string): Promise<number> {
  const total = [...chapterStore.values()]
    .filter((chapter) => chapter.bookId === bookId)
    .reduce((sum, chapter) => sum + chapter.wordCount, 0);
  const book = bookStore.get(bookId);
  if (book) bookStore.set(bookId, { ...book, wordCount: total });
  return Promise.resolve(total);
}
