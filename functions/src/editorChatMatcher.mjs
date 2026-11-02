// Matcher v1. No body, authorization, persistence or locale-dependent ID ordering.
import {
  EDITOR_CHAT_LIMITS,
  editorChatFail,
  editorChatText,
  editorChatSourceId,
  editorChatClosed,
  canonicalEditorChatJSON,
  editorChatUTF8Bytes,
  normalizeEditorChatReference,
  compareEditorChatStrings,
} from './editorChatContracts.mjs';
const cmp = compareEditorChatStrings;
const normalizedTerm = (v) => editorChatText(v).trim().toLocaleLowerCase('pt-BR');
// The production adapter always supplies reference and this exact qualified ID.
// Synthetic IDs without reference are only useful for pure callers and fixtures.
export function editorChatMatcherId(reference) {
  const r = normalizeEditorChatReference(reference);
  return JSON.stringify([r.kind, r.scopeId, r.entityId]);
}
function matcherId(value, reference) {
  if (reference !== null) {
    if (value !== editorChatMatcherId(reference)) editorChatFail();
    return value;
  }
  return editorChatSourceId(value);
}
function entityInput(v) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    typeof v.global !== 'boolean' ||
    !Array.isArray(v.aliases)
  )
    editorChatFail();
  const reference =
    v.reference === undefined || v.reference === null
      ? null
      : normalizeEditorChatReference(v.reference);
  if (reference && (reference.kind === 'universe') !== v.global) editorChatFail();
  return {
    id: matcherId(v.id, reference),
    name: editorChatText(v.name),
    aliases: Array.from(v.aliases, (a) => editorChatText(a)),
    global: v.global,
    reference,
  };
}
export function preferredEditorChatTerms(entities) {
  if (!Array.isArray(entities)) editorChatFail();
  const rows = entities
    .map(entityInput)
    .sort((a, b) => Number(a.global) - Number(b.global) || cmp(a.id, b.id));
  const terms = new Map(),
    ids = new Map();
  for (const e of rows) {
    if (ids.has(e.id) && canonicalEditorChatJSON(ids.get(e.id)) !== canonicalEditorChatJSON(e))
      editorChatFail('inconsistent');
    ids.set(e.id, e);
    for (const value of [e.name, ...e.aliases]) {
      const term = normalizedTerm(value);
      if (term && !terms.has(term)) terms.set(term, e);
    }
  }
  return terms;
}
function pattern(term) {
  const escaped = term.replace(/[.*+?^$}{()|[\]\\]/g, '\\$&');
  return new RegExp('(?<=^|[^\\p{L}\\p{N}_])' + escaped + '(?=[^\\p{L}\\p{N}_]|$)', 'giu');
}
function rawIntervals(text, terms, bounded) {
  editorChatText(text);
  const raw = [];
  for (const [term, entity] of terms) {
    const regex = pattern(term);
    let found;
    while ((found = regex.exec(text)) !== null) {
      raw.push({ from: found.index, to: found.index + found[0].length, term, id: entity.id });
      if (bounded && raw.length > EDITOR_CHAT_LIMITS.intervals)
        editorChatFail('context-too-complex');
    }
  }
  return raw;
}
function chooseIntervals(raw) {
  const rows = raw.sort(
    (a, b) => a.to - b.to || a.from - b.from || cmp(a.term, b.term) || cmp(a.id, b.id),
  );
  const previous = [],
    best = [0];
  for (let i = 0; i < rows.length; i++) {
    const current = rows[i];
    let low = 0,
      high = i - 1,
      last = -1;
    while (low <= high) {
      const middle = (low + high) >>> 1;
      if (rows[middle].to <= current.from) {
        last = middle;
        low = middle + 1;
      } else high = middle - 1;
    }
    previous[i] = last;
    best[i + 1] = Math.max(best[i], (current.to - current.from) ** 2 + best[last + 1]);
  }
  const result = [];
  let i = rows.length;
  while (i > 0) {
    const row = rows[i - 1],
      include = (row.to - row.from) ** 2 + best[previous[i - 1] + 1];
    if (include >= best[i - 1]) {
      result.push(row);
      i = previous[i - 1] + 1;
    } else i--;
  }
  return result.reverse().sort((a, b) => a.from - b.from || a.to - b.to || cmp(a.id, b.id));
}
export function findEditorChatLoreMatches(text, entities) {
  return chooseIntervals(rawIntervals(text, preferredEditorChatTerms(entities), false));
}
export function selectEditorChatLore(matches) {
  if (!Array.isArray(matches)) editorChatFail();
  const seen = new Set(),
    ids = [];
  const sorted = matches
    .map((m) => {
      editorChatClosed(m, ['from', 'to', 'term', 'id']);
      if (
        !Number.isSafeInteger(m.from) ||
        !Number.isSafeInteger(m.to) ||
        m.from < 0 ||
        m.to <= m.from
      )
        editorChatFail();
      return {
        from: m.from,
        to: m.to,
        term: editorChatText(m.term),
        id: editorChatText(m.id, Infinity, true),
      };
    })
    .sort((a, b) => a.from - b.from || a.to - b.to || cmp(a.id, b.id));
  for (const m of sorted)
    if (!seen.has(m.id)) {
      seen.add(m.id);
      ids.push(m.id);
    }
  return {
    ids: ids.slice(0, EDITOR_CHAT_LIMITS.lore),
    matchedEntityCount: ids.length,
    includedEntityCount: Math.min(ids.length, EDITOR_CHAT_LIMITS.lore),
    omittedEntityCount: Math.max(0, ids.length - EDITOR_CHAT_LIMITS.lore),
  };
}
export const createEditorChatLoreAccumulator = () => ({ schemaVersion: 1, terms: [] });
function accumulatorInput(value) {
  editorChatClosed(value, ['schemaVersion', 'terms']);
  if (value.schemaVersion !== 1 || !Array.isArray(value.terms)) editorChatFail('inconsistent');
  const terms = new Map();
  for (const row of value.terms) {
    editorChatClosed(row, ['term', 'id', 'global', 'reference']);
    const term = normalizedTerm(row.term);
    if (!term || term !== row.term || terms.has(term) || typeof row.global !== 'boolean')
      editorChatFail('inconsistent');
    const reference = row.reference === null ? null : normalizeEditorChatReference(row.reference);
    if (reference && (reference.kind === 'universe') !== row.global) editorChatFail('inconsistent');
    terms.set(term, { id: matcherId(row.id, reference), global: row.global, reference });
  }
  return terms;
}
function accumulatorValue(text, terms) {
  if (terms.size > EDITOR_CHAT_LIMITS.relevantTerms) editorChatFail('context-too-complex');
  const value = {
    schemaVersion: 1,
    terms: [...terms]
      .sort((a, b) => cmp(a[0], b[0]))
      .map(([term, e]) => ({ term, id: e.id, global: e.global, reference: e.reference })),
  };
  if (editorChatUTF8Bytes(canonicalEditorChatJSON(value)) > EDITOR_CHAT_LIMITS.accumulatorBytes)
    editorChatFail('context-too-complex');
  rawIntervals(text, terms, true);
  return value;
}
export function advanceEditorChatLoreAccumulator(text, accumulator, entities) {
  editorChatText(text);
  const terms = accumulatorInput(accumulator);
  for (const [term, e] of preferredEditorChatTerms(entities)) {
    if (!pattern(term).test(text)) continue;
    const old = terms.get(term);
    if (
      !old ||
      Number(e.global) < Number(old.global) ||
      (e.global === old.global && cmp(e.id, old.id) < 0)
    )
      terms.set(term, { id: e.id, global: e.global, reference: e.reference });
  }
  return accumulatorValue(text, terms);
}
export function finishEditorChatLoreAccumulator(text, accumulator) {
  const terms = accumulatorInput(accumulator);
  accumulatorValue(text, terms);
  const matches = chooseIntervals(rawIntervals(text, terms, true));
  return { matches, ...selectEditorChatLore(matches) };
}
