import { doc, onSnapshot } from 'firebase/firestore';
import { firestore } from '@/shared/lib';
export type AdventureLoreHint = 'root' | 'universe';
/** Hints only. No snapshot body or cached document authorizes a context. */
export function subscribeAdventureLoreHints(
  input: { ownerId: string; adventureId: string },
  onHint: (kind: AdventureLoreHint) => void,
): () => void {
  let active = true,
    universeStop: () => void = () => undefined,
    universeId: string | null = null,
    generation = 0;
  const signal = (kind: AdventureLoreHint) => {
    if (active) onHint(kind);
  };
  const stop = onSnapshot(
    doc(firestore, 'adventures', input.adventureId),
    { includeMetadataChanges: true },
    (snapshot) => {
      if (!active) return;
      signal('root');
      // Cached association is never used to revive or select a global context.
      if (snapshot.metadata.fromCache) return;
      const value = snapshot.exists() ? snapshot.data() : null;
      const next =
        value?.ownerId === input.ownerId &&
        value.deleting !== true &&
        typeof value.universeId === 'string'
          ? value.universeId
          : null;
      if (next === universeId) return;
      universeStop();
      universeId = next;
      const own = ++generation;
      universeStop = next
        ? onSnapshot(
            doc(firestore, 'universes', next),
            { includeMetadataChanges: true },
            () => {
              if (active && own === generation) signal('universe');
            },
            () => {
              if (active && own === generation) signal('universe');
            },
          )
        : () => undefined;
    },
    () => signal('root'),
  );
  return () => {
    active = false;
    generation++;
    stop();
    universeStop();
  };
}
