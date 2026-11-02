import { readId } from './bookLoreReadContracts';
import {
  readRemovalJournal,
  removalJournalTransition,
  LoreRemovalJournalConflict,
  type LoreRemovalJournal,
} from './bookLoreRemovalJournalContracts';

export const LORE_REMOVAL_DB = 'writer.book-lore-removals';
const STORE = 'removals';
const unavailable = () =>
  Error('Não foi possível gravar a recuperação da retirada neste dispositivo.');
function open(guard: () => void): Promise<IDBDatabase> {
  guard();
  if (
    !globalThis.indexedDB ||
    !globalThis.navigator?.locks?.request ||
    globalThis.isSecureContext === false
  )
    return Promise.reject(unavailable());
  return new Promise((resolve, reject) => {
    let failed = false;
    const r = indexedDB.open(LORE_REMOVAL_DB, 1);
    r.onupgradeneeded = () => {
      if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE);
    };
    r.onerror = () => {
      failed = true;
      reject(unavailable());
    };
    r.onblocked = () => {
      failed = true;
      reject(Error('Feche outras versões do Writer para retomar a retirada.'));
    };
    r.onsuccess = () => {
      const db = r.result;
      try {
        if (failed) {
          db.close();
          return;
        }
        guard();
        db.onversionchange = () => db.close();
        resolve(db);
      } catch (e) {
        db.close();
        reject(e instanceof Error ? e : unavailable());
      }
    };
  });
}
function run<T>(
  db: IDBDatabase,
  mode: IDBTransactionMode,
  guard: () => void,
  work: (store: IDBObjectStore, done: (v: T) => void, fail: (e: unknown) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let result: T,
      hasResult = false,
      error: unknown;
    let tx: IDBTransaction;
    try {
      guard();
      tx = db.transaction([STORE], mode);
    } catch (e) {
      db.close();
      reject(e instanceof Error ? e : unavailable());
      return;
    }
    const fail = (e: unknown) => {
      error = e;
      tx.abort();
    };
    tx.onerror = () => {
      error ??= unavailable();
    };
    tx.onabort = () => {
      db.close();
      reject(error instanceof Error ? error : unavailable());
    };
    tx.oncomplete = () => {
      db.close();
      try {
        guard();
        if (!hasResult) throw unavailable();
        resolve(result);
      } catch (e) {
        reject(e instanceof Error ? e : unavailable());
      }
    };
    try {
      guard();
      work(
        tx.objectStore(STORE),
        (v) => {
          result = v;
          hasResult = true;
        },
        fail,
      );
    } catch (e) {
      fail(e);
    }
  });
}
export interface LoreRemovalStore {
  read(): Promise<LoreRemovalJournal | null>;
  commit(next: LoreRemovalJournal, expected: string | null): Promise<LoreRemovalJournal>;
}
export function bookLoreRemovalStore(
  uid: string,
  writeId: string,
  guard: () => void,
): LoreRemovalStore {
  readId(uid);
  readId(writeId);
  const key: [string, string] = [uid, writeId];
  return {
    async read() {
      return run(await open(guard), 'readonly', guard, (store, done, fail) => {
        const r: IDBRequest<unknown> = store.get(key);
        r.onsuccess = () => {
          try {
            guard();
            done(r.result === undefined ? null : readRemovalJournal(r.result, uid, writeId));
          } catch (e) {
            fail(e);
          }
        };
      });
    },
    async commit(next, expected) {
      guard();
      const checked = readRemovalJournal(next, uid, writeId);
      if (!globalThis.navigator?.locks?.request) throw unavailable();
      return navigator.locks.request('writer.book-lore-removal:' + JSON.stringify(key), async () =>
        run(await open(guard), 'readwrite', guard, (store, done, fail) => {
          const r: IDBRequest<unknown> = store.get(key);
          r.onsuccess = () => {
            try {
              guard();
              const current =
                r.result === undefined ? null : readRemovalJournal(r.result, uid, writeId);
              if (current?.stamp === checked.stamp) {
                done(current);
                return;
              }
              if ((current?.stamp ?? null) !== expected) throw new LoreRemovalJournalConflict();
              if (current) removalJournalTransition(current, checked);
              else if (checked.revision !== 0) throw new LoreRemovalJournalConflict();
              store.put(checked, key);
              done(checked);
            } catch (e) {
              fail(e);
            }
          };
        }),
      );
    },
  };
}
export async function listBookLoreRemovals(
  uid: string,
  guard: () => void,
  after?: string,
  limit = 50,
) {
  readId(uid);
  if (after !== undefined) readId(after);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) throw unavailable();
  return run<{ items: LoreRemovalJournal[]; next: string | null }>(
    await open(guard),
    'readonly',
    guard,
    (store, done, fail) => {
      const items: LoreRemovalJournal[] = [];
      const r = store.openCursor(
        IDBKeyRange.bound([uid, after ?? ''], [uid, []], after !== undefined, true),
      );
      r.onsuccess = () => {
        try {
          guard();
          const cursor = r.result;
          if (!cursor) {
            done({ items, next: null });
            return;
          }
          const key = cursor.key;
          if (
            !Array.isArray(key) ||
            key.length !== 2 ||
            key[0] !== uid ||
            typeof key[1] !== 'string'
          )
            throw unavailable();
          if (items.length === limit) {
            done({ items, next: items[items.length - 1]!.identity.writeId });
            return;
          }
          items.push(readRemovalJournal(cursor.value, uid, key[1]));
          cursor.continue();
        } catch (e) {
          fail(e);
        }
      };
    },
  );
}
