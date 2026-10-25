import { closed, integer } from './bookRestoreUploadContracts.mjs';
import { workFail } from './workProgressContracts.mjs';
const fields = ['name', 'category', 'summary', 'details', 'aliases'];
const invalid = () =>
  workFail('invalid-argument', 'Projeção de contexto inválida.', 'book-lore-projection-invalid');
const exhausted = () =>
  workFail(
    'resource-exhausted',
    'O lore excede o orçamento deste contexto.',
    'book-lore-projection-budget',
  );
const limit = (value) => {
  if (value === null) return null;
  integer(value);
  return value;
};
export function createBookLoreProjectionBudget(input) {
  closed(input, ['bytes', 'parts', 'retainedBytes']);
  const maximum = { ...input },
    used = { bytes: 0, parts: 0, retainedBytes: 0 };
  for (const value of Object.values(maximum)) integer(value);
  function reserve(cost) {
    closed(cost, [], Object.keys(maximum));
    for (const [key, value] of Object.entries(cost)) {
      integer(value);
      if (value > maximum[key] - used[key]) exhausted();
    }
    for (const [key, value] of Object.entries(cost)) used[key] += value;
  }
  return {
    reserve,
    get used() {
      return { ...used };
    },
  };
}
/** Only the selected presentation lives in RAM. Parsers/observers alone never certify it. */
export function createBookLoreTextProjection(selection, budget) {
  closed(selection, [], fields);
  const observers = {},
    states = {};
  for (const [field, raw] of Object.entries(selection)) {
    let characters,
      items = null;
    if (field === 'aliases') {
      closed(raw, ['items', 'characters']);
      items = limit(raw.items);
      characters = limit(raw.characters);
    } else characters = limit(raw);
    const s = {
      aliases: [],
      count: 0,
      value: '',
      started: 0,
      ended: 0,
      truncated: false,
      current: null,
    };
    states[field] = s;
    const observer = {};
    observer.start = (role) => {
      if (role !== (field === 'category' ? 'category' : 'text') || s.current !== null) invalid();
      if (field !== 'aliases' && s.started !== 0) invalid();
      s.started++;
      s.current = '';
      const keep = field !== 'aliases' || items === null || s.count < items;
      if (keep) budget.reserve({ retainedBytes: 4 });
      observer.text = keep
        ? (code) => {
            const text = String.fromCodePoint(code);
            if (characters !== null && s.current.length + text.length > characters) {
              s.truncated = true;
              observer.text = undefined;
              return;
            }
            const bytes = code < 128 ? 1 : code < 2048 ? 2 : code < 65536 ? 3 : 4;
            budget.reserve({ retainedBytes: bytes });
            s.current += text;
          }
        : undefined;
    };
    observer.end = (role) => {
      if (role !== (field === 'category' ? 'category' : 'text') || s.current === null) invalid();
      if (field === 'aliases') {
        if (items === null || s.count < items) s.aliases.push(s.current);
        integer(++s.count);
      } else s.value = s.current;
      s.ended++;
      s.current = null;
      observer.text = undefined;
    };
    observers[field] = observer;
  }
  return {
    observers,
    finish(present) {
      if (!Array.isArray(present) || present.some((k) => typeof k !== 'string')) invalid();
      const value = {};
      for (const field of fields) {
        if (!Object.hasOwn(states, field) || !present.includes(field)) continue;
        const s = states[field];
        if (s.current !== null || s.started !== s.ended || (field !== 'aliases' && s.started !== 1))
          invalid();
        value[field] =
          field === 'aliases'
            ? {
                value: [...s.aliases],
                count: s.count,
                omitted: s.count - s.aliases.length,
                truncated: s.truncated,
              }
            : { value: s.value, truncated: s.truncated };
      }
      return value;
    },
  };
}
