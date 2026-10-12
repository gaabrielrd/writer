import { beforeEach, describe, expect, it, vi } from 'vitest';
import * as pdfjs from 'pdfjs-dist';
import { openPdfPreview, parsePdfFile, parsePdfLayout } from '../services/pdfDocumentService';

vi.mock('pdfjs-dist', () => ({
  getDocument: vi.fn(),
  GlobalWorkerOptions: { workerSrc: '' },
  OPS: {
    save: 1,
    restore: 2,
    transform: 3,
    setFillRGBColor: 4,
    constructPath: 5,
    fill: 6,
    eoFill: 7,
    fillStroke: 8,
    paintImageXObject: 9,
    paintInlineImageXObject: 10,
    paintImageMaskXObject: 11,
  },
}));

function file() {
  const value = new File([], 'aventura.pdf');
  Object.defineProperty(value, 'arrayBuffer', { value: () => Promise.resolve(new ArrayBuffer(1)) });
  return value;
}
function fakePage() {
  return {
    getTextContent: vi.fn().mockResolvedValue({
      items: [
        {
          str: 'Capítulo 1',
          transform: [24, 0, 0, 24, 40, 720],
          height: 24,
          width: 120,
          fontName: 'title',
        },
        {
          str: 'Texto aos jogadores.',
          transform: [12, 0, 0, 12, 50, 630],
          height: 12,
          width: 200,
          fontName: 'body',
        },
      ],
    }),
    getViewport: vi
      .fn()
      .mockReturnValue({ width: 600, height: 800, transform: [1, 0, 0, -1, 0, 800] }),
    getOperatorList: vi.fn().mockResolvedValue({
      fnArray: [1, 3, 4, 5, 2, 9],
      argsArray: [null, [1, 0, 0, 1, 10, 10], ['#ffefcf'], [6, [], [35, 570, 265, 650]], null, []],
    }),
    commonObjs: {
      get: (name: string) => ({ name: name === 'body' ? 'AFont-BoldItalic' : 'AFont-Regular' }),
    },
    cleanup: vi.fn(),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve(), cancel: vi.fn() }),
  };
}
function load(page = fakePage()) {
  const destroy = vi.fn().mockResolvedValue(undefined);
  vi.mocked(pdfjs.getDocument).mockReturnValue({
    promise: Promise.resolve({ numPages: 1, getPage: vi.fn().mockResolvedValue(page) }),
    destroy,
  } as unknown as ReturnType<typeof pdfjs.getDocument>);
  return { page, destroy };
}

describe('leitura local de PDF', () => {
  beforeEach(() => vi.clearAllMocks());
  it('usa worker local, fonte e caixa transformada, anuncia progresso e libera recursos', async () => {
    const { page, destroy } = load();
    const progress = vi.fn();
    const result = await parsePdfLayout(file(), { onProgress: progress });
    expect(result.sections[0]!.blocks[0]?.html).toBe(
      '<blockquote><p><em><strong>Texto aos jogadores.</strong></em></p></blockquote>',
    );
    expect(result.warnings.find((w) => w.code === 'visual-content')?.pages).toEqual([1]);
    expect(progress).toHaveBeenCalledWith(1, 1);
    expect(page.cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
    expect(pdfjs.GlobalWorkerOptions.workerSrc).not.toContain('http');
  });
  it('mantém a representação de texto para consumidores legados', async () => {
    load();
    expect(await parsePdfFile(file())).toContain('Texto aos jogadores.');
  });
  it('cancela antes de abrir um PDF e ao terminar a leitura de uma página', async () => {
    const abort = new AbortController();
    abort.abort();
    await expect(parsePdfLayout(file(), { signal: abort.signal })).rejects.toThrow();
    expect(pdfjs.getDocument).not.toHaveBeenCalled();
    const active = new AbortController();
    const { destroy } = load();
    await expect(
      parsePdfLayout(file(), { signal: active.signal, onProgress: () => active.abort() }),
    ).rejects.toThrow();
    expect(destroy).toHaveBeenCalled();
  });
  it('libera a página e o documento quando a extração falha', async () => {
    const { page, destroy } = load();
    page.getTextContent.mockRejectedValueOnce(new Error('Texto corrompido'));
    await expect(parsePdfLayout(file())).rejects.toThrow('Texto corrompido');
    expect(page.cleanup).toHaveBeenCalledOnce();
    expect(destroy).toHaveBeenCalledOnce();
  });
  it('renderiza original sob demanda, cancela renderização e libera o documento', async () => {
    const { page, destroy } = load();
    const preview = await openPdfPreview(file());
    const canvas = document.createElement('canvas');
    await preview.render(1, canvas, new AbortController().signal);
    expect(canvas.width).toBe(600);
    expect(page.cleanup).toHaveBeenCalledOnce();
    let finish!: () => void;
    const cancel = vi.fn();
    page.render.mockReturnValueOnce({
      promise: new Promise<void>((resolve) => {
        finish = resolve;
      }),
      cancel,
    });
    const abort = new AbortController();
    const rendering = preview.render(1, canvas, abort.signal);
    await vi.waitFor(() => expect(page.render).toHaveBeenCalledTimes(2));
    abort.abort();
    finish();
    await rendering;
    expect(cancel).toHaveBeenCalledOnce();
    await preview.destroy();
    expect(destroy).toHaveBeenCalledOnce();
  });
  it('não retém documentos cuja abertura da prévia falha', async () => {
    const destroy = vi.fn().mockResolvedValue(undefined);
    vi.mocked(pdfjs.getDocument).mockReturnValueOnce({
      promise: Promise.reject(new Error('PDF inválido')),
      destroy,
    } as unknown as ReturnType<typeof pdfjs.getDocument>);
    await expect(openPdfPreview(file())).rejects.toThrow('PDF inválido');
    expect(destroy).toHaveBeenCalledOnce();
  });
});
