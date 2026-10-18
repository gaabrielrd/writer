import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import type { ComparisonReadEnvelope } from '@/features/campaign-comparisons';
import type {
  AdoptionSelection,
  AdoptionControl,
  AdoptionProgress,
  AdoptionIdentity,
  PendingAdoption,
  StartAdoptionPending,
  StepAdoptionPending,
  AdoptionMutationResult,
  AdoptionAction,
  DecideAdoptionInput,
} from '../model/campaignAdoption';
import * as api from '../services/campaignAdoptionService';
import * as store from '../services/campaignAdoptionRecovery';
interface Options {
  uid: string;
  selection: AdoptionSelection;
  isActive: () => boolean;
  isOpen: () => boolean;
  onAdopted?: () => void;
  onPendingChange?: (value: boolean) => void;
}
export function useAdoptionOperation(options: Options) {
  const [control, setControl] = useState<AdoptionControl | null>(null),
    [progress, setProgress] = useState<AdoptionProgress | null>(null),
    [ready, setReady] = useState(false),
    [loading, setLoading] = useState(false),
    [busy, setBusy] = useState(false),
    [paused, setPaused] = useState(false),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [conflict, setConflict] = useState(false),
    [result, setResult] = useState<AdoptionMutationResult | null>(null);
  const alive = useRef(true),
    latest = useRef(options),
    reserved = useRef(false),
    pauseRequested = useRef(false),
    controlRef = useRef(control),
    progressRef = useRef(progress),
    identity = useRef<Partial<AdoptionIdentity>>(
      options.selection.expected ?? {
        campaignId: options.selection.campaignId,
        ...(options.selection.adoptionId ? { adoptionId: options.selection.adoptionId } : {}),
      },
    ),
    jobId = useRef(options.selection.adoptionId),
    generation = useRef(0),
    readOwner = useRef<number | null>(null);
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
    if (!active()) throw new Error('A sessão desta adoção foi encerrada.');
  }
  function adoptControl(v: AdoptionControl | null) {
    check();
    controlRef.current = v;
    setControl(v);
    if (v) {
      jobId.current = v.expected.adoptionId;
      identity.current = v.expected;
    }
  }
  function adoptProgress(v: AdoptionProgress) {
    check();
    const known = controlRef.current;
    api.validateProgress(
      v,
      options.uid,
      identity.current,
      Math.max(
        progressRef.current?.adoptionId === v.adoptionId ? progressRef.current.checkpoint : 0,
        known && 'checkpoint' in known && known.expected.adoptionId === v.adoptionId
          ? known.checkpoint
          : 0,
      ),
    );
    jobId.current = v.adoptionId;
    identity.current = api.identityOf(v);
    progressRef.current = v;
    setProgress(v);
  }
  function changed(): never {
    progressRef.current = null;
    setProgress(null);
    throw new Error('O controle mudou em outra aba. Consulte o progresso antes de continuar.');
  }
  function currentControl(expected: AdoptionControl | null) {
    check();
    const actual = store.pendingAdoptionFor(
      options.uid,
      options.selection.campaignId,
      jobId.current,
    );
    adoptControl(actual);
    if (api.canonical(actual) !== api.canonical(expected)) changed();
    return actual;
  }
  function accept(expected: AdoptionControl | null, value?: AdoptionProgress) {
    const actual = currentControl(expected);
    if (value) {
      if (actual && (!('checkpoint' in actual) || actual.checkpoint !== value.checkpoint))
        changed();
      adoptProgress(value);
    }
  }
  const readProgress = useCallback(
    async (explicit = false) => {
      if (!explicit && readOwner.current !== null) return;
      const own = ++generation.current;
      readOwner.current = own;
      if (active()) setLoading(true);
      try {
        const local = store.pendingAdoptionFor(
          options.uid,
          options.selection.campaignId,
          jobId.current,
        );
        if (!active() || own !== generation.current) return;
        adoptControl(local);
        setReady(true);
        if (local?.scope.kind === 'start' || !jobId.current) return;
        const value = await api.getCampaignAdoption({ adoptionId: jobId.current });
        if (!active() || own !== generation.current) return;
        currentControl(local);
        adoptProgress(value);
        if (
          local?.scope.kind === 'known' &&
          value.state === 'deleted' &&
          store.adoptionStorageAvailable()
        ) {
          const next = await store.rememberAdoption(value, () => {
            currentControl(local);
          });
          if (!active() || own !== generation.current) return;
          accept(next, value);
        }
        setError('');
      } catch (cause) {
        if (active() && own === generation.current) {
          setError(api.message(cause));
          progressRef.current = null;
          setProgress(null);
        }
      } finally {
        if (readOwner.current === own) {
          readOwner.current = null;
          if (active() && own === generation.current) setLoading(false);
        }
      }
      // The host keys this session by actor/selection; refs preserve exact pending inputs.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.uid, options.selection.campaignId],
  );
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) void readProgress();
    });
    const unsub = store.subscribeAdoptions(() => {
      if (!reserved.current && readOwner.current === null) void readProgress();
    });
    return () => {
      current = false;
      unsub();
    };
  }, [readProgress]);
  const pending = !!control && control.scope.kind !== 'known';
  useEffect(() => {
    if (active()) latest.current.onPendingChange?.(busy || pending);
  }, [busy, pending]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (reserved.current || (controlRef.current && controlRef.current.scope.kind !== 'known')) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  function observeReceipt(value: AdoptionMutationResult, op: PendingAdoption) {
    check();
    api.validateMutation(
      value,
      op,
      progressRef.current?.adoptionId === value.progress.adoptionId
        ? progressRef.current.checkpoint
        : 0,
    );
  }
  async function perform(op: PendingAdoption): Promise<AdoptionMutationResult | null> {
    check();
    currentControl(op);
    if ('phase' in op) {
      const value =
        op.phase === 'cancel-start'
          ? await api.resolveCampaignAdoptionStart({ ...op.input, intent: 'cancel' })
          : await api.startCampaignAdoption(op.input);
      check();
      if ('request' in value) {
        api.validateCanceled(value, op);
        const next = await store.finishAdoptionStart(op, null, check);
        check();
        accept(next);
        setNotice('Pedido inicial encerrado. Nenhuma adoção será iniciada por ele.');
        return null;
      }
      observeReceipt(value, op);
      const next = await store.finishAdoptionStart(op, value.progress, () =>
        observeReceipt(value, op),
      );
      check();
      observeReceipt(value, op);
      accept(next, value.progress);
      setResult(value);
      return value;
    }
    const value =
      op.method === 'decide'
        ? await api.decideCampaignAdoption(op.input as DecideAdoptionInput)
        : op.method === 'prepare'
          ? await api.prepareCampaignAdoption(op.input)
          : op.method === 'advance'
            ? await api.advanceCampaignAdoption(op.input)
            : op.method === 'activate'
              ? await api.activateCampaignAdoption(op.input)
              : await api.cancelCampaignAdoption(op.input);
    check();
    observeReceipt(value, op);
    const next = await store.finishAdoptionStep(op, value.progress, () =>
      observeReceipt(value, op),
    );
    check();
    observeReceipt(value, op);
    accept(next, value.progress);
    setResult(value);
    if (value.progress.state === 'adopted') {
      setNotice('A adoção desta base foi confirmada.');
      latest.current.onAdopted?.();
    }
    return value;
  }
  async function step(
    method: Exclude<AdoptionAction, 'start'>,
    choice?: {
      sourceKey: string;
      expectedRevision: number;
      choice: import('../model/campaignAdoption').AdoptionChoice;
    },
  ) {
    const p = progressRef.current;
    if (!p) throw new Error('Consulte o progresso antes de continuar.');
    if (controlRef.current && controlRef.current.scope.kind !== 'known')
      throw new Error('Confirme o pedido preservado antes de outro.');
    const op: StepAdoptionPending = {
      schemaVersion: 1,
      ownerId: options.uid,
      scope: { kind: 'job', campaignId: p.campaignId, adoptionId: p.adoptionId },
      method,
      input: {
        adoptionId: p.adoptionId,
        operationId: crypto.randomUUID(),
        expectedCheckpoint: p.checkpoint,
        ...choice,
      },
      expected: api.identityOf(p),
    };
    await store.reserveAdoption(op, check);
    check();
    adoptControl(op);
    return perform(op);
  }
  async function continueSteps(action: 'advance' | 'cancel', value: AdoptionMutationResult | null) {
    while (
      active() &&
      !pauseRequested.current &&
      latest.current.isOpen() &&
      value &&
      value.receipt.outcome === 'confirmed' &&
      value.progress.checkpoint === value.receipt.confirmedCheckpoint
    ) {
      const p = progressRef.current;
      if (
        !p ||
        (controlRef.current && controlRef.current.scope.kind !== 'known') ||
        (action === 'advance' ? p.state !== 'preparing' : p.state !== 'deleting')
      )
        return;
      value = await step(action);
      check();
    }
  }
  async function run(work: () => Promise<void>) {
    if (reserved.current) return;
    reserved.current = true;
    pauseRequested.current = false;
    setPaused(false);
    setBusy(true);
    setError('');
    setConflict(false);
    generation.current++;
    readOwner.current = null;
    setLoading(false);
    try {
      check();
      if (!store.adoptionStorageAvailable())
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
          adoptControl(
            store.pendingAdoptionFor(options.uid, options.selection.campaignId, jobId.current),
          );
        } catch (cause) {
          setReady(false);
          setError(api.message(cause));
        }
      }
    }
  }
  function start(context: ComparisonReadEnvelope) {
    const input = {
      operationId: crypto.randomUUID(),
      campaignId: context.campaignId,
      campaignToken: context.campaignToken,
      comparisonId: context.comparisonId,
      currentBaseId: context.currentBaseId,
      candidateBaseId: context.candidateBaseId,
      expectedCollectionRevision: context.collectionRevision,
    };
    const { operationId, ...base } = input;
    const op: StartAdoptionPending = {
      schemaVersion: 1,
      ownerId: options.uid,
      scope: { kind: 'start', campaignId: context.campaignId },
      phase: 'request',
      input,
      expected: { adoptionId: operationId, ...base },
    };
    return run(async () => {
      if (
        !ready ||
        context.ownerId !== options.uid ||
        context.campaignId !== options.selection.campaignId
      )
        throw new Error('Confira a comparação autorizada antes de iniciar.');
      await store.reserveAdoption(op, check);
      check();
      adoptControl(op);
      await perform(op);
    });
  }
  function recover() {
    const expected = controlRef.current;
    return run(async () => {
      const op = currentControl(expected);
      if (!op || 'checkpoint' in op) return;
      adoptControl(op);
      const value = await perform(op);
      if ('method' in op && ['prepare', 'advance', 'cancel'].includes(op.method))
        await continueSteps(op.method === 'cancel' ? 'cancel' : 'advance', value);
    });
  }
  function cancelStart(expected: AdoptionControl | null = controlRef.current) {
    return run(async () => {
      const old = currentControl(expected);
      if (!old || !('phase' in old)) throw new Error('Não há pedido inicial preservado.');
      const op = old.phase === 'cancel-start' ? old : await store.changeAdoptionStart(old, check);
      check();
      adoptControl(op);
      await perform(op);
    });
  }
  function execute(
    method: Exclude<AdoptionAction, 'start'>,
    choice?: {
      sourceKey: string;
      expectedRevision: number;
      choice: import('../model/campaignAdoption').AdoptionChoice;
    },
  ) {
    return run(async () => {
      const value = await step(method, choice);
      if (['prepare', 'advance', 'cancel'].includes(method))
        await continueSteps(method === 'cancel' ? 'cancel' : 'advance', value);
    });
  }
  function resolveConflict() {
    const expected = controlRef.current;
    return run(async () => {
      const op = currentControl(expected);
      if (!op || !('method' in op) || !conflict)
        throw new Error('A tentativa precisa de conflito definitivo.');
      const value = await api.getCampaignAdoption({ adoptionId: op.input.adoptionId });
      check();
      api.validateProgress(value, options.uid, op.expected);
      if (value.checkpoint <= op.input.expectedCheckpoint)
        throw new Error('O progresso ainda não comprova que a tentativa antiga ficou vencida.');
      const next = await store.finishAdoptionStep(op, value, check);
      check();
      accept(next, value);
      setNotice('Tentativa encerrada. Reveja o progresso antes de outra etapa.');
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
    result,
    refresh: () => readProgress(true),
    start,
    recover,
    cancelStart,
    execute,
    resolveConflict,
    paused,
    pause: () => {
      if (active()) {
        pauseRequested.current = true;
        setPaused(true);
      }
    },
  };
}
