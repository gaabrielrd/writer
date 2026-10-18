import { webcrypto } from 'node:crypto';
import { vi } from 'vitest';
import type {
  CampaignLoreEntityInput,
  CampaignLoreEnvelope,
  CampaignLoreHeader,
  CampaignLoreOperation,
  CampaignLoreResolution,
  CampaignLoreResult,
} from '../model/campaignLore';
export const uid = 'owner',
  campaignId = 'campaign',
  baseId = 'b'.repeat(64),
  sourceKey = 'a'.repeat(64),
  targetKey = 'd'.repeat(64),
  campaignToken = 'c'.repeat(64);
export const envelope: CampaignLoreEnvelope = {
  schemaVersion: 1,
  ownerId: uid,
  campaignId,
  baseId,
  campaignToken,
  collectionRevision: 0,
  projectionToken: 'e'.repeat(64),
};
export const header: CampaignLoreHeader = {
  campaignId,
  baseId,
  campaignToken,
  sourceKey,
  operationId: 'operation-1',
  expectedRevision: 0,
};
export const entity: CampaignLoreEntityInput = {
  name: 'Lia',
  aliases: ['Lia, a guia'],
  category: 'character',
  summary: 'Guia da mesa',
  details: '  Segredo 🐉\n da mesa  ',
  structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
  relations: [],
};
export function result(revision = 0): CampaignLoreResult {
  return {
    ...envelope,
    collectionRevision: revision,
    item: {
      sourceKey,
      revision,
      mode: revision ? 'override' : 'base',
      createdAt: revision ? 100 : null,
      updatedAt: revision ? 100 : null,
      entityHash: 'f'.repeat(64),
      entity: { ...entity, relations: [] },
    },
  };
}
export const operation: CampaignLoreOperation = {
  schemaVersion: 1,
  ownerId: uid,
  header,
  action: 'save',
  relatedSourceKeys: [],
  phase: 'preparing',
};
export function resolution(
  op: CampaignLoreOperation,
  state: 'committed' | 'canceled' = 'committed',
): CampaignLoreResolution {
  return {
    ...op.header,
    schemaVersion: 1,
    ownerId: op.ownerId,
    action: op.action,
    ...(op.action === 'save' ? { relatedSourceKeys: op.relatedSourceKeys } : {}),
    state,
    revision: state === 'committed' ? op.header.expectedRevision + 1 : null,
  };
}
export function deferred<T>() {
  let resolve!: (value: T) => void, reject!: (cause: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
// Small IDB event harness: tests exercise the real repository and its transaction
// boundary. Real IndexedDB persistence/concurrency is covered by the native suite.
export function installRecoveryHarness() {
  const rows = new Map<string, unknown>();
  let abortNextWrite = false,
    holdWrites = false;
  const completions: (() => void)[] = [];
  const db = {
    close: vi.fn(),
    onversionchange: null,
    transaction: (_name: string, mode: string) => {
      let dead = false,
        candidate: unknown,
        recordKey = '',
        writing = false;
      const tx: {
        oncomplete: (() => void) | null;
        onabort: (() => void) | null;
        onerror: (() => void) | null;
        abort: () => void;
        objectStore: () => unknown;
      } = {
        oncomplete: null,
        onabort: null,
        onerror: null,
        abort: () => {
          dead = true;
          queueMicrotask(() => tx.onabort?.());
        },
        objectStore: () => ({
          get: (key: string) => {
            recordKey = key;
            const request: { result: unknown; onsuccess: (() => void) | null } = {
              result: undefined,
              onsuccess: null,
            };
            queueMicrotask(() => {
              request.result = structuredClone(rows.get(key));
              request.onsuccess?.();
              const complete = () => {
                if (dead) return;
                if (mode === 'readwrite' && abortNextWrite) {
                  abortNextWrite = false;
                  tx.abort();
                  return;
                }
                if (writing) {
                  if (candidate === undefined) rows.delete(recordKey);
                  else rows.set(recordKey, structuredClone(candidate));
                }
                tx.oncomplete?.();
              };
              if (mode === 'readwrite' && holdWrites) completions.push(complete);
              else queueMicrotask(complete);
            });
            return request;
          },
          put: (value: unknown) => {
            candidate = value;
            writing = true;
          },
          delete: () => {
            candidate = undefined;
            writing = true;
          },
        }),
      };
      return tx;
    },
  };
  const factory = {
    open: () => {
      const request: { result: unknown; onsuccess: (() => void) | null } = {
        result: db,
        onsuccess: null,
      };
      queueMicrotask(() => request.onsuccess?.());
      return request;
    },
  };
  let tail = Promise.resolve();
  let held: Promise<void> | null = null;
  const locks = {
    request: vi.fn((_name: string, callback: () => Promise<unknown>) => {
      const prior = tail;
      const call = prior.then(async () => {
        if (held) await held;
        return callback();
      });
      tail = call.then(
        () => {},
        () => {},
      );
      return call;
    }),
  };
  vi.stubGlobal('indexedDB', factory);
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('BroadcastChannel', undefined);
  Object.defineProperty(navigator, 'locks', { configurable: true, value: locks });
  return {
    rows,
    locks,
    key: JSON.stringify([uid, campaignId]),
    abortWrite: () => {
      abortNextWrite = true;
    },
    holdWrites: () => {
      holdWrites = true;
    },
    completeWrite: () => {
      completions.shift()?.();
    },
    releaseWrites: () => {
      holdWrites = false;
      completions.splice(0).forEach((fn) => fn());
    },
    holdLock: (promise: Promise<void>) => {
      held = promise;
    },
    releaseLock: () => {
      held = null;
    },
  };
}
