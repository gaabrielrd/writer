import type {
  DeletionSource,
  DeletionProgress,
  DeletionControl,
  DeletionStartPending,
  DeletionStepPending,
} from '../model/campaignDeletion';
export const uid = 'owner',
  campaignId = 'campaign',
  token = 'a'.repeat(64),
  deletionId = 'delete-one';
export const source: DeletionSource = {
  schemaVersion: 1,
  ownerId: uid,
  campaignId,
  campaignToken: token,
  revision: 3,
  title: 'Mesa privada',
};
export const progress: DeletionProgress = {
  schemaVersion: 1,
  ownerId: uid,
  campaignId,
  campaignToken: token,
  deletionId,
  state: 'deleting',
  phase: 'recovery',
  checkpoint: 0,
  complete: false,
  revoked: true,
  createdAt: 1000,
  updatedAt: 1000,
};
export const start: DeletionStartPending = {
  schemaVersion: 1,
  ownerId: uid,
  kind: 'start',
  phase: 'request',
  input: { campaignId, campaignToken: token, expectedRevision: 3, operationId: deletionId },
};
export const step: DeletionStepPending = {
  schemaVersion: 1,
  ownerId: uid,
  kind: 'step',
  identity: { schemaVersion: 1, ownerId: uid, campaignId, campaignToken: token, deletionId },
  input: { deletionId, operationId: 'step-one', expectedCheckpoint: 0 },
};
export function deferred<T>() {
  let resolve!: (v: T) => void, reject!: (e: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
export function installBrowser() {
  localStorage.clear();
  let tail = Promise.resolve();
  Object.defineProperty(navigator, 'locks', {
    configurable: true,
    value: {
      request: (_name: string, work: () => unknown) => {
        const run = tail.then(() => work());
        tail = run.then(
          () => {},
          () => {},
        );
        return run;
      },
    },
  });
}
export const storedKey = 'writer:campaign-deletion:' + JSON.stringify([uid, campaignId]);
export const put = (c: DeletionControl) => localStorage.setItem(storedKey, JSON.stringify(c));
