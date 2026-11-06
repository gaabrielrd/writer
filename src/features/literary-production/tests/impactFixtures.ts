import type { ImpactFrame, ImpactScope, ImpactStart } from '../model/impact';
export const impactToken = 'c'.repeat(64),
  impactBookToken = 'b'.repeat(64),
  impactHash = 'a'.repeat(64);
export const impactStart: ImpactStart = {
  target: { kind: 'book', id: 'book' },
  jobId: 'impact-map-000001',
  bookIds: ['book'],
  sources: [{ kind: 'book', id: 'book', scopeKind: 'book', scopeId: 'book' }],
  prepareIndices: false,
  expectedBookToken: impactBookToken,
  expectedScopeToken: 'd'.repeat(64),
  requestHash: impactHash,
};
export const impactFrame: ImpactFrame = {
  jobId: impactStart.jobId,
  bookIds: ['book'],
  sources: impactStart.sources,
  prepareIndices: false,
  phase: 'freezing',
  revision: 1,
  originToken: impactToken,
  bookToken: impactBookToken,
  current: true,
  steps: 0,
  inventoryIndex: 0,
  inventoryCount: 30,
  records: 0,
  unavailable: 0,
  unsupported: 0,
  identityUnknown: 0,
  graph: null,
  coverage: null,
  pendingIndex: null,
  reason: null,
  createdAt: 100,
  semanticCompleteness: false,
  publicationReady: false,
  authorAccepted: false,
};
export const impactScope: ImpactScope = {
  bookToken: impactBookToken,
  scopeToken: impactStart.expectedScopeToken,
  bookIds: ['book'],
  inventoryCount: 30,
  maximumBooksPerRun: 10,
  registryToken: 'e'.repeat(64),
  scope: 'registered-dependencies',
  historicalOriginCoverage: false,
  publicationReady: false,
};
export function impactLocks() {
  let queue = Promise.resolve<unknown>(undefined);
  return {
    request: (_name: string, action: () => unknown) => {
      const result = queue.then(action);
      queue = result.catch(() => undefined);
      return result;
    },
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (cause: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
