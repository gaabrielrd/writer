import { vi } from 'vitest';
import type {
  AdventureDeletionSource,
  AdventureDeletionProgress,
  AdventureDeletionStartPending,
  AdventureDeletionStepPending,
  AdventureDeletionReceipt,
} from '../model/adventureDeletion';
import { floorOf, identityOf } from '../model/adventureDeletionContracts';
import type { AdventureDeletionTransport } from '../services/adventureDeletionTransport';
export const uid = 'author',
  adventureId = 'client-adventure-project',
  deletionId = 'client-deletion-start-0001';
export const source: AdventureDeletionSource = {
  schemaVersion: 1,
  ownerId: uid,
  adventureId,
  adventureToken: 'a'.repeat(64),
  sourceToken: 'b'.repeat(64),
  revision: 4,
  title: 'PRIVATE_TITLE_NOT_IN_JOURNAL',
};
export const progress: AdventureDeletionProgress = {
  schemaVersion: 1,
  ownerId: uid,
  adventureId,
  adventureToken: source.adventureToken,
  deletionId,
  deletionToken: 'c'.repeat(64),
  title: source.title,
  phase: 'quiescence',
  state: 'deleting',
  checkpoint: 0,
  deletedDocuments: 0,
  complete: false,
  revoked: true,
  createdAt: 1000,
  updatedAt: 1000,
};
export const start: AdventureDeletionStartPending = {
  schemaVersion: 1,
  ownerId: uid,
  kind: 'start',
  phase: 'request',
  input: {
    adventureId,
    adventureToken: source.adventureToken,
    sourceToken: source.sourceToken,
    expectedRevision: source.revision,
    operationId: deletionId,
  },
};
export const step: AdventureDeletionStepPending = {
  schemaVersion: 1,
  ownerId: uid,
  kind: 'step',
  identity: identityOf(progress),
  floor: floorOf(progress),
  input: {
    deletionId,
    deletionToken: progress.deletionToken,
    expectedCheckpoint: 0,
    operationId: 'client-deletion-step-0001',
  },
};
export const storageKey = 'writer:adventure-deletion:' + JSON.stringify([uid, adventureId]);
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function installBrowser() {
  localStorage.clear();
  const queues = new Map<string, Promise<unknown>>();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (key: string, work: () => unknown) => {
        const run = (queues.get(key) ?? Promise.resolve()).then(work);
        queues.set(
          key,
          run.catch(() => {}),
        );
        return run;
      },
    },
  });
}
export function server() {
  let job: AdventureDeletionProgress | null = null,
    effects = 0;
  const receipts = new Map<string, AdventureDeletionReceipt>(),
    canceled = new Set<string>();
  const confirm = (
    action: 'start' | 'advance',
    input: { operationId: string; expectedCheckpoint?: number },
  ) => {
    let receipt = receipts.get(input.operationId);
    if (!receipt) {
      const checkpoint = action === 'start' ? 0 : input.expectedCheckpoint! + 1;
      job =
        action === 'start'
          ? { ...progress, deletionId: input.operationId }
          : {
              ...job!,
              checkpoint,
              deletedDocuments: checkpoint,
              updatedAt: 1000 + checkpoint,
              phase: checkpoint >= 3 ? 'complete' : 'controls',
              state: checkpoint >= 3 ? 'deleted' : 'deleting',
              complete: checkpoint >= 3,
            };
      receipt = {
        operationId: input.operationId,
        action,
        expectedCheckpoint: action === 'start' ? null : input.expectedCheckpoint!,
        confirmedCheckpoint: checkpoint,
      };
      receipts.set(input.operationId, receipt);
      effects++;
    }
    return structuredClone({ receipt, progress: job });
  };
  const transport = {
    getSource: vi.fn((): Promise<typeof source | null> => Promise.resolve(structuredClone(source))),
    get: vi.fn(() =>
      Promise.resolve({
        schemaVersion: 1,
        ownerId: uid,
        lookup: { adventureId },
        deletion: structuredClone(job),
      }),
    ),
    start: vi.fn((input: typeof start.input) =>
      Promise.resolve(
        canceled.has(input.operationId)
          ? { schemaVersion: 1, ownerId: uid, kind: 'canceled', request: structuredClone(input) }
          : confirm('start', input),
      ),
    ),
    advance: vi.fn((input: typeof step.input) => Promise.resolve(confirm('advance', input))),
    resolveStart: vi.fn((input: typeof start.input & { intent: 'cancel' }): Promise<unknown> => {
      const { intent, ...request } = input;
      void intent;
      if (receipts.has(input.operationId)) return Promise.resolve(confirm('start', input));
      canceled.add(input.operationId);
      return Promise.resolve({ schemaVersion: 1, ownerId: uid, kind: 'canceled', request });
    }),
    list: vi.fn(() =>
      Promise.resolve({
        schemaVersion: 1,
        ownerId: uid,
        items: job ? [structuredClone(job)] : [],
        nextCursor: null,
      }),
    ),
  } satisfies AdventureDeletionTransport;
  return {
    transport,
    confirm,
    get job() {
      return job;
    },
    get effects() {
      return effects;
    },
    setJob: (value: AdventureDeletionProgress) => {
      job = structuredClone(value);
    },
  };
}
