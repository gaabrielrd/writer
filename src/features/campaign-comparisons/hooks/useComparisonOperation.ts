import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  ComparisonControl,
  ComparisonIdentity,
  ComparisonProgress,
  ComparisonSource,
  PendingComparison,
  StartComparisonPending,
  StepComparisonPending,
} from '../model/campaignComparison';
import * as api from '../services/campaignComparisonService';
import * as store from '../services/campaignComparisonRecovery';
interface Options {
  uid: string;
  campaignId: string;
  comparisonId?: string;
  currentBaseId?: string;
  expected?: ComparisonIdentity;
  isActive: () => boolean;
  isOpen: () => boolean;
}
export function useComparisonOperation(options: Options) {
  const [control, setControl] = useState<ComparisonControl | null>(null),
    [progress, setProgress] = useState<ComparisonProgress | null>(null),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [conflict, setConflict] = useState(false);
  const alive = useRef(true),
    reserved = useRef(false),
    refreshOwner = useRef<number | null>(null),
    latest = useRef(options),
    controlRef = useRef(control),
    progressRef = useRef(progress),
    identity = useRef<Partial<ComparisonIdentity>>(
      options.expected ?? {
        campaignId: options.campaignId,
        ...(options.comparisonId ? { comparisonId: options.comparisonId } : {}),
      },
    ),
    jobId = useRef(options.comparisonId),
    loadGeneration = useRef(0);
  useLayoutEffect(() => {
    latest.current = options;
  });
  useLayoutEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  function active() {
    return alive.current && latest.current.isActive();
  }
  function check() {
    if (!active()) throw new Error('A sessão desta comparação foi encerrada.');
  }
  function adoptControl(value: ComparisonControl | null) {
    check();
    controlRef.current = value;
    setControl(value);
    if (value?.scope.kind === 'start') {
      jobId.current = value.expected.comparisonId;
      identity.current = { ...value.expected };
    } else if (value) {
      jobId.current = value.scope.comparisonId;
      identity.current = value.expected;
    }
  }
  function adoptProgress(value: ComparisonProgress) {
    check();
    const known = controlRef.current;
    api.validateProgress(
      value,
      options.uid,
      identity.current,
      Math.max(
        progressRef.current?.comparisonId === value.comparisonId
          ? progressRef.current.checkpoint
          : 0,
        known?.scope.kind === 'known' &&
          'checkpoint' in known &&
          known.expected.comparisonId === value.comparisonId
          ? known.checkpoint
          : 0,
      ),
    );
    jobId.current = value.comparisonId;
    identity.current = api.identityOf(value);
    progressRef.current = value;
    setProgress(value);
  }
  function controlChanged(): never {
    progressRef.current = null;
    setProgress(null);
    throw new Error(
      'O controle mudou em outra aba. Consulte o controle novamente antes de continuar.',
    );
  }
  function confirmCurrentControl(expected: ComparisonControl | null) {
    check();
    const current = store.pendingComparisonFor(options.uid, options.campaignId, jobId.current);
    adoptControl(current);
    if (api.canonical(current) !== api.canonical(expected)) controlChanged();
    return current;
  }
  function acceptConfirmation(expected: ComparisonControl | null, value?: ComparisonProgress) {
    const current = confirmCurrentControl(expected);
    if (value) {
      if (
        current &&
        (current.scope.kind !== 'known' ||
          !('checkpoint' in current) ||
          current.checkpoint !== value.checkpoint)
      )
        controlChanged();
      adoptProgress(value);
    }
  }
  const refresh = useCallback(async () => {
    if (refreshOwner.current !== null) return;
    const generation = ++loadGeneration.current;
    refreshOwner.current = generation;
    if (active()) setLoading(true);
    try {
      let local: ComparisonControl | null = null;
      try {
        local = store.pendingComparisonFor(options.uid, options.campaignId, jobId.current);
        if (!active() || generation !== loadGeneration.current) return;
        adoptControl(local);
        setReady(true);
      } catch (cause) {
        if (active()) {
          setReady(false);
          setError(api.message(cause));
        }
      }
      if (local?.scope.kind === 'start' || !jobId.current) return;
      const value = await api.getCampaignComparison({ comparisonId: jobId.current });
      if (!active() || generation !== loadGeneration.current) return;
      confirmCurrentControl(local);
      adoptProgress(value);
      if (
        local?.scope.kind === 'known' &&
        value.state === 'deleted' &&
        value.cleanupComplete &&
        store.comparisonStorageAvailable()
      ) {
        const next = await store.rememberComparison(value, check);
        if (!active() || generation !== loadGeneration.current) return;
        acceptConfirmation(next, value);
      }
    } catch (cause) {
      if (active() && generation === loadGeneration.current) {
        progressRef.current = null;
        setProgress(null);
        setError(api.message(cause));
      }
    } finally {
      if (refreshOwner.current === generation) {
        refreshOwner.current = null;
        if (active() && generation === loadGeneration.current) setLoading(false);
      }
    }
    // The session is keyed by actor/campaign/selection; refs retain exact pending identities.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [options.uid, options.campaignId]);
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) void refresh();
    });
    const unsubscribe = store.subscribeComparisons(() => {
      if (!reserved.current && refreshOwner.current === null) void refresh();
    });
    return () => {
      current = false;
      unsubscribe();
    };
  }, [refresh]);
  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (reserved.current || (controlRef.current && controlRef.current.scope.kind !== 'known')) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  function observeReceipt(
    value: import('../model/campaignComparison').ComparisonMutationResult,
    entry: PendingComparison,
  ) {
    check();
    api.validateMutation(
      value,
      entry,
      progressRef.current?.comparisonId === value.progress.comparisonId
        ? progressRef.current.checkpoint
        : 0,
    );
  }
  async function performStart(entry: StartComparisonPending) {
    check();
    const value =
      entry.phase === 'cancel-start'
        ? await api.resolveCampaignComparisonStart({ ...entry.input, intent: 'cancel' })
        : await api.startCampaignComparison(entry.input);
    check();
    if ('request' in value) {
      api.validateCanceled(value, entry);
      const next = await store.finishComparisonStart(entry, null, check);
      check();
      acceptConfirmation(next);
      setNotice('Pedido inicial encerrado. Nenhuma candidata será criada por esse pedido.');
      return;
    }
    observeReceipt(value, entry);
    const next = await store.finishComparisonStart(entry, value.progress, () =>
      observeReceipt(value, entry),
    );
    check();
    observeReceipt(value, entry);
    acceptConfirmation(next, value.progress);
    if (entry.phase === 'cancel-start')
      setNotice(
        'O pedido inicial já era conhecido. A candidata foi preservada; descarte-a explicitamente se desejar.',
      );
  }
  async function performStep(entry: StepComparisonPending) {
    check();
    const value =
      entry.method === 'advance'
        ? await api.advanceCampaignComparison(entry.input)
        : await api.cancelCampaignComparison(entry.input);
    check();
    observeReceipt(value, entry);
    const next = await store.finishComparisonStep(entry, value.progress, () =>
      observeReceipt(value, entry),
    );
    check();
    observeReceipt(value, entry);
    acceptConfirmation(next, value.progress);
  }
  async function step(method: 'advance' | 'cancel') {
    const value = progressRef.current;
    if (!value) throw new Error('Consulte o progresso atual antes de continuar.');
    if (controlRef.current && controlRef.current.scope.kind !== 'known')
      throw new Error('Confirme o mesmo pedido antes de iniciar outro.');
    const entry: StepComparisonPending = {
      schemaVersion: 1,
      ownerId: options.uid,
      scope: { kind: 'job', campaignId: options.campaignId, comparisonId: value.comparisonId },
      method,
      input: {
        comparisonId: value.comparisonId,
        operationId: crypto.randomUUID(),
        expectedCheckpoint: value.checkpoint,
      },
      expected: api.identityOf(value),
    };
    await store.reserveComparison(entry, check);
    check();
    adoptControl(entry);
    await performStep(entry);
  }
  async function continueSteps(method: 'advance' | 'cancel') {
    while (active() && latest.current.isOpen()) {
      const value = progressRef.current;
      if (!value || (controlRef.current && controlRef.current.scope.kind !== 'known')) return;
      if (
        method === 'advance'
          ? value.state !== 'preparing' || !value.sourceAvailable
          : value.state === 'deleted'
      )
        return;
      await step(method);
      check();
    }
  }
  async function run(work: () => Promise<void>) {
    if (reserved.current) return;
    reserved.current = true;
    setBusy(true);
    setError('');
    setConflict(false);
    loadGeneration.current++;
    // The action supersedes an outstanding GET without waiting for its network response.
    // Its old finally cannot release the ownership of a later explicit refresh.
    refreshOwner.current = null;
    setLoading(false);
    try {
      check();
      if (!store.comparisonStorageAvailable())
        throw new Error(
          'A leitura continua disponível. Este navegador não permite preservar pedidos com reserva segura.',
        );
      await work();
    } catch (cause) {
      if (active()) {
        setError(api.message(cause));
        setConflict(['checkpoint-conflict', 'revision-conflict'].includes(api.reason(cause)));
      }
    } finally {
      reserved.current = false;
      if (active()) {
        setBusy(false);
        try {
          adoptControl(store.pendingComparisonFor(options.uid, options.campaignId, jobId.current));
        } catch (cause) {
          setError(api.message(cause));
          setReady(false);
        }
      }
    }
  }
  function start(source: ComparisonSource) {
    api.validateSource(
      source,
      options.uid,
      options.campaignId,
      options.currentBaseId ?? source.currentBaseId,
    );
    const operationId = crypto.randomUUID(),
      entry: StartComparisonPending = {
        schemaVersion: 1,
        ownerId: options.uid,
        scope: { kind: 'start', campaignId: options.campaignId },
        phase: 'request',
        input: {
          operationId,
          campaignId: options.campaignId,
          campaignToken: source.campaignToken,
          currentBaseId: source.currentBaseId,
          expectedSourceToken: source.sourceToken,
        },
        expected: {
          comparisonId: operationId,
          campaignId: options.campaignId,
          campaignToken: source.campaignToken,
          currentBaseId: source.currentBaseId,
        },
      };
    return run(async () => {
      if (!ready) throw new Error('Aguarde a conferência dos controles locais.');
      await store.reserveComparison(entry, check);
      check();
      adoptControl(entry);
      await performStart(entry);
      check();
      await continueSteps('advance');
    });
  }
  function recover() {
    return run(async () => {
      const entry = store.pendingComparisonFor(options.uid, options.campaignId, jobId.current);
      if (!entry || entry.scope.kind === 'known') return;
      adoptControl(entry);
      if ('phase' in entry) {
        await performStart(entry);
        if (entry.phase === 'request') await continueSteps('advance');
      } else if ('method' in entry) {
        await performStep(entry);
        await continueSteps(entry.method);
      }
    });
  }
  function cancelStart() {
    return run(async () => {
      const entry = store.pendingComparisonFor(options.uid, options.campaignId, jobId.current);
      if (!entry || !('phase' in entry)) throw new Error('Não há pedido inicial pendente.');
      const next =
        entry.phase === 'cancel-start' ? entry : await store.changeComparisonStart(entry, check);
      check();
      adoptControl(next);
      await performStart(next);
    });
  }
  function resolveConflict() {
    return run(async () => {
      const entry = store.pendingComparisonFor(options.uid, options.campaignId, jobId.current);
      if (!entry || !('method' in entry) || !conflict)
        throw new Error('A tentativa precisa de um conflito definitivo para ser encerrada.');
      const value = await api.getCampaignComparison({ comparisonId: entry.input.comparisonId });
      check();
      api.validateProgress(value, options.uid, entry.expected);
      if (value.checkpoint <= entry.input.expectedCheckpoint)
        throw new Error(
          'O progresso atual ainda não comprova que a tentativa antiga não poderá aplicar. O pedido foi preservado.',
        );
      const next = await store.finishComparisonStep(entry, value, check);
      check();
      acceptConfirmation(next, value);
      setConflict(false);
      setNotice('Tentativa encerrada. O progresso atual foi aceito sem executar outra etapa.');
    });
  }
  return {
    control,
    progress,
    ready,
    loading,
    busy,
    error,
    notice,
    conflict,
    refresh,
    start,
    recover,
    cancelStart,
    resolveConflict,
    continuePreparation: () => run(() => continueSteps('advance')),
    discard: () => run(() => continueSteps('cancel')),
    isReserved: () => reserved.current,
  };
}
