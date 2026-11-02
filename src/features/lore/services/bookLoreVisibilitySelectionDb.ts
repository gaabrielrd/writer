import { loreMetadataDatabase } from './bookLoreMetadataDb';
import { readId } from './bookLoreReadContracts';
import {
  visibilityIdentity,
  readVisibilityRoot,
  readVisibilityPage,
  readVisibilityState,
  initialVisibilityState,
  visibilityTransition,
  visibilityHead,
  visibilityEqual,
  visibilityFail,
  VisibilityConflict,
  type VisibilityIdentity,
  type VisibilityRoot,
  type VisibilityPage,
  type VisibilityState,
} from './bookLoreVisibilitySelectionContracts';
export const VISIBILITY_SELECTION_DB = 'writer.book-lore-visibility-selections';
const names = ['selections', 'pages', 'members'] as const,
  { run, unavailable } = loreMetadataDatabase(VISIBILITY_SELECTION_DB, names);
export function bookLoreVisibilitySelectionStore(
  raw: VisibilityIdentity,
  guard: () => void = () => {},
) {
  const identity = visibilityIdentity(raw),
    key = [identity.uid, identity.selectionId],
    partKey = (index: number) => [...key, index],
    scoped = (v: unknown) => readVisibilityRoot(v, identity);
  const locked = <T>(work: () => Promise<T>) => {
    guard();
    if (!navigator?.locks?.request) throw unavailable();
    return navigator.locks.request(
      'writer.book-lore-visibility-selection:' + JSON.stringify(key),
      work,
    );
  };
  const memberAt = (raw: unknown, root: VisibilityRoot, index: number) => {
    if (!Number.isSafeInteger(index) || index < 0 || index >= root.manifest.count) visibilityFail();
    return (
      readVisibilityPage(raw, root, Math.floor(index / 50)).items[index % 50] ?? visibilityFail()
    );
  };
  return {
    async init(pack: { root: VisibilityRoot; pages: readonly VisibilityPage[] }) {
      const root = scoped(pack.root),
        pages = pack.pages.map((p, i) => readVisibilityPage(p, root, i));
      if (
        root.head.revision ||
        root.head.cursor ||
        root.head.cancelRequested ||
        root.head.cancelCursor ||
        pages.length !== root.manifest.pageHashes.length
      )
        visibilityFail();
      const ids = new Set<string>();
      for (const p of pages)
        for (const m of p.items) {
          if (ids.has(m.loreId)) visibilityFail();
          ids.add(m.loreId);
        }
      return locked(() =>
        run<VisibilityRoot>('readwrite', guard, (s, read, wrap, done) => {
          read(s.selections, key, (v) => {
            if (v !== undefined) {
              const old = scoped(v);
              if (!visibilityEqual(old.manifest, root.manifest)) throw new VisibilityConflict();
              done(old);
              return;
            }
            let pending = 2;
            for (const store of [s.pages, s.members]) {
              const request = store.openCursor(IDBKeyRange.bound(key, [...key, []], false, true));
              request.onsuccess = wrap(() => {
                if (request.result) visibilityFail();
                if (--pending) return;
                for (const p of pages) {
                  s.pages.add(p, partKey(p.page));
                  for (const m of p.items)
                    s.members.add(initialVisibilityState(root, m), partKey(m.index));
                }
                s.selections.add(root, key);
                done(root);
              });
            }
          });
        }),
      );
    },
    read() {
      return run<VisibilityRoot | null>('readonly', guard, (s, read, _wrap, done) =>
        read(s.selections, key, (v) => done(v === undefined ? null : scoped(v))),
      );
    },
    member(index: number) {
      return run<{
        root: VisibilityRoot;
        member: VisibilityPage['items'][number];
        state: VisibilityState;
      }>('readonly', guard, (s, read, _wrap, done) =>
        read(s.selections, key, (v) => {
          const root = scoped(v);
          read(s.pages, partKey(Math.floor(index / 50)), (p) => {
            const member = memberAt(p, root, index);
            read(s.members, partKey(index), (value) =>
              done({ root, member, state: readVisibilityState(value, root, member) }),
            );
          });
        }),
      );
    },
    page(index: number) {
      return run<{ root: VisibilityRoot; page: VisibilityPage; states: VisibilityState[] }>(
        'readonly',
        guard,
        (s, read, _wrap, done) =>
          read(s.selections, key, (v) => {
            const root = scoped(v);
            read(s.pages, partKey(index), (raw) => {
              const page = readVisibilityPage(raw, root, index),
                states = new Array<VisibilityState>(page.items.length);
              let pending = page.items.length;
              for (const [offset, member] of page.items.entries())
                read(s.members, partKey(member.index), (raw) => {
                  states[offset] = readVisibilityState(raw, root, member);
                  if (!--pending) done({ root, page, states });
                });
            });
          }),
      );
    },
    cancel() {
      return locked(() =>
        run<VisibilityRoot>('readwrite', guard, (s, read, _wrap, done) =>
          read(s.selections, key, (raw) => {
            const root = scoped(raw);
            if (root.head.cancelRequested) {
              done(root);
              return;
            }
            const next = scoped({
              ...root,
              head: visibilityHead({
                ...root.head,
                revision: root.head.revision + 1,
                cancelRequested: true,
              }),
            });
            s.selections.put(next, key);
            done(next);
          }),
        ),
      );
    },
    change(
      index: number,
      expected: number,
      update: (old: VisibilityState) => VisibilityState,
      mode: 'produce' | 'control' | 'finish' = 'control',
    ) {
      return locked(() =>
        run<{ root: VisibilityRoot; state: VisibilityState }>(
          'readwrite',
          guard,
          (s, read, _wrap, done) =>
            read(s.selections, key, (raw) => {
              const root = scoped(raw),
                h = root.head;
              if (
                (h.cancelRequested ? h.cancelCursor : h.cursor) !== index ||
                (mode === 'produce' && h.cancelRequested)
              )
                throw new VisibilityConflict();
              read(s.pages, partKey(Math.floor(index / 50)), (p) => {
                const member = memberAt(p, root, index);
                read(s.members, partKey(index), (raw) => {
                  const old = readVisibilityState(raw, root, member);
                  if (old.revision !== expected || old.outcome) throw new VisibilityConflict();
                  const changed = update(old),
                    next = readVisibilityState(
                      { ...changed, revision: old.revision + 1 },
                      root,
                      member,
                    );
                  visibilityTransition(old, next);
                  if ((mode === 'finish') !== (next.outcome !== null)) visibilityFail();
                  if (next.outcome?.kind === 'cancelled' && !h.cancelRequested) visibilityFail();
                  const head = { ...h, revision: h.revision + 1 };
                  if (next.outcome) {
                    const k = next.outcome.kind;
                    head[k === 'conflict' ? 'conflicts' : k]++;
                    if (h.cancelRequested) head.cancelCursor++;
                    else head.cursor++;
                  }
                  const result = scoped({ ...root, head: visibilityHead(head) });
                  s.members.put(next, partKey(index));
                  s.selections.put(result, key);
                  done({ root: result, state: next });
                });
              });
            }),
        ),
      );
    },
    visit(index: number, expected: number) {
      return locked(() =>
        run<VisibilityRoot>('readwrite', guard, (s, read, _wrap, done) =>
          read(s.selections, key, (raw) => {
            const root = scoped(raw),
              h = root.head;
            if (!h.cancelRequested || h.cancelCursor !== index) throw new VisibilityConflict();
            read(s.pages, partKey(Math.floor(index / 50)), (p) => {
              const member = memberAt(p, root, index);
              read(s.members, partKey(index), (raw) => {
                const state = readVisibilityState(raw, root, member);
                if (!state.outcome || state.revision !== expected) throw new VisibilityConflict();
                const next = scoped({
                  ...root,
                  head: visibilityHead({ ...h, revision: h.revision + 1, cancelCursor: index + 1 }),
                });
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
export type VisibilitySelectionStore = ReturnType<typeof bookLoreVisibilitySelectionStore>;
export function listBookLoreVisibilitySelections(
  uid: string,
  guard: () => void,
  after?: string,
  limit = 50,
) {
  readId(uid);
  if (after !== undefined) readId(after);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) visibilityFail();
  return run<{ items: VisibilityRoot[]; next: string | null }>(
    'readonly',
    guard,
    (s, _read, wrap, done) => {
      const items: VisibilityRoot[] = [],
        request = s.selections.openCursor(
          IDBKeyRange.bound([uid, after ?? ''], [uid, []], after !== undefined, true),
        );
      request.onsuccess = wrap(() => {
        const c = request.result;
        if (!c) {
          done({ items, next: null });
          return;
        }
        if (items.length === limit) {
          done({ items, next: items.at(-1)!.manifest.identity.selectionId });
          return;
        }
        const key = c.key,
          value = c.value as VisibilityRoot,
          identity = visibilityIdentity(value?.manifest?.identity);
        if (
          !Array.isArray(key) ||
          key.length !== 2 ||
          key[0] !== uid ||
          key[1] !== identity.selectionId ||
          identity.uid !== uid
        )
          visibilityFail();
        items.push(readVisibilityRoot(value, identity));
        c.continue();
      });
    },
  );
}
