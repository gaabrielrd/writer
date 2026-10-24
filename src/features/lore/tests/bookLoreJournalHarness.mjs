import { vi } from 'vitest';
import { webcrypto } from 'node:crypto';
// Event/atomicity harness only; Chromium proves actual IndexedDB/Web Locks.
export function installLoreJournalHarness() {
  const stores = new Map(),
    held = [],
    locks = new Map();
  let hold = false,
    abortAt = -1,
    commits = 0,
    closed = 0;
  const key = (k) => JSON.stringify(k),
    clone = (v) => (v === undefined ? undefined : structuredClone(v));
  function compare(a, b) {
    if (Array.isArray(a) && Array.isArray(b)) {
      for (let n = 0; n < Math.min(a.length, b.length); n++) {
        const c = compare(a[n], b[n]);
        if (c) return c;
      }
      return a.length - b.length;
    }
    if (typeof a !== typeof b || Array.isArray(a) !== Array.isArray(b)) {
      const rank = (v) => (Array.isArray(v) ? 3 : typeof v === 'number' ? 1 : 2);
      return rank(a) - rank(b);
    }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  const db = {
    close() {
      closed++;
    },
    createObjectStore(name) {
      stores.set(name, new Map());
    },
    transaction(_names, mode) {
      let pending = 0,
        dead = false,
        scheduled = false;
      const writes = [];
      const tx = {
        oncomplete: null,
        onabort: null,
        onerror: null,
        abort() {
          if (dead) return;
          dead = true;
          queueMicrotask(() => tx.onabort?.());
        },
        objectStore(name) {
          const rows = stores.get(name);
          if (!rows) throw Error('Missing store');
          function request(work) {
            pending++;
            const r = { result: undefined, onsuccess: null, onerror: null };
            queueMicrotask(() => {
              if (dead) return;
              try {
                r.result = work();
                r.onsuccess?.();
              } catch {
                tx.onerror?.();
                tx.abort();
              }
              pending--;
              finish();
            });
            return r;
          }
          return {
            get(k) {
              return request(() => clone(rows.get(key(k))?.value));
            },
            put(value, k) {
              return request(() => {
                writes.push({ name, k: clone(k), value: clone(value) });
                return k;
              });
            },
            add(value, k) {
              return request(() => {
                if (
                  rows.has(key(k)) ||
                  writes.some((w) => w.name === name && key(w.k) === key(k) && !w.remove)
                )
                  throw Error('Constraint');
                writes.push({ name, k: clone(k), value: clone(value) });
                return k;
              });
            },
            delete(k) {
              return request(() => {
                writes.push({ name, k: clone(k), remove: true });
              });
            },
            openCursor(range) {
              pending++;
              const entries = [...rows.values()]
                .filter(({ k }) => {
                  const lower = compare(k, range.lower),
                    upper = compare(k, range.upper);
                  return (
                    (range.lowerOpen ? lower > 0 : lower >= 0) &&
                    (range.upperOpen ? upper < 0 : upper <= 0)
                  );
                })
                .sort((a, b) => compare(a.k, b.k));
              let index = 0;
              const r = { result: null, onsuccess: null };
              const step = () => {
                if (dead) return;
                const row = entries[index++];
                let continued = false;
                r.result = row
                  ? {
                      key: clone(row.k),
                      value: clone(row.value),
                      continue() {
                        continued = true;
                        queueMicrotask(step);
                      },
                    }
                  : null;
                r.onsuccess?.();
                if (!continued) {
                  pending--;
                  finish();
                }
              };
              queueMicrotask(step);
              return r;
            },
          };
        },
      };
      function finish() {
        if (dead || pending || scheduled) return;
        scheduled = true;
        queueMicrotask(() => {
          scheduled = false;
          if (dead || pending) return;
          const commit = () => {
            if (dead) return;
            if (mode === 'readwrite' && ++commits === abortAt) {
              tx.onerror?.();
              tx.abort();
              return;
            }
            for (const w of writes) {
              const rows = stores.get(w.name);
              if (w.remove) rows.delete(key(w.k));
              else rows.set(key(w.k), { k: w.k, value: w.value });
            }
            dead = true;
            tx.oncomplete?.();
          };
          if (mode === 'readwrite' && hold) held.push(commit);
          else commit();
        });
      }
      return tx;
    },
  };
  let opened = false;
  vi.stubGlobal('indexedDB', {
    open() {
      const r = {
        result: db,
        onupgradeneeded: null,
        onsuccess: null,
        onerror: null,
        onblocked: null,
      };
      queueMicrotask(() => {
        if (!opened) {
          opened = true;
          r.onupgradeneeded?.();
        }
        r.onsuccess?.();
      });
      return r;
    },
  });
  vi.stubGlobal('IDBKeyRange', {
    bound(lower, upper, lowerOpen = false, upperOpen = false) {
      return { lower, upper, lowerOpen, upperOpen };
    },
  });
  vi.stubGlobal('crypto', webcrypto);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('navigator', {
    locks: {
      request(name, work) {
        const prior = locks.get(name) ?? Promise.resolve(),
          result = prior.then(work);
        locks.set(
          name,
          result.catch(() => {}),
        );
        return result;
      },
    },
  });
  return {
    stores,
    rows: () =>
      [...stores].flatMap(([store, rows]) => [...rows.values()].map((r) => ({ store, ...r }))),
    hold() {
      hold = true;
    },
    release() {
      hold = false;
      while (held.length) held.shift()();
    },
    held: () => held.length,
    abortNext() {
      abortAt = commits + 1;
    },
    abortAt(n) {
      abortAt = n;
    },
    commits: () => commits,
    closed: () => closed,
  };
}
