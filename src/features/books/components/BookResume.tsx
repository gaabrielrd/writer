import { Link } from 'react-router';
import { ChevronRight, PenLine } from 'lucide-react';
import { buttonVariants } from '@/shared/ui';
import type { Book } from '../model/book';
import type { Chapter } from '../model/chapter';
import { bookNextSteps, lastEditedChapter, type BookNextStep } from '../model/bookProgress';
import styles from './BookResume.module.css';

const editedDate = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'short' });

export interface BookResumeProps {
  book: Book;
  chapters: readonly Chapter[];
  onStep: (step: BookNextStep) => void;
}

/** Top of the book page: where to continue and what is still missing. */
export function BookResume({ book, chapters, onStep }: BookResumeProps) {
  const last = lastEditedChapter(chapters);
  const steps = bookNextSteps(book, chapters);
  if (!last && !steps.length) return null;
  return (
    <section className={styles.resume} aria-label="Retomar o trabalho">
      {last && (
        <div className={styles.continue}>
          <PenLine className={`icon ${styles.continueIcon}`} aria-hidden="true" />
          <div className={styles.continueText}>
            <p className={styles.eyebrow}>Continuar de onde parou</p>
            <p className={styles.chapterTitle} title={last.title}>
              {last.title}
            </p>
            <p className={styles.chapterMeta}>
              {last.wordCount.toLocaleString('pt-BR')} palavras · editado em{' '}
              {editedDate.format(last.updatedAt)}
            </p>
          </div>
          <Link
            to={`/books/${book.id}/editor/${last.id}`}
            className={buttonVariants({ variant: 'primary', size: 'sm' })}
          >
            Continuar escrevendo
          </Link>
        </div>
      )}
      {steps.length > 0 && (
        <div className={styles.steps}>
          <h2 className={styles.stepsTitle}>Próximos passos</h2>
          <ul className={styles.stepList}>
            {steps.map((step) => (
              <li key={step.id}>
                <button type="button" className={styles.step} onClick={() => onStep(step)}>
                  <span className={styles.stepText}>
                    <span className={styles.stepLabel}>{step.label}</span>
                    <span className={styles.stepDescription}>{step.description}</span>
                  </span>
                  <ChevronRight className="icon icon-sm" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
