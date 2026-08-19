import { describe, expect, it, vi } from 'vitest';
import { saveChapterContent } from '../services/chapterContentStorage';
import * as bookService from '@/features/books';

describe('chapterContentStorage', () => {
  it('calcula a contagem de palavras e atualiza o capitulo no Firestore', async () => {
    vi.spyOn(bookService, 'updateChapter').mockResolvedValue();

    const result = await saveChapterContent(
      'book-1',
      'chap-1',
      'Era uma vez um reino distante onde dragões voavam.',
    );

    expect(result.wordCount).toBe(9);
    expect(bookService.updateChapter).toHaveBeenCalledWith('book-1', 'chap-1', {
      content: 'Era uma vez um reino distante onde dragões voavam.',
      wordCount: 9,
    });
  });
});
