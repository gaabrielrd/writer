export interface Act {
  id: string;
  name: string | null;
  order: number;
  createdAt: number;
  updatedAt: number;
}
export type ActHeading = Pick<Act, 'id' | 'name' | 'order'>;

export function romanNumeral(value: number): string {
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('Número de ato inválido.');
  let remaining = value;
  let result = '';
  for (const [number, symbol] of [
    [1000, 'M'],
    [900, 'CM'],
    [500, 'D'],
    [400, 'CD'],
    [100, 'C'],
    [90, 'XC'],
    [50, 'L'],
    [40, 'XL'],
    [10, 'X'],
    [9, 'IX'],
    [5, 'V'],
    [4, 'IV'],
    [1, 'I'],
  ] as const) {
    result += symbol.repeat(Math.floor(remaining / number));
    remaining %= number;
  }
  return result;
}

export function actName(act: ActHeading): string {
  return act.name?.trim() || romanNumeral(act.order);
}

export interface ChapterGroup<T> {
  act: ActHeading | null;
  chapters: T[];
}

/** Stable reading order for drafts, publications and exports; absent links remain visible. */
export function groupChapters<T extends { id: string; order: number; actId?: string | null }>(
  chapters: readonly T[],
  acts: readonly ActHeading[],
): ChapterGroup<T>[] {
  const orderedActs = [...acts].sort((a, b) => a.order - b.order || a.id.localeCompare(b.id));
  const groups: ChapterGroup<T>[] = orderedActs.map((act) => ({ act, chapters: [] }));
  const unassigned: ChapterGroup<T> = { act: null, chapters: [] };
  const byId = new Map(groups.map((group) => [group.act!.id, group]));
  for (const chapter of [...chapters].sort(
    (a, b) => a.order - b.order || a.id.localeCompare(b.id),
  )) {
    (byId.get(chapter.actId ?? '') ?? unassigned).chapters.push(chapter);
  }
  return [...groups, unassigned];
}

export function filterChapterTitle(title: string, query: string): boolean {
  const normalize = (text: string) =>
    text.normalize('NFD').replace(/\p{M}/gu, '').toLocaleLowerCase('pt-BR').trim();
  return normalize(title).includes(normalize(query));
}
