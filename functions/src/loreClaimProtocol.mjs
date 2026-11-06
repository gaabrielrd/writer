// Pure shared parser: classification is a suggestion, never a proof of fictional truth.
export const LORE_CLAIM_KINDS = Object.freeze(['observed', 'interpretation', 'proposal']);
export function resolveLoreEvidence(source, value) {
  if (
    typeof source !== 'string' ||
    typeof value !== 'string' ||
    !value.trim() ||
    value.length > 1000
  )
    throw new TypeError('Evidência inválida.');
  const quote = value.trim();
  const pattern = quote
    .split(/\s+/u)
    .map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('\\s+');
  const evidence = source.includes(quote) ? quote : source.match(new RegExp(pattern, 'u'))?.[0];
  if (!evidence || evidence.length > 1000)
    throw new TypeError('Evidência ausente no texto selecionado.');
  return evidence;
}
function closed(value, fields) {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((key) => Object.hasOwn(value, key))
  );
}
export function normalizeLoreClaims(value, entity, source) {
  if (value === undefined) return undefined;
  if (
    !closed(value, ['version', 'items']) ||
    value.version !== 1 ||
    !Array.isArray(value.items) ||
    value.items.length < 1 ||
    value.items.length > 16
  )
    throw new TypeError('Classificação de afirmações inválida.');
  const seen = new Set();
  const items = value.items.map((claim) => {
    if (
      !closed(claim, ['field', 'text', 'kind', 'evidence', 'rationale']) ||
      !['summary', 'details'].includes(claim.field) ||
      !LORE_CLAIM_KINDS.includes(claim.kind) ||
      typeof claim.text !== 'string' ||
      !claim.text.trim() ||
      claim.text.length > 2000 ||
      typeof entity[claim.field] !== 'string' ||
      !entity[claim.field].includes(claim.text.trim()) ||
      typeof claim.rationale !== 'string' ||
      claim.rationale.length > 1000 ||
      (claim.kind !== 'observed' && !claim.rationale.trim())
    )
      throw new TypeError(
        'Confira a afirmação, seu campo e a justificativa da interpretação ou proposta.',
      );
    const text = claim.text.trim(),
      key = JSON.stringify([claim.field, text]);
    if (seen.has(key)) throw new TypeError('Afirmação repetida na classificação.');
    seen.add(key);
    return {
      field: claim.field,
      text,
      kind: claim.kind,
      evidence: resolveLoreEvidence(source, claim.evidence),
      rationale: claim.rationale,
    };
  });
  return { version: 1, items };
}
