import { countWords } from '../model/chapter';
import { renderRichText, sanitizeRichText } from '@/shared/lib/sanitizeRichText';
import pdfWorkerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { extractPdfText, type PdfTextPage } from './pdfTextExtraction';

export interface ParsedChapter {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  selected: boolean;
  preview: string;
}

export interface DocumentParseResult {
  title: string;
  chapters: ParsedChapter[];
  totalWords: number;
}

export const DOCUMENT_EXTENSIONS = [
  '.docx',
  '.pdf',
  '.md',
  '.markdown',
  '.txt',
  '.text',
  '.html',
  '.htm',
];
export const DOCUMENT_FORMAT_LABEL =
  'DOCX, PDF, Markdown (.md, .markdown), texto (.txt, .text) ou HTML (.html, .htm)';

export function isSupportedDocument(fileName: string): boolean {
  return DOCUMENT_EXTENSIONS.some((extension) => fileName.toLowerCase().endsWith(extension));
}

export function extractPlainText(htmlOrText: string): string {
  const template = document.createElement('template');
  template.innerHTML = sanitizeRichText(htmlOrText).replace(
    /<\/(?:p|div|h[1-6]|li)>|<br\s*\/?\s*>/gi,
    ' ',
  );
  return (template.content.textContent ?? '').replace(/\s+/g, ' ').trim();
}

const CHAPTER_HEADING = /^(?:cap[íi]tulo|chapter)\s+(?:\d+|[ivxlcdm]+)(?:\s*[:\-–—]\s*.+)?$/i;
const SPECIAL_HEADING =
  /^(?:pr[óo]logo|prologue|ep[íi]logo|epilogue|posf[áa]cio|pref[áa]cio|introdu[çc][ãa]o)$/i;
const PART_HEADING =
  /^(?:ato|parte|se[çc][ãa]o|livro|cena)\s+(?:\d+|[ivxlcdm]+)(?:\s*[:\-–—]\s*.+)?$/i;
const CONTENTS_HEADING = /^(?:sum[áa]rio|[íi]ndice(?:\s+geral)?|table of contents|contents)$/i;
const CONTENTS_ENTRY = /(?:\.\s*){2,}\d+\s*$/;

function isChapterHeading(text: string, hasChapters: boolean): boolean {
  return (
    text.length <= 200 &&
    (CHAPTER_HEADING.test(text) ||
      SPECIAL_HEADING.test(text) ||
      (!hasChapters && PART_HEADING.test(text)))
  );
}

export async function parseDocxFile(file: File): Promise<string> {
  const mammothModule = await import('mammoth');
  const mammoth = mammothModule.default || mammothModule;
  const result = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  return sanitizeRichText(result.value);
}

export async function parsePdfFile(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist');
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(await file.arrayBuffer()) });
  const pdf = await loadingTask.promise;
  try {
    const pages: PdfTextPage[] = [];
    for (let number = 1; number <= pdf.numPages; number++) {
      const page = await pdf.getPage(number);
      const text = await page.getTextContent();
      pages.push({ number, height: page.getViewport({ scale: 1 }).height, items: text.items });
      page.cleanup();
    }
    return extractPdfText(pages);
  } finally {
    await loadingTask.destroy();
  }
}

function decodeText(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  const encoding =
    bytes[0] === 0xff && bytes[1] === 0xfe
      ? 'utf-16le'
      : bytes[0] === 0xfe && bytes[1] === 0xff
        ? 'utf-16be'
        : 'utf-8';
  let text: string;
  try {
    text = new TextDecoder(encoding, { fatal: true }).decode(bytes);
  } catch {
    text = new TextDecoder('windows-1252').decode(bytes);
  }
  if (
    Array.from(text).some((character) => {
      const code = character.charCodeAt(0);
      return code < 32 && (code < 9 || code > 13);
    })
  )
    throw new Error('O arquivo contém dados binários. Selecione um documento de texto.');
  return text.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
}

