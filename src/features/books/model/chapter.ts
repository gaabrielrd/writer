export interface ChapterPersonaComplement {
  personaId: string;
  overrides: { traitId: string; value: number }[];
}
import { renderRichText } from '../../../shared/lib/sanitizeRichText';

export interface Chapter {
  actId?: string | null;
  id: string;
  bookId: string;
  personaComplement?: ChapterPersonaComplement | null;
  title: string;
  order: number;
  wordCount: number;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateChapterInput {
  actId?: string | null;
  personaComplement?: ChapterPersonaComplement | null;
  title: string;
  order?: number;
  content?: string;
}

export interface UpdateChapterInput {
  personaComplement?: ChapterPersonaComplement | null;
  title?: string;
  order?: number;
  content?: string;
  wordCount?: number;
}

/**
 * Calcula a contagem de palavras em um texto simples ou com tags HTML.
 */
export function countWords(text: string): number {
  const normalized = typeof document === 'undefined' ? text : renderRichText(text);
  const blockSeparated = normalized
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, '')
    .replace(/<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|pre|br|hr|section|tr)\b[^>]*>/gi, ' ');
  let stripped: string;
  if (typeof document !== 'undefined') {
    const template = document.createElement('template');
    template.innerHTML = blockSeparated;
    stripped = (template.content.textContent ?? '').trim();
  } else {
    stripped = blockSeparated
      .replace(/<[^>]*>/g, '')
      .replace(/&(?:nbsp|amp|lt|gt|quot|apos);/gi, ' ')
      .trim();
  }
  if (!stripped) return 0;

  const tokens = stripped.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token));
  return tokens.length;
}
