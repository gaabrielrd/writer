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

it('serializa gravacoes entre sessoes e permite repetir apos falha', async () => {
  vi.restoreAllMocks();
  let finish!: () => void;
  const update = vi
    .spyOn(bookService, 'updateChapter')
    .mockReturnValueOnce(
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
    )
    .mockResolvedValue(undefined);
  const first = saveChapterContent('ordered-book', 'chapter', 'old session');
  const second = saveChapterContent('ordered-book', 'chapter', 'new session');
  expect(update).toHaveBeenCalledTimes(1);
  finish();
  await Promise.all([first, second]);
  expect(update).toHaveBeenLastCalledWith(
    'ordered-book',
    'chapter',
    expect.objectContaining({ content: 'new session' }),
  );
  update.mockRejectedValueOnce(new Error('offline')).mockResolvedValueOnce(undefined);
  const failed = saveChapterContent('retry-book', 'chapter', 'first');
  const retry = saveChapterContent('retry-book', 'chapter', 'retry');
  await expect(failed).rejects.toThrow('offline');
  await expect(retry).resolves.toEqual({ wordCount: 1 });
});
