import { vi } from 'vitest';
import { webcrypto } from 'node:crypto';
const uid = 'owner',
  campaignId = 'campaign';
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
