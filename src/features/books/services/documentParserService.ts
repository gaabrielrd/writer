import { countWords } from '../model/chapter';

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

/**
 * Remove tags HTML e espaços redundantes para gerar um preview limpo.
 */
export function extractPlainText(htmlOrText: string): string {
  return htmlOrText
    .replace(/<(?:\/p|\/div|\/h[1-6]|br\s*\/?)>/gi, '\n')
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z]+;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Heurística de identificação de títulos de capítulos.
 */
const CHAPTER_REGEX_PATTERNS = [
  // Ex: "Capítulo 1", "Capítulo 1: O Início", "Capítulo I", "Capítulo 10 - A Jornada"
  /^(?:cap[íi]tulo|chapter)\s+(?:[0-9]+|[ivxlcdm]+)(?:\s*[:\-–—]\s*.*)?$/i,
  // Ex: "Prólogo", "Prologue", "Epílogo", "Epilogue", "Posfácio", "Prefácio"
  /^(?:pr[óo]logo|prologue|ep[íi]logo|epilogue|posf[áa]cio|pref[áa]cio|introdu[çc][ãa]o)$/i,
  // Ex: "Ato 1", "Parte 1", "Seção 1", "Cena 1"
  /^(?:ato|parte|se[çc][ãa]o|livro|cena)\s+(?:[0-9]+|[ivxlcdm]+)(?:\s*[:\-–—]\s*.*)?$/i,
];

function isChapterHeading(line: string): boolean {
  const trimmed = line.trim();
  if (!trimmed || trimmed.length > 100) return false;
  return CHAPTER_REGEX_PATTERNS.some((regex) => regex.test(trimmed));
}

/**
 * Extrai texto bruto ou estruturado de um arquivo DOCX via carregamento dinâmico.
 */
export async function parseDocxFile(file: File): Promise<string> {
  const mammothModule = await import('mammoth');
  const mammoth = mammothModule.default || mammothModule;
  const arrayBuffer = await file.arrayBuffer();
  const result = await mammoth.convertToHtml({ arrayBuffer });
  return result.value;
}

/**
 * Extrai texto página a página de um arquivo PDF via carregamento dinâmico.
 */
export async function parsePdfFile(file: File): Promise<string> {
  const pdfjsLib = await import('pdfjs-dist');
  if (typeof window !== 'undefined' && !pdfjsLib.GlobalWorkerOptions.workerSrc) {
    pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
  }

  const arrayBuffer = await file.arrayBuffer();
  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdfDoc = await loadingTask.promise;
  const pageTexts: string[] = [];

  for (let pageNum = 1; pageNum <= pdfDoc.numPages; pageNum++) {
    const page = await pdfDoc.getPage(pageNum);
    const textContent = await page.getTextContent();
    const pageStr = textContent.items.map((item) => ('str' in item ? item.str : '')).join(' ');
    pageTexts.push(pageStr);
  }

  return pageTexts.join('\n\n');
}

/**
 * Divide o conteúdo textual ou HTML em múltiplos capítulos estruturados.
 */
export function splitIntoChapters(
  rawContent: string,
  fallbackTitle: string = 'Capítulo 1',
): ParsedChapter[] {
  if (!rawContent || !rawContent.trim()) {
    return [];
  }

  const isHtml = /<[a-z][\s\S]*>/i.test(rawContent);

  if (isHtml) {
    return splitHtmlIntoChapters(rawContent, fallbackTitle);
  }

  return splitPlainTextIntoChapters(rawContent, fallbackTitle);
}

