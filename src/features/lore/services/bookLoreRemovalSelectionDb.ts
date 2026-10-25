import { readId } from './bookLoreReadContracts';
import {
  selectionIdentity,
  readSelectionRoot,
  readSelectionPage,
  readSelectionOutcome,
  selectionHead,
  selectionEqual,
  selectionFail,
  LoreSelectionConflict,
  REMOVAL_SELECTION_PAGE_SIZE,
  type RemovalSelectionIdentity,
  type RemovalSelectionRoot,
  type RemovalSelectionPage,
  type RemovalSelectionMember,
  type RemovalSelectionOutcome,
} from './bookLoreRemovalSelectionContracts';

export const REMOVAL_SELECTION_DB = 'writer.book-lore-removal-selections';
const names = ['selections', 'pages', 'outcomes'] as const;
type Stores = Record<(typeof names)[number], IDBObjectStore>;
const unavailable = () => Error('Não foi possível gravar a seleção neste dispositivo.');
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
    const r = indexedDB.open(REMOVAL_SELECTION_DB, 1);
    r.onupgradeneeded = () => {
      for (const name of names)
        if (!r.result.objectStoreNames.contains(name)) r.result.createObjectStore(name);
    };
    r.onerror = () => {
      failed = true;
      reject(unavailable());
    };
    r.onblocked = () => {
      failed = true;
      reject(Error('Feche outras versões do Writer para retomar a seleção.'));
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
async function run<T>(
  mode: IDBTransactionMode,
  guard: () => void,
  work: (
    stores: Stores,
    read: (s: IDBObjectStore, key: IDBValidKey, then: (v: unknown) => void) => void,
    wrap: (f: () => void) => () => void,
    done: (v: T) => void,
  ) => void,
): Promise<T> {
  const db = await open(guard);
  return new Promise((resolve, reject) => {
    let result: T,
      ready = false,
      error: unknown,
      tx: IDBTransaction;
    try {
      guard();
      tx = db.transaction([...names], mode);
    } catch (e) {
      db.close();
      reject(e instanceof Error ? e : unavailable());
      return;
    }
    const fail = (e: unknown) => {
      error = e;
      tx.abort();
    };
    const wrap = (f: () => void) => () => {
      try {
        guard();
        f();
      } catch (e) {
        fail(e);
      }
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
        if (!ready) throw unavailable();
        resolve(result);
      } catch (e) {
        reject(e instanceof Error ? e : unavailable());
      }
    };
    const stores = Object.fromEntries(names.map((name) => [name, tx.objectStore(name)])) as Stores;
    const read = (s: IDBObjectStore, key: IDBValidKey, then: (v: unknown) => void) => {
      const r: IDBRequest<unknown> = s.get(key);
      r.onsuccess = wrap(() => then(r.result));
    };
    try {
      guard();
      work(stores, read, wrap, (value) => {
        result = value;
        ready = true;
      });
    } catch (e) {
      fail(e);
    }
  });
}
export function bookLoreRemovalSelectionStore(
  raw: RemovalSelectionIdentity,
  guard: () => void = () => {},
) {
  const identity = selectionIdentity(raw),
    key = [identity.uid, identity.selectionId],
    lock = 'writer.book-lore-removal-selection:' + JSON.stringify(key);
  const scoped = (v: unknown) => readSelectionRoot(v, identity);
  const locked = <T>(work: () => Promise<T>) => {
    guard();
    if (!globalThis.navigator?.locks?.request) throw unavailable();
    return navigator.locks.request(lock, work);
  };
  const partKey = (index: number) => [...key, index];
  const memberFrom = (raw: unknown, root: RemovalSelectionRoot, index: number) =>
    readSelectionPage(raw, root, Math.floor(index / REMOVAL_SELECTION_PAGE_SIZE)).items[
      index % REMOVAL_SELECTION_PAGE_SIZE
    ] ?? selectionFail();
  return {
    async init(pack: { root: RemovalSelectionRoot; pages: readonly RemovalSelectionPage[] }) {
      guard();
      const root = scoped(pack.root),
        pages = pack.pages.map((p, i) => readSelectionPage(p, root, i));
      if (
        root.head.revision ||
        root.head.cursor ||
        root.head.cancelRequested ||
        root.head.cancelCursor ||
        root.head.faultIndex !== null ||
        pages.length !== root.manifest.pageHashes.length
      )
        selectionFail();
      const ids = new Set<string>();
      for (const page of pages)
        for (const member of page.items) {
          if (ids.has(member.loreId)) selectionFail();
          ids.add(member.loreId);
        }
      return locked(() =>
        run<RemovalSelectionRoot>('readwrite', guard, (stores, read, wrap, done) => {
          read(stores.selections, key, (raw) => {
            if (raw !== undefined) {
              const old = scoped(raw);
              if (!selectionEqual(old.manifest, root.manifest)) throw new LoreSelectionConflict();
              done(old);
              return;
            }
            let waiting = 2;
            const absent = () => {
              if (--waiting) return;
              for (const page of pages) stores.pages.add(page, partKey(page.page));
              stores.selections.add(root, key);
              done(root);
            };
            for (const store of [stores.pages, stores.outcomes]) {
              const r = store.openCursor(IDBKeyRange.bound(key, [...key, []], false, true));
              r.onsuccess = wrap(() => {
                if (r.result) selectionFail();
                absent();
              });
            }
          });
        }),
      );
    },
    async read() {
      return run<RemovalSelectionRoot | null>('readonly', guard, (s, read, _wrap, done) =>
        read(s.selections, key, (v) => done(v === undefined ? null : scoped(v))),
      );
    },
    async member(index: number) {
      return run<{
        root: RemovalSelectionRoot;
        member: RemovalSelectionMember;
        outcome: RemovalSelectionOutcome | null;
      }>('readonly', guard, (s, read, _wrap, done) =>
        read(s.selections, key, (v) => {
          const root = scoped(v);
          if (!Number.isSafeInteger(index) || index < 0 || index >= root.manifest.count)
            selectionFail();
          read(s.pages, partKey(Math.floor(index / REMOVAL_SELECTION_PAGE_SIZE)), (p) => {
            const member = memberFrom(p, root, index);
            read(s.outcomes, partKey(index), (o) =>
              done({
                root,
                member,
                outcome: o === undefined ? null : readSelectionOutcome(o, root, member),
              }),
            );
          });
        }),
      );
    },
    async page(index: number) {
      return run<{
        root: RemovalSelectionRoot;
        page: RemovalSelectionPage;
        outcomes: readonly (RemovalSelectionOutcome | null)[];
      }>('readonly', guard, (s, read, _wrap, done) =>
        read(s.selections, key, (v) => {
          const root = scoped(v);
          read(s.pages, partKey(index), (p) => {
            const page = readSelectionPage(p, root, index),
              outcomes: (RemovalSelectionOutcome | null)[] =
                new Array<RemovalSelectionOutcome | null>(page.items.length);
            let waiting = page.items.length;
            for (const [offset, member] of page.items.entries())
              read(s.outcomes, partKey(member.index), (o) => {
                outcomes[offset] = o === undefined ? null : readSelectionOutcome(o, root, member);
                if (!--waiting) done({ root, page, outcomes });
              });
          });
        }),
      );
    },
    async cancel() {
      return locked(() =>
        run<RemovalSelectionRoot>('readwrite', guard, (s, read, _wrap, done) =>
          read(s.selections, key, (v) => {
            const root = scoped(v);
            if (root.head.cancelRequested) {
              done(root);
              return;
            }
            const head = root.head;
            const next = scoped({
              ...root,
              head: selectionHead({ ...head, revision: head.revision + 1, cancelRequested: true }),
            });
            s.selections.put(next, key);
            done(next);
          }),
        ),
      );
    },
    async fence(expected: string, index: number) {
      return locked(() =>
        run<RemovalSelectionRoot>('readwrite', guard, (s, read, _wrap, done) =>
          read(s.selections, key, (v) => {
            const root = scoped(v);
            if (
              root.head.stamp !== expected ||
              root.head.cancelRequested ||
              root.head.cursor !== index
            )
              throw new LoreSelectionConflict();
            if (root.head.faultIndex === index) {
              done(root);
              return;
            }
            const head = root.head;
            const next = scoped({
              ...root,
              head: selectionHead({ ...head, revision: head.revision + 1, faultIndex: index }),
            });
            s.selections.put(next, key);
            done(next);
          }),
        ),
      );
    },
    async finish(expected: string, index: number, outcome: RemovalSelectionOutcome) {
      return locked(() =>
        run<RemovalSelectionRoot>('readwrite', guard, (s, read, _wrap, done) =>
          read(s.selections, key, (v) => {
            const root = scoped(v);
            if (!Number.isSafeInteger(index) || index < 0 || index >= root.manifest.count)
              selectionFail();
            read(s.pages, partKey(Math.floor(index / REMOVAL_SELECTION_PAGE_SIZE)), (p) => {
              const member = memberFrom(p, root, index),
                checked = readSelectionOutcome(outcome, root, member);
              read(s.outcomes, partKey(index), (o) => {
                const old = o === undefined ? null : readSelectionOutcome(o, root, member),
                  cursor = root.head.cancelRequested ? root.head.cancelCursor : root.head.cursor;
                if (old && !selectionEqual(old, checked)) selectionFail();
                if (cursor > index && old) {
                  done(root);
                  return;
                }
                if (root.head.stamp !== expected || cursor !== index)
                  throw new LoreSelectionConflict();
                if (checked.kind === 'cancelled' && !root.head.cancelRequested) selectionFail();
                if (
                  checked.kind === 'conflict' &&
                  !root.head.cancelRequested &&
                  root.head.faultIndex !== index
                )
                  selectionFail();
                const head = root.head;
                const counts = {
                  removed: head.removed,
                  conflicts: head.conflicts,
                  cancelled: head.cancelled,
                };
                if (!old)
                  counts[
                    checked.kind === 'removed'
                      ? 'removed'
                      : checked.kind === 'conflict'
                        ? 'conflicts'
                        : 'cancelled'
                  ]++;
                const next = scoped({
                  ...root,
                  head: selectionHead({
                    ...head,
                    ...counts,
                    revision: head.revision + 1,
                    ...(head.cancelRequested
                      ? { cancelCursor: cursor + 1 }
                      : { cursor: cursor + 1, faultIndex: null }),
                  }),
                });
                if (!old) s.outcomes.add(checked, partKey(index));
                s.selections.put(next, key);
                done(next);
              });
            });
          }),
        ),
      );
    },
  };
}
export type RemovalSelectionStore = ReturnType<typeof bookLoreRemovalSelectionStore>;
export async function listBookLoreRemovalSelections(
  uid: string,
  guard: () => void,
  after?: string,
  limit = 50,
) {
  readId(uid);
  if (after !== undefined) readId(after);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) selectionFail();
  return run<{ items: RemovalSelectionRoot[]; next: string | null }>(
    'readonly',
    guard,
    (s, _read, wrap, done) => {
      const items: RemovalSelectionRoot[] = [],
        r = s.selections.openCursor(
          IDBKeyRange.bound([uid, after ?? ''], [uid, []], after !== undefined, true),
        );
      r.onsuccess = wrap(() => {
        const c = r.result;
        if (!c) {
          done({ items, next: null });
          return;
        }
        const key = c.key;
        if (!Array.isArray(key) || key.length !== 2 || key[0] !== uid || typeof key[1] !== 'string')
          selectionFail();
        if (items.length === limit) {
          done({ items, next: items.at(-1)!.manifest.identity.selectionId });
          return;
        }
        const raw = c.value as RemovalSelectionRoot,
          identity = selectionIdentity(raw?.manifest?.identity);
        if (identity.uid !== uid || identity.selectionId !== key[1]) selectionFail();
        items.push(readSelectionRoot(raw, identity));
        c.continue();
      });
    },
  );
}
