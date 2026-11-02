import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { publishInvalidation } from '@/shared/services';
import type { PendingSessionReference, SessionReferenceOutcome } from '../model/sessionReference';
import * as api from '../services/sessionReferenceService';
import * as store from '../services/sessionReferenceRecovery';
interface Options {
  uid: string;
  campaignId: string;
  isActive: () => boolean;
  onConfirmed?: (value: SessionReferenceOutcome) => void;
  onUnavailable?: () => void;
}
export function useSessionReferenceOperation(options: Options) {
  const [initial] = useState(() => {
    try {
      return {
        pending: store.readPendingSessionReference(options.uid, options.campaignId),
        error: '',
      };
    } catch (cause) {
      return { pending: null, error: api.message(cause) };
    }
  });
  const [pending, setPending] = useState(initial.pending),
    [error, setError] = useState(initial.error),
    [blocked, setBlocked] = useState(!!initial.error),
    [busy, setBusy] = useState(false),
    [notice, setNotice] = useState('');
  const alive = useRef(true),
    latest = useRef(options),
    reserved = useRef(false),
    control = useRef(pending);
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
    if (!active()) throw new Error('A conta ou a sessão mudou. O pedido foi preservado.');
  }
  function read() {
    check();
    const value = store.readPendingSessionReference(options.uid, options.campaignId);
    control.current = value;
    setPending(value);
    setBlocked(false);
    return value;
  }
  useEffect(
    () =>
      store.subscribeSessionReferences(options.uid, options.campaignId, () => {
        if (active()) {
          try {
            read();
          } catch (cause) {
            setBlocked(true);
            setError(api.message(cause));
          }
        }
      }),
    [options.uid, options.campaignId], // eslint-disable-line react-hooks/exhaustive-deps
  );
  useEffect(() => {
    if (!pending && !busy && !blocked) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [pending, busy, blocked]);
  async function run(expected: PendingSessionReference, mode: 'new' | 'replay' | 'cancel') {
    if (!active() || reserved.current || blocked) return;
    reserved.current = true;
    setBusy(true);
    setError('');
    let op = structuredClone(expected);
    try {
      api.validatePending(op, options.uid, options.campaignId);
      if (mode === 'new') await store.reserveSessionReference(op, check);
      else {
        store.exactSessionReference(op, check);
        if (mode === 'cancel' && op.intent !== 'cancel')
          op = await store.cancelSessionReference(op, check);
      }
      check();
      read();
      store.exactSessionReference(op, check);
      const value =
        op.intent === 'cancel'
          ? await api.resolveCampaignSessionReferenceOperation(
              op.action === 'add'
                ? { action: 'add', request: op.request, intent: 'cancel' }
                : { action: 'remove', request: op.request, intent: 'cancel' },
            )
          : op.action === 'add'
            ? await api.addCampaignSessionReference(op.request)
            : await api.removeCampaignSessionReference(op.request);
      check();
      api.validateOutcome(value, op);
      await store.forgetSessionReferenceRecovery(op, () => {
        check();
        api.validateOutcome(value, op);
      });
      check();
      if (read() !== null)
        throw new Error('Outro controle foi preservado. Confira-o antes de continuar.');
      setNotice(
        value.kind === 'canceled'
          ? 'Pedido encerrado; ele não criará nem removerá um vínculo.'
          : 'Pedido de vínculo confirmado. Consulte a lista atual.',
      );
      latest.current.onConfirmed?.(value);
    } catch (cause) {
      if (!active()) return;
      if (api.deletedCampaignError(cause, options.campaignId)) {
        latest.current.onUnavailable?.();
        publishInvalidation({ actorId: options.uid, scope: 'campaign:' + options.campaignId });
        return;
      }
      try {
        read();
      } catch {
        setBlocked(true);
        /* Preserve malformed controls. */
      }
      setError(api.message(cause));
    } finally {
      reserved.current = false;
      if (active()) setBusy(false);
    }
  }
  return {
    pending,
    busy,
    error,
    notice,
    blocked,
    locksAvailable: store.referenceLocksAvailable(),
    execute: (value: PendingSessionReference) => {
      if (control.current) return Promise.resolve();
      return run(value, 'new');
    },
    recover: (value: PendingSessionReference) => run(value, 'replay'),
    cancel: (value: PendingSessionReference) => run(value, 'cancel'),
  };
}
