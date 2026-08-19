import { useState, type FormEvent } from 'react';
import { ArrowDown, ArrowUp, Edit2, Plus, Trash2 } from 'lucide-react';
import { Alert, Button, Dialog, Input, LoadingState } from '@vitru/styleguide';
import type { Book } from '../model/book';
import type { Chapter } from '../model/chapter';
import { useChapters } from '../hooks/useChapters';
import styles from './ChapterList.module.css';

export interface ChapterListProps {
  book: Book;
  open: boolean;
  onClose: () => void;
  onChapterCountChanged?: () => void;
}

export function ChapterList({ book, open, onClose, onChapterCountChanged }: ChapterListProps) {
  const { chapters, loading, error, createChapter, updateChapter, deleteChapter, reorderChapters } =
    useChapters(open ? book.id : null);

  const [newTitle, setNewTitle] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);

  const handleAddChapter = (e: FormEvent) => {
    e.preventDefault();
    if (!newTitle.trim()) return;

    setIsProcessing(true);
    void (async () => {
      try {
        await createChapter({ title: newTitle.trim() });
        setNewTitle('');
        onChapterCountChanged?.();
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
      <div className={styles.container}>
        <div className={styles.summary}>
          <span>
            <strong>{chapters.length}</strong> capítulo(s)
          </span>
          <span>
            Total: <strong>{totalWords.toLocaleString('pt-BR')}</strong> palavras
          </span>
        </div>

        {error && (
          <Alert variant="danger" title="Erro ao carregar capítulos">
            {error}
          </Alert>
        )}

        <form onSubmit={handleAddChapter} className={styles.addForm}>
          <div className={styles.addInput}>
            <Input
              label="Novo Capítulo"
              placeholder="Ex: Capítulo 1: O Despertar"
              value={newTitle}
              onChange={(e) => setNewTitle(e.target.value)}
              disabled={isProcessing}
            />
          </div>
          <Button
            type="submit"
            variant="primary"
            disabled={isProcessing || !newTitle.trim()}
            title="Adicionar capítulo"
          >
            <Plus className="icon icon-sm" aria-hidden="true" />
            Adicionar
          </Button>
        </form>

        {loading ? (
          <LoadingState label="Carregando capítulos..." />
        ) : chapters.length === 0 ? (
          <div className={styles.emptyChapters}>
            Nenhum capítulo criado ainda. Adicione o primeiro capítulo acima!
          </div>
        ) : (
          <div className={styles.chapterList}>
            {chapters.map((ch, index) => (
              <div key={ch.id} className={styles.chapterItem}>
                <div className={styles.chapterInfo}>
                  <span className={styles.chapterOrder}>{ch.order}.</span>
                  {editingId === ch.id ? (
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
                  ) : (
                    <span className={styles.chapterTitle}>{ch.title}</span>
                  )}
                  <span className={styles.chapterWords}>
                    ({ch.wordCount.toLocaleString('pt-BR')} palavras)
                  </span>
                </div>

                <div className={styles.chapterActions}>
                  <Button
                    variant="secondary"
                    onClick={() => handleMove(index, 'up')}
                    disabled={index === 0 || isProcessing}
                    title="Mover para cima"
                    aria-label={`Mover ${ch.title} para cima`}
                  >
                    <ArrowUp className="icon icon-sm" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleMove(index, 'down')}
                    disabled={index === chapters.length - 1 || isProcessing}
                    title="Mover para baixo"
                    aria-label={`Mover ${ch.title} para baixo`}
                  >
                    <ArrowDown className="icon icon-sm" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => handleStartRename(ch)}
                    title="Renomear capítulo"
                    aria-label={`Renomear ${ch.title}`}
                  >
                    <Edit2 className="icon icon-sm" aria-hidden="true" />
                  </Button>
                  <Button
                    variant="danger"
                    onClick={() => handleDelete(ch.id)}
                    title="Excluir capítulo"
                    aria-label={`Excluir ${ch.title}`}
                  >
                    <Trash2 className="icon icon-sm" aria-hidden="true" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </Dialog>
  );
}
