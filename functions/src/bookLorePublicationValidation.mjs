import { closed, integer } from './bookRestoreUploadContracts.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
export const PUBLICATION_FIELDS = Object.freeze(['name', 'aliases', 'category', 'summary']);
const invalid = () =>
  workFail(
    'invalid-argument',
    'Os campos públicos não correspondem à ficha original.',
    'book-publication-fields-invalid',
  );
export function publicationCandidate(value) {
  closed(value, PUBLICATION_FIELDS);
  for (const key of ['name', 'summary', 'category'])
    if (typeof value[key] !== 'string' || !value[key].isWellFormed()) invalid();
  if (
    !value.name ||
    value.name !== value.name.trim() ||
    value.name.length > 200 ||
    value.summary.length > 140 ||
    !['character', 'location', 'concept', 'other'].includes(value.category) ||
    !Array.isArray(value.aliases) ||
    value.aliases.length > 20 ||
    value.aliases.some((v) => typeof v !== 'string' || !v.isWellFormed() || v.length > 200)
  )
    invalid();
  return {
    name: value.name,
    aliases: [...value.aliases],
    category: value.category,
    summary: value.summary,
  };
}
export function publicationOverrides(opened) {
  return opened.mode === 'payload' && opened.storage.schemaVersion === 2
    ? PUBLICATION_FIELDS.filter(
        (k) => Object.hasOwn(opened.storage.fields, k) && opened.storage.fields[k] !== null,
      )
    : [];
}
export function createPublicationValidation() {
  return {
    fieldIndex: 0,
    partIndex: 0,
    validation: null,
    hashState: null,
    matches: Object.fromEntries(
      PUBLICATION_FIELDS.map((k) => [k, { position: 0, index: 0, ended: false }]),
    ),
  };
}
function validateState(state) {
  closed(state, ['fieldIndex', 'partIndex', 'validation', 'hashState', 'matches']);
  integer(state.fieldIndex);
  integer(state.partIndex);
  if (state.fieldIndex > 4 || !(state.hashState === null || typeof state.hashState === 'string'))
    invalid();
  closed(state.matches, PUBLICATION_FIELDS);
  for (const m of Object.values(state.matches)) {
    closed(m, ['position', 'index', 'ended']);
    integer(m.position);
    integer(m.index);
    if (m.position > 200 || m.index > 20 || typeof m.ended !== 'boolean') invalid();
  }
}
export function publicationObservers(state, candidate, keys = PUBLICATION_FIELDS) {
  validateState(state);
  return Object.fromEntries(
    keys.map((key) => {
      const match = state.matches[key];
      const expected = () => (key === 'aliases' ? candidate.aliases[match.index] : candidate[key]);
      return [
        key,
        {
          start() {
            if (match.ended || typeof expected() !== 'string') invalid();
          },
          text(code) {
            const char = String.fromCodePoint(code),
              value = expected();
            if (typeof value !== 'string' || match.ended) invalid();
            if (
              key === 'name' &&
              char.trim() === '' &&
              (match.position === 0 || match.position === value.length)
            )
              return;
            if (value.slice(match.position, match.position + char.length) !== char) invalid();
            match.position += char.length;
          },
          end() {
            if (match.position !== expected()?.length) invalid();
            if (key === 'aliases') {
              match.index++;
              match.position = 0;
            } else match.ended = true;
          },
        },
      ];
    }),
  );
}
export function finishPublicationValidation(opened, metadata, state, candidate) {
  if (opened.mode === 'inline') {
    const data = opened.data;
    if (
      typeof data.name !== 'string' ||
      digest({
        name: data.name.trim(),
        aliases: data.aliases,
        category: data.category,
        summary: data.summary,
      }) !== digest(candidate)
    )
      invalid();
    return;
  }
  validateState(state);
  const fields = opened.storage.schemaVersion === 2 ? opened.storage.fields : {};
  for (const key of PUBLICATION_FIELDS) {
    if (!(Object.hasOwn(fields, key) ? fields[key] !== null : metadata.fields.includes(key)))
      invalid();
    const match = state.matches[key];
    if (
      key === 'aliases'
        ? match.index !== candidate.aliases.length || match.position !== 0
        : !match.ended
    )
      invalid();
  }
}
