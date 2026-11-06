export const LITERARY_PROSE_MODES = Object.freeze([
  'draftScene',
  'reviseScene',
  'reviewStructure',
  'reviewProse',
]);
export function literaryReviewSegments(text, size = 18000, overlap = 1200) {
  if (
    typeof text !== 'string' ||
    !Number.isSafeInteger(size) ||
    size < 1000 ||
    !Number.isSafeInteger(overlap) ||
    overlap < 0 ||
    overlap >= size
  )
    throw new TypeError('Segmentação inválida.');
  const segments = [];
  for (let coreStart = 0; coreStart < text.length || (!text.length && !segments.length);) {
    let coreEnd = Math.min(coreStart + size, text.length);
    if (
      coreEnd < text.length &&
      text.charCodeAt(coreEnd) >= 0xdc00 &&
      text.charCodeAt(coreEnd) <= 0xdfff
    )
      coreEnd -= 1;
    let start = Math.max(0, coreStart - overlap),
      end = Math.min(text.length, coreEnd + overlap);
    if (start > 0 && text.charCodeAt(start) >= 0xdc00 && text.charCodeAt(start) <= 0xdfff)
      start -= 1;
    if (end < text.length && text.charCodeAt(end) >= 0xdc00 && text.charCodeAt(end) <= 0xdfff)
      end += 1;
    segments.push({
      index: segments.length,
      start,
      end,
      coreStart,
      coreEnd,
      text: text.slice(start, end),
    });
    if (coreEnd === text.length) break;
    coreStart = coreEnd;
  }
  return segments;
}
const closed = (value, keys) => {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).some((key) => !keys.includes(key))
  )
    throw new TypeError('Resposta literária inválida.');
};
const text = (value, max, required = false) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    throw new TypeError('Texto literário inválido.');
  return value.replace(/\r\n/g, '\n');
};
export function normalizeLiteraryProseOutput(value, { mode, documents, segment }) {
  closed(value, ['text', 'complete', 'rationale', 'findings']);
  if (value.complete !== true) throw new TypeError('A IA não concluiu a operação solicitada.');
  const prose = text(value.text, 80000, ['draftScene', 'reviseScene'].includes(mode));
  if (mode.startsWith('review') && prose.trim())
    throw new TypeError('A análise não deve substituir a prosa.');
  const rationale = text(value.rationale, 6000);
  if (!Array.isArray(value.findings) || value.findings.length > 40)
    throw new TypeError('Achados inválidos.');
  const findings = value.findings.map((finding) => {
    closed(finding, ['sourceId', 'quote', 'problem', 'severity', 'action']);
    const source = documents.find((item) => item.id === finding.sourceId),
      quote = text(finding.quote, 1200, true);
    const offset = source?.text.indexOf(quote) ?? -1;
    if (offset < 0 || !['blocking', 'warning', 'suggestion'].includes(finding.severity))
      throw new TypeError('Evidência inválida.');
    return {
      sourceId: source.id,
      quote,
      offset: (source.id === 'manuscript' ? segment.start : 0) + offset,
      problem: text(finding.problem, 2000, true),
      severity: finding.severity,
      action: text(finding.action, 2000, true),
    };
  });
  return { text: prose, rationale, findings, complete: true };
}
export function literaryPlainProseHTML(value) {
  const escaped = value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
  return escaped
    .trim()
    .split(/\n\s*\n/)
    .map((paragraph) => '<p>' + paragraph.replace(/\n/g, '<br>') + '</p>')
    .join('');
}
