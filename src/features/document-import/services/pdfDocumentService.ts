import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import type { ParseOptions } from '../model/documentImport';
import {
  extractPdfLayout,
  type LayoutPage,
  type PdfRegion,
  type LayoutItem,
} from './pdfLayoutExtraction';
import { extractPdfText } from './pdfTextExtraction';

function matrixNumbers(value: unknown): number[] {
  return Array.isArray(value) &&
    value.length === 6 &&
    value.every((entry: unknown) => typeof entry === 'number')
    ? value
    : [1, 0, 0, 1, 0, 0];
}

function multiply(a: number[], b: number[]): number[] {
  return [
    a[0]! * b[0]! + a[2]! * b[1]!,
    a[1]! * b[0]! + a[3]! * b[1]!,
    a[0]! * b[2]! + a[2]! * b[3]!,
    a[1]! * b[2]! + a[3]! * b[3]!,
    a[0]! * b[4]! + a[2]! * b[5]! + a[4]!,
    a[1]! * b[4]! + a[3]! * b[5]! + a[5]!,
  ];
}

export function throwIfAborted(signal?: AbortSignal): void {
  signal?.throwIfAborted();
}

async function readPages(file: File, options: ParseOptions = {}): Promise<LayoutPage[]> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  throwIfAborted(options.signal);
  const data = new Uint8Array(await file.arrayBuffer());
  throwIfAborted(options.signal);
  const loadingTask = pdfjs.getDocument({
    data,
    fontExtraProperties: true,
  });
  const cancel = () => {
    void loadingTask.destroy();
  };
  options.signal?.addEventListener('abort', cancel, { once: true });
  try {
    const pdf = await loadingTask.promise;
    const pages: LayoutPage[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      throwIfAborted(options.signal);
      const page = await pdf.getPage(number);
      try {
        const text = await page.getTextContent();
        const viewport = page.getViewport({ scale: 1 });
        const viewportMatrix = matrixNumbers(viewport.transform);
        const operators = page.getOperatorList ? await page.getOperatorList() : undefined;
        const boxes: PdfRegion[] = [];
        const stack: number[][] = [];
        let matrix = [1, 0, 0, 1, 0, 0];
        let fill = '';
        let hasImages = false;
        const imageOps = [
          pdfjs.OPS?.paintImageXObject,
          pdfjs.OPS?.paintInlineImageXObject,
          pdfjs.OPS?.paintImageMaskXObject,
        ];
        operators?.fnArray.forEach((op, index) => {
          const args = operators.argsArray[index] as unknown[] | null;
          if (imageOps.includes(op)) hasImages = true;
          if (op === pdfjs.OPS.save) stack.push([...matrix]);
          if (op === pdfjs.OPS.restore) matrix = stack.pop() ?? [1, 0, 0, 1, 0, 0];
          if (op === pdfjs.OPS.transform && args) matrix = multiply(matrix, matrixNumbers(args));
          if (op === pdfjs.OPS.setFillRGBColor) fill = typeof args?.[0] === 'string' ? args[0] : '';
          // PDF.js 6 emits the painted path's bounding box as the third argument.
          if (
            op !== pdfjs.OPS.constructPath ||
            !args ||
            ![pdfjs.OPS.fill, pdfjs.OPS.eoFill, pdfjs.OPS.fillStroke].includes(args[0] as number) ||
            fill === '#ffffff'
          )
            return;
          const bounds = args[2] as ArrayLike<number> | undefined;
          if (!bounds || bounds.length !== 4) return;
          const points = [
            [bounds[0]!, bounds[1]!],
            [bounds[2]!, bounds[1]!],
            [bounds[0]!, bounds[3]!],
            [bounds[2]!, bounds[3]!],
          ];
          const transformPoint = (point: number[], transform: number[]) => [
            point[0]! * transform[0]! + point[1]! * transform[2]! + transform[4]!,
            point[0]! * transform[1]! + point[1]! * transform[3]! + transform[5]!,
          ];
          const transformed = points.map((point) =>
            transformPoint(transformPoint(point, matrix), viewportMatrix),
          );
          const xs = transformed.map((point) => point[0]!);
          const ys = transformed.map((point) => point[1]!);
          const width = Math.max(...xs) - Math.min(...xs);
          const height = Math.max(...ys) - Math.min(...ys);
          if (width > 40 && height > 20 && width * height < viewport.width * viewport.height * 0.65)
            boxes.push({ x: Math.min(...xs), y: viewport.height - Math.max(...ys), width, height });
        });
        let uncertain = false;
        const items: (LayoutItem | object)[] = text.items.map((item) => {
          if (!('str' in item)) return item;
          let font = '';
          try {
            font =
              (page.commonObjs?.get(item.fontName) as { name?: string } | undefined)?.name ?? '';
          } catch {
            /* Font metadata is optional. */
          }
          const normalized =
            viewport.transform && item.transform
              ? multiply(viewportMatrix, matrixNumbers(item.transform))
              : undefined;
          if (normalized && Math.abs(normalized[1]!) > Math.abs(normalized[0]!)) uncertain = true;
          return {
            ...item,
            ...(normalized && {
              transform: [
                item.height,
                0,
                0,
                item.height,
                normalized[4]!,
                viewport.height - normalized[5]!,
              ],
            }),
            bold: /bold|black|heavy/i.test(font),
            italic: /italic|oblique/i.test(font),
          };
        });
        pages.push({
          number,
          width: viewport.width ?? 0,
          height: viewport.height,
          items,
          boxes,
          hasImages,
          uncertain,
        });
        options.onProgress?.(number, pdf.numPages);
      } finally {
        page.cleanup();
      }
      // Allow cancellation and progress to paint even for cached/local PDF pages.
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
    throwIfAborted(options.signal);
    return pages;
  } finally {
    options.signal?.removeEventListener('abort', cancel);
    await loadingTask.destroy();
  }
}

export async function parsePdfLayout(file: File, options?: ParseOptions) {
  const pages = await readPages(file, options);
  const result = extractPdfLayout(pages);
  return { ...result, pageCount: pages.length };
}

/** Kept for callers that explicitly need the legacy plain-text representation. */
export async function parsePdfFile(file: File): Promise<string> {
  return extractPdfText(await readPages(file));
}

export async function openPdfPreview(file: File) {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const task = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  let pdf;
  try {
    pdf = await task.promise;
  } catch (error) {
    await task.destroy();
    throw error;
  }
  return {
    pageCount: pdf.numPages,
    async render(number: number, canvas: HTMLCanvasElement, signal: AbortSignal) {
      throwIfAborted(signal);
      const page = await pdf.getPage(number);
      try {
        throwIfAborted(signal);
        const viewport = page.getViewport({ scale: 1 });
        const scale = Math.min(1.5, 900 / viewport.width);
        const sized = page.getViewport({ scale });
        canvas.width = sized.width;
        canvas.height = sized.height;
        const rendering = page.render({ canvas, viewport: sized });
        const cancel = () => rendering.cancel();
        signal.addEventListener('abort', cancel, { once: true });
        try {
          await rendering.promise;
        } finally {
          signal.removeEventListener('abort', cancel);
        }
      } finally {
        page.cleanup();
      }
    },
    destroy: () => task.destroy(),
  };
}
