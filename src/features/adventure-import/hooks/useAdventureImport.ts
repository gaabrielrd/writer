import { useLayoutEffect, useRef, useState } from 'react';
import { useAuth } from '@/features/auth';
import { normalizeConfirmedReview } from '../services/adventureImportContracts';
import { createAdventureImportSession } from '../services/adventureImportService';
import { readLocalAdventureImport } from '../services/adventureImportRecovery';
import type { ConfirmedReview, ImportProgress, LocalImportRecord } from '../model/adventureImport';
export function useAdventureImport(open: boolean, onActivated: (id: string) => void) {
  const { user } = useAuth(),
    uid = user?.uid ?? '';
  const gate = useRef({ uid, open, generation: 0, mounted: true });
  const [progress, setProgress] = useState<ImportProgress | null>(null),
    [importId, setImportId] = useState<string | null>(null),
    [record, setRecord] = useState<LocalImportRecord | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const running = useRef(false);
  useLayoutEffect(() => {
    const state = { uid, open, generation: gate.current.generation + 1, mounted: true };
    gate.current = state;
    return () => {
      state.mounted = false;
      state.generation++;
    };
  }, [uid, open]);
  const visible = progress?.ownerId === uid ? progress : null;
  async function act(
    work: (s: ReturnType<typeof createAdventureImportSession>) => Promise<ImportProgress | null>,
    idHint?: string,
    resetIfMissing = false,
  ) {
    if (running.current || !uid || !open) return;
    const generation = gate.current.generation;
    const check = () => {
      if (
        !gate.current.mounted ||
        gate.current.uid !== uid ||
        !gate.current.open ||
        gate.current.generation !== generation
      )
        throw new Error('A sessão mudou. O pedido foi preservado.');
    };
    running.current = true;
    setBusy(true);
    setError('');
    const session = createAdventureImportSession(uid, check, (p) => {
      check();
      setImportId(p.importId);
      setProgress((prior) =>
        prior?.importId === p.importId &&
        prior.jobToken === p.jobToken &&
        (prior.checkpoint > p.checkpoint ||
          (prior.checkpoint === p.checkpoint && prior.recoveryKeyReady && !p.recoveryKeyReady))
          ? prior
          : p,
      );
    });
    try {
      const p = await work(session);
      check();
      if (p) {
        const local = await readLocalAdventureImport(uid, p.importId);
        check();
        setRecord(local);
        if (p.state === 'activated') onActivated(p.adventureId);
      } else {
        setProgress(null);
        setRecord(null);
        setImportId(null);
      }
    } catch (cause) {
      if (
        gate.current.mounted &&
        gate.current.generation === generation &&
        gate.current.uid === uid
      ) {
        if (idHint) {
          try {
            const local = await readLocalAdventureImport(uid, idHint);
            check();
            setRecord(local);
            if (!local && resetIfMissing) setImportId(null);
          } catch {
            /* Preserve the error and controls if local storage is unavailable. */
          }
        }
        if (
          gate.current.mounted &&
          gate.current.generation === generation &&
          gate.current.uid === uid
        )
          setError(cause instanceof Error ? cause.message : 'Não foi possível confirmar o pedido.');
      }
    } finally {
      running.current = false;
      if (gate.current.mounted && gate.current.generation === generation) setBusy(false);
    }
  }
  return {
    uid,
    progress: visible,
    importId,
    record,
    busy: busy && open,
    error,
    start: (review: ConfirmedReview) => {
      const id = crypto.randomUUID();
      return act(
        (s) => {
          const normalized = normalizeConfirmedReview(review);
          setImportId(id);
          return s.start(normalized, id);
        },
        id,
        true,
      );
    },
    load: (id: string) => {
      setImportId(id);
      return act((s) => s.get(id), id);
    },
    verify: (id: string) => act((s) => s.verify(id), id),
    resume: (id: string, review?: ConfirmedReview) =>
      act((s) => (review ? s.reconstruct(id, review) : s.run(id)), id),
    cancel: (id: string) => act((s) => s.cancel(id), id),
  };
}
