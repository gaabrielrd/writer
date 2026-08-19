import { countWords, updateChapter } from '@/features/books';

export async function saveChapterContent(
  bookId: string,
  chapterId: string,
  content: string,
): Promise<{ wordCount: number }> {
  const wordCount = countWords(content);
  await updateChapter(bookId, chapterId, {
    content,
    wordCount,
  });

  return { wordCount };
}
