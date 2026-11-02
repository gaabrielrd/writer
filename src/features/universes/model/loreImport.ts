import type { LoreCategory } from '@/features/lore';

export const LORE_IMPORT_MAX_BYTES = 10_000_000;
export const LORE_IMPORT_EXTENSIONS = ['.pdf', '.txt', '.text', '.md', '.markdown'];
export interface ImportLoreFields {
  name: string;
  category: LoreCategory;
  aliases: string[];
  summary: string;
  details: string;
}
export interface LoreImportCandidate extends ImportLoreFields {
  id: string;
  evidence: string;
  fileName: string;
  page: number | null;
}
export interface LoreImportExisting extends ImportLoreFields {
  id: string;
}
export interface LoreImportReview {
  id: string;
  state: 'uploading' | 'analyzing' | 'ready' | 'applied' | 'cancelled';
  universeId: string | null;
  cursor: number;
  total: number;
  cost: number;
  candidates: LoreImportCandidate[];
  existing: Array<Pick<LoreImportExisting, 'id' | 'name' | 'aliases' | 'category'>>;
  pendingReview?: LoreImportSubmission;
  result?: { universeId: string; created: number; updated: number };
}
export interface LoreImportChoice {
  candidateId: string;
  targetId: string | null;
  input: ImportLoreFields;
}
export function validateLoreImportFiles(files: readonly Pick<File, 'name' | 'size'>[]) {
  if (!files.length) throw new Error('Selecione pelo menos um arquivo.');
  if (files.length > 50) throw new Error('Selecione até 50 arquivos por importação.');
  if (
    files.some(
      (file) => !LORE_IMPORT_EXTENSIONS.some((ext) => file.name.toLowerCase().endsWith(ext)),
    )
  )
    throw new Error('Use PDF, TXT ou Markdown.');
  if (files.some((file) => file.size <= 0)) throw new Error('Remova os arquivos vazios.');
  if (files.reduce((sum, file) => sum + file.size, 0) > LORE_IMPORT_MAX_BYTES)
    throw new Error('O total dos arquivos deve ser de até 10 MB.');
}
export function matchingImportEntities(
  candidate: ImportLoreFields,
  existing: LoreImportReview['existing'],
) {
  const normalize = (value: string) => value.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
  const terms = [candidate.name, ...candidate.aliases].map(normalize);
  return existing.filter((item) =>
    [item.name, ...item.aliases].some((term) => terms.includes(normalize(term))),
  );
}
export interface LoreFieldDiff {
  field: keyof ImportLoreFields;
  label: string;
  before: string;
  after: string;
  kind: 'added' | 'removed' | 'changed';
}
export function loreImportDiff(before: ImportLoreFields, after: ImportLoreFields): LoreFieldDiff[] {
  const fields = {
    name: 'Nome',
    category: 'Categoria',
    aliases: 'Apelidos',
    summary: 'Resumo',
    details: 'Detalhes',
  } as const;
  return (Object.keys(fields) as Array<keyof ImportLoreFields>).flatMap((field) => {
    const display = (value: string | string[]) => (Array.isArray(value) ? value.join('\n') : value);
    const oldValue = display(before[field]);
    const newValue = display(after[field]);
    return oldValue === newValue
      ? []
      : [
          {
            field,
            label: fields[field],
            before: oldValue,
            after: newValue,
            kind: !oldValue ? 'added' : !newValue ? 'removed' : 'changed',
          },
        ];
  });
}

export interface LoreImportSubmission {
  id: string;
  operationId: string;
  name: string;
  description: string;
  changes: LoreImportChoice[];
}

export interface LoreTextDiffPart {
  kind: 'same' | 'removed' | 'added';
  text: string;
}
/** Bounded word diff; large rewrites retain common edges without quadratic work. */
export function loreTextDiff(before: string, after: string): LoreTextDiffPart[] {
  const oldTokens = before.match(/\s+|[^\s]+/gu) ?? [];
  const newTokens = after.match(/\s+|[^\s]+/gu) ?? [];
  let start = 0;
  while (
    start < oldTokens.length &&
    start < newTokens.length &&
    oldTokens[start] === newTokens[start]
  )
    start++;
  let end = 0;
  while (
    end < oldTokens.length - start &&
    end < newTokens.length - start &&
    oldTokens[oldTokens.length - end - 1] === newTokens[newTokens.length - end - 1]
  )
    end++;
  const oldMiddle = oldTokens.slice(start, oldTokens.length - end);
  const newMiddle = newTokens.slice(start, newTokens.length - end);
  const result: LoreTextDiffPart[] = [];
  const append = (kind: LoreTextDiffPart['kind'], text: string) => {
    if (!text) return;
    const last = result.at(-1);
    if (last?.kind === kind) last.text += text;
    else result.push({ kind, text });
  };
  append('same', oldTokens.slice(0, start).join(''));
  if (oldMiddle.length * newMiddle.length > 100000) {
    append('removed', oldMiddle.join(''));
    append('added', newMiddle.join(''));
  } else {
    const width = newMiddle.length + 1;
    const table = new Uint32Array((oldMiddle.length + 1) * width);
    for (let a = oldMiddle.length - 1; a >= 0; a--)
      for (let b = newMiddle.length - 1; b >= 0; b--)
        table[a * width + b] =
          oldMiddle[a] === newMiddle[b]
            ? 1 + table[(a + 1) * width + b + 1]!
            : Math.max(table[(a + 1) * width + b]!, table[a * width + b + 1]!);
    let a = 0,
      b = 0;
    while (a < oldMiddle.length || b < newMiddle.length) {
      if (a < oldMiddle.length && b < newMiddle.length && oldMiddle[a] === newMiddle[b]) {
        append('same', oldMiddle[a++]!);
        b++;
      } else if (
        b < newMiddle.length &&
        (a === oldMiddle.length || table[a * width + b + 1]! > table[(a + 1) * width + b]!)
      )
        append('added', newMiddle[b++]!);
      else append('removed', oldMiddle[a++]!);
    }
  }
  append('same', end ? oldTokens.slice(-end).join('') : '');
  return result;
}
