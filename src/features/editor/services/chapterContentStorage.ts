import { countWords, updateChapter } from '@/features/books';

// Survives a route unmount/remount: writes to the same chapter cannot overtake
// an earlier session's pending save, including when navigating Back quickly.
const pendingWrites = new Map<string, Promise<unknown>>();
export function saveChapterContent(
  bookId: string,
  chapterId: string,
  content: string,
): Promise<{ wordCount: number }> {
  const key = `${bookId}:${chapterId}`;
  const previous = pendingWrites.get(key);
  const wordCount = countWords(content);
  const write = (async () => {
    if (previous) {
      try {
        await previous;
      } catch {
        /* A later retry may succeed. */
      }
    }
    await updateChapter(bookId, chapterId, { content, wordCount });
    return { wordCount };
  })();
  pendingWrites.set(key, write);
  void write
    .finally(() => {
      if (pendingWrites.get(key) === write) pendingWrites.delete(key);
    })
    .catch(() => {});
  return write;
}
