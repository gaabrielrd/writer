import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router';
import { ScenePlanner } from '@/features/scenes';
import { PageHeader, Alert, Button, buttonVariants } from '@/shared/ui';
import { renderRichText } from '@/shared/lib';
import type { Book } from '../model/book';
import type { Chapter } from '../model/chapter';
import { getChapter } from '../services/bookService';
import { copyChapterDraft } from '../services/chapterCompositionService';
import styles from './SceneChapterView.module.css';

export function SceneChapterView({
  book,
  chapter,
  legacyDraft,
}: {
  book: Book;
  chapter: Chapter;
  legacyDraft?: string | null;
}) {
  const [current, setCurrent] = useState(chapter);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copyStatus, setCopyStatus] = useState('');
  const generation = useRef(0);
  useEffect(
    () => () => {
      generation.current += 1;
    },
    [],
  );
  const reload = useCallback(() => {
    const request = ++generation.current;
    setLoading(true);
    void getChapter(book.id, chapter.id)
      .then((next) => {
        if (request !== generation.current) return;
        if (!next) throw new Error('O capítulo foi removido. As cenas permanecem no planejamento.');
        setCurrent(next);
        setError('');
      })
      .catch((cause: unknown) => {
        if (request === generation.current)
          setError(
            cause instanceof Error ? cause.message : 'Não foi possível atualizar a composição.',
          );
      })
      .finally(() => {
        if (request === generation.current) setLoading(false);
      });
  }, [book.id, chapter.id]);
  return (
    <div className={styles.page}>
      <PageHeader
        title={chapter.title}
        description={book.title}
        actions={
          <Link
            to={`/books/${encodeURIComponent(book.id)}`}
            className={buttonVariants({ variant: 'secondary' })}
          >
            Voltar ao livro
          </Link>
        }
      />
      <Alert title="Capítulo composto por cenas">
        Escreva em cada cena para atualizar esta composição. Cenas arquivadas e sem capítulo ficam
        fora do manuscrito.
      </Alert>
      {legacyDraft !== undefined && legacyDraft !== null && (
        <details>
          <summary>Rascunho local anterior à conversão</summary>
          <p>
            Este texto não foi confirmado no capítulo antes da conversão. Ele continua preservado
            neste navegador. Compare com as cenas atuais e copie para uma cena se desejar; nenhum
            texto será substituído automaticamente.
          </p>
          <section
            aria-label="Prévia do rascunho anterior"
            className={styles.prose}
            dangerouslySetInnerHTML={{ __html: renderRichText(legacyDraft) }}
          />
          <Button
            variant="secondary"
            onClick={() => {
              void copyChapterDraft(legacyDraft)
                .then(() => setCopyStatus('Texto formatado copiado.'))
                .catch((cause: unknown) =>
                  setCopyStatus(
                    cause instanceof Error
                      ? cause.message
                      : 'Selecione o texto na prévia para copiar.',
                  ),
                );
            }}
          >
            Copiar texto formatado
          </Button>
          {copyStatus && <p role="status">{copyStatus}</p>}
        </details>
      )}
      <section aria-label="Composição do capítulo" className={styles.prose}>
        {loading ? (
          <p role="status">Atualizando composição...</p>
        ) : error ? (
          <Alert variant="destructive" title="Composição indisponível">
            {error}
            <Button variant="secondary" onClick={reload}>
              Tentar novamente
            </Button>
          </Alert>
        ) : current.content ? (
          <div dangerouslySetInnerHTML={{ __html: renderRichText(current.content) }} />
        ) : (
          <p>O capítulo ainda não tem texto de cenas ativas.</p>
        )}
      </section>
      <ScenePlanner
        target={{ kind: 'book', id: book.id }}
        projectTitle={book.title}
        initialParentId={chapter.id}
        onManuscriptChange={reload}
      />
    </div>
  );
}