function splitHtmlIntoChapters(html: string, fallbackTitle: string): ParsedChapter[] {
  // Substitui headings <h1>, <h2>, <h3> por delimitadores conhecidos
  const headingRegex = /<h[1-3][^>]*>(.*?)<\/h[1-3]>/gi;
  const matches = Array.from(html.matchAll(headingRegex));

  if (matches.length === 0) {
    // Tenta quebrar por parágrafos que correspondam a "Capítulo X"
    return splitPlainTextIntoChapters(html, fallbackTitle);
  }

  const chapters: ParsedChapter[] = [];
  let lastIndex = 0;
  let currentTitle = fallbackTitle;

  // Verifica se há texto antes do primeiro heading
  const firstMatchIndex = matches[0]?.index ?? 0;
  if (firstMatchIndex > 0) {
    const preContent = html.substring(0, firstMatchIndex).trim();
    const plain = extractPlainText(preContent);
    if (plain.length > 50) {
      chapters.push(createParsedChapter('chapter-0', 'Início / Prólogo', preContent));
    }
  }

  matches.forEach((match, idx) => {
    const headingText = extractPlainText(match[1] || `Capítulo ${idx + 1}`);
    const matchStart = match.index;
    const matchEnd = matchStart + match[0].length;

    if (idx > 0 && lastIndex > 0) {
      const chapterContent = html.substring(lastIndex, matchStart).trim();
      if (chapterContent) {
        chapters.push(
          createParsedChapter(`chapter-${chapters.length + 1}`, currentTitle, chapterContent),
        );
      }
    }

    currentTitle = headingText || `Capítulo ${idx + 1}`;
    lastIndex = matchEnd;
  });

  // Último capítulo
  if (lastIndex < html.length) {
    const remainingContent = html.substring(lastIndex).trim();
    if (remainingContent) {
      chapters.push(
        createParsedChapter(`chapter-${chapters.length + 1}`, currentTitle, remainingContent),
      );
    }
  }

  return chapters.length > 0
    ? chapters
    : [createParsedChapter('chapter-1', fallbackTitle, html.trim())];
}

function splitPlainTextIntoChapters(text: string, fallbackTitle: string): ParsedChapter[] {
  const lines = text.split(/\r?\n/);
  const rawChapters: { title: string; lines: string[] }[] = [];
  let currentTitle: string | null = null;
  let currentLines: string[] = [];

  for (const line of lines) {
    const cleanLine = extractPlainText(line);
    if (isChapterHeading(cleanLine)) {
      if (currentTitle !== null || currentLines.length > 0) {
        rawChapters.push({
          title: currentTitle || 'Início',
          lines: currentLines,
        });
      }
      currentTitle = cleanLine;
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentTitle !== null || currentLines.length > 0) {
    rawChapters.push({
      title: currentTitle || fallbackTitle,
      lines: currentLines,
    });
  }

  // Converte para ParsedChapter
  const validChapters = rawChapters
    .map((raw, idx) => {
      const content = raw.lines.join('\n').trim();
      return createParsedChapter(`chapter-${idx + 1}`, raw.title, content);
    })
    .filter((ch) => ch.content.length > 0 || ch.title !== 'Início');

  if (validChapters.length === 0) {
    const trimmed = text.trim();
    return trimmed ? [createParsedChapter('chapter-1', fallbackTitle, trimmed)] : [];
  }

  return validChapters;
}

function createParsedChapter(id: string, title: string, content: string): ParsedChapter {
  const plain = extractPlainText(content);
  const wordCount = countWords(content);
  const preview = plain.length > 180 ? `${plain.substring(0, 180)}...` : plain;

  return {
    id,
    title: title.trim() || 'Capítulo sem título',
    content,
    wordCount,
    selected: true,
    preview,
  };
}

/**
 * Função principal para analisar um arquivo (.docx ou .pdf) e retornar os capítulos detectados.
 */
export async function parseDocumentFile(file: File): Promise<DocumentParseResult> {
  const fileName = file.name;
  const extension = fileName.substring(fileName.lastIndexOf('.')).toLowerCase();
  const baseTitle = fileName.replace(/\.[^/.]+$/, '').trim() || 'Obra Importada';

  let rawContent: string;

  if (extension === '.docx') {
    rawContent = await parseDocxFile(file);
  } else if (extension === '.pdf') {
    rawContent = await parsePdfFile(file);
  } else {
    throw new Error(`Formato de arquivo não suportado (${extension}). Use arquivos .docx ou .pdf.`);
  }

  const chapters = splitIntoChapters(rawContent, 'Capítulo 1');
  const totalWords = chapters.reduce((sum, ch) => sum + ch.wordCount, 0);

  return {
    title: baseTitle,
    chapters,
    totalWords,
  };
}
