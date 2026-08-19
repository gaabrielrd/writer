import { useState, useRef, type ChangeEvent, type DragEvent } from 'react';
import { CheckSquare, FileText, Square, Upload, X } from 'lucide-react';
import { Alert, Badge, Button, Dialog, Input, LoadingState, Textarea } from '@/shared/ui';
import type { Book } from '../model/book';
import * as bookService from '../services/bookService';
import { parseDocumentFile, type ParsedChapter } from '../services/documentParserService';
import styles from './ImportBookModal.module.css';

export interface ImportBookModalProps {
  open: boolean;
  onClose: () => void;
  targetBook?: Book | null;
  authorId: string;
  onSuccess: (bookId: string) => void;
}

export function ImportBookModal({
  open,
  onClose,
  targetBook,
  authorId,
  onSuccess,
}: ImportBookModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);

  // Metadados do novo livro
  const [bookTitle, setBookTitle] = useState('');
  const [bookGenre, setBookGenre] = useState('');
  const [bookSynopsis, setBookSynopsis] = useState('');

  // Capítulos detectados
  const [chapters, setChapters] = useState<ParsedChapter[]>([]);

  const isCreatingNewBook = !targetBook;

  const handleReset = () => {
    setSelectedFile(null);
    setParseError(null);
    setIsParsing(false);
    setIsImporting(false);
    setBookTitle('');
    setBookGenre('');
    setBookSynopsis('');
    setChapters([]);
  };

  const handleClose = () => {
    if (isImporting) return;
    handleReset();
    onClose();
  };

  const handleProcessFile = async (file: File) => {
    const validExtensions = ['.docx', '.pdf'];
    const fileName = file.name.toLowerCase();
    const isValid = validExtensions.some((ext) => fileName.endsWith(ext));

    if (!isValid) {
      setParseError('Por favor, selecione um arquivo válido no formato .docx ou .pdf.');
      return;
    }

    setSelectedFile(file);
    setIsParsing(true);
    setParseError(null);

    try {
      const result = await parseDocumentFile(file);
      setBookTitle(result.title);
      setChapters(result.chapters);
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Falha ao processar arquivo');
      setSelectedFile(null);
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && files[0]) {
      void handleProcessFile(files[0]);
    }
  };

  const handleDragOver = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0 && files[0]) {
      void handleProcessFile(files[0]);
    }
  };

  const handleToggleChapter = (chapterId: string) => {
    setChapters((prev) =>
      prev.map((ch) => (ch.id === chapterId ? { ...ch, selected: !ch.selected } : ch)),
    );
  };

  const handleToggleAll = () => {
    const allSelected = chapters.every((ch) => ch.selected);
    setChapters((prev) => prev.map((ch) => ({ ...ch, selected: !allSelected })));
  };

  const handleChapterTitleChange = (chapterId: string, newTitle: string) => {
    setChapters((prev) =>
      prev.map((ch) => (ch.id === chapterId ? { ...ch, title: newTitle } : ch)),
    );
  };

  const selectedChapters = chapters.filter((ch) => ch.selected);
  const selectedWordsCount = selectedChapters.reduce((sum, ch) => sum + ch.wordCount, 0);
  const allSelected = chapters.length > 0 && chapters.every((ch) => ch.selected);

  const handleImport = async () => {
    if (selectedChapters.length === 0) return;
    if (isCreatingNewBook && !bookTitle.trim()) return;

    setIsImporting(true);
    setParseError(null);

    try {
      let activeBookId = targetBook ? targetBook.id : '';

      // Se for um novo livro, cria o livro primeiro
      if (isCreatingNewBook) {
        const newBook = await bookService.createBook(authorId, {
          title: bookTitle.trim(),
          genre: bookGenre.trim() || undefined,
          synopsis: bookSynopsis.trim() || undefined,
        });
        activeBookId = newBook.id;
      }

      // Cria cada capítulo selecionado sequencialmente para manter a ordem
      for (const ch of selectedChapters) {
        await bookService.createChapter(activeBookId, {
          title: ch.title.trim() || 'Capítulo',
          content: ch.content,
        });
      }

      // Recalcula o wordCount total do livro
      await bookService.recalculateBookWordCount(activeBookId);

      onSuccess(activeBookId);
      handleClose();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Falha ao importar capítulos');
    } finally {
      setIsImporting(false);
    }
  };

  if (!open) return null;

  const dialogTitle = isCreatingNewBook
    ? 'Importar Livro de Documento'
    : `Importar Capítulos — ${targetBook.title}`;

  return (
    <Dialog
      open={open}
      title={dialogTitle}
      onClose={handleClose}
      maxWidthClass="max-w-2xl"
      footer={
        <div className={styles.footerActions}>
          <Button variant="secondary" onClick={handleClose} disabled={isImporting}>
            Cancelar
          </Button>

          <div className={styles.footerGroup}>
            {selectedFile && !isParsing && (
              <Button
                variant="primary"
                onClick={() => void handleImport()}
                disabled={
                  isImporting ||
                  selectedChapters.length === 0 ||
                  (isCreatingNewBook && !bookTitle.trim())
                }
              >
                <Upload className="icon icon-sm" aria-hidden="true" />
                {isImporting ? 'Importando...' : `Importar ${selectedChapters.length} Capítulo(s)`}
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div className={styles.container}>
        {targetBook && (
          <div className={styles.targetBookBanner}>
            Destino: <strong>{targetBook.title}</strong>
          </div>
        )}

        {parseError && (
          <Alert variant="danger" title="Erro no documento">
            {parseError}
          </Alert>
        )}

        {/* Etapa 1: Seleção de Arquivo */}
        {!selectedFile ? (
          <div
            className={`${styles.dropzone} ${isDragging ? styles.dropzoneActive : ''}`}
            onClick={() => fileInputRef.current?.click()}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') fileInputRef.current?.click();
            }}
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".docx,.pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf"
              className={styles.fileInputHidden}
              onChange={handleFileInputChange}
            />
            <Upload className={`icon ${styles.dropzoneIcon}`} aria-hidden="true" />
            <p className={styles.dropzoneTitle}>
              Clique ou arraste um arquivo <strong>.docx</strong> ou <strong>.pdf</strong>
            </p>
            <p className={styles.dropzoneSubtitle}>
              Os capítulos e conteúdos serão identificados e divididos automaticamente
            </p>
          </div>
        ) : (
          <div className={styles.fileSelectedCard}>
            <div className={styles.fileInfo}>
              <FileText className="icon icon-sm text-[hsl(var(--primary))]" aria-hidden="true" />
              <span className={styles.fileName}>{selectedFile.name}</span>
              <Badge variant="neutral">{(selectedFile.size / 1024).toFixed(1)} KB</Badge>
            </div>
            <Button
              variant="secondary"
              size="sm"
              onClick={handleReset}
              disabled={isParsing || isImporting}
              title="Trocar arquivo"
            >
              <X className="icon icon-sm" aria-hidden="true" />
              Trocar
            </Button>
          </div>
        )}

        {/* Etapa 2: Carregando Análise */}
        {isParsing && <LoadingState label="Analisando documento e detectando capítulos..." />}

        {/* Etapa 3: Revisão e Configuração dos Capítulos */}
        {!isParsing && selectedFile && chapters.length > 0 && (
          <>
            {isCreatingNewBook && (
              <div className={styles.newBookFields}>
                <Input
                  label="Título do Livro"
                  placeholder="Título da nova obra"
                  value={bookTitle}
                  onChange={(e) => setBookTitle(e.target.value)}
                  required
                  disabled={isImporting}
                />
                <Input
                  label="Gênero Literário (opcional)"
                  placeholder="Ex: Fantasia Épica, Ficção Científica"
                  value={bookGenre}
                  onChange={(e) => setBookGenre(e.target.value)}
                  disabled={isImporting}
                />
                <Textarea
                  label="Sinopse (opcional)"
                  placeholder="Breve descrição da história..."
                  value={bookSynopsis}
                  onChange={(e) => setBookSynopsis(e.target.value)}
                  rows={2}
                  disabled={isImporting}
                />
              </div>
            )}

            <div className={styles.summaryToolbar}>
              <div className={styles.summaryText}>
                <strong>{chapters.length}</strong> capítulos encontrados ({selectedChapters.length}{' '}
                selecionados • {selectedWordsCount.toLocaleString('pt-BR')} palavras)
              </div>
              <Button
                variant="secondary"
                size="sm"
                onClick={handleToggleAll}
                disabled={isImporting}
              >
                {allSelected ? (
                  <>
                    <Square className="icon icon-sm" aria-hidden="true" />
                    Desmarcar todos
                  </>
                ) : (
                  <>
                    <CheckSquare className="icon icon-sm" aria-hidden="true" />
                    Selecionar todos
                  </>
                )}
              </Button>
            </div>

            <div className={styles.chaptersList}>
              {chapters.map((ch, idx) => (
                <div
                  key={ch.id}
                  className={`${styles.chapterCard} ${ch.selected ? styles.chapterCardSelected : ''}`}
                >
                  <div className={styles.chapterHeader}>
                    <label className={styles.chapterCheckboxLabel}>
                      <input
                        type="checkbox"
                        checked={ch.selected}
                        onChange={() => handleToggleChapter(ch.id)}
                        disabled={isImporting}
                        className={styles.checkbox}
                      />
                      <span className="font-semibold text-sm text-[hsl(var(--muted-foreground))]">
                        {idx + 1}.
                      </span>
                      <div className={styles.chapterTitleInput}>
                        <Input
                          value={ch.title}
                          onChange={(e) => handleChapterTitleChange(ch.id, e.target.value)}
                          disabled={!ch.selected || isImporting}
                          placeholder="Título do capítulo"
                        />
                      </div>
                    </label>
                    <Badge variant={ch.selected ? 'highlight' : 'neutral'}>
                      {ch.wordCount.toLocaleString('pt-BR')} palavras
                    </Badge>
                  </div>

                  {ch.preview && <p className={styles.chapterPreview}>{ch.preview}</p>}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
