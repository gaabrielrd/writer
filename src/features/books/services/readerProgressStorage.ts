import type { PublicBook, PublicChapter } from '../model/publicBook';
export interface ReaderProgress {
  version: 1;
  bookId: string;
  revisionId: string;
  currentChapterId: string;
  furthestChapterId: string;
}
const key = (bookId: string) => 'writer:reader-progress:' + encodeURIComponent(bookId);
export function readReaderProgress(bookId: string): ReaderProgress | null {
  try {
    const raw = localStorage.getItem(key(bookId));
    if (!raw || raw.length > 12000) return null;
    const v = JSON.parse(raw) as ReaderProgress;
    return v.version === 1 &&
      v.bookId === bookId &&
      [v.bookId, v.revisionId, v.currentChapterId, v.furthestChapterId].every(
        (id) => typeof id === 'string' && !!id && !id.includes('/') && id.length <= 1500,
      )
      ? {
          version: 1,
          bookId: v.bookId,
          revisionId: v.revisionId,
          currentChapterId: v.currentChapterId,
          furthestChapterId: v.furthestChapterId,
        }
      : null;
  } catch {
    return null;
  }
}
export function advanceReaderProgress(
  book: PublicBook,
  chapters: readonly PublicChapter[],
  currentChapterId: string,
  previous: ReaderProgress | null,
): ReaderProgress {
  const index = chapters.findIndex((chapter) => chapter.id === currentChapterId),
    prior =
      previous?.bookId === book.id && previous.revisionId === book.revisionId
        ? chapters.findIndex((chapter) => chapter.id === previous.furthestChapterId)
        : -1;
  return {
    version: 1,
    bookId: book.id,
    revisionId: book.revisionId,
    currentChapterId,
    furthestChapterId: chapters[Math.max(index, prior)]?.id ?? currentChapterId,
  };
}
export function writeReaderProgress(value: ReaderProgress): void {
  try {
    localStorage.setItem(
      key(value.bookId),
      JSON.stringify({
        version: 1,
        bookId: value.bookId,
        revisionId: value.revisionId,
        currentChapterId: value.currentChapterId,
        furthestChapterId: value.furthestChapterId,
      }),
    );
  } catch {
    /* Reading still works when storage is unavailable. */
  }
}
