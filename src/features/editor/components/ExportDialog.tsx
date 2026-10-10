import { useEffect, useRef, useState } from 'react';
import { Download, Printer } from 'lucide-react';
import type { Book, Chapter } from '@/features/books';
import { Alert, Button, Dialog, Select } from '@/shared/ui';
import type { ExportFormat, ExportScope } from '../model/exportDocument';
import { exportManuscript } from '../services/exportManuscript';

export interface ExportDialogProps {
  book: Book;
  currentChapter?: Chapter;
  currentContent?: string;
  onClose: () => void;
}

export function ExportDialog({ book, currentChapter, currentContent, onClose }: ExportDialogProps) {
  const [scope, setScope] = useState<ExportScope>(currentChapter ? 'chapter' : 'book');
  const [format, setFormat] = useState<ExportFormat>('markdown');
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const operation = useRef<AbortController | null>(null);
  useEffect(() => () => operation.current?.abort(), []);

  const close = () => {
    operation.current?.abort();
    onClose();
  };

  const startExport = async () => {
    if (operation.current) return;
    const controller = new AbortController();
    operation.current = controller;
    setPending(true);
    setError(null);
    setResult(null);
    try {
      await exportManuscript({
        book,
        scope,
        format,
        currentChapter,
        currentContent,
        signal: controller.signal,
      });
      if (!controller.signal.aborted) {
        setResult(
          format === 'pdf'
            ? 'Impressão aberta. Escolha “Salvar como PDF” no navegador.'
            : 'Arquivo preparado. Confira os downloads do navegador.',
        );
      }
    } catch (failure) {
      if (!controller.signal.aborted)
        setError(
          failure instanceof Error
            ? failure.message
            : 'Não foi possível exportar. Tente novamente.',
        );
    } finally {
      if (!controller.signal.aborted) setPending(false);
      if (operation.current === controller) operation.current = null;
    }
  };

  return (
    <Dialog
      open
      onClose={close}
      title="Exportar manuscrito"
      description={book.title}
      footer={
        <>
          <Button variant="secondary" onClick={close}>
            {pending ? 'Cancelar exportação' : 'Fechar'}
          </Button>
          <Button onClick={() => void startExport()} disabled={pending}>
            {format === 'pdf' ? (
              <Printer className="icon icon-sm" aria-hidden="true" />
            ) : (
              <Download className="icon icon-sm" aria-hidden="true" />
            )}
            {pending ? 'Preparando…' : format === 'pdf' ? 'Abrir impressão' : 'Baixar arquivo'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4" aria-busy={pending}>
        <Select
          label="Conteúdo da exportação"
          value={scope}
          disabled={pending || format === 'json'}
          onChange={(event) => {
            setScope(event.target.value as ExportScope);
            setResult(null);
          }}
          options={[
            ...(currentChapter
              ? [{ value: 'chapter', label: `Capítulo atual: ${currentChapter.title}` }]
              : []),
            { value: 'book', label: 'Livro inteiro' },
          ]}
        />
        <Select
          label="Formato do arquivo"
          value={format}
          disabled={pending}
          onChange={(event) => {
            const next = event.target.value as ExportFormat;
            setFormat(next);
            if (next === 'json') setScope('book');
            setResult(null);
          }}
          options={[
            { value: 'markdown', label: 'Markdown (.md)' },
            { value: 'docx', label: 'Word (.docx)' },
            { value: 'pdf', label: 'PDF (impressão)' },
            { value: 'json', label: 'Backup completo (.json)' },
          ]}
        />
        {format === 'pdf' && (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            O navegador abre uma versão limpa para impressão. Escolha “Salvar como PDF” e desative
            cabeçalhos e rodapés para um manuscrito sem a URL.
          </p>
        )}
        {format === 'json' && (
          <Alert variant="warning" title="Backup privado">
            Inclui todos os capítulos, fichas de lore privadas e relações deste livro. Compartilhe
            somente com pessoas de confiança.
          </Alert>
        )}
        {currentChapter && (
          <p className="text-sm text-[hsl(var(--muted-foreground))]">
            Inclui as alterações atuais deste capítulo, mesmo antes do salvamento.
          </p>
        )}
        {error && (
          <Alert variant="destructive" title="Falha na exportação">
            {error}
          </Alert>
        )}
        {result && (
          <Alert variant="success" role="status">
            {result}
          </Alert>
        )}
      </div>
    </Dialog>
  );
}
