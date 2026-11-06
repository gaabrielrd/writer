import { useEffect, useRef, useState } from 'react';
import { Button, Dropdown, ErrorState, EmptyState, LoadingState } from '@/shared/ui';
import { literaryImpactNodeKey } from '../../../../functions/src/literaryImpactProtocol.mjs';
import type { ImpactIntent, LiteraryImpactNode } from '../model/impact';
import type { LiteraryReferenceKind } from '../model/planning';
import {
  listLiteraryVolumeBooks,
  listLiteraryPlans,
  listLiteraryReferences,
} from '../services/literaryPlanningService';
import styles from './EditorialContractPanel.module.css';
export interface ImpactSelection {
  intent: ImpactIntent;
  labels: string[];
  bookLabels: string[];
}
type Choice = { node: LiteraryImpactNode; label: string };
export function LiteraryImpactScopeFields({
  bookId,
  disabled,
  onReview,
  onDirtyChange,
}: {
  bookId: string;
  disabled: boolean;
  onReview: (selection: ImpactSelection) => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const [books, setBooks] = useState([{ id: bookId, title: 'Este livro' }]);
  const [selected, setSelected] = useState([bookId]),
    [sourceBook, setSourceBook] = useState(bookId);
  const [sources, setSources] = useState<Choice[]>([
    { node: { kind: 'book', id: bookId, scopeKind: 'book', scopeId: bookId }, label: 'Este livro' },
  ]);
  const [prepare, setPrepare] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const [after, setAfter] = useState<string | null>(null),
    [loaded, setLoaded] = useState(false);
  const alive = useRef(false),
    working = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  async function loadBooks() {
    if (working.current) return;
    working.current = true;
    setLoading(true);
    setError('');
    try {
      const result = await listLiteraryVolumeBooks(bookId, after);
      if (!alive.current) return;
      setBooks((current) => [
        ...new Map([...current, ...result.items].map((item) => [item.id, item])).values(),
      ]);
      setAfter(result.nextAfterId);
      setLoaded(true);
    } catch (cause) {
      if (alive.current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível consultar os livros.');
    } finally {
      working.current = false;
      if (alive.current) setLoading(false);
    }
  }
  const changed = () => onDirtyChange(true);
  return (
    <div className={styles.decisionForm}>
      <h4>Escopo do mapa de impacto</h4>
      <p>
        Escolha os livros examinados e as fontes cuja alteração deseja investigar. Retire as fontes
        de um livro antes de removê-lo da seleção. Vínculos fora da seleção aparecerão como lacunas.
      </p>
      <div className={styles.actions}>
        {books.map((book) => (
          <Button
            className={styles.sequenceAction}
            key={book.id}
            variant={selected.includes(book.id) ? 'primary' : 'outline'}
            aria-pressed={selected.includes(book.id)}
            disabled={
              disabled ||
              book.id === bookId ||
              (selected.includes(book.id) &&
                sources.some(
                  (source) => source.node.scopeKind === 'book' && source.node.scopeId === book.id,
                ))
            }
            onClick={() => {
              changed();
              if (selected.includes(book.id) && sourceBook === book.id) setSourceBook(bookId);
              setSelected(
                selected.includes(book.id)
                  ? selected.filter((id) => id !== book.id)
                  : [...selected, book.id],
              );
            }}
          >
            {book.title}
          </Button>
        ))}
      </div>
      {(!loaded || after) && (
        <Button
          className={styles.sequenceAction}
          variant="outline"
          disabled={disabled || loading}
          onClick={() => void loadBooks()}
        >
          {loaded ? 'Mais livros' : 'Consultar outros livros'}
        </Button>
      )}
      {loading && <LoadingState label="Consultando livros disponíveis…" />}
      {error && <ErrorState message={error} />}
      <Dropdown
        mode="select"
        label="Livro da fonte"
        value={sourceBook}
        options={books
          .filter((book) => selected.includes(book.id))
          .map((book) => ({ value: book.id, label: book.title }))}
        disabled={disabled}
        onValueChange={(value) => setSourceBook(String(value))}
      />
      <ImpactSourceChoices
        key={sourceBook}
        bookId={sourceBook}
        bookLabel={books.find((book) => book.id === sourceBook)?.title ?? 'Livro selecionado'}
        disabled={disabled || !selected.includes(sourceBook) || sources.length >= 16}
        onAdd={(choice) => {
          changed();
          setSources((current) =>
            current.some(
              (item) => literaryImpactNodeKey(item.node) === literaryImpactNodeKey(choice.node),
            )
              ? current
              : [...current, choice],
          );
        }}
      />
      {sources.length ? (
        <ul>
          {sources.map((choice) => (
            <li key={literaryImpactNodeKey(choice.node)}>
              <span className={styles.contextText}>{choice.label}</span>{' '}
              <Button
                className={styles.sequenceAction}
                variant="ghost"
                disabled={disabled}
                aria-label={'Remover fonte ' + choice.label}
                onClick={() => {
                  changed();
                  setSources(sources.filter((item) => item !== choice));
                }}
              >
                Remover
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyState
          title="Nenhuma fonte selecionada"
          description="Adicione pelo menos uma fonte para investigar sua influência."
        />
      )}
      <Dropdown
        mode="select"
        label="Índices antigos do guia de leitura"
        value={prepare ? 'prepare' : 'observe'}
        options={[
          { value: 'observe', label: 'Somente consultar; manter índices ausentes como lacunas' },
          { value: 'prepare', label: 'Autorizar preparação dos índices ausentes' },
        ]}
        disabled={disabled}
        onValueChange={(value) => {
          changed();
          setPrepare(value === 'prepare');
        }}
      />
      <p>
        A preparação grava índices privados a partir das versões existentes do guia antes de
        congelar o mapa. O mapa não aprova a leitura ou a publicação.
      </p>
      <Button
        className={styles.sequenceAction}
        disabled={disabled || sources.length === 0}
        onClick={() =>
          onReview({
            intent: {
              bookIds: selected,
              sources: sources.map((source) => source.node),
              prepareIndices: prepare,
            },
            labels: sources.map((source) => source.label),
            bookLabels: books
              .filter((book) => selected.includes(book.id))
              .map((book) => book.title),
          })
        }
      >
        Conferir escopo
      </Button>
    </div>
  );
}
function ImpactSourceChoices({
  bookId,
  bookLabel,
  disabled,
  onAdd,
}: {
  bookId: string;
  bookLabel: string;
  disabled: boolean;
  onAdd: (choice: Choice) => void;
}) {
  type Kind = 'book' | 'contract' | 'plan' | Exclude<LiteraryReferenceKind, 'volumeUnit'>;
  const [kind, setKind] = useState<Kind>('book'),
    [items, setItems] = useState<Choice[]>([]),
    [after, setAfter] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState('');
  const epoch = useRef(0),
    alive = useRef(false),
    working = useRef(false);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
      epoch.current++;
    };
  }, []);
  async function load() {
    if (working.current) return;
    const own = epoch.current;
    working.current = true;
    setLoading(true);
    setError('');
    try {
      let choices: Choice[], next: string | null;
      if (kind === 'plan') {
        const result = await listLiteraryPlans(bookId, after);
        choices = result.items.map((item) => ({
          node: { kind: 'plan', id: item.id, scopeKind: 'book', scopeId: bookId },
          label: item.title + ' · ' + bookLabel,
        }));
        next = result.nextAfterId;
      } else if (kind === 'book' || kind === 'contract') {
        choices = [];
        next = null;
      } else {
        const result = await listLiteraryReferences(bookId, kind, after);
        choices = result.items
          .filter((item) => item.reference.scopeId !== null)
          .map((item) => ({
            node: {
              kind,
              id: item.reference.id,
              scopeKind: kind === 'globalLore' ? 'universe' : 'book',
              scopeId: item.reference.scopeId!,
            },
            label: item.label + ' · ' + bookLabel,
          }));
        next = result.nextAfterId;
      }
      if (!alive.current || own !== epoch.current) return;
      setItems((current) => [
        ...new Map(
          [...current, ...choices].map((item) => [literaryImpactNodeKey(item.node), item]),
        ).values(),
      ]);
      setAfter(next);
      setLoaded(true);
    } catch (cause) {
      if (alive.current && own === epoch.current)
        setError(cause instanceof Error ? cause.message : 'Não foi possível consultar as fontes.');
    } finally {
      working.current = false;
      if (alive.current && own === epoch.current) setLoading(false);
    }
  }
  return (
    <div className={styles.panel}>
      <Dropdown
        mode="select"
        label="Tipo de fonte"
        value={kind}
        disabled={disabled || loading}
        options={[
          { value: 'book', label: 'Livro' },
          { value: 'contract', label: 'Contrato e guia editorial' },
          { value: 'plan', label: 'Ficha de planejamento' },
          { value: 'act', label: 'Ato' },
          { value: 'chapter', label: 'Capítulo' },
          { value: 'scene', label: 'Cena' },
          { value: 'arc', label: 'Arco' },
          { value: 'event', label: 'Evento' },
          { value: 'localLore', label: 'Compêndio do livro' },
          { value: 'globalLore', label: 'Compêndio do universo' },
        ]}
        onValueChange={(value) => {
          epoch.current++;
          setKind(value as Kind);
          setItems([]);
          setAfter(null);
          setLoaded(false);
          setError('');
        }}
      />
      {kind === 'book' || kind === 'contract' ? (
        <Button
          className={styles.sequenceAction}
          variant="outline"
          disabled={disabled}
          onClick={() =>
            onAdd({
              node: {
                kind,
                id: kind === 'book' ? bookId : 'current',
                scopeKind: 'book',
                scopeId: bookId,
              },
              label: kind === 'book' ? bookLabel : 'Contrato e guia editorial · ' + bookLabel,
            })
          }
        >
          Adicionar fonte
        </Button>
      ) : (
        <>
          {(!loaded || after) && (
            <Button
              className={styles.sequenceAction}
              variant="outline"
              disabled={disabled || loading}
              onClick={() => void load()}
            >
              {loaded ? 'Mais fontes' : 'Consultar fontes'}
            </Button>
          )}
          {items.map((choice) => (
            <Button
              className={styles.sourceButton}
              key={literaryImpactNodeKey(choice.node)}
              variant="outline"
              disabled={disabled}
              onClick={() => onAdd(choice)}
            >
              {choice.label}
            </Button>
          ))}
          {loaded && items.length === 0 && <EmptyState title="Nenhuma fonte disponível" />}
        </>
      )}
      {loading && <LoadingState label="Consultando fontes…" />}
      {error && <ErrorState message={error} />}
    </div>
  );
}
