import { onAuthStateChanged } from 'firebase/auth';
import { collection, doc, onSnapshot } from 'firebase/firestore';
import { auth, firestore } from '@/shared/lib';
import { bookLoreReadSession, hasBookLorePayload } from './bookLoreReadService';

interface Row {
  id: string;
  data(): Record<string, unknown>;
}
/** Coalesces refreshes; obsolete RPC results cannot publish or start another page. */
export function subscribeBookLore<T>(
  bookId: string,
  map: (id: string, data: Record<string, unknown>) => T,
  changed: (values: T[]) => void,
  failed: (error: unknown) => void,
  sort: (a: T, b: T) => number,
) {
  let active = true,
    epoch = 0,
    running = false,
    pending = false,
    rootReady = false;
  let rows: Row[] | undefined, rootKey: string | undefined;
  const stops: (() => void)[] = [];
  const register = (cleanup: () => void) => {
    if (active) stops.push(cleanup);
    else cleanup();
  };
  const session = bookLoreReadSession(() => active);
  const stop = () => {
    if (!active) return;
    active = false;
    epoch++;
    for (const cleanup of stops) cleanup();
  };
  const fail = (cause: unknown) => {
    if (!active) return;
    stop();
    changed([]);
    failed(cause);
  };
  const pump = async () => {
    if (running || !active || !rootReady || !pending || !rows) return;
    running = true;
    try {
      while (active && pending && rows) {
        pending = false;
        const current = epoch,
          snapshot = rows;
        try {
          const read = bookLoreReadSession(() => {
            session.guard();
            return active && epoch === current;
          });
          const values = snapshot.some((row) => hasBookLorePayload(row.data()))
            ? (await read.list(bookId)).map((item) => map(item.id, item.data))
            : snapshot.map((row) => map(row.id, row.data()));
          read.guard();
          changed(values.sort(sort));
        } catch (cause) {
          if (active && epoch === current) {
            fail(cause);
            return;
          }
        }
      }
    } finally {
      running = false;
    }
  };
  const queue = () => {
    epoch++;
    pending = true;
    void pump();
  };
  try {
    register(
      onAuthStateChanged(auth, (actor) => {
        if (actor !== session.actor) fail(new Error('A conta mudou. Reabra o compêndio.'));
      }),
    );
    register(
      onSnapshot(
        doc(firestore, 'books', bookId),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!active || snapshot.metadata?.fromCache || snapshot.metadata?.hasPendingWrites)
            return;
          const value = snapshot.data();
          if (
            !snapshot.exists() ||
            !value ||
            value.authorId !== session.actor.uid ||
            (Object.hasOwn(value, 'deleting') && value.deleting !== false)
          ) {
            fail(new Error('Livro indisponível.'));
            return;
          }
          const version: unknown = Object.hasOwn(value, 'localLoreVersion')
            ? value.localLoreVersion
            : 0;
          if (typeof version !== 'number' || !Number.isSafeInteger(version) || version < 0) {
            fail(new Error('Versão de lore inválida.'));
            return;
          }
          const key = JSON.stringify([value.authorId, version]);
          const first = !rootReady;
          rootReady = true;
          if (
            (first && rows) ||
            (rootKey !== undefined &&
              key !== rootKey &&
              rows?.some((row) => hasBookLorePayload(row.data())))
          )
            queue();
          rootKey = key;
        },
        fail,
      ),
    );
    register(
      onSnapshot(
        collection(firestore, 'books', bookId, 'lore'),
        { includeMetadataChanges: true },
        (snapshot) => {
          if (!active || snapshot.metadata?.fromCache || snapshot.metadata?.hasPendingWrites)
            return;
          rows = snapshot.docs;
          queue();
        },
        fail,
      ),
    );
  } catch (cause) {
    fail(cause);
  }
  return stop;
}
