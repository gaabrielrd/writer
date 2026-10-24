import {
  journalHead,
  journalFrame,
  journalFail,
  type LoreJournalHead,
  type LoreJournalIdentity,
  type LoreJournalSection,
  type LoreJournalFrame,
} from './bookLoreJournalContracts';
import { readLoreControlRecord, type LoreControlRecord } from './bookLoreControlContracts';
export const LORE_JOURNAL_DB = 'writer.book-lore-journal';
const HEADS = 'heads',
  FRAMES = 'frames';
export type JournalFrameKey = [string, string, LoreJournalSection, string, number];
export type JournalControlKey = [string, string, 'controls', string, number | string];
export type JournalRecordKey = JournalFrameKey | JournalControlKey;
export const journalFrameKey = (
  i: LoreJournalIdentity,
  s: LoreJournalSection,
  g: string,
  n: number,
): JournalFrameKey => [i.uid, i.writeId, s, g, n];
export const journalStorageAvailable = () =>
  !!globalThis.indexedDB &&
  !!globalThis.crypto?.subtle &&
  typeof globalThis.navigator?.locks?.request === 'function' &&
  globalThis.isSecureContext !== false;
function open(): Promise<IDBDatabase> {
  if (!journalStorageAvailable())
    return Promise.reject(
      Error('Este navegador não oferece recuperação cifrada e reserva seguras.'),
    );
  return new Promise((resolve, reject) => {
    let failed = false;
    const r = indexedDB.open(LORE_JOURNAL_DB, 1);
    r.onupgradeneeded = () => {
      r.result.createObjectStore(HEADS);
      r.result.createObjectStore(FRAMES);
    };
    r.onerror = () => {
      failed = true;
      reject(Error('Não foi possível abrir a cópia protegida.'));
    };
    r.onblocked = () => {
      failed = true;
      reject(Error('Feche outras versões do Writer para abrir a recuperação.'));
    };
    r.onsuccess = () => {
      const db = r.result;
      if (failed) {
        db.close();
        return;
      }
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
function operation<T>(
  db: IDBDatabase,
  stores: string[],
  mode: IDBTransactionMode,
  work: (tx: IDBTransaction, done: (v: T) => void) => void,
): Promise<T> {
  return new Promise((resolve, reject) => {
    let result: T, error: unknown;
    const tx = db.transaction(stores, mode);
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      error ??= Error('A gravação da cópia protegida falhou. Seus dados foram preservados.');
    };
    tx.onabort = () => {
      db.close();
      reject(
        error instanceof Error ? error : Error('A gravação da cópia protegida foi cancelada.'),
      );
    };
    try {
      work(tx, (v) => {
        result = v;
      });
    } catch (e) {
      error = e;
      tx.abort();
    }
  });
}
export async function readJournalHead(
  uid: string,
  writeId: string,
): Promise<LoreJournalHead | null> {
  const db = await open();
  return operation(db, [HEADS], 'readonly', (tx, done) => {
    const r: IDBRequest<unknown> = tx.objectStore(HEADS).get([uid, writeId]);
    r.onsuccess = () => {
      try {
        done(r.result === undefined ? null : journalHead(r.result, uid, writeId));
      } catch {
        tx.abort();
      }
    };
  });
}
export async function commitJournalHead(
  identity: LoreJournalIdentity,
  expected: string | null,
  next: LoreJournalHead,
  adds: { key: JournalRecordKey; value: LoreJournalFrame | LoreControlRecord }[] = [],
  removes: JournalRecordKey[] = [],
) {
  if (!journalStorageAvailable()) throw Error('A recuperação protegida não está disponível.');
  return navigator.locks.request(
    'writer.book-lore-journal:' + JSON.stringify([identity.uid, identity.writeId]),
    async () => {
      const db = await open();
      return operation<LoreJournalHead>(db, [HEADS, FRAMES], 'readwrite', (tx, done) => {
        const store = tx.objectStore(HEADS),
          r: IDBRequest<unknown> = store.get([identity.uid, identity.writeId]);
        r.onsuccess = () => {
          try {
            const current =
              r.result === undefined ? null : journalHead(r.result, identity.uid, identity.writeId);
            if ((current?.stamp ?? null) !== expected) journalFail();
            const checked = journalHead(next, identity.uid, identity.writeId);
            store.put(checked, [identity.uid, identity.writeId]);
            const frames = tx.objectStore(FRAMES);
            for (const add of adds) {
              if (add.key[0] !== identity.uid || add.key[1] !== identity.writeId) journalFail();
              frames.add(
                add.key[2] === 'controls'
                  ? readLoreControlRecord(add.value)
                  : journalFrame(add.value),
                add.key,
              );
            }
            for (const key of removes) frames.delete(key);
            done(checked);
          } catch {
            tx.abort();
          }
        };
      });
    },
  );
}
export async function readJournalFrame(key: JournalFrameKey): Promise<LoreJournalFrame> {
  const db = await open();
  return operation(db, [FRAMES], 'readonly', (tx, done) => {
    const r: IDBRequest<unknown> = tx.objectStore(FRAMES).get(key);
    r.onsuccess = () => {
      try {
        done(journalFrame(r.result));
      } catch {
        tx.abort();
      }
    };
  });
}
export async function listJournalHeads(uid: string, after?: string, limit = 50) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) journalFail();
  const db = await open();
  return operation<{ items: LoreJournalHead[]; next: string | null }>(
    db,
    [HEADS],
    'readonly',
    (tx, done) => {
      const items: LoreJournalHead[] = [],
        range = IDBKeyRange.bound([uid, after ?? ''], [uid, []], after !== undefined, true),
        r = tx.objectStore(HEADS).openCursor(range);
      r.onsuccess = () => {
        try {
          const c = r.result;
          if (!c) {
            done({ items, next: null });
            return;
          }
          if (items.length === limit) {
            done({ items, next: items.at(-1)!.identity.writeId });
            return;
          }
          const raw: unknown = c.value,
            key = c.key;
          if (!Array.isArray(key) || key[0] !== uid || typeof key[1] !== 'string') journalFail();
          items.push(journalHead(raw, uid, key[1]));
          c.continue();
        } catch {
          tx.abort();
        }
      };
    },
  );
}

export async function readJournalControlRecord(key: JournalControlKey): Promise<LoreControlRecord> {
  const db = await open();
  return operation(db, [FRAMES], 'readonly', (tx, done) => {
    const r: IDBRequest<unknown> = tx.objectStore(FRAMES).get(key);
    r.onsuccess = () => {
      try {
        done(readLoreControlRecord(r.result));
      } catch {
        tx.abort();
      }
    };
  });
}
