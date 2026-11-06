/** Literal source coordinates; offsets are UTF-16, byte budgets are UTF-8. */
export interface LoreSourceSpan {
  start: number;
  end: number;
  page: number | null;
}
export interface LoreDocumentPage {
  page: number | null;
  text: string;
  sectionStarts?: number[];
}
export interface PreparedLorePart {
  text: string;
  spans: LoreSourceSpan[];
}

const encoder = new TextEncoder();
const MAX_CHARACTERS = 12000;
const MAX_BYTES = 32000;
const MAX_SPANS = 200;
const OVERLAP = 300;
const safeEnd = (text: string, end: number) =>
  end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1] ?? '') ? end - 1 : end;

/** Pack short pages together without summarizing, rewriting, or dropping facts. */
export function prepareLoreSources(pages: readonly LoreDocumentPage[]): PreparedLorePart[] {
  const texts: string[] = [];
  const spans: LoreSourceSpan[] = [];
  const sections: number[] = [];
  let length = 0;
  for (const page of pages) {
    if (!page.text.trim()) continue;
    const separator = texts.length ? '\n\n' : '';
    const start = length;
    texts.push(separator, page.text);
    length += separator.length + page.text.length;
    if (length > 20000000) throw new Error('O texto extraído excede o limite de importação.');
    spans.push({ start, end: length, page: page.page });
    for (const offset of page.sectionStarts ?? []) sections.push(start + separator.length + offset);
  }
  const text = texts.join('');
  const paragraphs = Array.from(text.matchAll(/\n[\t ]*\n/g), (match) => match.index);
  const parts: PreparedLorePart[] = [];
  let start = 0;
  let spanIndex = 0;
  let sectionIndex = 0;
  let paragraphIndex = 0;
  while (start < text.length) {
    while (spans[spanIndex]!.end <= start) spanIndex++;
    let end = safeEnd(text, Math.min(start + MAX_CHARACTERS, text.length));
    end = Math.min(end, spans[Math.min(spanIndex + MAX_SPANS - 1, spans.length - 1)]!.end);
    while (encoder.encode(text.slice(start, end)).byteLength > MAX_BYTES)
      end = safeEnd(text, end - Math.max(1, Math.floor((end - start) / 10)));
    if (end < text.length) {
      const minimum = start + Math.floor((end - start) * 0.6);
      while (sectionIndex < sections.length && sections[sectionIndex]! <= end) sectionIndex++;
      while (paragraphIndex < paragraphs.length && paragraphs[paragraphIndex]! <= end)
        paragraphIndex++;
      const section = sections[sectionIndex - 1] ?? 0;
      const paragraph = paragraphs[paragraphIndex - 1] ?? 0;
      const line = text.lastIndexOf('\n', end - 1) + 1;
      const word = text.lastIndexOf(' ', end - 1) + 1;
      end =
        [section, paragraph, line, word].find((offset) => offset >= minimum && offset > start) ??
        end;
    }
    const sourceSpans: LoreSourceSpan[] = [];
    for (let index = spanIndex; index < spans.length && spans[index]!.start < end; index++) {
      const span = spans[index]!;
      sourceSpans.push({
        start: Math.max(span.start, start) - start,
        end: Math.min(span.end, end) - start,
        page: span.page,
      });
    }
    parts.push({ text: text.slice(start, end), spans: sourceSpans });
    if (end === text.length) break;
    start = end - Math.min(OVERLAP, Math.floor((end - start) / 4));
    if (/[\uDC00-\uDFFF]/.test(text[start] ?? '')) start--;
  }
  return parts;
}

export async function hashLoreSource(value: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', encoder.encode(value));
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function describeLoreSources(parts: readonly PreparedLorePart[]) {
  let sourceHash = '';
  let sourceBytes = 0;
  const hashes: string[] = [];
  for (const part of parts) {
    const digest = await hashLoreSource(JSON.stringify(part));
    hashes.push(digest);
    sourceHash = await hashLoreSource(`${sourceHash}:${digest}`);
    sourceBytes += encoder.encode(part.text).byteLength;
  }
  return { sourceHash, sourceBytes, hashes };
}
