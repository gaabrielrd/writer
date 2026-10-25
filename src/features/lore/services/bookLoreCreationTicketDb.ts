import { readId } from './bookLoreReadContracts';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import {
  readCreationTicket,
  creationTicketScope,
  creationKeyClosed,
  type CreationTicket,
} from './bookLoreCreationTicketContracts';
import {
  journalFrame,
  journalFail,
  sameJournalIdentity,
  type LoreJournalFrame,
} from './bookLoreJournalContracts';
import {
  openLoreJournalDatabase as open,
  runLoreJournalTransaction as run,
  journalStorageAvailable,
} from './bookLoreJournalDb';

const TICKETS = 'creationTickets',
  FRAMES = 'creationFrames';
export type CreationFrameKey = [string, string, 'draft', string, number];
export const creationFrameKey = (
  t: CreationTicket,
  generation: string,
  index: number,
): CreationFrameKey => [t.uid, t.writeId, 'draft', generation, index];
export async function getCreationTicket(
  uid: string,
  writeId: string,
): Promise<CreationTicket | null> {
  readId(uid);
  readId(writeId);
  return run(await open(), [TICKETS], 'readonly', (tx, done) => {
    const r: IDBRequest<unknown> = tx.objectStore(TICKETS).get([uid, writeId]);
    r.onsuccess = () => {
      try {
        done(r.result === undefined ? null : readCreationTicket(r.result, uid, writeId));
      } catch {
        tx.abort();
      }
    };
  });
}
function monotonic(a: CreationTicket, b: CreationTicket) {
  if (
    creationTicketScope(a) !== creationTicketScope(b) ||
    (a.intentHash !== null && (b.intentHash !== a.intentHash || b.uploadCount !== a.uploadCount)) ||
    (a.cancelRequested && !b.cancelRequested) ||
    (a.releaseRequested && !b.releaseRequested) ||
    (a.jobsClosed && !b.jobsClosed) ||
    (a.startState === 'confirmed' && b.startState !== 'confirmed') ||
    ['none', 'pending', 'confirmed'].indexOf(b.keyState) <
      ['none', 'pending', 'confirmed'].indexOf(a.keyState) ||
    (a.identity && (!b.identity || !sameJournalIdentity(a.identity, b.identity))) ||
    (a.keyView?.phase === 'revoked' && b.keyView?.phase !== 'revoked') ||
    (a.revoke && (!b.revoke || hash(a.revoke.wire) !== hash(b.revoke.wire))) ||
    (a.revoke?.state === 'confirmed' && b.revoke?.state !== 'confirmed') ||
    (a.parent &&
      (!b.parent ||
        b.parent.jobToken !== a.parent.jobToken ||
        (a.parent.phase === 'cancelled' && b.parent.phase !== 'cancelled') ||
        (a.parent.phase === 'cancelling' && b.parent.phase === 'preparing') ||
        (a.parent.phase === 'adopted' && hash(b.parent) !== hash(a.parent)))) ||
    (a.parent?.cleanupRevision ?? 0) > (b.parent?.cleanupRevision ?? 0) ||
    (a.discard &&
      (!b.discard ||
        b.discard.generation !== a.discard.generation ||
        ['requested', 'purging', 'complete'].indexOf(b.discard.phase) <
          ['requested', 'purging', 'complete'].indexOf(a.discard.phase) ||
        b.discard.deleted < a.discard.deleted)) ||
    (a.draft &&
      b.draft &&
      (a.draft.generation !== b.draft.generation ||
        a.draft.byteLength !== b.draft.byteLength ||
        a.draft.chunkCount !== b.draft.chunkCount ||
        b.draft.written < a.draft.written ||
        (a.draft.complete && !b.draft.complete))) ||
    (a.draft && !b.draft && (!b.discard || b.discard.phase === 'requested'))
  )
    journalFail();
}
export async function commitCreationTicket(
  next: CreationTicket,
  expected: string | null,
  adds: { key: CreationFrameKey; value: LoreJournalFrame }[] = [],
) {
  if (!journalStorageAvailable()) journalFail();
  const checked = readCreationTicket(next, next.uid, next.writeId);
  if (checked.stamp === expected) journalFail();
  return navigator.locks.request(
    'writer.book-lore-creation:' + JSON.stringify([next.uid, next.writeId]),
    async () =>
      run<CreationTicket>(await open(), [TICKETS, FRAMES], 'readwrite', (tx, done) => {
        const tickets = tx.objectStore(TICKETS),
          frames = tx.objectStore(FRAMES);
        const r: IDBRequest<unknown> = tickets.get([next.uid, next.writeId]);
        r.onsuccess = () => {
          try {
            const current =
              r.result === undefined ? null : readCreationTicket(r.result, next.uid, next.writeId);
            if ((current?.stamp ?? null) !== expected) journalFail();
            if (current) monotonic(current, checked);
            if (
              adds.length > 1 ||
              (adds.length &&
                (checked.releaseRequested ||
                  checked.discard ||
                  !checked.identity ||
                  !checked.draft))
            )
              journalFail();
            const finish = () => {
              tickets.put(checked, [next.uid, next.writeId]);
              done(checked);
            };
            if (!current) {
              if (adds.length) journalFail();
              const cursor = frames.openCursor(
                IDBKeyRange.bound(
                  [next.uid, next.writeId],
                  [next.uid, next.writeId, []],
                  false,
                  true,
                ),
              );
              cursor.onsuccess = () => {
                try {
                  if (cursor.result) journalFail();
                  finish();
                } catch {
                  tx.abort();
                }
              };
            } else if (adds.length) {
              const add = adds[0]!,
                k = add.key,
                blob = checked.draft!;
              if (
                k.length !== 5 ||
                k[0] !== next.uid ||
                k[1] !== next.writeId ||
                k[2] !== 'draft' ||
                k[3] !== blob.generation ||
                !Number.isSafeInteger(k[4]) ||
                k[4] < -1 ||
                k[4] >= blob.chunkCount
              )
                journalFail();
              const value = journalFrame(add.value),
                existing: IDBRequest<unknown> = frames.get(k);
              existing.onsuccess = () => {
                try {
                  if (existing.result !== undefined) journalFail();
                  frames.put(value, k);
                  finish();
                } catch {
                  tx.abort();
                }
              };
            } else finish();
          } catch {
            tx.abort();
          }
        };
      }),
  );
}
export async function getCreationFrame(key: CreationFrameKey): Promise<LoreJournalFrame> {
  return run(await open(), [FRAMES], 'readonly', (tx, done) => {
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
export async function listCreationTickets(uid: string, after?: string, limit = 50) {
  readId(uid);
  if (after !== undefined) readId(after);
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) journalFail();
  return run<{ items: CreationTicket[]; next: string | null }>(
    await open(),
    [TICKETS],
    'readonly',
    (tx, done) => {
      const items: CreationTicket[] = [];
      const request = tx
        .objectStore(TICKETS)
        .openCursor(IDBKeyRange.bound([uid, after ?? ''], [uid, []], after !== undefined, true));
      request.onsuccess = () => {
        try {
          const c = request.result;
          if (!c) {
            done({ items, next: null });
            return;
          }
          if (items.length === limit) {
            done({ items, next: items.at(-1)!.writeId });
            return;
          }
          if (
            !Array.isArray(c.key) ||
            c.key.length !== 2 ||
            c.key[0] !== uid ||
            typeof c.key[1] !== 'string'
          )
            journalFail();
          items.push(readCreationTicket(c.value, uid, c.key[1]));
          c.continue();
        } catch {
          tx.abort();
        }
      };
    },
  );
}
export async function purgeCreationFrames(
  uid: string,
  writeId: string,
  expected: string,
  limit = 50,
) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 50) journalFail();
  return navigator.locks.request(
    'writer.book-lore-creation:' + JSON.stringify([uid, writeId]),
    async () =>
      run<CreationTicket>(await open(), [TICKETS, FRAMES], 'readwrite', (tx, done) => {
        const tickets = tx.objectStore(TICKETS),
          r: IDBRequest<unknown> = tickets.get([uid, writeId]);
        r.onsuccess = () => {
          try {
            const t = readCreationTicket(r.result, uid, writeId);
            if (t.stamp !== expected || !t.discard || !creationKeyClosed(t)) journalFail();
            const frames = tx.objectStore(FRAMES);
            const cursor = frames.openCursor(
              IDBKeyRange.bound([uid, writeId], [uid, writeId, []], false, true),
            );
            let removed = 0;
            cursor.onsuccess = () => {
              try {
                const c = cursor.result;
                if (t.discard!.phase === 'complete') {
                  if (c) journalFail();
                  done(t);
                  return;
                }
                if (!c || removed === limit) {
                  const next = readCreationTicket(
                    {
                      ...t,
                      stamp: crypto.randomUUID(),
                      draft: null,
                      discard: {
                        ...t.discard,
                        phase: c ? 'purging' : 'complete',
                        deleted: t.discard!.deleted + removed,
                      },
                    },
                    uid,
                    writeId,
                  );
                  tickets.put(next, [uid, writeId]);
                  done(next);
                  return;
                }
                const k = c.key;
                if (
                  !Array.isArray(k) ||
                  k.length !== 5 ||
                  k[0] !== uid ||
                  k[1] !== writeId ||
                  k[2] !== 'draft' ||
                  k[3] !== t.discard!.generation ||
                  typeof k[4] !== 'number' ||
                  !Number.isSafeInteger(k[4]) ||
                  k[4] < -1
                )
                  journalFail();
                journalFrame(c.value);
                frames.delete(k);
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
      }),
  );
}