function createParsedChapter(title: string, content: string, index: number): ParsedChapter {
  const plain = extractPlainText(renderRichText(content));
  return {
    id: 'chapter-' + (index + 1),
    title: title.trim() || 'Capítulo sem título',
    content: content.trim(),
    wordCount: countWords(content),
    selected: true,
    preview: plain.length > 180 ? plain.slice(0, 180) + '...' : plain,
  };
}

export function splitIntoChapters(
  rawContent: string,
  fallbackTitle = 'Capítulo 1',
): ParsedChapter[] {
  if (!rawContent.trim()) return [];
  return /^\s*<(?:p|h[1-6]|div|html|body|ul|ol|section|article)\b/i.test(rawContent)
    ? splitHtmlIntoChapters(sanitizeRichText(rawContent), fallbackTitle)
    : splitPlainTextIntoChapters(rawContent, fallbackTitle);
}

function splitPlainTextIntoChapters(text: string, fallbackTitle: string): ParsedChapter[] {
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const hasChapters = lines.some((line) => CHAPTER_HEADING.test(line.trim()));
  const contentsIndex = lines.findIndex((line) => CONTENTS_HEADING.test(line.trim()));
  // A TOC title alone is insufficient: require an actual chapter after it.
  const lastHeading = new Map<string, number>();
  lines.forEach((line, index) => {
    if (isChapterHeading(line.trim(), hasChapters)) lastHeading.set(line.trim(), index);
  });
  const firstChapter = lines.findIndex(
    (line, index) =>
      index > contentsIndex &&
      isChapterHeading(line.trim(), hasChapters) &&
      !CONTENTS_ENTRY.test(line) &&
      (contentsIndex < 0 || lastHeading.get(line.trim()) === index),
  );
  const start = contentsIndex >= 0 && firstChapter >= 0 ? firstChapter : 0;
  const chapters: ParsedChapter[] = [];
  let title = fallbackTitle;
  let content: string[] = [];
  const flush = () => {
    if (content.join('').trim())
      chapters.push(createParsedChapter(title, content.join('\n'), chapters.length));
    content = [];
  };
  for (const line of lines.slice(start)) {
    const clean = line.trim();
    if (isChapterHeading(clean, hasChapters)) {
      flush();
      title = clean;
    } else content.push(line);
  }
  flush();
  return chapters;
}

interface Heading {
  start: number;
  end: number;
  level: number;
  title: string;
}

