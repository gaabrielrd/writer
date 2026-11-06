import type { LiteraryPlan, LiteraryPlanState, LiteraryReference } from './planning';
export type BookMapResource = 'acts' | 'chapters' | 'events' | 'plans';
interface MapBase {
  id: string;
  version: string;
  revision: number;
}
export type BookMapAct = MapBase & { resource: 'acts'; name: string; order: number };
export type BookMapChapter = MapBase & {
  resource: 'chapters';
  title: string;
  order: number;
  actId: string | null;
  contentMode: string;
};
export type BookMapEvent = MapBase & {
  resource: 'events';
  title: string;
  dateLabel: string;
  rank: string;
  description: string;
};
export type BookMapPlan = MapBase & {
  resource: 'plans';
  plan: LiteraryPlan;
  fieldLabels: Record<string, string>;
  sources: LiteraryPlanState['sources'];
};
export type BookMapItem = BookMapAct | BookMapChapter | BookMapEvent | BookMapPlan;
export interface BookMapPage {
  fence: string;
  resource: BookMapResource;
  items: BookMapItem[];
  nextAfterId: string | null;
  coverage: { kind: 'root-fenced-metadata-read'; manuscriptRead: false };
}
export interface BookMapData {
  acts: BookMapAct[];
  chapters: BookMapChapter[];
  events: BookMapEvent[];
  plans: BookMapPlan[];
}
export const emptyBookMap = (): BookMapData => ({ acts: [], chapters: [], events: [], plans: [] });
export function mapSubjects(plan: BookMapPlan, kind: string) {
  return plan.sources.filter(
    (source) =>
      source.available && source.reference.purpose === 'subject' && source.reference.kind === kind,
  );
}
export function mapSubjectIndex(plans: BookMapPlan[]) {
  const result = new Map<string, BookMapPlan[]>();
  for (const plan of plans)
    for (const source of plan.sources) {
      if (!source.available || source.reference.purpose !== 'subject') continue;
      const key = JSON.stringify([source.reference.kind, source.reference.id]);
      const entries = result.get(key) ?? [];
      if (!entries.some((entry) => entry.id === plan.id)) entries.push(plan);
      result.set(key, entries);
    }
  return result;
}
export function mapCharacters(plans: BookMapPlan[]) {
  const characters = new Map<
    string,
    { key: string; label: string; plans: BookMapPlan[]; reference: LiteraryReference }
  >();
  for (const plan of plans) {
    // Only explicit subjects identify whose trajectory a plan describes.
    if (plan.plan.kind !== 'knowledgeState') continue;
    for (const source of plan.sources) {
      if (
        !source.available ||
        source.reference.purpose !== 'subject' ||
        !['localLore', 'globalLore'].includes(source.reference.kind)
      )
        continue;
      const reference = source.currentReference ?? source.reference;
      const key = JSON.stringify([
        reference.kind,
        reference.scopeId,
        reference.id,
        reference.sourceToken,
      ]);
      const item = characters.get(key) ?? {
        key,
        label: source.label ?? source.reference.id,
        plans: [],
        reference,
      };
      if (!item.plans.some((row) => row.id === plan.id)) item.plans.push(plan);
      characters.set(key, item);
    }
  }
  const names = new Map<string, number>();
  for (const item of characters.values()) names.set(item.label, (names.get(item.label) ?? 0) + 1);
  return [...characters.values()]
    .map((item) =>
      names.get(item.label)! > 1
        ? {
            ...item,
            label: `${item.label} · ${item.reference.kind === 'localLore' ? 'livro' : 'universo'} · ${item.reference.id}`,
          }
        : item,
    )
    .sort((a, b) => a.label.localeCompare(b.label) || a.key.localeCompare(b.key));
}
