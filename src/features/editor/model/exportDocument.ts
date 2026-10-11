import { groupChapters, actName, type ActHeading, type Book, type Chapter } from '@/features/books';
import { renderRichText } from '@/shared/lib/sanitizeRichText';

export type ExportFormat = 'markdown' | 'docx' | 'pdf' | 'json';
export type ExportScope = 'chapter' | 'book';

export interface ExportRun {
  text: string;
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strike?: boolean;
  code?: boolean;
  href?: string;
}

export interface ExportBlock {
  kind: 'paragraph' | 'heading' | 'quote' | 'list' | 'code' | 'rule';
  runs: ExportRun[];
  level?: number;
  marker?: string;
}

export interface ExportChapter {
  actTitle?: string;
  inAct?: true;
  title: string;
  html: string;
  blocks: ExportBlock[];
}

export interface ExportDocument {
  title: string;
  genre: string;
  synopsis: string;
  chapters: ExportChapter[];
}

function inlineRuns(node: Node, formatting: Omit<ExportRun, 'text'> = {}): ExportRun[] {
  if (node.nodeType === Node.TEXT_NODE) return [{ text: node.textContent ?? '', ...formatting }];
  if (!(node instanceof Element)) return [];
  const tag = node.tagName.toLowerCase();
  if (tag === 'ul' || tag === 'ol') return [];
  if (tag === 'br') return [{ text: '\n', ...formatting }];
  const next = { ...formatting };
  if (tag === 'strong' || tag === 'b') next.bold = true;
  if (tag === 'em' || tag === 'i') next.italic = true;
  if (tag === 'u') next.underline = true;
  if (tag === 's' || tag === 'del') next.strike = true;
  if (tag === 'code') next.code = true;
  if (tag === 'a' && node.hasAttribute('href')) next.href = node.getAttribute('href') ?? undefined;
  const runs = Array.from(node.childNodes).flatMap((child) => inlineRuns(child, next));
  if (tag === 'p') runs.push({ text: '\n', ...formatting });
  return runs;
}

function trimEndingBreak(runs: ExportRun[]): ExportRun[] {
  const last = runs.at(-1);
  if (last?.text === '\n') return runs.slice(0, -1);
  return runs;
}

/** Walk only the neutral sanitizer's allowlisted DOM, never raw manuscript markup. */
export function parseExportBlocks(html: string): ExportBlock[] {
  const body = new DOMParser().parseFromString(html, 'text/html').body;
  function walk(container: Element, depth = 0): ExportBlock[] {
    const blocks: ExportBlock[] = [];
    let pending: ExportRun[] = [];
    const flush = () => {
      if (pending.some((run) => run.text.trim())) blocks.push({ kind: 'paragraph', runs: pending });
      pending = [];
    };
    for (const child of Array.from(container.childNodes)) {
      if (!(child instanceof Element)) {
        pending.push(...inlineRuns(child));
        continue;
      }
      const tag = child.tagName.toLowerCase();
      if (!/^(p|h[1-6]|blockquote|ul|ol|pre|hr)$/.test(tag)) {
        pending.push(...inlineRuns(child));
        continue;
      }
      flush();
      if (tag === 'ul' || tag === 'ol') {
        Array.from(child.children).forEach((item, index) => {
          blocks.push({
            kind: 'list',
            marker: tag === 'ol' ? `${index + 1}.` : '-',
            level: depth,
            runs: trimEndingBreak(inlineRuns(item)),
          });
          for (const nested of Array.from(item.children)) {
            if (nested.tagName === 'UL' || nested.tagName === 'OL') {
              const wrapper = body.ownerDocument.createElement('div');
              wrapper.append(nested.cloneNode(true));
              blocks.push(...walk(wrapper, depth + 1));
            }
          }
        });
      } else if (tag === 'blockquote') {
        blocks.push(...walk(child).map((block) => ({ ...block, kind: 'quote' as const })));
      } else if (tag === 'pre') {
        blocks.push({ kind: 'code', runs: [{ text: child.textContent ?? '', code: true }] });
      } else if (tag === 'hr') {
        blocks.push({ kind: 'rule', runs: [] });
      } else {
        blocks.push({
          kind: tag.startsWith('h') ? 'heading' : 'paragraph',
          ...(tag.startsWith('h') ? { level: Number(tag[1]) } : {}),
          runs: trimEndingBreak(inlineRuns(child)),
        });
      }
    }
    flush();
    return blocks;
  }
  return walk(body);
}

export function createExportDocument(
  book: Book,
  chapters: Chapter[],
  acts: ActHeading[] = [],
): ExportDocument {
  if (chapters.length === 0) throw new Error('Adicione um capítulo antes de exportar o livro.');
  return {
    title: book.title,
    genre: book.genre ?? '',
    synopsis: book.synopsis ?? '',
    chapters: groupChapters(chapters, acts).flatMap((group) =>
      group.chapters.map((chapter, index) => {
        const html = renderRichText(chapter.content);
        return {
          title: chapter.title,
          html,
          blocks: parseExportBlocks(html),
          ...(group.act
            ? { inAct: true as const, ...(index === 0 ? { actTitle: actName(group.act) } : {}) }
            : {}),
        };
      }),
    ),
  };
}

export function exportFileName(title: string, extension: 'md' | 'docx' | 'json'): string {
  const name = title
    .normalize('NFKC')
    .replace(/[<>:"/\\|?*\p{Cc}\p{Cf}]/gu, '')
    .replace(/^\.+|[. ]+$/g, '')
    .trim()
    .slice(0, 120);
  return `${name || 'manuscrito'}.${extension}`;
}