function splitHtmlIntoChapters(html: string, fallbackTitle: string): ParsedChapter[] {
  const matches = Array.from(html.matchAll(/<(h[1-6]|p)\b[^>]*>([\s\S]*?)<\/\1>/gi));
  const hasChapters = matches.some((match) =>
    CHAPTER_HEADING.test(extractPlainText(match[2] ?? '')),
  );
  const headings: Heading[] = matches
    .map((match) => ({
      start: match.index,
      end: match.index + match[0].length,
      level: match[1] === 'p' ? 0 : Number(match[1]?.slice(1)),
      title: extractPlainText(match[2] ?? ''),
    }))
    .filter(
      (heading) =>
        heading.level > 0 ||
        isChapterHeading(heading.title, hasChapters) ||
        CONTENTS_HEADING.test(heading.title),
    );
  let boundaries = headings.filter(
    (heading) =>
      isChapterHeading(heading.title, hasChapters) && !CONTENTS_ENTRY.test(heading.title),
  );
  if (!boundaries.length) {
    const proseHeadings = headings.filter(
      (heading) =>
        heading.level > 0 &&
        !CONTENTS_HEADING.test(heading.title) &&
        !CONTENTS_ENTRY.test(heading.title),
    );
    let level = Math.min(...proseHeadings.map((heading) => heading.level));
    const topHeadings = proseHeadings.filter((heading) => heading.level === level);
    const first = topHeadings[0];
    const next = proseHeadings.find((heading) => first && heading.start >= first.end);
    // A solitary book title followed immediately by deeper titles is a wrapper.
    // A chapter with body prose before its subsections must keep its own level.
    if (
      topHeadings.length === 1 &&
      first &&
      next &&
      !extractPlainText(html.slice(first.end, next.start))
    )
      level = next.level;
    boundaries = proseHeadings.filter((heading) => heading.level === level);
  }
  const contents = headings.find((heading) => CONTENTS_HEADING.test(heading.title));
  if (contents) {
    const lastHeading = new Map(boundaries.map((heading) => [heading.title, heading.start]));
    boundaries = boundaries.filter(
      (heading) =>
        heading.start >= contents.end && lastHeading.get(heading.title) === heading.start,
    );
  }
  // TOC entries without body prose must never become chapters.
  boundaries = boundaries.filter((heading, index) => {
    const end = boundaries[index + 1]?.start ?? html.length;
    const body = html.slice(heading.end, end);
    return extractPlainText(body).length > 0;
  });
  if (!boundaries.length)
    return extractPlainText(html) ? [createParsedChapter(fallbackTitle, html, 0)] : [];
  const chapters: ParsedChapter[] = [];
  const prefix = html.slice(0, boundaries[0]?.start ?? 0).trim();
  const prefixProse = prefix.replace(/<h[1-6]\b[^>]*>[\s\S]*?<\/h[1-6]>/gi, '');
  if (!contents && extractPlainText(prefixProse))
    chapters.push(createParsedChapter('Início / Prólogo', prefix, chapters.length));
  boundaries.forEach((heading, index) => {
    const content = html.slice(heading.end, boundaries[index + 1]?.start ?? html.length).trim();
    if (extractPlainText(content))
      chapters.push(createParsedChapter(heading.title, content, chapters.length));
  });
  return chapters;
}

function markdownHtml(text: string): string {
  // Metadata from the app's own Markdown export is not manuscript prose.
  const withoutMetadata = text.replace(/^---\n(?:[\w-]+:[^\n]*\n)+---(?:\n|$)/, '');
  return renderRichText(withoutMetadata);
}

function plainTextHtml(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return escaped
    .split(/\n\s*\n/)
    .map((paragraph) => '<p>' + paragraph.replace(/\n/g, '<br>') + '</p>')
    .join('');
}

export async function parseDocumentFile(file: File): Promise<DocumentParseResult> {
  const extension = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
  if (!isSupportedDocument(file.name))
    throw new Error(
      'Formato de arquivo não suportado (' + extension + '). Use ' + DOCUMENT_FORMAT_LABEL + '.',
    );
  let content: string;
  if (extension === '.docx') content = await parseDocxFile(file);
  else if (extension === '.pdf') content = await parsePdfFile(file);
  else {
    const text = decodeText(await file.arrayBuffer());
    content = ['.md', '.markdown'].includes(extension)
      ? markdownHtml(text)
      : ['.html', '.htm'].includes(extension)
        ? sanitizeRichText(text)
        : text;
  }
  const isPlainText = ['.pdf', '.txt', '.text'].includes(extension);
  const chapters = isPlainText
    ? splitPlainTextIntoChapters(content, 'Capítulo 1').map((chapter, index) =>
        createParsedChapter(chapter.title, plainTextHtml(chapter.content), index),
      )
    : splitIntoChapters(content);
  if (!chapters.length || !chapters.some((chapter) => chapter.wordCount > 0))
    throw new Error(
      extension === '.pdf'
        ? 'Não foi encontrado texto no PDF. PDFs digitalizados precisam de OCR antes da importação.'
        : 'O documento está vazio ou não contém texto para importar.',
    );
  return {
    title: file.name.replace(/\.[^/.]+$/, '').trim() || 'Obra Importada',
    chapters,
    totalWords: chapters.reduce((sum, chapter) => sum + chapter.wordCount, 0),
  };
}
