import { useId, useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import {
  ArrowDown,
  ArrowUp,
  Edit2,
  MoreHorizontal,
  PenLine,
  Plus,
  Trash2,
  Upload,
  Search,
  Layers,
} from 'lucide-react';
import {
  Alert,
  Button,
  Dialog,
  Dropdown,
  DropdownItem,
  Input,
  LoadingState,
  EmptyState,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/shared/ui';
import type { Book } from '../model/book';
import type { Chapter } from '../model/chapter';
import { useChapters } from '../hooks/useChapters';
import { useActs } from '../hooks/useActs';
import { actName, filterChapterTitle, groupChapters } from '../model/act';
import {
  moveChaptersToAct,
  deleteChapters,
  MAX_CHAPTER_SELECTION,
} from '../services/chapterOrganizationService';
import styles from './ChapterList.module.css';

export interface ChapterListProps {
  book: Book;
  open: boolean;
  onClose: () => void;
  onChapterCountChanged?: () => void;
  /** Quando 'inline', renderiza sem Dialog. Default: 'dialog'. */
  mode?: 'dialog' | 'inline';
  /** Callback para abrir o modal de importação de documentos (.docx/.pdf) */
  onOpenImport?: () => void;
}

export function ChapterList(props: ChapterListProps) {
  return <ChapterListSession key={props.book.id + ':' + props.open} {...props} />;
}

function ChapterListSession({
  book,
  open,
  onClose,
  onChapterCountChanged,
  mode = 'dialog',
  onOpenImport,
}: ChapterListProps) {
  const navigate = useNavigate();
  const {
    chapters,
    loading: chaptersLoading,
    error: chaptersError,
    createChapter,
    updateChapter,
    refreshChapters,
    reorderChapters,
  } = useChapters(mode === 'inline' ? book.id : open ? book.id : null);

  const actsState = useActs(mode === 'inline' || open ? book.id : null);
  const loading = chaptersLoading || actsState.loading;
  const error = chaptersError || actsState.error;
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [newActName, setNewActName] = useState('');
  const [isActOpen, setIsActOpen] = useState(false);
  const [newActId, setNewActId] = useState('');
  const [bulkAction, setBulkAction] = useState<'move' | 'delete' | null>(null);
  const [bulkSelection, setBulkSelection] = useState<Chapter[]>([]);
  const [destination, setDestination] = useState('');
  const [actionError, setActionError] = useState<string | null>(null);
  const summaryRef = useRef<HTMLDivElement>(null);
  const actTriggerRef = useRef<HTMLButtonElement>(null);
  const chapterTriggerRef = useRef<HTMLButtonElement>(null);
  const groups = groupChapters(chapters, actsState.acts);
  const ordered = groups.flatMap((group) => group.chapters);
  const chapterNumbers = new Map(ordered.map((chapter, index) => [chapter.id, index + 1]));
  const displayed = ordered.filter((chapter) => filterChapterTitle(chapter.title, query));
  const selection = displayed.filter((chapter) => selectedIds.has(chapter.id));
  const selectedCount = selection.length;
  const allSelected = displayed.length > 0 && selectedCount === displayed.length;
  const actOptions = [
    { value: '', label: 'Sem ato' },
    ...actsState.acts.map((act) => ({ value: act.id, label: actName(act) })),
  ];

  const [newTitle, setNewTitle] = useState('');
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [creationError, setCreationError] = useState<string | null>(null);
  const createFormId = useId();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAddChapter = (e: FormEvent) => {
    e.preventDefault();
    if (isProcessing || !newTitle.trim()) return;

    setIsProcessing(true);
    setCreationError(null);
    void (async () => {
      try {
        await createChapter({ title: newTitle.trim(), ...(newActId ? { actId: newActId } : {}) });
        setNewTitle('');
        setIsCreateOpen(false);
        setNewActId('');
        onChapterCountChanged?.();
      } catch (cause) {
        setCreationError(
          cause instanceof Error ? cause.message : 'Não foi possível criar o capítulo.',
        );
      } finally {
        setIsProcessing(false);
      }
    })();
  };

  const handleStartRename = (ch: Chapter) => {
    setEditingId(ch.id);
    setEditingTitle(ch.title);
  };

  const handleSaveRename = (chapterId: string) => {
    if (!editingTitle.trim()) {
      setEditingId(null);
      return;
    }

    setIsProcessing(true);
    void (async () => {
      try {
        await updateChapter(chapterId, { title: editingTitle.trim() });
        setEditingId(null);
        await refreshChapters();
      } catch (cause) {
        setActionError(cause instanceof Error ? cause.message : 'Não foi possível renomear.');
      } finally {
        setIsProcessing(false);
      }
    })();
  };

  const openBulk = (action: 'move' | 'delete', chosen = selection) => {
    setBulkSelection(chosen);
    setActionError(null);
    setDestination('');
    setBulkAction(action);
  };

  const handleMove = (chapter: Chapter, direction: 'up' | 'down') => {
    const siblings = groups.find((group) =>
      group.chapters.some((item) => item.id === chapter.id),
    )!.chapters;
    const index = siblings.findIndex((item) => item.id === chapter.id);
    const target = index + (direction === 'up' ? -1 : 1);
    if (target < 0 || target >= siblings.length || isProcessing) return;
    const next = [...siblings];
    [next[index], next[target]] = [next[target]!, next[index]!];
    setIsProcessing(true);
    void reorderChapters(next.map((item) => item.id))
      .then(refreshChapters)
      .catch((cause: unknown) =>
        setActionError(cause instanceof Error ? cause.message : 'Não foi possível reordenar.'),
      )
      .finally(() => setIsProcessing(false));
  };

  const confirmBulk = async () => {
    if (isProcessing) return;
    setIsProcessing(true);
    setActionError(null);
    try {
      if (bulkAction === 'move')
        await moveChaptersToAct(book.id, bulkSelection, destination || null);
      else await deleteChapters(book.id, bulkSelection);
      setSelectedIds(new Set());
      setBulkAction(null);
      await refreshChapters();
      onChapterCountChanged?.();
    } catch (cause) {
      setActionError(
        cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.',
      );
    } finally {
      setIsProcessing(false);
    }
  };

  const handleCreateAct = async (event: FormEvent) => {
    event.preventDefault();
    if (isProcessing) return;
    setIsProcessing(true);
    setActionError(null);
    try {
      await actsState.create(newActName);
      setNewActName('');
      setIsActOpen(false);
      onChapterCountChanged?.();
    } catch (cause) {
      setActionError(cause instanceof Error ? cause.message : 'Não foi possível criar o ato.');
    } finally {
      setIsProcessing(false);
    }
  };
  const actFormId = useId();

  const totalWords = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

  const closeCreateChapter = () => {
    if (isProcessing) return;
    setIsCreateOpen(false);
    setNewTitle('');
    setNewActId('');
    setCreationError(null);
  };

  const content = (
    <div className={styles.container}>
      <div className={styles.summary} ref={summaryRef} tabIndex={-1}>
        <div className={styles.counts}>
          <span>
            <strong>{chapters.length}</strong> capítulo(s)
          </span>
          <span>
            <strong>{totalWords.toLocaleString('pt-BR')}</strong> palavras
          </span>
        </div>
        <div className={styles.summaryActions}>
          <div className={styles.filterField}>
            <Input
              aria-label="Filtrar capítulos por nome"
              placeholder="Filtrar capítulos"
              leftIcon={<Search className="icon icon-sm" aria-hidden="true" />}
              className={styles.filterInput}
              value={query}
              disabled={isProcessing}
              onChange={(event) => {
                setQuery(event.target.value);
                setSelectedIds(new Set());
              }}
            />
          </div>
          <Button
            size="sm"
            className={styles.newChapterButton}
            ref={chapterTriggerRef}
            aria-label="Novo capítulo"
            disabled={loading || isProcessing}
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="icon icon-sm" aria-hidden="true" />
            <span className={styles.actionLabel}>Novo capítulo</span>
          </Button>
          <Button
            size="sm"
            variant="ghost"
            aria-label="Novo ato"
            ref={actTriggerRef}
            disabled={loading || isProcessing}
            onClick={() => {
              setActionError(null);
              setIsActOpen(true);
            }}
          >
            <Layers className="icon icon-sm" aria-hidden="true" />
            <span className={styles.actionLabel}>Novo ato</span>
          </Button>
          {onOpenImport && (
            <Button variant="secondary" size="sm" onClick={onOpenImport} disabled={isProcessing}>
              <Upload className="icon icon-sm" aria-hidden="true" />
              Importar Arquivo
            </Button>
          )}
        </div>
      </div>

      {error && (
        <Alert variant="danger" title="Erro ao carregar capítulos">
          {error}
          <Button
            variant="secondary"
            onClick={() => {
              void refreshChapters();
              void actsState.refresh();
            }}
          >
            Tentar novamente
          </Button>
        </Alert>
      )}

      {actionError && !bulkAction && !isActOpen && (
        <Alert variant="destructive">{actionError}</Alert>
      )}
      {!loading && selectedCount > 0 && (
        <div className={styles.bulkToolbar} role="group" aria-label="Ações da seleção">
          <span role="status">{selectedCount} selecionado(s)</span>
          <Button
            size="sm"
            variant="secondary"
            disabled={isProcessing}
            onClick={() => openBulk('move')}
          >
            Mover para ato
          </Button>
          <Button
            size="sm"
            variant="destructive"
            disabled={isProcessing}
            onClick={() => openBulk('delete')}
          >
            Excluir seleção
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={isProcessing}
            onClick={() => setSelectedIds(new Set())}
          >
            Limpar seleção
          </Button>
        </div>
      )}
      {loading ? (
        <LoadingState label="Carregando capítulos..." />
      ) : chapters.length === 0 && actsState.acts.length === 0 ? (
        <div className={styles.emptyChapters}>
          <p className="mb-3">
            Nenhum capítulo criado ainda. Use “Novo capítulo” para começar
            {onOpenImport ? ' ou importe um arquivo (.docx / .pdf).' : '.'}
          </p>
          {onOpenImport && (
            <Button variant="secondary" onClick={onOpenImport}>
              <Upload className="icon icon-sm" aria-hidden="true" />
              Importar Manuscrito (.docx, .pdf)
            </Button>
          )}
        </div>
      ) : query.trim() && displayed.length === 0 ? (
        <EmptyState title="Nenhum capítulo encontrado" description="Tente outro nome." />
      ) : (
        <Table className={styles.chapterTable} aria-label="Capítulos">
          <TableHeader>
            <TableRow>
              <TableHead className={styles.selectionCell} scope="col">
                <Input
                  ref={(node) => {
                    if (node) node.indeterminate = selectedCount > 0 && !allSelected;
                  }}
                  type="checkbox"
                  className={styles.checkbox}
                  aria-label="Selecionar todos os capítulos exibidos"
                  checked={allSelected}
                  disabled={isProcessing || displayed.length === 0}
                  onChange={() =>
                    setSelectedIds(
                      allSelected ? new Set() : new Set(displayed.map((chapter) => chapter.id)),
                    )
                  }
                />
              </TableHead>
              <TableHead scope="col">Capítulo</TableHead>
              <TableHead className={styles.wordsCell} scope="col">
                Palavras
              </TableHead>
              <TableHead className={styles.actionsCell} scope="col">
                Ações
              </TableHead>
            </TableRow>
          </TableHeader>
          {groups.map((group) => {
            const visible = group.chapters.filter((chapter) =>
              filterChapterTitle(chapter.title, query),
            );
            if (query.trim() && !visible.length) return null;
            if (!group.act && !visible.length) return null;
            return (
              <TableBody
                key={group.act?.id ?? 'unassigned'}
                aria-label={group.act ? 'Ato ' + actName(group.act) : 'Sem ato'}
              >
                {actsState.acts.length > 0 && (
                  <TableRow className={styles.actRow}>
                    <TableHead colSpan={4} scope="rowgroup">
                      <h3 className={styles.actHeading}>
                        {group.act ? actName(group.act) : 'Sem ato'}
                      </h3>
                    </TableHead>
                  </TableRow>
                )}
                {!visible.length ? (
                  <TableRow>
                    <TableCell colSpan={4} className={styles.emptyAct}>
                      Este ato ainda não tem capítulos.
                    </TableCell>
                  </TableRow>
                ) : (
                  <>
                    {visible.map((ch) => (
                      <TableRow
                        key={ch.id}
                        className={styles.chapterItem}
                        data-state={selectedIds.has(ch.id) ? 'selected' : undefined}
                      >
                        <TableCell className={styles.selectionCell}>
                          <Input
                            type="checkbox"
                            className={styles.checkbox}
                            aria-label={'Selecionar ' + ch.title}
                            checked={selectedIds.has(ch.id)}
                            disabled={isProcessing}
                            onChange={() =>
                              setSelectedIds((previous) => {
                                const next = new Set(previous);
                                if (next.has(ch.id)) next.delete(ch.id);
                                else next.add(ch.id);
                                return next;
                              })
                            }
                          />
                        </TableCell>
                        <TableCell>
                          <div className={styles.chapterInfo}>
                            <span className={styles.chapterOrder}>
                              {chapterNumbers.get(ch.id)}.
                            </span>
                            {editingId === ch.id ? (
                              <div className={styles.renameField}>
                                <Input
                                  label="Título do capítulo"
                                  value={editingTitle}
                                  onChange={(e) => setEditingTitle(e.target.value)}
                                  onBlur={() => handleSaveRename(ch.id)}
                                  onKeyDown={(e) => {
                                    if (e.key === 'Enter') handleSaveRename(ch.id);
                                    if (e.key === 'Escape') setEditingId(null);
                                  }}
                                />
                              </div>
                            ) : (
                              <Button
                                variant="link"
                                className={styles.chapterTitle}
                                title={ch.title}
                                aria-label={`Abrir capítulo ${ch.title}`}
                                onClick={() => void navigate(`/books/${book.id}/editor/${ch.id}`)}
                              >
                                {ch.title}
                              </Button>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className={styles.wordsCell}>
                          <span
                            className={styles.chapterWords}
                            aria-label={`${ch.wordCount.toLocaleString('pt-BR')} palavras`}
                          >
                            {ch.wordCount.toLocaleString('pt-BR')}
                          </span>
                        </TableCell>
                        <TableCell className={styles.actionsCell}>
                          <div className={styles.chapterActions}>
                            <Button
                              variant="ghost"
                              size="icon"
                              className={styles.writeButton}
                              onClick={() => void navigate(`/books/${book.id}/editor/${ch.id}`)}
                              title="Abrir no editor de escrita"
                              aria-label={`Escrever ${ch.title}`}
                            >
                              <PenLine className="icon icon-sm" aria-hidden="true" />
                            </Button>
                            <Dropdown
                              mode="action"
                              label={`Opções de ${ch.title}`}
                              align="end"
                              variant="ghost"
                              iconOnly
                              className={styles.chapterMenuButton}
                              disabled={isProcessing}
                              icon={<MoreHorizontal className="icon icon-sm" aria-hidden="true" />}
                            >
                              <DropdownItem onSelect={() => handleStartRename(ch)}>
                                <Edit2 className="icon icon-sm" aria-hidden="true" />
                                Renomear
                              </DropdownItem>
                              <DropdownItem
                                onSelect={() => handleMove(ch, 'up')}
                                disabled={group.chapters[0]?.id === ch.id}
                              >
                                <ArrowUp className="icon icon-sm" aria-hidden="true" />
                                Mover para cima
                              </DropdownItem>
                              <DropdownItem
                                onSelect={() => handleMove(ch, 'down')}
                                disabled={group.chapters.at(-1)?.id === ch.id}
                              >
                                <ArrowDown className="icon icon-sm" aria-hidden="true" />
                                Mover para baixo
                              </DropdownItem>
                              <DropdownItem
                                onSelect={() => openBulk('delete', [ch])}
                                variant="destructive"
                              >
                                <Trash2 className="icon icon-sm" aria-hidden="true" />
                                Excluir
                              </DropdownItem>
                            </Dropdown>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </>
                )}
              </TableBody>
            );
          })}
        </Table>
      )}
    </div>
  );

  const createDialog = isCreateOpen && (
    <Dialog
      open
      title="Novo capítulo"
      onCloseAutoFocus={(event) => {
        event.preventDefault();
        chapterTriggerRef.current?.focus();
      }}
      description="Dê um título ao capítulo para começar a escrever."
      onClose={closeCreateChapter}
      footer={
        <>
          <Button variant="secondary" onClick={closeCreateChapter} disabled={isProcessing}>
            Cancelar
          </Button>
          <Button type="submit" form={createFormId} disabled={isProcessing || !newTitle.trim()}>
            {isProcessing ? 'Criando...' : 'Criar capítulo'}
          </Button>
        </>
      }
    >
      <form id={createFormId} onSubmit={handleAddChapter}>
        <Input
          label="Título do capítulo"
          placeholder="Ex: Capítulo 1: O Despertar"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          disabled={isProcessing}
        />
        {actsState.acts.length > 0 && (
          <Dropdown
            mode="select"
            label="Ato do capítulo"
            value={newActId}
            onValueChange={setNewActId}
            options={actOptions}
            disabled={isProcessing}
          />
        )}
      </form>
      {creationError && (
        <Alert variant="destructive" title="Não foi possível criar o capítulo">
          {creationError}
        </Alert>
      )}
    </Dialog>
  );

  const organizationDialogs = (
    <>
      {isActOpen && (
        <Dialog
          open
          title="Novo ato"
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            actTriggerRef.current?.focus();
          }}
          description="O nome é opcional. Sem nome, o ato recebe um numeral romano."
          onClose={() => {
            if (!isProcessing) {
              setIsActOpen(false);
              setNewActName('');
              setActionError(null);
            }
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={isProcessing}
                onClick={() => {
                  setIsActOpen(false);
                  setNewActName('');
                  setActionError(null);
                }}
              >
                Cancelar
              </Button>
              <Button type="submit" form={actFormId} disabled={isProcessing}>
                {isProcessing ? 'Criando...' : 'Criar ato'}
              </Button>
            </>
          }
        >
          <form id={actFormId} onSubmit={(event) => void handleCreateAct(event)}>
            <Input
              label="Nome do ato (opcional)"
              value={newActName}
              maxLength={300}
              disabled={isProcessing}
              onChange={(event) => setNewActName(event.target.value)}
            />
          </form>
          {actionError && <Alert variant="destructive">{actionError}</Alert>}
        </Dialog>
      )}
      {bulkAction && (
        <Dialog
          open
          title={bulkAction === 'move' ? 'Mover capítulos para ato' : 'Excluir capítulos'}
          description={
            bulkAction === 'move'
              ? 'Os capítulos serão acrescentados ao final do destino, preservando sua ordem.'
              : 'Esta ação exclui permanentemente o conteúdo dos capítulos selecionados do rascunho.'
          }
          onClose={() => {
            if (!isProcessing) {
              setBulkAction(null);
              setActionError(null);
            }
          }}
          onCloseAutoFocus={(event) => {
            // Successful actions remove the selection toolbar that opened this dialog.
            if (!selectedCount) {
              event.preventDefault();
              summaryRef.current?.focus();
            }
          }}
          footer={
            <>
              <Button
                variant="secondary"
                disabled={isProcessing}
                onClick={() => {
                  setBulkAction(null);
                  setActionError(null);
                }}
              >
                Cancelar
              </Button>
              <Button
                variant={bulkAction === 'delete' ? 'destructive' : 'primary'}
                disabled={isProcessing || bulkSelection.length > MAX_CHAPTER_SELECTION}
                onClick={() => void confirmBulk()}
              >
                {isProcessing
                  ? 'Processando...'
                  : bulkAction === 'move'
                    ? 'Mover capítulos'
                    : 'Excluir capítulos'}
              </Button>
            </>
          }
        >
          <p>{bulkSelection.length} capítulo(s) selecionado(s)</p>
          {book.status === 'published' && (
            <Alert variant="info">
              Para aplicar estas alterações ao leitor público, atualize ou retire a publicação.
            </Alert>
          )}
          <ul className={styles.selectionList}>
            {bulkSelection.map((chapter) => (
              <li key={chapter.id}>{chapter.title}</li>
            ))}
          </ul>
          {bulkAction === 'move' && (
            <Dropdown
              mode="select"
              label="Ato de destino"
              options={actOptions}
              value={destination}
              onValueChange={setDestination}
              disabled={isProcessing}
            />
          )}
          {bulkSelection.length > MAX_CHAPTER_SELECTION && (
            <Alert variant="destructive">
              Selecione no máximo {MAX_CHAPTER_SELECTION} capítulos por operação.
            </Alert>
          )}
          {actionError && (
            <Alert variant="destructive">
              {actionError}
              <Button
                variant="secondary"
                disabled={isProcessing}
                onClick={() => {
                  setBulkAction(null);
                  setActionError(null);
                  setSelectedIds(new Set());
                  void refreshChapters();
                  void actsState.refresh();
                }}
              >
                Atualizar lista
              </Button>
            </Alert>
          )}
        </Dialog>
      )}
    </>
  );

  if (mode === 'inline') {
    return (
      <>
        {content}
        {createDialog}
        {organizationDialogs}
      </>
    );
  }

  return (
    <Dialog
      open={open}
      title={`Capítulos — ${book.title}`}
      onClose={onClose}
      footer={
        <Button variant="secondary" onClick={onClose}>
          Fechar
        </Button>
      }
    >
      {content}
      {createDialog}
      {organizationDialogs}
    </Dialog>
  );
}
