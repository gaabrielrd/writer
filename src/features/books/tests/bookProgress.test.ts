import { expect, it } from 'vitest';
import { bookNextSteps, lastEditedChapter } from '../model/bookProgress';

const chapter = (id: string, order: number, wordCount: number, updatedAt: number) => ({
  id,
  title: `Capítulo ${order}`,
  order,
  wordCount,
  updatedAt,
});

it('retoma o capítulo editado por último e ignora capítulos em exclusão', () => {
  expect(lastEditedChapter([])).toBeNull();
  expect(
    lastEditedChapter([
      chapter('a', 1, 100, 10),
      chapter('b', 2, 50, 30),
      { ...chapter('c', 3, 0, 99), deleting: true },
    ])?.id,
  ).toBe('b');
});

it('sugere começar o manuscrito, depois sinopse e capa, em ordem de trabalho', () => {
  expect(bookNextSteps({ synopsis: '', coverUrl: null }, []).map((step) => step.id)).toEqual([
    'first-chapter',
    'synopsis',
    'cover',
  ]);
});

it('aponta o primeiro capítulo vazio pela ordem do livro e respeita o limite', () => {
  const steps = bookNextSteps({ synopsis: 'Uma sinopse', coverUrl: null }, [
    chapter('late', 3, 0, 50),
    chapter('early', 2, 0, 10),
    chapter('done', 1, 900, 5),
  ]);
  expect(steps).toEqual([
    {
      id: 'empty-chapter',
      label: 'Escrever “Capítulo 2”',
      description: 'Este capítulo ainda não tem texto.',
      chapterId: 'early',
    },
    expect.objectContaining({ id: 'cover' }),
  ]);
  expect(bookNextSteps({ synopsis: '', coverUrl: null }, [], 1)).toHaveLength(1);
});

it('não sugere nada quando o livro já tem texto, sinopse e capa', () => {
  expect(
    bookNextSteps({ synopsis: 'Pronta', coverUrl: 'data:,' }, [chapter('a', 1, 10, 1)]),
  ).toEqual([]);
});
