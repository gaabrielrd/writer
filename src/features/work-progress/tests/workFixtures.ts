import type {
  WorkProgress,
  WorkTarget,
  ChecklistItem,
  ChecklistPage,
  ResumeSummary,
} from '../model/workProgress';
export const target: WorkTarget = { kind: 'book', id: 'book' };
export function progress(
  scope: WorkTarget = target,
  extra: Partial<WorkProgress> = {},
): WorkProgress {
  return {
    target: scope,
    ownerId: 'owner',
    title: 'Projeto privado',
    revision: 1,
    activityRevision: 7,
    archived: false,
    editorialState: scope.kind === 'campaign' ? null : 'draft',
    wordGoal: scope.kind === 'campaign' ? null : 100,
    manuscript: scope.kind === 'campaign' ? null : { ready: true, wordCount: 40 },
    checklist: scope.kind === 'book' ? null : { total: 0, completed: 0 },
    ...extra,
  };
}
export const task: ChecklistItem = {
  id: 'task',
  title: 'Revisar pistas',
  completed: false,
  revision: 1,
  createdAt: 1000,
  updatedAt: 2000,
};
export function checklist(
  items: ChecklistItem[] = [task],
  nextCursor: string | null = null,
): ChecklistPage {
  return {
    items,
    nextCursor,
    checklistRevision: 1,
    total: items.length,
    completed: items.filter((item) => item.completed).length,
  };
}
export const recent: ResumeSummary = {
  target,
  title: 'Projeto privado',
  resource: { kind: 'chapter', id: 'chapter' },
  accessedAt: 1000,
};
export function conflict() {
  return Object.assign(new Error('A versão foi alterada em outro dispositivo.'), {
    code: 'functions/failed-precondition',
    details: { reason: 'revision-conflict' },
  });
}
export function uncertain() {
  return Object.assign(new Error('Não foi possível confirmar esta operação. Tente novamente.'), {
    code: 'functions/unavailable',
  });
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
