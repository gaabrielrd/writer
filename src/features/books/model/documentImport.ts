import { countWords } from './chapter';
import { renderRichText, sanitizeRichText } from '@/shared/lib/sanitizeRichText';

export interface ImportBlock {
  html: string;
  text: string;
  page?: number;
}

export interface ParsedChapter {
  id: string;
  title: string;
  content: string;
  wordCount: number;
  selected: boolean;
  preview: string;
  sourcePages?: number[];
  blocks?: ImportBlock[];
}

export interface ImportWarning {
  code: 'visual-content' | 'no-text' | 'layout' | 'table' | 'contents';
  message: string;
  pages: number[];
}

export interface DocumentParseResult {
  title: string;
  chapters: ParsedChapter[];
  totalWords: number;
  warnings?: ImportWarning[];
  pageCount?: number;
}

export interface ParseOptions {
  signal?: AbortSignal;
  onProgress?: (current: number, total: number) => void;
}

export function createParsedChapter(
  title: string,
  content: string,
  index: number,
  blocks?: ImportBlock[],
): ParsedChapter {
  const safeContent = sanitizeRichText(renderRichText(content));
  const template = document.createElement('template');
  template.innerHTML = safeContent.replace(/<\/(?:p|div|h[1-6]|li)>|<br\s*\/?\s*>/gi, ' ');
  const plain = (template.content.textContent ?? '').replace(/\s+/g, ' ').trim();
  return {
    id: 'chapter-' + (index + 1),
    title: title.trim() || 'Capítulo sem título',
    content: content.trim(),
    wordCount: countWords(content),
    selected: true,
    preview: plain.length > 180 ? plain.slice(0, 180) + '...' : plain,
    ...(blocks && {
      blocks,
      sourcePages: [...new Set(blocks.flatMap((block) => (block.page ? [block.page] : [])))],
    }),
  };
}

export function splitImportedChapter(chapter: ParsedChapter, at: number): ParsedChapter[] {
  const blocks = chapter.blocks;
  if (!blocks || at <= 0 || at >= blocks.length) return [chapter];
  return [blocks.slice(0, at), blocks.slice(at)].map((part, index) => ({
    ...createParsedChapter(
      index === 0 ? chapter.title : chapter.title + ' — continuação',
      part.map((block) => block.html).join(''),
      index,
      part,
    ),
    id: index === 0 ? chapter.id : crypto.randomUUID(),
    selected: chapter.selected,
  }));
}

export function mergeImportedChapters(first: ParsedChapter, next: ParsedChapter): ParsedChapter {
  const keepTitle = next.title !== first.title && next.title !== first.title + ' — continuação';
  const escapedTitle = next.title
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const heading = keepTitle ? '<h2>' + escapedTitle + '</h2>' : '';
  const blocks =
    first.blocks && next.blocks
      ? [
          ...first.blocks,
          ...(keepTitle ? [{ html: heading, text: next.title, page: next.sourcePages?.[0] }] : []),
          ...next.blocks,
        ]
      : undefined;
  return {
    ...createParsedChapter(first.title, first.content + heading + next.content, 0, blocks),
    id: first.id,
    selected: first.selected,
  };
}
