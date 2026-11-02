import { describe, expect, it } from 'vitest';
import { countVisibleWords } from '../../../../functions/src/visibleWordCount.mjs';
import corpusJson from '../../../../functions/test/fixtures/visible-prose.json?raw';
import { renderRichText } from '@/shared/lib/sanitizeRichText';
import { countWords } from '../model/chapter';

interface VisibleProseCase {
  id: string;
  content: string;
  tokens: string[];
  wordCount: number;
}
const corpus = JSON.parse(corpusJson) as VisibleProseCase[];

describe('server count matches the existing visible manuscript', () => {
  it.each(corpus)('$id', ({ content, tokens, wordCount }) => {
    const template = document.createElement('template');
    template.innerHTML = renderRichText(content).replace(
      /<\/?(?:p|div|h[1-6]|li|ul|ol|blockquote|pre|br|hr|section|tr)\b[^>]*>/gi,
      ' ',
    );
    const visibleTokens = (template.content.textContent ?? '')
      .trim()
      .split(/\s+/)
      .filter((token) => /[\p{L}\p{N}]/u.test(token));
    expect(visibleTokens).toEqual(tokens);
    expect(countWords(content)).toBe(wordCount);
    expect(countVisibleWords(content)).toBe(wordCount);
  });
});
