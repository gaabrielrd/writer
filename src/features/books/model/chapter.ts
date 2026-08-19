export interface Chapter {
  id: string;
  bookId: string;
  title: string;
  order: number;
  wordCount: number;
  content: string;
  createdAt: number;
  updatedAt: number;
}

export interface CreateChapterInput {
  title: string;
  order?: number;
  content?: string;
}

export interface UpdateChapterInput {
  title?: string;
  order?: number;
  content?: string;
  wordCount?: number;
}

/**
 * Calcula a contagem de palavras em um texto simples ou com tags HTML.
 */
export function countWords(text: string): number {
  const stripped = text
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim();

  if (!stripped) return 0;

  const tokens = stripped.split(/\s+/).filter((token) => /[\p{L}\p{N}]/u.test(token));
  return tokens.length;
}
