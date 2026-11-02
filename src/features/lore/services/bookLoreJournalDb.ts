import {
  journalHead,
  journalFrame,
  journalFail,
  sameJournalIdentity,
  type LoreJournalHead,
  type LoreJournalIdentity,
  type LoreJournalSection,
  type LoreJournalFrame,
} from './bookLoreJournalContracts';
import { readLoreControlRecord, type LoreControlRecord } from './bookLoreControlContracts';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { preparationHead, type LorePreparationHead } from './bookLorePreparationContracts';
export const LORE_JOURNAL_DB = 'writer.book-lore-journal';
const HEADS = 'heads',
  FRAMES = 'frames',
  PREPARATIONS = 'preparations';
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
    const r = indexedDB.open(LORE_JOURNAL_DB, 3);
    r.onupgradeneeded = () => {
      for (const store of [HEADS, FRAMES, PREPARATIONS, 'creationTickets', 'creationFrames'])
        if (!r.result.objectStoreNames.contains(store)) r.result.createObjectStore(store);
    };
    r.onerror = () => {
      failed = true;
      reject(
        Error(
          r.error?.name === 'VersionError'
            ? 'Atualize o Writer para abrir a recuperação deste dispositivo.'
            : 'Não foi possível abrir a cópia protegida.',
        ),
      );
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
      return operation<LoreJournalHead>(
        db,
        [HEADS, FRAMES, PREPARATIONS],
        'readwrite',
        (tx, done) => {
          const store = tx.objectStore(HEADS),
            r: IDBRequest<unknown> = store.get([identity.uid, identity.writeId]);
          r.onsuccess = () => {
            try {
              const current =
                r.result === undefined
                  ? null
                  : journalHead(r.result, identity.uid, identity.writeId);
              if ((current?.stamp ?? null) !== expected) journalFail();
              const checked = journalHead(next, identity.uid, identity.writeId);
              const save = () => {
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
              };
              if (expected === null) {
                const p: IDBRequest<unknown> = tx
                  .objectStore(PREPARATIONS)
                  .get([identity.uid, identity.writeId]);
                p.onsuccess = () => {
                  try {
                    if (
                      p.result !== undefined &&
                      preparationHead(p.result, identity.uid, identity.writeId).discard
                    )
                      journalFail();
                    save();
                  } catch {
                    tx.abort();
                  }
                };
              } else save();
            } catch {
              tx.abort();
            }
          };
        },
      );
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

export async function readJournalPreparation(
  uid: string,
  writeId: string,
): Promise<LorePreparationHead | null> {
  const db = await open();
  return operation(db, [PREPARATIONS], 'readonly', (tx, done) => {
    const r: IDBRequest<unknown> = tx.objectStore(PREPARATIONS).get([uid, writeId]);
    r.onsuccess = () => {
      try {
        done(r.result === undefined ? null : preparationHead(r.result, uid, writeId));
      } catch {
        tx.abort();
      }
    };
  });
}
export async function commitJournalPreparation(next: LorePreparationHead, expected: string | null) {
  if (!journalStorageAvailable()) throw Error('A recuperação protegida não está disponível.');
  const checked = preparationHead(next, next.uid, next.intent.writeId);
  return navigator.locks.request(
    'writer.book-lore-preparation:' + JSON.stringify([next.uid, next.intent.writeId]),
    async () => {
      const db = await open();
      return operation<LorePreparationHead>(db, [PREPARATIONS], 'readwrite', (tx, done) => {
        const store = tx.objectStore(PREPARATIONS),
          r: IDBRequest<unknown> = store.get([next.uid, next.intent.writeId]);
        r.onsuccess = () => {
          try {
            const current =
              r.result === undefined
                ? null
                : preparationHead(r.result, next.uid, next.intent.writeId);
            if (
              (current?.stamp ?? null) !== expected ||
              (current &&
                (current.requestHash !== checked.requestHash ||
                  (current.cancelRequested && !checked.cancelRequested) ||
                  (current.releaseRequested && !checked.releaseRequested) ||
                  (current.closed && hash(current.closed) !== hash(checked.closed)) ||
                  (current.reserveState === 'confirmed' && checked.reserveState !== 'confirmed') ||
                  (current.jobsClosed !== null && current.jobsClosed !== checked.jobsClosed) ||
                  (current.discard &&
                    (!checked.discard ||
                      ['requested', 'purging', 'complete'].indexOf(checked.discard.phase) <
                        ['requested', 'purging', 'complete'].indexOf(current.discard.phase) ||
                      checked.discard.deleted < current.discard.deleted)) ||
                  (current.revoke &&
                    (!checked.revoke || hash(current.revoke.wire) !== hash(checked.revoke.wire))) ||
                  (current.revoke?.state === 'confirmed' &&
                    checked.revoke?.state !== 'confirmed') ||
                  (current.identity &&
                    (!checked.identity ||
                      !sameJournalIdentity(current.identity, checked.identity)))))
            )
              journalFail();
            store.put(checked, [next.uid, next.intent.writeId]);
            done(checked);
          } catch {
            tx.abort();
          }
        };
      });
    },
  );
}
export async function listJournalPreparations(uid: string, after?: string, limit = 50) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) journalFail();
  const db = await open();
  return operation<{ items: LorePreparationHead[]; next: string | null }>(
    db,
    [PREPARATIONS],
    'readonly',
    (tx, done) => {
      const items: LorePreparationHead[] = [],
        range = IDBKeyRange.bound([uid, after ?? ''], [uid, []], after !== undefined, true),
        r = tx.objectStore(PREPARATIONS).openCursor(range);
      r.onsuccess = () => {
        try {
          const c = r.result;
          if (!c) {
            done({ items, next: null });
            return;
          }
          if (items.length === limit) {
            done({ items, next: items.at(-1)!.intent.writeId });
            return;
          }
          const key = c.key;
          if (!Array.isArray(key) || key[0] !== uid || typeof key[1] !== 'string') journalFail();
          items.push(preparationHead(c.value, uid, key[1]));
          c.continue();
        } catch {
          tx.abort();
        }
      };
    },
  );
}

