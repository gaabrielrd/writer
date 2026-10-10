import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createExportDocument } from '../model/exportDocument';
import { buildPrintDocument, exportPdf } from '../services/exportPdf';
import { downloadExport } from '../services/downloadExport';
import { exportBook, exportChapter } from './exportFixtures';

const manuscript = createExportDocument(exportBook, [exportChapter]);

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
  document.querySelectorAll('iframe').forEach((frame) => frame.remove());
});

function getFrame(): HTMLIFrameElement {
  const frame = document.querySelector('iframe');
  if (!frame) throw new Error('Missing print frame');
  return frame;
}

function readyFrame(print = vi.fn()) {
  const frame = getFrame();
  const target = frame.contentWindow;
  if (!target) throw new Error('Missing print window');
  vi.spyOn(target, 'focus').mockImplementation(() => {});
  vi.spyOn(target, 'print').mockImplementation(print);
  frame.dispatchEvent(new Event('load'));
  return { frame, target, print };
}

describe('clean PDF printing', () => {
  it('builds a clean standalone print document with safe content and chapter page breaks', () => {
    const html = buildPrintDocument({
      ...manuscript,
      title: '</title><script>bad()</script>',
      chapters: [
        {
          title: '<img src=x>',
          html: '<p onclick="bad()">Seguro<script>bad()</script><a href="javascript:bad()">texto</a><img src="https://tracker"></p>',
          blocks: [],
        },
      ],
    });
    const dom = new DOMParser().parseFromString(html, 'text/html');
    expect(dom.querySelector('script')).toBeNull();
    expect(dom.querySelector('img')).toBeNull();
    expect(dom.querySelector('[onclick]')).toBeNull();
    expect(dom.body.textContent).toContain('Segurotexto');
    expect(dom.querySelector('style')?.textContent).toContain('@media print');
    expect(dom.querySelector('style')?.textContent).toContain('break-before: page');
    expect(
      dom.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content'),
    ).toContain("default-src 'none'");
    expect(dom.querySelector('button')).toBeNull();
    expect(html).not.toContain(exportBook.authorId);
    const minimal = buildPrintDocument({ ...manuscript, genre: '', synopsis: '' });
    expect(minimal).not.toContain('<p class="synopsis">');
  });

  it('prints only its isolated document and cleans up after the native dialog', async () => {
    const pending = exportPdf(manuscript);
    const { frame, target, print } = readyFrame();
    await pending;
    expect(print).toHaveBeenCalledOnce();
    expect(frame.srcdoc).toContain(exportChapter.title);
    expect(frame.getAttribute('aria-hidden')).toBe('true');
    target.dispatchEvent(new Event('afterprint'));
    expect(document.querySelector('iframe')).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('cleans up when the browser omits afterprint', async () => {
    const pending = exportPdf(manuscript);
    readyFrame();
    await pending;
    vi.advanceTimersByTime(300_000);
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('rejects and cleans up failed printing, timeout, cancellation and unavailable window', async () => {
    const failed = exportPdf(manuscript);
    readyFrame(
      vi.fn(() => {
        throw new Error('Impressão indisponível');
      }),
    );
    await expect(failed).rejects.toThrow('Impressão indisponível');
    expect(document.querySelector('iframe')).toBeNull();
    const timedOut = exportPdf(manuscript);
    vi.advanceTimersByTime(15_000);
    await expect(timedOut).rejects.toThrow('demorou demais');
    const controller = new AbortController();
    const canceled = exportPdf(manuscript, controller.signal);
    controller.abort();
    await expect(canceled).rejects.toMatchObject({ name: 'AbortError' });
    expect(() => exportPdf(manuscript, controller.signal)).toThrow();
    const missingWindow = exportPdf(manuscript);
    const frame = getFrame();
    vi.spyOn(frame, 'contentWindow', 'get').mockReturnValue(null);
    frame.dispatchEvent(new Event('load'));
    await expect(missingWindow).rejects.toThrow('não disponibilizou');
    expect(document.querySelector('iframe')).toBeNull();
  });

  it('normalizes non-Error printing failures', async () => {
    const pending = exportPdf(manuscript);
    readyFrame(
      vi.fn(() => {
        // eslint-disable-next-line @typescript-eslint/only-throw-error -- malformed browser APIs can throw non-Error values
        throw 'unknown';
      }),
    );
    await expect(pending).rejects.toThrow('Não foi possível abrir a impressão');
  });
});

describe('browser downloads', () => {
  it('clicks a temporary download link and revokes its URL after the browser consumes it', () => {
    const createObjectURL = vi.fn(() => 'blob:export');
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL, revokeObjectURL });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
      this: HTMLAnchorElement,
    ) {
      expect(this.download).toBe('manuscrito.md');
      expect(this.href).toBe('blob:export');
      expect(this.isConnected).toBe(true);
    });
    const blob = new Blob(['texto']);
    downloadExport(blob, 'manuscrito.md');
    expect(createObjectURL).toHaveBeenCalledWith(blob);
    expect(click).toHaveBeenCalledOnce();
    expect(document.querySelector('a[download]')).toBeNull();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:export');
  });

  it('cleans up even if the browser rejects the download', () => {
    const revokeObjectURL = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: vi.fn(() => 'blob:export'), revokeObjectURL });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {
      throw new Error('Download blocked');
    });
    expect(() => downloadExport(new Blob(), 'file.md')).toThrow('Download blocked');
    expect(document.querySelector('a[download]')).toBeNull();
    vi.advanceTimersByTime(1_000);
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });
});
