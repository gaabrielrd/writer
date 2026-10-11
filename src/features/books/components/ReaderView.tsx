import { useEffect, useRef, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router';
import { ArrowLeft, ArrowRight, BookOpen } from 'lucide-react';
import { Button, EmptyState, ErrorState, LoadingState } from '@/shared/ui';
import { ReaderContent } from './ReaderContent';
import { ReaderHeader } from './ReaderHeader';
import {
  getPublicBook,
  getPublicBookContent,
  isPublicBookUnavailable,
  publicReadingPath,
  subscribePublicBook,
  type PublicBook,
  type PublicBookContent,
} from '../services/publicBookService';
import { actName, groupChapters } from '../model/act';
import styles from './ReaderView.module.css';

type ReaderState =
  | { kind: 'loading' | 'unavailable' | 'error' }
  | { kind: 'ready'; book: PublicBook; content: PublicBookContent };

function UnavailableBook({ onRetry }: { onRetry?: () => void }) {
  return (
    <EmptyState
      title="Obra indisponível"
      description="Esta obra é privada, ainda não foi publicada ou não está mais disponível."
      icon={<BookOpen className="icon" aria-hidden="true" />}
      action={
        onRetry ? (
          <Button type="button" variant="outline" onClick={onRetry}>
            Verificar novamente
          </Button>
        ) : undefined
      }
    />
  );
}

function ReaderSession({ bookId, onRetry }: { bookId: string; onRetry: () => void }) {
  const [state, setState] = useState<ReaderState>({ kind: 'loading' });
  const [searchParams, setSearchParams] = useSearchParams();
  const heading = useRef<HTMLHeadingElement>(null);
  const previousChapterId = useRef<string | undefined>(undefined);
  const requestedChapter = searchParams.get('chapter');

  useEffect(() => {
    let active = true;
    let generation = 0;
    let revision: string | undefined;
    let unsubscribe = () => {};
    const fail = (error: unknown) => {
      if (!active) return;
      generation += 1;
      revision = undefined;
      setState({ kind: isPublicBookUnavailable(error) ? 'unavailable' : 'error' });
    };
    const acceptBook = async (book: PublicBook | null) => {
      if (!active) return;
      if (!book) {
        generation += 1;
        revision = undefined;
        setState({ kind: 'unavailable' });
        return;
      }
      if (revision === book.revisionId) return;
      revision = book.revisionId;
      const request = ++generation;
      setState({ kind: 'loading' });
      try {
        const content = await getPublicBookContent(book);
        // Recheck permission and the active revision before displaying a snapshot.
        const current = await getPublicBook(bookId);
        if (!active || request !== generation) return;
        if (!current || current.revisionId !== book.revisionId) {
          await acceptBook(current);
          return;
        }
        setState({ kind: 'ready', book: current, content });
      } catch (error) {
        if (active && request === generation) fail(error);
      }
    };
    void getPublicBook(bookId)
      .then((book) => {
        if (!active) return;
        void acceptBook(book);
        unsubscribe = subscribePublicBook(
          bookId,
          (current) => {
            void acceptBook(current);
          },
          fail,
        );
      })
      .catch(fail);
    return () => {
      active = false;
      generation += 1;
      unsubscribe();
    };
  }, [bookId]);

  const currentChapter =
    state.kind === 'ready'
      ? (state.content.chapters.find((chapter) => chapter.id === requestedChapter) ??
        state.content.chapters[0])
      : undefined;
  useEffect(() => {
    if (currentChapter) {
      heading.current?.focus({ preventScroll: true });
      if (previousChapterId.current && previousChapterId.current !== currentChapter.id) {
        heading.current?.scrollIntoView?.({ block: 'start' });
      }
      previousChapterId.current = currentChapter.id;
    }
  }, [currentChapter]);

  useEffect(() => {
    if (state.kind !== 'ready' || !currentChapter) return;
    const navigateWithKeyboard = (event: KeyboardEvent) => {
      if (
        event.defaultPrevented ||
        event.repeat ||
        event.altKey ||
        event.ctrlKey ||
        event.metaKey ||
        event.shiftKey
      )
        return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      if (
        event.target instanceof Element &&
        event.target.closest(
          'input, textarea, select, button, a, [contenteditable], [role="textbox"]',
        )
      )
        return;
      if (window.getSelection()?.isCollapsed === false) return;
      const index = state.content.chapters.findIndex((chapter) => chapter.id === currentChapter.id);
      const target = state.content.chapters[index + (event.key === 'ArrowRight' ? 1 : -1)];
      if (!target) return;
      event.preventDefault();
      setSearchParams({ chapter: target.id });
    };
    window.addEventListener('keydown', navigateWithKeyboard);
    return () => window.removeEventListener('keydown', navigateWithKeyboard);
  }, [state, currentChapter, setSearchParams]);

  if (state.kind === 'loading') return <LoadingState label="Abrindo a obra..." />;
  if (state.kind === 'unavailable') return <UnavailableBook onRetry={onRetry} />;
  if (state.kind === 'error')
    return (
      <ErrorState
        title="Não foi possível abrir a obra"
        description="Verifique sua conexão e tente novamente."
        onRetry={onRetry}
      />
    );
  if (state.kind !== 'ready') return null;
  const {
    book,
    content: { chapters, lore, acts = [] },
  } = state;
  const index = chapters.findIndex((chapter) => chapter.id === currentChapter?.id);
  const previous = chapters[index - 1];
  const next = chapters[index + 1];
  const selectChapter = (id: string) => {
    setSearchParams({ chapter: id });
  };
  return (
    <>
      <ReaderHeader
        key={`${book.id}-${currentChapter?.id ?? ''}`}
        book={book}
        chapter={currentChapter}
      />
      {!currentChapter ? (
        <EmptyState
          title="Nenhum capítulo publicado"
          description="O autor ainda não disponibilizou capítulos nesta edição."
        />
      ) : (
        <div className={styles.layout}>
          <aside className={styles.sidebar}>
            <nav aria-label="Sumário">
              <h2>Sumário</h2>
              {groupChapters(chapters, acts)
                .filter((group) => group.chapters.length > 0)
                .map((group) => (
                  <section
                    key={group.act?.id ?? 'unassigned'}
                    aria-label={group.act ? 'Ato ' + actName(group.act) : 'Sem ato'}
                  >
                    {acts.length > 0 && (
                      <h3 className={styles.actHeading}>
                        {group.act ? actName(group.act) : 'Sem ato'}
                      </h3>
                    )}
                    <ol className={styles.chapterList}>
                      {group.chapters.map((chapter) => (
                        <li key={chapter.id}>
                          <Link
                            to={publicReadingPath(book.id, chapter.id)}
                            className={styles.chapterLink}
                            aria-current={chapter.id === currentChapter.id ? 'page' : undefined}
                          >
                            {chapter.title}
                          </Link>
                        </li>
                      ))}
                    </ol>
                  </section>
                ))}
            </nav>
          </aside>
          <article className={styles.article} aria-labelledby="reader-chapter-title">
            {currentChapter.actId && (
              <p className={styles.currentAct}>
                Ato {actName(acts.find((act) => act.id === currentChapter.actId)!)}
              </p>
            )}
            <p className={styles.eyebrow}>
              Capítulo {index + 1} de {chapters.length}
            </p>
            <h2
              ref={heading}
              tabIndex={-1}
              id="reader-chapter-title"
              className={styles.chapterTitle}
            >
              {currentChapter.title}
            </h2>
            <div className={styles.prose}>
              {currentChapter.content.trim() ? (
                <ReaderContent
                  key={currentChapter.id}
                  content={currentChapter.content}
                  lore={lore}
                />
              ) : (
                <p>Este capítulo ainda não contém texto.</p>
              )}
            </div>
            <nav className={styles.pagination} aria-label="Navegação de capítulos">
              <Button
                type="button"
                variant="outline"
                disabled={!previous}
                onClick={() => {
                  if (previous) selectChapter(previous.id);
                }}
              >
                <ArrowLeft className="icon icon-sm" aria-hidden="true" /> Anterior
              </Button>
              <span aria-live="polite">
                {index + 1} / {chapters.length}
              </span>
              <Button
                type="button"
                variant="outline"
                disabled={!next}
                onClick={() => {
                  if (next) selectChapter(next.id);
                }}
              >
                Próximo <ArrowRight className="icon icon-sm" aria-hidden="true" />
              </Button>
            </nav>
          </article>
        </div>
      )}
    </>
  );
}

export function ReaderView() {
  const { bookId } = useParams<{ bookId: string }>();
  const [attempt, setAttempt] = useState(0);
  return (
    <div className={styles.reader}>
      <a className={styles.skipLink} href="#reader-chapter-title">
        Pular para o capítulo
      </a>
      {bookId ? (
        <ReaderSession
          key={`${bookId}-${attempt}`}
          bookId={bookId}
          onRetry={() => setAttempt((value) => value + 1)}
        />
      ) : (
        <UnavailableBook />
      )}
    </div>
  );
}
