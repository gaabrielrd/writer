import { useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  BookOpen,
  Eye,
  LayoutGrid,
  List,
  MapPin,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  User,
  X,
} from 'lucide-react';
import { Button, EmptyState, ErrorState, Input, LoadingState } from '@/shared/ui';
import { useBookLoreActor } from '../hooks/useBookLoreActor';
import { useBookLoreCollection } from '../hooks/useBookLoreCollection';
import type { LoreCategory, LoreMentionEntity } from '../model/loreEntity';
import type { BookLorePresentation } from '../model/bookLorePresentation';
import { LoreEntityCard } from './LoreEntityCard';
import { LoreEntityList } from './LoreEntityList';
import { BookLoreWorkspaceDialog, type BookLoreWorkspaceMode } from './BookLoreWorkspaceDialog';
import styles from './LorePage.module.css';

export interface BookLoreCollectionProps {
  bookId: string;
  active?: boolean;
  relatedEntities?: readonly LoreMentionEntity[];
  actionsContainer?: HTMLElement | null;
  onEntitiesChanged?: () => void;
  onBusyChange?: (busy: boolean) => void;
}
/** Book compendium entries share native C1 and protected operations. */
export function BookLoreCollection(props: BookLoreCollectionProps) {
  const actor = useBookLoreActor();
  return actor !== null && props.active !== false ? (
    <Content key={JSON.stringify([actor, props.bookId])} {...props} />
  ) : null;
}
const tabs: { value: LoreCategory | 'all'; label: string; icon: typeof Tag }[] = [
  { value: 'all', label: 'Todos', icon: Tag },
  { value: 'character', label: 'Personagens', icon: User },
  { value: 'location', label: 'Locais', icon: MapPin },
  { value: 'concept', label: 'Conceitos / Itens', icon: BookOpen },
  { value: 'other', label: 'Outros', icon: Tag },
];
function Content({
  bookId,
  relatedEntities = [],
  actionsContainer,
  onEntitiesChanged,
  onBusyChange,
}: BookLoreCollectionProps) {
  const { rows, loading, error, refresh } = useBookLoreCollection(bookId),
    [query, setQuery] = useState(''),
    [category, setCategory] = useState<LoreCategory | 'all'>('all'),
    [view, setView] = useState<'grid' | 'list'>('grid'),
    [mode, setMode] = useState<BookLoreWorkspaceMode | null>(null),
    [result, setResult] = useState(''),
    [selection, setSelection] = useState({ rows, ids: new Set<string>() }),
    selectAllRef = useRef<HTMLInputElement | null>(null),
    listRef = useRef<HTMLButtonElement>(null),
    returnFocus = useRef<HTMLElement | null>(null);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter(
      (e) =>
        (category === 'all' || e.category === category) &&
        (!q || [e.name, ...e.aliases, e.summary].some((t) => t.toLowerCase().includes(q))),
    );
  }, [rows, query, category]);
  if (selection.rows !== rows) {
    const present = new Set(filtered.map((e) => e.id));
    setSelection({ rows, ids: new Set([...selection.ids].filter((id) => present.has(id))) });
  }
  const selected = filtered.filter((e) => selection.ids.has(e.id)),
    locked = mode !== null,
    entities = useMemo(() => [...rows, ...relatedEntities], [rows, relatedEntities]);
  useEffect(() => {
    onBusyChange?.(locked);
    return () => onBusyChange?.(false);
  }, [locked, onBusyChange]);
  const clear = () => setSelection({ rows, ids: new Set() });
  const open = (next: BookLoreWorkspaceMode) => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;
    setResult('');
    setMode(next);
  };
  const close = () => {
    setMode(null);
    requestAnimationFrame(() => {
      const target = returnFocus.current;
      if (target?.isConnected && !target.hasAttribute('disabled')) target.focus();
      else (selectAllRef.current ?? listRef.current)?.focus();
    });
  };
  const completed = (ids: readonly string[], message: string) => {
    setSelection((s) => ({ ...s, ids: new Set([...s.ids].filter((id) => !ids.includes(id))) }));
    setResult(message);
    onEntitiesChanged?.();
    void refresh();
  };
  const edit = (e: BookLorePresentation) => open({ kind: 'edit', loreId: e.id }),
    remove = (id: string) => {
      const e = rows.find((e) => e.id === id);
      if (e) open({ kind: 'remove', loreId: e.id, sourceToken: e.sourceToken, name: e.name });
    },
    targets = () =>
      Object.freeze(
        selected.map((e) => Object.freeze({ loreId: e.id, sourceToken: e.sourceToken })),
      );
  const controls = (
    <div className={styles.loreTabHeader}>
      <div className={styles.viewSwitch} role="group" aria-label="Visualização do compêndio">
        <Button
          ref={listRef}
          variant="ghost"
          size="sm"
          aria-label="Visualização em lista"
          aria-pressed={view === 'list'}
          disabled={locked}
          onClick={() => {
            clear();
            setView('list');
          }}
        >
          <List className="icon icon-sm" aria-hidden="true" />
          Lista
        </Button>
        <Button
          variant="ghost"
          size="sm"
          aria-label="Visualização em grid"
          aria-pressed={view === 'grid'}
          disabled={locked}
          onClick={() => {
            clear();
            setView('grid');
          }}
        >
          <LayoutGrid className="icon icon-sm" aria-hidden="true" />
          Grid
        </Button>
      </div>
      <Button variant="secondary" disabled={locked} onClick={() => open({ kind: 'recoveries' })}>
        <RotateCcw className="icon icon-sm" aria-hidden="true" />
        Retomadas
      </Button>
      <Button variant="primary" disabled={locked} onClick={() => open({ kind: 'create' })}>
        <Plus className="icon icon-sm" aria-hidden="true" />
        Nova Entidade
      </Button>
    </div>
  );
  return (
    <div className={`${styles.loreTabContainer} ${selected.length ? styles.withSelection : ''}`}>
      {actionsContainer ? createPortal(controls, actionsContainer) : controls}
      {result && <p role="status">{result}</p>}
      <div className={styles.filterSection}>
        <div className={styles.searchBar}>
          <Input
            aria-label="Buscar no compêndio"
            leftIcon={<Search className="icon icon-sm" aria-hidden="true" />}
            placeholder="Buscar por nome, apelido ou resumo..."
            value={query}
            disabled={locked || loading}
            onChange={(e) => {
              clear();
              setQuery(e.target.value);
            }}
          />
        </div>
        <div className={styles.tabsRow} role="tablist" aria-label="Categorias do compêndio">
          {tabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <Button
                key={tab.value}
                variant="ghost"
                size="sm"
                role="tab"
                aria-selected={category === tab.value}
                disabled={locked || loading}
                className={`${styles.tabButton} ${category === tab.value ? styles.tabActive : ''}`}
                onClick={() => {
                  clear();
                  setCategory(tab.value);
                }}
              >
                <Icon className="icon icon-sm" aria-hidden="true" />
                <span>{tab.label}</span>
                <span className={styles.tabCount}>
                  {tab.value === 'all'
                    ? rows.length
                    : rows.filter((e) => e.category === tab.value).length}
                </span>
              </Button>
            );
          })}
        </div>
        <Button
          variant="secondary"
          size="sm"
          disabled={locked || loading}
          onClick={() => void refresh()}
        >
          Atualizar compêndio
        </Button>
      </div>
      {loading ? (
        <LoadingState label="Carregando compêndio de lore..." />
      ) : error ? (
        <ErrorState
          title="Não foi possível carregar o compêndio"
          description={error}
          action={<Button onClick={() => void refresh()}>Tentar novamente</Button>}
        />
      ) : rows.length === 0 ? (
        <EmptyState
          title="Nenhuma entidade cadastrada"
          description="Cadastre personagens, locais e conceitos para este livro."
          action={
            <Button disabled={locked} onClick={() => open({ kind: 'create' })}>
              Cadastrar Primeira Entidade
            </Button>
          }
        />
      ) : !filtered.length ? (
        <EmptyState
          title="Nenhuma entidade encontrada"
          description="Nenhuma entidade corresponde aos termos da busca ou aos filtros selecionados."
          action={
            <Button
              disabled={locked}
              onClick={() => {
                clear();
                setQuery('');
                setCategory('all');
              }}
            >
              Limpar filtros
            </Button>
          }
        />
      ) : view === 'list' ? (
        <LoreEntityList
          entities={filtered}
          selectedIds={selection.ids}
          disabled={locked}
          selectAllRef={(e) => {
            selectAllRef.current = e;
          }}
          onSelect={(id) => {
            const ids = new Set(selection.ids);
            if (ids.has(id)) ids.delete(id);
            else ids.add(id);
            setSelection({ rows, ids });
            setResult('');
          }}
          onSelectAll={() => {
            setSelection({
              rows,
              ids:
                selected.length === filtered.length
                  ? new Set()
                  : new Set(filtered.map((e) => e.id)),
            });
            setResult('');
          }}
          onView={(entity) => open({ kind: 'read', entity })}
          onEdit={edit}
          onDelete={remove}
        />
      ) : (
        <div className={styles.grid}>
          {filtered.map((entity) => (
            <LoreEntityCard
              key={entity.id}
              entity={entity}
              disabled={locked}
              onView={(entity) => open({ kind: 'read', entity })}
              onEdit={edit}
              onDelete={remove}
            />
          ))}
        </div>
      )}
      {selected.length > 0 &&
        !loading &&
        !error &&
        createPortal(
          <div className={styles.bulkBar} role="region" aria-label="Ações da seleção">
            <span role="status">
              {selected.length} {selected.length === 1 ? 'selecionada' : 'selecionadas'}
            </span>
            <div className={styles.bulkButtons}>
              <Button
                variant="secondary"
                size="sm"
                disabled={locked}
                onClick={() => open({ kind: 'choose-visibility', targets: targets() })}
              >
                <Eye className="icon icon-sm" aria-hidden="true" />
                Alterar visibilidade
              </Button>
              <Button
                variant="danger"
                size="sm"
                disabled={locked}
                onClick={() => open({ kind: 'remove-selection', targets: targets() })}
              >
                <Trash2 className="icon icon-sm" aria-hidden="true" />
                Excluir
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Limpar seleção"
                disabled={locked}
                onClick={clear}
              >
                <X className="icon icon-sm" aria-hidden="true" />
              </Button>
            </div>
          </div>,
          document.body,
        )}
      {mode && (
        <BookLoreWorkspaceDialog
          mode={mode}
          bookId={bookId}
          entities={entities}
          onMode={setMode}
          onClose={close}
          onCompleted={completed}
        />
      )}
    </div>
  );
}
