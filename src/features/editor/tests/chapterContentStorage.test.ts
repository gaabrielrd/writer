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

it('captura a base confirmada ao executar a gravação enfileirada e conserva a conta da sessão', async () => {
  vi.restoreAllMocks();
  let confirmed = 'Original';
  let finish!: () => void;
  const update = vi
    .spyOn(bookService, 'updateChapter')
    .mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          finish = () => {
            confirmed = 'Primeira';
            resolve();
          };
        }),
    )
    .mockResolvedValue(undefined);
  const first = saveChapterContent('cas-book', 'chapter', 'Primeira', () => confirmed, 'author');
  const flush = saveChapterContent('cas-book', 'chapter', 'Final', () => confirmed, 'author');
  expect(update).toHaveBeenCalledTimes(1);
  expect(update).toHaveBeenCalledWith(
    'cas-book',
    'chapter',
    expect.objectContaining({
      expectedContent: 'Original',
      expectedOwnerId: 'author',
      content: 'Primeira',
    }),
  );
  finish();
  await Promise.all([first, flush]);
  expect(update).toHaveBeenLastCalledWith(
    'cas-book',
    'chapter',
    expect.objectContaining({
      expectedContent: 'Primeira',
      expectedOwnerId: 'author',
      content: 'Final',
    }),
  );
});
