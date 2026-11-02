import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  CampaignSessionEnvelope,
  CampaignSessionMutation,
  PendingCampaignSession,
} from '../model/campaignSession';
import * as api from '../services/campaignSessionService';
import * as store from '../services/campaignSessionRecovery';
interface Options {
  uid: string;
  campaignId: string;
  isActive: () => boolean;
  minimumRevision: () => number;
  observe: (value: CampaignSessionEnvelope) => void;
  onConfirmed: (
    value: CampaignSessionMutation,
    op: PendingCampaignSession,
    canAdopt: boolean,
  ) => void;
  onRejected?: () => void;
  onUnavailable?: () => void;
}
export function useCampaignSessionOperation(options: Options) {
  const [initial] = useState(() => {
    try {
      return {
        pending: store.readPendingCampaignSession(options.uid, options.campaignId),
        error: '',
      };
    } catch (cause) {
      return { pending: null, error: api.message(cause) };
    }
  });
  const [pending, setPending] = useState(initial.pending),
    [error, setError] = useState(initial.error),
    [busy, setBusy] = useState(false),
    [blocked, setBlocked] = useState(!!initial.error),
    [conflict, setConflict] = useState(false);
  const alive = useRef(true),
    latest = useRef(options),
    pendingRef = useRef(pending),
    reserved = useRef(false);
  useLayoutEffect(() => {
    latest.current = options;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const active = () => alive.current && latest.current.isActive();
  function check() {
    if (!active()) throw new Error('A sessão desta confirmação mudou. O pedido foi preservado.');
  }
  function read() {
    check();
    const actual = store.readPendingCampaignSession(options.uid, options.campaignId);
    pendingRef.current = actual;
    setPending(actual);
    return actual;
  }
  useEffect(
    () =>
      store.subscribeSessionRecovery(options.uid, options.campaignId, () => {
        if (!active()) return;
        try {
          read();
        } catch (cause) {
          setBlocked(true);
          setError(api.message(cause));
        }
      }),
    // The host keys actor/target; callbacks read the latest active owner.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.uid, options.campaignId],
  );
  useEffect(() => {
    if (!pending && !busy && !blocked) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending, busy, blocked]);
  async function run(snapshot: PendingCampaignSession, replay: boolean) {
    if (!active() || reserved.current || blocked || (!replay && (pendingRef.current || conflict)))
      return;
    const op = structuredClone(snapshot);
    reserved.current = true;
    setBusy(true);
    setError('');
    let sent = false;
    try {
      api.validatePending(op, options.uid, options.campaignId);
      if (replay) {
        store.exactPendingCampaignSession(op, check);
        const gate = await api.getCampaignSession({
          campaignId: op.input.campaignId,
          campaignToken: op.input.campaignToken,
          sessionId: op.input.sessionId,
        });
        check();
        store.exactPendingCampaignSession(op, check);
        api.validateEnvelope(
          gate,
          options.uid,
          options.campaignId,
          op.input.campaignToken,
          latest.current.minimumRevision(),
        );
        api.keys(gate, [
          'schemaVersion',
          'ownerId',
          'campaignId',
          'campaignToken',
          'collectionRevision',
          'session',
        ]);
        latest.current.observe(gate);
      }
      await store.reserveCampaignSession(op, check);
      check();
      read();
      store.exactPendingCampaignSession(op, check);
      sent = true;
      const value = await (op.method === 'saveCampaignSession'
        ? api.saveCampaignSession(op.input)
        : op.method === 'moveCampaignSession'
          ? api.moveCampaignSession(op.input)
          : api.deleteCampaignSession(op.input));
      check();
      api.validateMutation(value, op);
      store.exactPendingCampaignSession(op, check);
      await store.forgetCampaignSessionRecovery(op, check);
      check();
      if (read() !== null)
        throw new Error('Outro pedido foi preservado. Confira-o antes de continuar.');
      api.validateMutation(value, op);
      const canAdopt = value.collectionRevision >= latest.current.minimumRevision();
      if (canAdopt) latest.current.observe(value);
      setConflict(false);
      latest.current.onConfirmed(value, op, canAdopt);
    } catch (cause) {
      if (!active()) return;
      if (api.isDeletedCampaignError(cause, options.campaignId)) {
        latest.current.onUnavailable?.();
        return;
      }
      if (sent && api.definitive(cause)) {
        try {
          await store.forgetCampaignSessionRecovery(op, check);
          check();
          read();
        } catch {
          /* Keep changed or unreadable controls. */
        }
        if (!active()) return;
        setConflict(true);
        latest.current.onRejected?.();
      }
      try {
        read();
      } catch {
        setBlocked(true);
      }
      setError(api.message(cause));
    } finally {
      reserved.current = false;
      if (active()) setBusy(false);
    }
  }
  return {
    pending,
    error,
    busy,
    blocked,
    conflict,
    locksAvailable: store.sessionLocksAvailable(),
    execute: (op: PendingCampaignSession) => run(op, false),
    recover: () => {
      const expected = pendingRef.current;
      return expected ? run(expected, true) : Promise.resolve();
    },
    clearConflict: () => {
      setConflict(false);
      setError('');
    },
    isReserved: () => reserved.current || !!pendingRef.current || blocked,
  };
}
