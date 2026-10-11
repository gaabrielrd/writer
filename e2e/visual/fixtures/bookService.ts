import { groupChapters, type Act } from '../../../src/features/books/model/act';
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
const bindingListeners = new Set<() => void>();
let sequence = 0;
const actStore = new Map<string, Act[]>();

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
  bindingListeners.forEach((notify) => notify());
  return Promise.resolve();
}

export function deleteBook(bookId: string): Promise<void> {
  bookStore.delete(bookId);
  actStore.delete(bookId);
  chapterStore.forEach((chapter) => {
    if (chapter.bookId === bookId) chapterStore.delete(chapter.id);
  });
  return Promise.resolve();
}

export function listChapters(bookId: string): Promise<Chapter[]> {
  if (sessionStorage.getItem('writer.visual.export-failure') === 'true') {
    return Promise.reject(new Error('Falha simulada na exportação. Tente novamente.'));
  }
  return Promise.resolve(
    structuredClone(
      groupChapters(
        [...chapterStore.values()].filter((chapter) => chapter.bookId === bookId),
        actStore.get(bookId) ?? [],
      ).flatMap((group) => group.chapters),
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
    ...(input.actId ? { actId: input.actId } : {}),
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
  bindingListeners.forEach((notify) => notify());
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

export const MAX_CHAPTER_SELECTION = 200;
export function listActs(bookId: string): Promise<Act[]> {
  return Promise.resolve(structuredClone(actStore.get(bookId) ?? []));
}
export function createAct(bookId: string, name: string): Promise<Act> {
  if (!bookStore.has(bookId)) throw new Error('Livro fictício não encontrado.');
  const acts = actStore.get(bookId) ?? [];
  const act: Act = {
    id: 'visual-act-' + ++sequence,
    name: name.trim() || null,
    order: acts.length + 1,
    createdAt: FIXTURE_TIME,
    updatedAt: FIXTURE_TIME,
  };
  actStore.set(bookId, [...acts, act]);
  return Promise.resolve(structuredClone(act));
}
export async function moveChaptersToAct(
  bookId: string,
  selected: readonly Chapter[],
  actId: string | null,
): Promise<void> {
  if (sessionStorage.getItem('writer.visual.acts-failure') === 'true')
    throw new Error('Falha simulada na movimentação.');
  const ids = new Set(selected.map((chapter) => chapter.id));
  const chapters = await listChapters(bookId);
  const nextOrder = Math.max(
    0,
    ...chapters
      .filter((chapter) => (chapter.actId ?? null) === actId)
      .map((chapter) => chapter.order),
  );
  groupChapters(chapters, await listActs(bookId))
    .flatMap((group) => group.chapters)
    .filter((chapter) => ids.has(chapter.id) && (chapter.actId ?? null) !== actId)
    .forEach((chapter, index) =>
      chapterStore.set(chapter.id, { ...chapter, actId, order: nextOrder + index + 1 }),
    );
}
export async function deleteChapters(bookId: string, selected: readonly Chapter[]): Promise<void> {
  for (const chapter of selected) await deleteChapter(bookId, chapter.id);
  await recalculateBookWordCount(bookId);
}

export function subscribeWritingBindings(
  bookId: string,
  chapterId: string | null,
  callback: (settings: {
    personaId?: Book['personaId'];
    personaComplement?: Chapter['personaComplement'];
  }) => void,
): () => void {
  const notify = () => {
    callback({ personaId: bookStore.get(bookId)?.personaId ?? null });
    if (chapterId)
      callback({ personaComplement: chapterStore.get(chapterId)?.personaComplement ?? null });
  };
  bindingListeners.add(notify);
  notify();
  return () => {
    bindingListeners.delete(notify);
  };
}
