import { sanitizeRichText } from '@/shared/lib/sanitizeRichText';
import type { ExportDocument } from '../model/exportDocument';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** A standalone document: none of the app's toolbars, themes or private lore enter the print tree. */
export function buildPrintDocument(manuscript: ExportDocument): string {
  const chapters = manuscript.chapters
    .map(
      (chapter) =>
        `<section class="chapter"><h2>${escapeHtml(chapter.title)}</h2>${sanitizeRichText(chapter.html)}</section>`,
    )
    .join('');
  return `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'"><title>${escapeHtml(manuscript.title)}</title><style>
    :root { color-scheme: light; }
    body { color: CanvasText; background: Canvas; font: 12pt/1.6 Georgia, serif; overflow-wrap: anywhere; margin: 0 auto; max-width: 170mm; }
    h1 { font-size: 26pt; line-height: 1.2; } h2 { font-size: 20pt; } h3,h4,h5,h6 { line-height: 1.3; }
    h1,h2,h3,h4,h5,h6 { break-after: avoid; } p { orphans: 3; widows: 3; }
    blockquote { margin-inline: 1.5em; font-style: italic; } pre { white-space: pre-wrap; } a { color: inherit; }
    .chapter + .chapter { break-before: page; } .synopsis { white-space: pre-wrap; }
    @page { size: A4; margin: 22mm; }
    @media print { body { max-width: none; } .chapter + .chapter { page-break-before: always; } }
  </style></head><body><main><h1>${escapeHtml(manuscript.title)}</h1>${manuscript.genre ? `<p>${escapeHtml(manuscript.genre)}</p>` : ''}${manuscript.synopsis ? `<p class="synopsis">${escapeHtml(manuscript.synopsis)}</p>` : ''}${chapters}</main></body></html>`;
}

/** Native print offers Save as PDF. The browser, not the app, owns its final save/cancel step. */
export function exportPdf(manuscript: ExportDocument, signal?: AbortSignal): Promise<void> {
  signal?.throwIfAborted();
  return new Promise((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.title = 'Impressão do manuscrito';
    frame.setAttribute('aria-hidden', 'true');
    frame.tabIndex = -1;
    frame.style.cssText =
      'position:fixed;inset:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none';
    let cleanupTimer: ReturnType<typeof setTimeout> | undefined;
    let printWindow: Window | null = null;
    const cleanup = () => {
      clearTimeout(readyTimer);
      clearTimeout(cleanupTimer);
      signal?.removeEventListener('abort', abort);
      printWindow?.removeEventListener('afterprint', cleanup);
      frame.remove();
    };
    const abort = () => {
      cleanup();
      reject(new DOMException('Exportação cancelada.', 'AbortError'));
    };
    signal?.addEventListener('abort', abort, { once: true });
    frame.onload = () => {
      frame.onload = null;
      clearTimeout(readyTimer);
      try {
        signal?.throwIfAborted();
        printWindow = frame.contentWindow;
        if (!printWindow)
          throw new Error('O navegador não disponibilizou a impressão. Tente novamente.');
        printWindow.addEventListener('afterprint', cleanup, { once: true });
        // Some engines omit afterprint; keep the document alive until printing has had time to finish.
        cleanupTimer = setTimeout(cleanup, 300_000);
        printWindow.focus();
        printWindow.print();
        resolve();
      } catch (error) {
        cleanup();
        reject(error instanceof Error ? error : new Error('Não foi possível abrir a impressão.'));
      }
    };
    const readyTimer = setTimeout(() => {
      cleanup();
      reject(new Error('A preparação da impressão demorou demais. Tente novamente.'));
    }, 15_000);
    frame.srcdoc = buildPrintDocument(manuscript);
    document.body.append(frame);
  });
}