export async function advanceJournalDiscard(
  uid: string,
  writeId: string,
  expected: string,
  limit = 50,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) journalFail();
  return navigator.locks.request(
    'writer.book-lore-preparation:' + JSON.stringify([uid, writeId]),
    () =>
      navigator.locks.request(
        'writer.book-lore-journal:' + JSON.stringify([uid, writeId]),
        async () => {
          const db = await open();
          return operation<LorePreparationHead>(
            db,
            [PREPARATIONS, HEADS, FRAMES],
            'readwrite',
            (tx, done) => {
              const preparations = tx.objectStore(PREPARATIONS),
                request: IDBRequest<unknown> = preparations.get([uid, writeId]);
              request.onsuccess = () => {
                try {
                  const p = preparationHead(request.result, uid, writeId);
                  if (
                    p.stamp !== expected ||
                    !p.discard ||
                    !p.closed ||
                    p.jobsClosed === null ||
                    !p.releaseRequested
                  )
                    journalFail();
                  const heads = tx.objectStore(HEADS),
                    headRequest: IDBRequest<unknown> = heads.get([uid, writeId]);
                  headRequest.onsuccess = () => {
                    try {
                      if (headRequest.result !== undefined) {
                        const j = journalHead(headRequest.result, uid, writeId);
                        if (
                          p.discard!.phase !== 'requested' ||
                          !p.identity ||
                          !sameJournalIdentity(j.identity, p.identity)
                        )
                          journalFail();
                      }
                      if (p.discard!.phase !== 'complete') heads.delete([uid, writeId]);
                      const frames = tx.objectStore(FRAMES),
                        range = IDBKeyRange.bound([uid, writeId], [uid, writeId, []], false, true),
                        cursor = frames.openCursor(range);
                      let removed = 0;
                      cursor.onsuccess = () => {
                        try {
                          const c = cursor.result;
                          if (p.discard!.phase === 'complete') {
                            if (c) journalFail();
                            done(p);
                            return;
                          }
                          if (!c || removed === limit) {
                            const next = preparationHead(
                              {
                                ...p,
                                stamp: crypto.randomUUID(),
                                discard: {
                                  phase: c ? 'purging' : 'complete',
                                  deleted: p.discard!.deleted + removed,
                                },
                              },
                              uid,
                              writeId,
                            );
                            preparations.put(next, [uid, writeId]);
                            done(next);
                            return;
                          }
                          const key = c.key;
                          if (
                            !Array.isArray(key) ||
                            key.length !== 5 ||
                            key[0] !== uid ||
                            key[1] !== writeId ||
                            typeof key[2] !== 'string' ||
                            !['draft', 'production', 'checkpoint', 'controls'].includes(key[2]) ||
                            typeof key[3] !== 'string' ||
                            !(
                              (typeof key[4] === 'string' && key[2] === 'controls') ||
                              (typeof key[4] === 'number' &&
                                Number.isSafeInteger(key[4]) &&
                                key[4] >= -1)
                            )
                          )
                            journalFail();
                          frames.delete(key);
                          removed++;
                          c.continue();
                        } catch {
                          tx.abort();
                        }
                      };
                    } catch {
                      tx.abort();
                    }
                  };
                } catch {
                  tx.abort();
                }
              };
            },
          );
        },
      ),
  );
}

// Shared only by the creation stores; formats and keys of the edit stores stay unchanged.
export { open as openLoreJournalDatabase, operation as runLoreJournalTransaction };
