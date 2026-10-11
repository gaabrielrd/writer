import { useId, useState, type FormEvent } from 'react';
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
} from 'lucide-react';
import { Alert, Button, Dialog, Dropdown, DropdownItem, Input, LoadingState } from '@/shared/ui';
import type { Book } from '../model/book';
import type { Chapter } from '../model/chapter';
import { useChapters } from '../hooks/useChapters';
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

export function ChapterList({
  book,
  open,
  onClose,
  onChapterCountChanged,
  mode = 'dialog',
  onOpenImport,
}: ChapterListProps) {
  const navigate = useNavigate();
  const { chapters, loading, error, createChapter, updateChapter, deleteChapter, reorderChapters } =
    useChapters(mode === 'inline' ? book.id : open ? book.id : null);

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
        await createChapter({ title: newTitle.trim() });
        setNewTitle('');
        setIsCreateOpen(false);
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
      } finally {
        setIsProcessing(false);
      }
    })();
  };

  const handleDelete = (chapterId: string) => {
    setIsProcessing(true);
    void (async () => {
      try {
        await deleteChapter(chapterId);
        onChapterCountChanged?.();
      } finally {
        setIsProcessing(false);
      }
    })();
  };

  const handleMove = (index: number, direction: 'up' | 'down') => {
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= chapters.length) return;

    const newOrder = [...chapters];
    const itemA = newOrder[index];
    const itemB = newOrder[targetIndex];
    if (itemA && itemB) {
      newOrder[index] = itemB;
      newOrder[targetIndex] = itemA;
      void reorderChapters(newOrder.map((c) => c.id));
    }
  };

  const totalWords = chapters.reduce((sum, ch) => sum + (ch.wordCount || 0), 0);

  const closeCreateChapter = () => {
    if (isProcessing) return;
    setIsCreateOpen(false);
    setNewTitle('');
    setCreationError(null);
  };

  const content = (
    <div className={styles.container}>
      <div className={styles.summary}>
        <div className={styles.counts}>
          <span>
            <strong>{chapters.length}</strong> capítulo(s)
          </span>
          <span>
            <strong>{totalWords.toLocaleString('pt-BR')}</strong> palavras
          </span>
        </div>
        <div className={styles.summaryActions}>
          <Button
            size="sm"
            className={styles.newChapterButton}
            aria-label="Novo capítulo"
            disabled={loading || isProcessing}
            onClick={() => setIsCreateOpen(true)}
          >
            <Plus className="icon icon-sm" aria-hidden="true" />
            <span className={styles.actionLabel}>Novo capítulo</span>
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
        </Alert>
      )}

      {loading ? (
        <LoadingState label="Carregando capítulos..." />
      ) : chapters.length === 0 ? (
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
      ) : (
        <ol
          className={`${styles.chapterList} ${mode === 'dialog' ? styles.modalList : ''}`}
          aria-label="Capítulos"
        >
          {chapters.map((ch, index) => (
            <li key={ch.id} className={styles.chapterItem}>
              <div className={styles.chapterInfo}>
                <span className={styles.chapterOrder}>{ch.order}.</span>
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
                  <span className={styles.chapterTitle} title={ch.title}>
                    {ch.title}
                  </span>
                )}
              </div>

              <span
                className={styles.chapterWords}
                aria-label={`${ch.wordCount.toLocaleString('pt-BR')} palavras`}
              >
                {ch.wordCount.toLocaleString('pt-BR')}
                <span className={styles.wordsLabel}> palavras</span>
              </span>
              <div className={styles.chapterActions}>
                <Button
                  variant="primary"
                  size="sm"
                  className={styles.writeButton}
                  onClick={() => void navigate(`/books/${book.id}/editor/${ch.id}`)}
                  title="Abrir no editor de escrita"
                  aria-label={`Escrever ${ch.title}`}
                >
                  <PenLine className="icon icon-sm" aria-hidden="true" />
                  <span className={styles.actionLabel}>Escrever</span>
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
                  <DropdownItem onSelect={() => handleMove(index, 'up')} disabled={index === 0}>
                    <ArrowUp className="icon icon-sm" aria-hidden="true" />
                    Mover para cima
                  </DropdownItem>
                  <DropdownItem
                    onSelect={() => handleMove(index, 'down')}
                    disabled={index === chapters.length - 1}
                  >
                    <ArrowDown className="icon icon-sm" aria-hidden="true" />
                    Mover para baixo
                  </DropdownItem>
                  <DropdownItem onSelect={() => handleDelete(ch.id)} variant="destructive">
                    <Trash2 className="icon icon-sm" aria-hidden="true" />
                    Excluir
                  </DropdownItem>
                </Dropdown>
              </div>
            </li>
          ))}
        </ol>
      )}
    </div>
  );

  const createDialog = isCreateOpen && (
    <Dialog
      open
      title="Novo capítulo"
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
      </form>
      {creationError && (
        <Alert variant="destructive" title="Não foi possível criar o capítulo">
          {creationError}
        </Alert>
      )}
    </Dialog>
  );

  if (mode === 'inline') {
    return (
      <>
        {content}
        {createDialog}
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
    </Dialog>
  );
}
