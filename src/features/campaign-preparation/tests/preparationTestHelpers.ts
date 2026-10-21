import { vi } from 'vitest';
import type {
  PendingCampaignPreparation,
  PreparationOutcome,
  PreparationRequest,
  PreparationItem,
  PreparationItemSummary,
} from '../model/campaignPreparation';
export const uid = 'owner',
  campaignId = 'campaign',
  token = 'a'.repeat(64),
  itemId = 'item-000000000001',
  operationId = 'operation-000000001',
  sessionId = 'session-0000000001';
export const identity = {
  schemaVersion: 1 as const,
  ownerId: uid,
  campaignId,
  campaignToken: token,
};
export const scope = { campaignId, campaignToken: token };
export const sessionScope = { ...scope, sessionId, expectedSessionRevision: 1 };
export const clue = {
  id: itemId,
  kind: 'clue',
  revision: 1,
  order: 1,
  title: 'A chave perdida',
  status: 'pending',
  body: { text: 'Texto próprio  \n', condition: 'Ao abrir a porta', recipient: 'Maga' },
  createdAt: 1000,
  updatedAt: 1000,
} satisfies PreparationItem;
export const quest = {
  ...clue,
  id: 'quest-00000000001',
  kind: 'quest',
  title: 'Encontrar o farol',
  status: 'available',
  body: { description: 'Um farol apagado', consequences: 'A vila poderá navegar' },
} satisfies PreparationItem;
export function summary(item: PreparationItem): PreparationItemSummary {
  const { body, ...value } = item;
  void body;
  return value;
}
const itemWrite = {
  ...scope,
  operationId,
  itemId,
  expectedRevision: 1,
  expectedItemCollectionRevision: 2,
};
const linkWrite = {
  ...sessionScope,
  operationId,
  linkId: 'link-000000000001',
  expectedRevision: 1,
  expectedLinkCollectionRevision: 3,
};
export const requests: PreparationRequest[] = [
  {
    action: 'save-item',
    request: {
      ...itemWrite,
      kind: 'clue',
      title: clue.title,
      status: 'pending',
      body: clue.body,
    },
  },
  { action: 'delete-item', request: itemWrite },
  { action: 'move-item', request: { ...itemWrite, direction: 'up' } },
  {
    action: 'add-link',
    request: {
      ...linkWrite,
      linkId: operationId,
      expectedRevision: 0,
      itemId,
      expectedItemRevision: 1,
    },
  },
  { action: 'remove-link', request: linkWrite },
  { action: 'move-link', request: { ...linkWrite, direction: 'down' } },
];
export const pending = (
  request: PreparationRequest = requests[0]!,
): PendingCampaignPreparation => ({
  ...structuredClone(request),
  schemaVersion: 1,
  ownerId: uid,
  intent: 'apply',
});
export function outcome(p: PreparationRequest): PreparationOutcome {
  const r = p.request;
  if (p.action === 'save-item' || p.action === 'delete-item' || p.action === 'move-item') {
    const q = p.request;
    return {
      ...identity,
      kind: 'confirmed',
      receipt: {
        action: p.action,
        operationId: q.operationId,
        itemId: q.itemId,
        expectedRevision: q.expectedRevision,
        revision: q.expectedRevision + 1,
        itemCollectionRevision: q.expectedItemCollectionRevision + 1,
      },
    };
  }
  const q = p.request;
  void r;
  return {
    ...identity,
    kind: 'confirmed',
    receipt: {
      action: p.action,
      operationId: q.operationId,
      linkId: q.linkId,
      sessionId: q.sessionId,
      expectedSessionRevision: q.expectedSessionRevision,
      expectedRevision: q.expectedRevision,
      revision: q.expectedRevision + 1,
      linkCollectionRevision: q.expectedLinkCollectionRevision + 1,
    },
  };
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
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}
