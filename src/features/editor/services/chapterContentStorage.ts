import { countWords, updateChapter } from '@/features/books';

// Survives a route unmount/remount: writes to the same chapter cannot overtake
// an earlier session's pending save, including when navigating Back quickly.
const pendingWrites = new Map<string, Promise<unknown>>();
export function runChapterOperation<T>(
  bookId: string,
  chapterId: string,
  work: () => Promise<T>,
): Promise<T> {
  const key = `${bookId}:${chapterId}`;
  const previous = pendingWrites.get(key);
  const request = (async () => {
    if (previous) await previous.catch(() => undefined);
    return work();
  })();
  pendingWrites.set(key, request);
  void request
    .finally(() => {
      if (pendingWrites.get(key) === request) pendingWrites.delete(key);
    })
    .catch(() => undefined);
  return request;
}
export function saveChapterContent(
  bookId: string,
  chapterId: string,
  content: string,
  expectedContent?: string | (() => string),
  ownerId?: string,
): Promise<{ wordCount: number }> {
  const wordCount = countWords(content);
  return runChapterOperation(bookId, chapterId, async () => {
    const observed = typeof expectedContent === 'function' ? expectedContent() : expectedContent;
    await updateChapter(bookId, chapterId, {
      content,
      wordCount,
      ...(observed !== undefined ? { expectedContent: observed } : {}),
      ...(ownerId ? { expectedOwnerId: ownerId } : {}),
    });
    return { wordCount };
  });
}
