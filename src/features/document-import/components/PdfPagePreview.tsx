import { useEffect, useRef, useState } from 'react';
import { Alert, LoadingState } from '@/shared/ui';
import { openPdfPreview } from '../services/pdfDocumentService';
import styles from './DocumentSectionReview.module.css';

export function PdfPagePreview({ file, pageNumber }: { file: File; pageNumber: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [session, setSession] = useState<Awaited<ReturnType<typeof openPdfPreview>> | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let disposed = false;
    let preview: Awaited<ReturnType<typeof openPdfPreview>> | undefined;
    void openPdfPreview(file)
      .then((value) => {
        preview = value;
        if (disposed) void value.destroy();
        else setSession(value);
      })
      .catch((reason: unknown) => {
        if (!disposed) {
          setError(
            reason instanceof Error ? reason.message : 'Não foi possível abrir a página original.',
          );
          setLoading(false);
        }
      });
    return () => {
      disposed = true;
      if (preview) void preview.destroy();
    };
  }, [file]);

  useEffect(() => {
    if (!session || !canvas.current) return;
    const abort = new AbortController();
    // State belongs to this render request, never to a previous page.
    void session
      .render(pageNumber, canvas.current, abort.signal)
      .then(() => {
        if (!abort.signal.aborted) {
          setLoading(false);
          setError('');
        }
      })
      .catch((reason: unknown) => {
        if (!abort.signal.aborted) {
          setError(reason instanceof Error ? reason.message : 'Falha ao renderizar a página.');
          setLoading(false);
        }
      });
    return () => abort.abort();
  }, [session, pageNumber]);

  return (
    <div className={styles.originalPage}>
      {loading && <LoadingState label="Abrindo página original..." />}
      {error && (
        <Alert variant="danger" title="Prévia indisponível">
          {error}
        </Alert>
      )}
      <canvas
        hidden={loading || !!error}
        ref={canvas}
        role="img"
        aria-label={`Página original ${pageNumber} do PDF; o texto importado está na prévia ao lado`}
      />
    </div>
  );
}
