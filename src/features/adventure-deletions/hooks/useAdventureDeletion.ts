import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { publishInvalidation } from '@/shared/services';
import type {
  AdventureDeletionControl as Control,
  AdventureDeletionProgress as Progress,
  AdventureDeletionSource as Source,
  AdventureDeletionStartPending as StartPending,
  AdventureDeletionPending as Pending,
} from '../model/adventureDeletion';
import { floorOf, identityOf, readProgress, reason } from '../model/adventureDeletionContracts';
import { createAdventureDeletionClient } from '../services/adventureDeletionClient';
import type { AdventureDeletionTransport } from '../services/adventureDeletionTransport';
import {
  readDeletion,
  recoveryAvailable,
  subscribeDeletions,
} from '../services/adventureDeletionRecovery';

interface Options {
  uid: string;
  adventureId: string;
  open: boolean;
  isActive: () => boolean;
  isOpen: () => boolean;
  onRevoked?: (progress: Progress) => void;
  transport?: AdventureDeletionTransport;
}
interface View {
  source: Source | null;
  control: Control | null;
  progress: Progress | null;
  loading: boolean;
  busy: boolean;
  ready: boolean;
  readOnly: boolean;
  error: string;
  notice: string;
  conflict: boolean;
  paused: boolean;
}
const message = (cause: unknown) =>
  cause instanceof Error
    ? cause.message
    : 'Não foi possível confirmar a exclusão. Preserve o pedido e tente novamente.';
export function useAdventureDeletion(options: Options) {
  const { uid, adventureId } = options;
  const [view, setView] = useState<View>({
    source: null,
    control: null,
    progress: null,
    loading: false,
    busy: false,
    ready: false,
    readOnly: false,
    error: '',
    notice: '',
    conflict: false,
    paused: false,
  });
  const latest = useRef(options),
    alive = useRef(true),
    reads = useRef(0),
    running = useRef(false),
    reading = useRef(false),
    paused = useRef(false),
    progress = useRef<Progress | null>(null),
    notified = useRef(false);
  useLayoutEffect(() => {
    latest.current = options;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = useCallback(() => alive.current && latest.current.isActive(), []);
  const confirmed = useCallback(
    (value: Progress) => {
      if (!active()) throw Error('A conta ou a aventura mudou. O pedido foi preservado.');
      const old = progress.current;
      const next = readProgress(
        value,
        uid,
        old ? identityOf(old) : { adventureId },
        old ? floorOf(old) : undefined,
      );
      progress.current = next;
      setView((current) => ({ ...current, progress: next, source: null }));
      if (!notified.current) {
        notified.current = true;
        publishInvalidation({ actorId: uid, scope: 'adventure:' + adventureId });
        latest.current.onRevoked?.(structuredClone(next));
      }
    },
    [active, uid, adventureId],
  );
  const client = useMemo(
    () =>
      createAdventureDeletionClient({
        uid,
        adventureId,
        isActive: active,
        onRevoked: confirmed,
        transport: options.transport,
      }),
    [uid, adventureId, active, confirmed, options.transport],
  );
  const refresh = useCallback(async () => {
    if (!active() || !latest.current.isOpen() || reading.current) return;
    reading.current = true;
    const generation = ++reads.current;
    setView((current) => ({ ...current, loading: true, ready: false, error: '' }));
    try {
      const value = await client.load();
      if (!active() || generation !== reads.current || !latest.current.isOpen()) return;
      const source = !value.control && !value.progress ? await client.getSource() : null;
      if (!active() || generation !== reads.current || !latest.current.isOpen()) return;
      setView((current) => ({
        ...current,
        ...value,
        source,
        ready: true,
        loading: false,
        error: '',
        conflict: false,
      }));
    } catch (cause) {
      if (active() && generation === reads.current && latest.current.isOpen())
        setView((current) => ({ ...current, source: null, ready: false, error: message(cause) }));
    } finally {
      reading.current = false;
      if (active() && generation === reads.current)
        setView((current) => ({ ...current, loading: false }));
    }
  }, [active, client]);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current && latest.current.isOpen()) void refresh();
    });
    const stop = subscribeDeletions(() => {
      if (active() && latest.current.isOpen() && !running.current && !reading.current)
        void refresh();
    });
    return () => {
      current = false;
      stop();
    };
  }, [active, refresh, options.open]);

  async function continueSteps() {
    while (
      active() &&
      latest.current.isOpen() &&
      !paused.current &&
      progress.current &&
      !progress.current.complete
    ) {
      // Yield between units so pause/close can act even with an immediate local transport.
      await new Promise<void>((resolve) => window.setTimeout(resolve, 0));
      if (!active() || !latest.current.isOpen() || paused.current) break;
      await client.advance();
    }
  }
  async function run(work: () => Promise<void>) {
    if (!active() || running.current) return;
    running.current = true;
    paused.current = false;
    reads.current++;
    setView((current) => ({
      ...current,
      busy: true,
      loading: false,
      paused: false,
      error: '',
      notice: '',
    }));
    try {
      await work();
    } catch (cause) {
      if (active())
        setView((current) => ({
          ...current,
          error: message(cause),
          conflict: current.conflict || reason(cause) === 'checkpoint-conflict',
        }));
    } finally {
      running.current = false;
      if (active()) {
        try {
          const control = readDeletion(uid, adventureId);
          setView((current) => ({
            ...current,
            control,
            ready: true,
            busy: false,
            readOnly: !recoveryAvailable(),
          }));
        } catch (cause) {
          setView((current) => ({ ...current, ready: false, busy: false, error: message(cause) }));
        }
      }
    }
  }
  return {
    ...view,
    refresh,
    pause() {
      if (!active()) return;
      paused.current = true;
      setView((current) => ({ ...current, paused: true }));
    },
    start(source: Source) {
      const captured = structuredClone(source);
      return run(async () => {
        await client.start(captured);
        await continueSteps();
      });
    },
    recover(expected: Pending) {
      const captured = structuredClone(expected);
      return run(async () => {
        const result = await client.recover(captured);
        if ('kind' in result) {
          setView((current) => ({
            ...current,
            notice: 'Pedido inicial encerrado. Ele não iniciará uma exclusão.',
          }));
          await refresh();
        } else await continueSteps();
      });
    },
    advance() {
      return run(async () => {
        await client.advance();
        await continueSteps();
      });
    },
    cancelStart(expected: StartPending) {
      const captured = structuredClone(expected);
      return run(async () => {
        const result = await client.cancelStart(captured);
        if ('kind' in result) {
          setView((current) => ({
            ...current,
            notice: 'Pedido inicial encerrado. Ele não iniciará uma exclusão.',
          }));
          await refresh();
        }
      });
    },
    resolveConflict() {
      return run(async () => {
        await client.resolveConflict();
        await refresh();
      });
    },
  };
}
