import { vi } from 'vitest';
import type {
  PendingSessionReference,
  SessionReferenceOutcome,
  SessionReferencePage,
  SessionReferenceRow,
  SessionLoreReferenceResult,
} from '../model/sessionReference';
export const uid = 'owner',
  cid = 'campaign-references',
  token = 'a'.repeat(64),
  sourceKey = 'b'.repeat(64);
export const scope = {
  campaignId: cid,
  campaignToken: token,
  sessionId: 'session-0000000001',
  expectedSessionRevision: 1,
};
export const context = { baseId: 'c'.repeat(64), projectionToken: 'd'.repeat(64) };
export const candidate = {
  sourceKey,
  name: 'Lia da mesa',
  category: 'character' as const,
  revision: 2,
  mode: 'override' as const,
  legacy: true,
};
export const row: SessionReferenceRow = {
  id: 'reference-0000000001',
  revision: 1,
  createdAt: 1000,
  updatedAt: 1000,
  available: true,
  target: { kind: 'lore', ...candidate },
};
export const envelope = {
  schemaVersion: 1 as const,
  ownerId: uid,
  campaignId: cid,
  campaignToken: token,
  sessionId: scope.sessionId,
  sessionRevision: 1,
  referenceCollectionRevision: 1,
};
export const page = (
  items: SessionReferenceRow[] = [],
  nextCursor: string | null = null,
): Extract<SessionReferencePage, { view: 'references' }> => ({
  ...envelope,
  view: 'references',
  sourceContext: context,
  items,
  nextCursor,
});
export const material: SessionLoreReferenceResult = {
  ...envelope,
  referenceId: row.id,
  referenceRevision: 1,
  sourceContext: context,
  material: {
    kind: 'lore',
    sourceKey: candidate.sourceKey,
    revision: candidate.revision,
    mode: candidate.mode,
    legacy: candidate.legacy,
    entity: {
      name: candidate.name,
      aliases: ['A vigia'],
      category: 'character',
      summary: 'Resumo autorizado',
      details: 'Detalhes protegidos da ficha',
      structuredDetails: {
        appearance: 'Manto azul',
        personality: 'Paciente',
        history: 'Vigia da torre',
        notes: 'Nota da mesa',
      },
      relations: [
        {
          targetKey: 'e'.repeat(64),
          targetName: 'Torre antiga',
          relationType: 'habita',
          description: 'Lar atual',
        },
      ],
    },
  },
};
export const operation = {
  schemaVersion: 1,
  ownerId: uid,
  intent: 'apply',
  action: 'add',
  request: {
    ...scope,
    operationId: 'operation-reference-0001',
    referenceId: 'operation-reference-0001',
    expectedReferenceCollectionRevision: 1,
    sourceContext: context,
    target: { kind: 'lore', sourceKey },
  },
} satisfies PendingSessionReference;
export function confirmed(op: PendingSessionReference): SessionReferenceOutcome {
  return {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: op.request.campaignId,
    campaignToken: op.request.campaignToken,
    sessionId: op.request.sessionId,
    kind: 'confirmed',
    receipt: {
      operationId: op.request.operationId,
      action: op.action,
      referenceId: op.request.referenceId,
      sessionId: op.request.sessionId,
      expectedSessionRevision: op.request.expectedSessionRevision,
      expectedReferenceCollectionRevision: op.request.expectedReferenceCollectionRevision,
      revision: op.action === 'add' ? 1 : op.request.expectedRevision + 1,
      referenceCollectionRevision: op.request.expectedReferenceCollectionRevision + 1,
    },
  };
}
export const journalKey = 'writer:session-references:' + JSON.stringify([uid, cid]);
export function installLocks() {
  let tail = Promise.resolve();
  const request = vi.fn((_key: string, work: () => unknown) => {
    const next = tail.then(work);
    tail = next.then(
      () => {},
      () => {},
    );
    return next;
  });
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request } });
  return request;
}
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
export const rpcError = (reason: string) =>
  Object.assign(new Error(reason), { code: 'functions/failed-precondition', details: { reason } });
