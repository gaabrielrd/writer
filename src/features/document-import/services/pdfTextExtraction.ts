interface PdfTextItem {
  str: string;
  transform?: number[];
  height?: number;
  width?: number;
  hasEOL?: boolean;
}

interface PdfLine {
  text: string;
  x: number;
  y: number;
  height: number;
  right?: number;
}

export interface PdfTextPage {
  number: number;
  height: number;
  items: (PdfTextItem | object)[];
}

const CHAPTER_LABEL = /^(?:cap[íi]tulo|chapter)\s+(?:\d+|[ivxlcdm]+)$/i;

function pageLines(page: PdfTextPage): PdfLine[] {
  const lines: PdfLine[] = [];
  let current: PdfLine | undefined;
  for (const item of page.items) {
    if (!('str' in item) || typeof item.str !== 'string') continue;
    const textItem = item;
    const x = textItem.transform?.[4] ?? 0;
    const y = textItem.transform?.[5] ?? 0;
    const height = textItem.height || Math.abs(textItem.transform?.[3] ?? 12);
    if (!current || Math.abs(current.y - y) > Math.max(2, height * 0.2)) {
      current = { text: '', x, y, height };
      lines.push(current);
    }
    const needsSpace =
      current.text &&
      textItem.str &&
      !/\s$/.test(current.text) &&
      !/^\s/.test(textItem.str) &&
      (current.right === undefined || x - current.right > height * 0.12);
    current.text += `${needsSpace ? ' ' : ''}${textItem.str}`;
    current.right = textItem.width === undefined ? undefined : x + textItem.width;
    current.height = Math.max(current.height, height);
    if (textItem.hasEOL) current = undefined;
  }
  return lines
    .filter((line) => line.text.trim())
    .map((line) => ({ ...line, text: line.text.trim() }));
}

function isMargin(line: PdfLine, page: PdfTextPage): boolean {
  return page.height > 0 && (line.y > page.height * 0.85 || line.y < page.height * 0.1);
}

/** Remove only recurring margin text and page numbers, never matching body prose. */
export function extractPdfText(pages: PdfTextPage[]): string {
  const linesByPage = pages.map(pageLines);
  const repetitions = new Map<string, number>();
  pages.forEach((page, index) => {
    const marginTexts = new Set(
      linesByPage[index]?.filter((line) => isMargin(line, page)).map((line) => line.text),
    );
    for (const text of marginTexts) repetitions.set(text, (repetitions.get(text) ?? 0) + 1);
  });
  const repetitionThreshold = Math.max(3, Math.ceil(pages.length * 0.4));
  return pages
    .map((page, pageIndex) => {
      const lines = (linesByPage[pageIndex] ?? []).filter(
        (line) =>
          !isMargin(line, page) ||
          (!/^\d+$/.test(line.text) && (repetitions.get(line.text) ?? 0) < repetitionThreshold),
      );
      const heights = lines.map((line) => line.height).sort((a, b) => a - b);
      const bodyHeight = heights[Math.floor(heights.length / 2)] ?? 12;
      const output: string[] = [];
      for (let index = 0; index < lines.length; index++) {
        const line = lines[index];
        if (!line) continue;
        const next = lines[index + 1];
        if (
          CHAPTER_LABEL.test(line.text) &&
          next &&
          next.height > bodyHeight * 1.15 &&
          !CHAPTER_LABEL.test(next.text)
        ) {
          output.push(`\n${line.text}: ${next.text}\n`);
          index++;
          continue;
        }
        const previous = lines[index - 1];
        if (
          previous &&
          (previous.y - line.y > bodyHeight * 1.9 || line.x - previous.x > bodyHeight)
        ) {
          output.push('');
        }
        output.push(line.text);
      }
      return output.join('\n');
    })
    .join('\n\n');
}
