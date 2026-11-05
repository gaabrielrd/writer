import type { Book } from './book';
import type { Chapter } from './chapter';

type ChapterSummary = Pick<Chapter, 'id' | 'title' | 'order' | 'wordCount' | 'updatedAt'> & {
  deleting?: boolean;
};

export type BookNextStep =
  | { id: 'first-chapter'; label: string; description: string }
  | { id: 'empty-chapter'; label: string; description: string; chapterId: string }
  | { id: 'synopsis'; label: string; description: string }
  | { id: 'cover'; label: string; description: string };

/** Chapter the author touched last, used to resume writing. */
export function lastEditedChapter<T extends ChapterSummary>(chapters: readonly T[]): T | null {
  return chapters
    .filter((chapter) => !chapter.deleting)
    .reduce<T | null>(
      (latest, chapter) => (!latest || chapter.updatedAt > latest.updatedAt ? chapter : latest),
      null,
    );
}

/**
 * Short list of pending steps derived only from data the page already has.
 * Order is the order of the work: write, then describe, then dress the book.
 */
export function bookNextSteps(
  book: Pick<Book, 'synopsis' | 'coverUrl'>,
  chapters: readonly ChapterSummary[],
  limit = 3,
): BookNextStep[] {
  const live = chapters.filter((chapter) => !chapter.deleting);
  const steps: BookNextStep[] = [];
  if (!live.length)
    steps.push({
      id: 'first-chapter',
      label: 'Escrever o primeiro capítulo',
      description: 'Crie um capítulo para começar o manuscrito.',
    });
  const empty = [...live]
    .sort((a, b) => a.order - b.order)
    .find((chapter) => chapter.wordCount === 0);
  if (empty)
    steps.push({
      id: 'empty-chapter',
      label: `Escrever “${empty.title}”`,
      description: 'Este capítulo ainda não tem texto.',
      chapterId: empty.id,
    });
  if (!book.synopsis?.trim())
    steps.push({
      id: 'synopsis',
      label: 'Escrever a sinopse',
      description: 'Ela aparece no catálogo e orienta o assistente.',
    });
  if (!book.coverUrl)
    steps.push({
      id: 'cover',
      label: 'Escolher a capa',
      description: 'Use uma imagem da biblioteca ou gere uma nova.',
    });
  return steps.slice(0, limit);
}
