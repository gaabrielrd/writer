import type {
  NarrativeContext,
  NarrativeItem,
  NarrativePage,
  NarrativeSummary,
} from '../model/narrative';
export const target = { kind: 'book' as const, id: 'book' };
export const context: NarrativeContext = {
  target,
  ownerId: 'owner',
  title: 'A última luz do cais',
  universeId: null,
  projectRevision: 1,
  sceneRevision: 1,
  updatedAt: 100,
  hasResources: true,
  entityIndexReady: true,
};
const common = {
  ownerId: 'owner',
  schemaVersion: 1 as const,
  revision: 1,
  title: 'Lia reencontra o farol',
  rank: 'U',
  referenceCount: 0,
  createdAt: 100,
  updatedAt: 100,
};
export const arc: NarrativeItem = {
  ...common,
  kind: 'arc',
  id: 'arc',
  initialState: 'Lia perdeu a esperança.',
  objective: 'Restaurar o farol.',
  plannedOutcome: 'A luz retorna.',
};
export const event: NarrativeItem = {
  ...common,
  kind: 'event',
  id: 'event',
  title: 'O sino toca',
  description: 'Mara ouve o sino na torre.',
  dateLabel: '3º dia do inverno',
};
export const milestone: NarrativeItem = {
  ...common,
  kind: 'milestone',
  arcId: 'arc',
  id: 'milestone',
  title: 'Encontrar as cartas',
  notes: 'Lia precisa decidir.',
};
export function summary(item: NarrativeItem): NarrativeSummary {
  const { ownerId, schemaVersion, revision, title, rank, referenceCount, createdAt, updatedAt } =
    item;
  const base = {
    ownerId,
    schemaVersion,
    revision,
    title,
    rank,
    referenceCount,
    createdAt,
    updatedAt,
  };
  return item.kind === 'milestone'
    ? { ...base, kind: item.kind, id: item.id, arcId: item.arcId }
    : item.kind === 'event'
      ? { ...base, kind: item.kind, id: item.id, dateLabel: item.dateLabel }
      : { ...base, kind: item.kind, id: item.id };
}
export function page<T>(items: T[], nextCursor: string | null = null): NarrativePage<T> {
  return { items, nextCursor, projectRevision: 1, sceneRevision: 1 };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
export function conflict() {
  return Object.assign(new Error('A revisão mudou.'), {
    code: 'functions/failed-precondition',
    details: { reason: 'revision-conflict' },
  });
}
export function transport() {
  return Object.assign(new Error('Não foi possível confirmar esta operação. Tente novamente.'), {
    code: 'functions/unavailable',
  });
}
