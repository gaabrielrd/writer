import { vi } from 'vitest';
import type {
  CampaignSession,
  CampaignSessionEnvelope,
  CampaignSessionMutation,
  PendingCampaignSession,
} from '../model/campaignSession';
export const uid = 'owner',
  campaignId = 'campaign',
  token = 'a'.repeat(64),
  sessionId = 'session-0000000001';
export const envelope: CampaignSessionEnvelope = {
  schemaVersion: 1,
  ownerId: uid,
  campaignId,
  campaignToken: token,
  collectionRevision: 1,
};
export const session: CampaignSession = {
  schemaVersion: 1,
  ownerId: uid,
  campaignId,
  id: sessionId,
  revision: 1,
  order: 1,
  title: 'Primeiro encontro',
  summary: 'Texto autoral  \n',
  scheduledDate: null,
  status: 'planned',
  createdAt: 1000,
  updatedAt: 1000,
};
export const operation: PendingCampaignSession = {
  schemaVersion: 1,
  ownerId: uid,
  method: 'saveCampaignSession',
  input: {
    campaignId,
    campaignToken: token,
    sessionId,
    operationId: sessionId,
    expectedRevision: 0,
    title: session.title,
    summary: session.summary,
    scheduledDate: null,
    status: 'planned',
  },
};
export function mutation(
  op: PendingCampaignSession,
  body: CampaignSession | null = session,
  collectionRevision = 1,
): CampaignSessionMutation {
  return {
    ...envelope,
    collectionRevision,
    receipt: {
      operationId: op.input.operationId,
      action:
        op.method === 'saveCampaignSession'
          ? 'save'
          : op.method === 'moveCampaignSession'
            ? 'move'
            : 'delete',
      sessionId: op.input.sessionId,
      expectedRevision: op.input.expectedRevision,
      revision: op.input.expectedRevision + 1,
      collectionRevision:
        op.method === 'moveCampaignSession'
          ? op.input.expectedCollectionRevision + 1
          : collectionRevision,
    },
    session: body,
  };
}
export const summary = (value: CampaignSession) => {
  const { summary: _, ...metadata } = value;
  void _;
  return metadata;
};
export const journalKey = 'writer:campaign-sessions:' + JSON.stringify([uid, campaignId]);
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
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
export const rpcError = (reason: string) =>
  Object.assign(new Error(reason), { code: 'functions/failed-precondition', details: { reason } });
