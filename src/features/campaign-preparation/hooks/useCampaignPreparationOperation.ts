import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { publishInvalidation } from '@/shared/services';
import type {
  PendingCampaignPreparation,
  PreparationOutcome,
  PreparationRequest,
  ResolvePreparationInput,
} from '../model/campaignPreparation';
import * as api from '../services/campaignPreparationService';
import * as store from '../services/campaignPreparationRecovery';
interface Options {
  uid: string;
  campaignId: string;
  isActive: () => boolean;
  onConfirmed: (outcome: PreparationOutcome, operation: PendingCampaignPreparation) => void;
  onUnavailable: () => void;
}
export function useCampaignPreparationOperation(options: Options) {
  const [initial] = useState(() => {
    try {
      return {
        pending: store.readPendingCampaignPreparation(options.uid, options.campaignId),
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
    control = useRef(pending),
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
    if (!active()) throw new Error('A conta ou a campanha mudou. O pedido foi preservado.');
  }
  function read() {
    check();
    const value = store.readPendingCampaignPreparation(options.uid, options.campaignId);
    control.current = value;
    setPending(value);
    setBlocked(false);
    return value;
  }
  useEffect(
    () =>
      store.subscribeCampaignPreparation(options.uid, options.campaignId, () => {
        if (active())
          try {
            read();
          } catch (cause) {
            setBlocked(true);
            setError(api.message(cause));
          }
      }),
    // Identity is fixed by the keyed host; continuations use current callbacks.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.uid, options.campaignId],
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
  async function dispatch(p: PendingCampaignPreparation): Promise<PreparationOutcome> {
    if (p.intent === 'cancel')
      return api.resolveCampaignPreparationOperation({
        action: p.action,
        request: p.request,
        intent: 'cancel',
      } as ResolvePreparationInput);
    switch (p.action) {
      case 'save-item':
        return api.saveCampaignPreparationItem(p.request);
      case 'delete-item':
        return api.deleteCampaignPreparationItem(p.request);
      case 'move-item':
        return api.moveCampaignPreparationItem(p.request);
      case 'add-link':
        return api.addCampaignSessionPreparationLink(p.request);
      case 'remove-link':
        return api.removeCampaignSessionPreparationLink(p.request);
      case 'move-link':
        return api.moveCampaignSessionPreparationLink(p.request);
    }
  }
  async function run(expected: PendingCampaignPreparation, mode: 'new' | 'recover' | 'cancel') {
    if (!active() || reserved.current || blocked || (mode === 'new' && control.current)) return;
    reserved.current = true;
    setBusy(true);
    setError('');
    let operation = structuredClone(expected);
    try {
      api.validatePending(operation, options.uid, options.campaignId);
      if (mode === 'new') await store.reserveCampaignPreparation(operation, check);
      else {
        store.exactCampaignPreparation(operation, check);
        if (mode === 'cancel' && operation.intent !== 'cancel')
          operation = await store.cancelCampaignPreparation(operation, check);
      }
      check();
      read();
      store.exactCampaignPreparation(operation, check);
      const result = await dispatch(operation);
      check();
      api.validateOutcome(result, operation);
      await store.forgetCampaignPreparationRecovery(operation, () => {
        check();
        api.validateOutcome(result, operation);
      });
      check();
      if (read() !== null)
        throw new Error('Outro pedido foi preservado. Confira-o antes de continuar.');
      setNotice(
        result.kind === 'canceled'
          ? 'Pedido encerrado sem executar a alteração.'
          : 'Pedido da preparação confirmado. Consulte a lista atual.',
      );
      latest.current.onConfirmed(result, operation);
    } catch (cause) {
      if (!active()) return;
      if (api.deletedCampaignError(cause, options.campaignId)) {
        latest.current.onUnavailable();
        publishInvalidation({ actorId: options.uid, scope: 'campaign:' + options.campaignId });
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
    busy,
    error,
    notice,
    blocked,
    locksAvailable: store.preparationLocksAvailable(),
    isReserved: () => reserved.current || !!control.current || blocked,
    execute: (request: PreparationRequest) =>
      run(
        { ...structuredClone(request), schemaVersion: 1, ownerId: options.uid, intent: 'apply' },
        'new',
      ),
    recover: () => (control.current ? run(control.current, 'recover') : Promise.resolve()),
    cancel: () => (control.current ? run(control.current, 'cancel') : Promise.resolve()),
  };
}
