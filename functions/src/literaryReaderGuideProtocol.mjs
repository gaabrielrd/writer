import { workClosed, workFail, workId } from './workProgressContracts.mjs';
import { publicationText } from './literaryPublicationContracts.mjs';
const line = (value, max, optional = false) =>
  optional && typeof value === 'string' && value.length <= max && !value.trim()
    ? ''
    : publicationText(value, max);
const list = (value, max, read) => {
  if (!Array.isArray(value) || value.length > max)
    workFail('invalid-argument', 'O guia excede o limite de itens.');
  return value.map(read);
};
const certainty = (value) => {
  if (!['fact', 'uncertain'].includes(value))
    workFail('invalid-argument', 'Indique fato ou informação incerta.');
  return value;
};
const evidence = (value) => {
  workClosed(value, ['chapterId', 'quote']);
  return { chapterId: workId(value.chapterId), quote: line(value.quote, 1500) };
};
export function normalizeLiteraryReaderGuide(value) {
  workClosed(value, [
    'name',
    'aliases',
    'category',
    'summary',
    'certainty',
    'disambiguation',
    'revealAfterChapterId',
    'evidence',
    'facts',
    'relationships',
    'appearances',
  ]);
  if (!['character', 'location', 'concept', 'other'].includes(value.category))
    workFail('invalid-argument', 'Categoria inválida.');
  const normalized = {
    name: line(value.name, 200),
    aliases: [...new Set(list(value.aliases, 20, (v) => line(v, 200)))],
    category: value.category,
    summary: line(value.summary, 140),
    certainty: certainty(value.certainty),
    disambiguation: line(value.disambiguation, 140, true),
    revealAfterChapterId: workId(value.revealAfterChapterId),
    evidence: list(value.evidence, 8, evidence),
    facts: list(value.facts, 12, (v) => {
      workClosed(v, ['text', 'certainty', 'chapterId', 'quote']);
      return {
        text: line(v.text, 300),
        certainty: certainty(v.certainty),
        ...evidence({ chapterId: v.chapterId, quote: v.quote }),
      };
    }),
    relationships: list(value.relationships, 12, (v) => {
      workClosed(v, ['targetId', 'description', 'certainty', 'chapterId', 'quote']);
      return {
        targetId: workId(v.targetId),
        description: line(v.description, 300),
        certainty: certainty(v.certainty),
        ...evidence({ chapterId: v.chapterId, quote: v.quote }),
      };
    }),
    appearances: list(value.appearances, 24, (v) => {
      workClosed(v, ['kind', 'chapterId', 'quote']);
      if (!['direct', 'document', 'mention', 'uncertain'].includes(v.kind))
        workFail('invalid-argument', 'Tipo de aparição inválido.');
      return { kind: v.kind, ...evidence({ chapterId: v.chapterId, quote: v.quote }) };
    }),
  };
  if (!normalized.evidence.length)
    workFail('invalid-argument', 'Cite uma passagem para o resumo público.');
  return normalized;
}
