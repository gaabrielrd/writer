import { useState, useRef, useEffect, type ChangeEvent, type DragEvent } from 'react';
import { CheckSquare, FileText, Square, Upload, X } from 'lucide-react';
import {
  Alert,
  Badge,
  Button,
  Dialog,
  FormSection,
  Input,
  LoadingState,
  Textarea,
} from '@/shared/ui';
import type { Book } from '../model/book';
import * as bookService from '../services/bookService';
import {
  DOCUMENT_EXTENSIONS,
  DOCUMENT_FORMAT_LABEL,
  isSupportedDocument,
  parseDocumentFile,
  type ParsedChapter,
} from '../services/documentParserService';
import styles from './ImportBookModal.module.css';
import {
  mergeImportedChapters,
  splitImportedChapter,
  type ImportWarning,
} from '../model/documentImport';
import { ImportChapterReview } from './ImportChapterReview';

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
  const parseController = useRef<AbortController | null>(null);
  const importRunning = useRef(false);
  const importedBookId = useRef<string | null>(null);
  const savedChapterIds = useRef(new Set<string>());
  const chapterCreationIds = useRef(new Map<string, string>());
  useEffect(() => () => parseController.current?.abort(), [open]);

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
  const [warnings, setWarnings] = useState<ImportWarning[]>([]);
  const [pageCount, setPageCount] = useState<number>();
  const [progress, setProgress] = useState('');
  const [expandedChapter, setExpandedChapter] = useState<string | null>(null);
  const [reviewPage, setReviewPage] = useState(1);
  const [savedCount, setSavedCount] = useState(0);
  const [importStarted, setImportStarted] = useState(false);

  const isCreatingNewBook = !targetBook;

  const handleReset = () => {
    parseController.current?.abort();
    parseController.current = null;
    importedBookId.current = null;
    savedChapterIds.current.clear();
    chapterCreationIds.current.clear();
    setSelectedFile(null);
    setParseError(null);
    setIsParsing(false);
    setIsImporting(false);
    setBookTitle('');
    setBookGenre('');
    setBookSynopsis('');
    setChapters([]);
    setWarnings([]);
    setPageCount(undefined);
    setProgress('');
    setExpandedChapter(null);
    setSavedCount(0);
    setImportStarted(false);
  };

  const handleClose = () => {
    if (isImporting) return;
    handleReset();
    onClose();
  };

  const handleProcessFile = async (file: File) => {
    if (importRunning.current || importedBookId.current) return;
    if (!isSupportedDocument(file.name)) {
      setParseError(`Por favor, selecione um arquivo válido: ${DOCUMENT_FORMAT_LABEL}.`);
      return;
    }

    parseController.current?.abort();
    const controller = new AbortController();
    parseController.current = controller;
    setChapters([]);
    setWarnings([]);
    setPageCount(undefined);
    setExpandedChapter(null);
    setProgress('');
    setSelectedFile(file);
    setIsParsing(true);
    setParseError(null);

    try {
      const result = await parseDocumentFile(file, {
        signal: controller.signal,
        onProgress: (current, total) => {
          if (!controller.signal.aborted) setProgress(`Página ${current} de ${total}`);
        },
      });
      if (controller.signal.aborted) return;
      setBookTitle(result.title);
      setChapters(result.chapters);
      setWarnings(result.warnings ?? []);
      setPageCount(result.pageCount);
    } catch (err) {
      if (controller.signal.aborted) return;
      setParseError(err instanceof Error ? err.message : 'Falha ao processar arquivo');
      setSelectedFile(null);
    } finally {
      if (parseController.current === controller) setIsParsing(false);
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
    if (importRunning.current) return;
    if (selectedChapters.length === 0) return;
    if (isCreatingNewBook && !bookTitle.trim()) return;

    setIsImporting(true);
    importRunning.current = true;
    setParseError(null);

    try {
      let activeBookId = importedBookId.current ?? targetBook?.id ?? '';

      // Se for um novo livro, cria o livro primeiro
      if (isCreatingNewBook && !activeBookId) {
        const newBook = await bookService.createBook(authorId, {
          title: bookTitle.trim(),
          genre: bookGenre.trim() || undefined,
          synopsis: bookSynopsis.trim() || undefined,
        });
        activeBookId = newBook.id;
      }
      importedBookId.current = activeBookId;
      setImportStarted(true);

      // Cria cada capítulo selecionado sequencialmente para manter a ordem
      for (const ch of selectedChapters) {
        if (savedChapterIds.current.has(ch.id)) continue;
        const creationId = chapterCreationIds.current.get(ch.id) ?? crypto.randomUUID();
        chapterCreationIds.current.set(ch.id, creationId);
        await bookService.createChapter(activeBookId, {
          creationId,
          title: ch.title.trim() || 'Capítulo',
          content: ch.content,
        });
        savedChapterIds.current.add(ch.id);
        setSavedCount(savedChapterIds.current.size);
      }

      // Recalcula o wordCount total do livro
      await bookService.recalculateBookWordCount(activeBookId);

      onSuccess(activeBookId);
      handleReset();
      onClose();
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'Falha ao importar capítulos');
    } finally {
      setIsImporting(false);
      importRunning.current = false;
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
      description="Escolha um documento, confira os capítulos e importe quando estiver pronto."
      onClose={handleClose}
      maxWidthClass={expandedChapter && pageCount ? 'max-w-5xl' : 'max-w-2xl'}
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
        {importStarted && !isImporting && (
          <Alert variant="info" title="Capítulos já gravados">
            {savedCount} capítulo(s) confirmado(s). Uma nova tentativa confirma os pedidos pendentes
            e continua pelos capítulos pendentes.
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
              accept={DOCUMENT_EXTENSIONS.join(',')}
              aria-label="Arquivo do manuscrito"
              className={styles.fileInputHidden}
              onChange={handleFileInputChange}
            />
            <Upload className={`icon ${styles.dropzoneIcon}`} aria-hidden="true" />
            <p className={styles.dropzoneTitle}>
              Clique ou arraste um arquivo DOCX, PDF, Markdown, texto ou HTML
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
              disabled={isImporting || importStarted}
              title="Trocar arquivo"
            >
              <X className="icon icon-sm" aria-hidden="true" />
              Trocar
            </Button>
          </div>
        )}

        {/* Etapa 2: Carregando Análise */}
        {isParsing && (
          <div role="status">
            <LoadingState label="Analisando documento e detectando capítulos..." />
            {progress}
          </div>
        )}
        {!isParsing && warnings.length > 0 && (
          <div className={styles.warnings}>
            {warnings.map((warning) => (
              <Alert
                key={`${warning.code}-${warning.message}`}
                variant="warning"
                title="Conferência do PDF"
              >
                <p>{warning.message}</p>
                <div className={styles.pageLinks}>
                  {warning.pages.map((number) => (
                    <Button
                      key={number}
                      variant="ghost"
                      size="sm"
                      disabled={isImporting}
                      onClick={() => {
                        const chapter =
                          chapters.find((chapter) => chapter.sourcePages?.includes(number)) ??
                          chapters[0];
                        if (chapter) {
                          setExpandedChapter(chapter.id);
                          setReviewPage(number);
                        }
                      }}
                    >
                      Página {number}
                    </Button>
                  ))}
                </div>
              </Alert>
            ))}
          </div>
        )}

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
                  disabled={isImporting || importStarted}
                />
                <FormSection
                  title="Sobre a obra"
                  description="Gênero e sinopse · opcionais"
                  disabled={isImporting || importStarted}
                >
                  <Input
                    label="Gênero Literário (opcional)"
                    placeholder="Ex: Fantasia Épica, Ficção Científica"
                    value={bookGenre}
                    onChange={(e) => setBookGenre(e.target.value)}
                    disabled={isImporting || importStarted}
                  />
                  <Textarea
                    label="Sinopse (opcional)"
                    placeholder="Breve descrição da história..."
                    value={bookSynopsis}
                    onChange={(e) => setBookSynopsis(e.target.value)}
                    rows={2}
                    disabled={isImporting || importStarted}
                  />
                </FormSection>
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
                disabled={isImporting || importStarted}
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
                    <div className={styles.chapterCheckboxLabel}>
                      <label className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          aria-label={`Selecionar capítulo ${idx + 1}`}
                          checked={ch.selected}
                          onChange={() => handleToggleChapter(ch.id)}
                          disabled={isImporting || importStarted}
                          className={styles.checkbox}
                        />
                        <span className="font-semibold text-sm text-[hsl(var(--muted-foreground))]">
                          {idx + 1}.
                        </span>
                      </label>
                      <div className={styles.chapterTitleInput}>
                        <Input
                          value={ch.title}
                          aria-label={`Título do capítulo ${idx + 1}`}
                          onChange={(e) => handleChapterTitleChange(ch.id, e.target.value)}
                          disabled={!ch.selected || isImporting || importStarted}
                          placeholder="Título do capítulo"
                        />
                      </div>
                    </div>
                    <Badge variant={ch.selected ? 'highlight' : 'neutral'}>
                      {ch.wordCount.toLocaleString('pt-BR')} palavras
                    </Badge>
                  </div>

                  {ch.preview && <p className={styles.chapterPreview}>{ch.preview}</p>}
                  {ch.sourcePages && (
                    <p className={styles.summaryStats}>
                      Páginas de origem: {ch.sourcePages.join(', ')}
                    </p>
                  )}
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-expanded={expandedChapter === ch.id}
                    aria-controls={`review-${ch.id}`}
                    onClick={() => {
                      setExpandedChapter(expandedChapter === ch.id ? null : ch.id);
                      setReviewPage(ch.sourcePages?.[0] ?? 1);
                    }}
                  >
                    {' '}
                    {expandedChapter === ch.id ? 'Recolher prévia' : 'Conferir conteúdo'}
                  </Button>
                  {expandedChapter === ch.id && selectedFile && (
                    <div id={`review-${ch.id}`}>
                      <ImportChapterReview
                        key={`${ch.id}-${reviewPage}-${ch.blocks?.length}`}
                        chapter={ch}
                        file={selectedFile}
                        pageCount={pageCount}
                        initialPage={reviewPage}
                        disabled={isImporting || importStarted}
                        canMerge={idx < chapters.length - 1}
                        onSplit={(at) => {
                          setChapters((current) =>
                            current.flatMap((chapter) =>
                              chapter.id === ch.id ? splitImportedChapter(chapter, at) : [chapter],
                            ),
                          );
                        }}
                        onMerge={() => {
                          setChapters((current) => {
                            const at = current.findIndex((chapter) => chapter.id === ch.id);
                            const next = current[at + 1];
                            if (!next) return current;
                            return [
                              ...current.slice(0, at),
                              mergeImportedChapters(current[at]!, next),
                              ...current.slice(at + 2),
                            ];
                          });
                        }}
                      />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </Dialog>
  );
}
