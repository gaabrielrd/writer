import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { publishInvalidation } from '@/shared/services';
import type {
  DeletionControl,
  DeletionPending,
  DeletionProgress,
  DeletionSource,
  DeletionLookup,
  DeletionIdentity,
} from '../model/campaignDeletion';
import * as api from '../services/campaignDeletionService';
import * as store from '../services/campaignDeletionRecovery';
interface Options {
  uid: string;
  campaignId: string;
  isActive: () => boolean;
  isOpen: () => boolean;
  onRevoked?: (progress: DeletionProgress) => void;
}
export function useDeletionOperation(options: Options) {
  const [control, setControl] = useState<DeletionControl | null>(null),
    [progress, setProgress] = useState<DeletionProgress | null>(null),
    [ready, setReady] = useState(false),
    [busy, setBusy] = useState(false),
    [loading, setLoading] = useState(false),
    [error, setError] = useState(''),
    [conflict, setConflict] = useState(false),
    [notice, setNotice] = useState(''),
    [paused, setPaused] = useState(false);
  const alive = useRef(true),
    latest = useRef(options),
    controlRef = useRef(control),
    progressRef = useRef(progress),
    reserved = useRef(false),
    pauseRef = useRef(false),
    generation = useRef(0),
    readOwner = useRef<number | null>(null),
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
  const active = () => alive.current && latest.current.isActive();
  function check() {
    if (!active()) throw new Error('A conta ou a campanha mudou. O controle foi preservado.');
  }
  function adoptControl(value: DeletionControl | null) {
    check();
    controlRef.current = value;
    setControl(value);
  }
  function currentControl(expected: DeletionControl | null) {
    check();
    const actual = store.readDeletion(options.uid, options.campaignId);
    adoptControl(actual);
    if (api.canonical(actual) !== api.canonical(expected)) {
      progressRef.current = null;
      setProgress(null);
      throw new Error('O controle mudou em outra aba. Consulte o progresso antes de continuar.');
    }
    return actual;
  }
  function expectedIdentity(c: DeletionControl | null): Partial<DeletionIdentity> {
    return c?.kind === 'start'
      ? {
          campaignId: c.input.campaignId,
          campaignToken: c.input.campaignToken,
          deletionId: c.input.operationId,
        }
      : (c?.identity ?? { campaignId: options.campaignId });
  }
  function observe(p: DeletionProgress) {
    check();
    const old = progressRef.current,
      c = controlRef.current;
    api.validateProgress(
      p,
      options.uid,
      expectedIdentity(c),
      Math.max(
        old?.deletionId === p.deletionId ? old.checkpoint : 0,
        c?.kind === 'known' ? c.checkpoint : 0,
      ),
    );
    progressRef.current = p;
    setProgress(p);
    revokePresentation(p);
  }
  function revokePresentation(p: DeletionProgress) {
    check();
    if (!notified.current) {
      notified.current = true;
      publishInvalidation({ actorId: options.uid, scope: 'campaign:' + options.campaignId });
      latest.current.onRevoked?.(p);
    }
  }
  const read = useCallback(
    async (explicit = false) => {
      if (!explicit && readOwner.current !== null) return;
      const own = ++generation.current;
      readOwner.current = own;
      if (active()) setLoading(true);
      try {
        const local = store.readDeletion(options.uid, options.campaignId);
        if (!active() || own !== generation.current) return;
        adoptControl(local);
        setReady(true);
        if (local?.kind === 'start') return;
        const value = await api.getCampaignDeletion({ campaignId: options.campaignId });
        if (!active() || own !== generation.current) return;
        api.validateLookup(value, options.uid, { campaignId: options.campaignId });
        if (value.deletion) revokePresentation(value.deletion);
        currentControl(local);
        if (value.deletion) observe(value.deletion);
        else if (local) throw new Error('O controle preservado ainda não pôde ser confirmado.');
        setError('');
      } catch (cause) {
        if (active() && own === generation.current) setError(api.message(cause));
      } finally {
        if (readOwner.current === own) {
          readOwner.current = null;
          if (active() && own === generation.current) setLoading(false);
        }
      }
      // Host keys actor/target and imperative checks guard each continuation.
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [options.uid, options.campaignId],
  );
  useEffect(() => {
    let current = true;
    queueMicrotask(() => {
      if (current) void read();
    });
    const unsub = store.subscribeDeletions(() => {
      if (!reserved.current && readOwner.current === null) void read();
    });
    return () => {
      current = false;
      unsub();
    };
  }, [read]);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (reserved.current || (controlRef.current && controlRef.current.kind !== 'known')) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  function receipt(
    value: import('../model/campaignDeletion').DeletionMutation,
    op: DeletionPending,
  ) {
    check();
    api.validateMutation(
      value,
      op,
      progressRef.current?.deletionId === value.progress.deletionId
        ? progressRef.current.checkpoint
        : 0,
    );
  }
  async function perform(op: DeletionPending) {
    currentControl(op);
    const value =
      op.kind === 'start'
        ? op.phase === 'cancel-start'
          ? await api.resolveCampaignDeletionStart({ ...op.input, intent: 'cancel' })
          : await api.startCampaignDeletion(op.input)
        : await api.advanceCampaignDeletion(op.input);
    check();
    if ('kind' in value) {
      api.validateCanceled(value, op);
      const next = await store.finishDeletion(op, null, () => {
        currentControl(op);
      });
      check();
      currentControl(next);
      setNotice('Pedido inicial encerrado. Este pedido não iniciará uma exclusão.');
      return null;
    }
    receipt(value, op);
    revokePresentation(value.progress);
    const next = await store.finishDeletion(op, value.progress, () => {
      receipt(value, op);
    });
    check();
    receipt(value, op);
    currentControl(next);
    if (next?.kind !== 'known' || next.checkpoint !== value.progress.checkpoint)
      throw new Error('O controle atual mudou e foi preservado.');
    observe(value.progress);
    return value;
  }
  async function step() {
    const p = progressRef.current;
    if (!p || p.complete) throw new Error('Consulte uma exclusão ainda em andamento.');
    if (controlRef.current && controlRef.current.kind !== 'known')
      throw new Error('Confirme o pedido preservado.');
    const op: DeletionPending = {
      schemaVersion: 1,
      ownerId: options.uid,
      kind: 'step',
      identity: api.identityOf(p),
      input: {
        deletionId: p.deletionId,
        operationId: crypto.randomUUID(),
        expectedCheckpoint: p.checkpoint,
      },
    };
    await store.reserveDeletion(op, check);
    check();
    adoptControl(op);
    return perform(op);
  }
  async function continueSteps(value: Awaited<ReturnType<typeof perform>>) {
    while (
      active() &&
      latest.current.isOpen() &&
      !pauseRef.current &&
      value &&
      !value.progress.complete &&
      value.progress.checkpoint === value.receipt.confirmedCheckpoint
    ) {
      value = await step();
      check();
    }
  }
  async function run(work: () => Promise<void>) {
    if (reserved.current) return;
    reserved.current = true;
    pauseRef.current = false;
    setPaused(false);
    setBusy(true);
    setError('');
    setConflict(false);
    generation.current++;
    readOwner.current = null;
    setLoading(false);
    try {
      check();
      if (!store.recoveryAvailable())
        throw new Error('Não há reserva segura neste navegador. Nenhum pedido novo será enviado.');
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
          adoptControl(store.readDeletion(options.uid, options.campaignId));
        } catch (cause) {
          setReady(false);
          setError(api.message(cause));
        }
      }
    }
  }
  function start(source: DeletionSource) {
    const snapshot = structuredClone(source);
    return run(async () => {
      api.validateSource(snapshot, options.uid, options.campaignId);
      if (!ready) throw new Error('Confira o controle antes de excluir.');
      const op: DeletionPending = {
        schemaVersion: 1,
        ownerId: options.uid,
        kind: 'start',
        phase: 'request',
        input: {
          campaignId: snapshot.campaignId,
          campaignToken: snapshot.campaignToken,
          expectedRevision: snapshot.revision,
          operationId: crypto.randomUUID(),
        },
      };
      await store.reserveDeletion(op, check);
      check();
      adoptControl(op);
      await continueSteps(await perform(op));
    });
  }
  function recover() {
    const expected = controlRef.current;
    return run(async () => {
      const op = currentControl(expected);
      if (!op || op.kind === 'known') return;
      await continueSteps(await perform(op));
    });
  }
  function cancelStart(expected: DeletionControl | null = controlRef.current) {
    return run(async () => {
      const old = currentControl(expected);
      if (!old || old.kind !== 'start') throw new Error('Não há início preservado.');
      const op = old.phase === 'cancel-start' ? old : await store.changeDeletionStart(old, check);
      check();
      adoptControl(op);
      await perform(op);
    });
  }
  function advance() {
    return run(async () => {
      await continueSteps(await step());
    });
  }
  function resolveConflict() {
    const expected = controlRef.current,
      hadConflict = conflict;
    return run(async () => {
      const op = currentControl(expected);
      if (!op || op.kind !== 'step' || !hadConflict)
        throw new Error('A tentativa precisa de conflito definitivo.');
      const lookup = await api.getCampaignDeletion({ campaignId: options.campaignId });
      check();
      api.validateLookup(lookup, options.uid, { campaignId: options.campaignId });
      if (!lookup.deletion) throw new Error('A exclusão ainda não pôde ser confirmada.');
      revokePresentation(lookup.deletion);
      api.validateProgress(
        lookup.deletion,
        options.uid,
        op.identity,
        op.input.expectedCheckpoint + 1,
      );
      const next = await store.finishDeletion(op, lookup.deletion, () => {
        currentControl(op);
      });
      check();
      currentControl(next);
      observe(lookup.deletion);
      setNotice('Tentativa encerrada. Consulte o progresso antes de outra etapa.');
    });
  }
  async function proof(): Promise<DeletionLookup> {
    check();
    const value = await api.getCampaignDeletion({ campaignId: options.campaignId });
    check();
    api.validateLookup(value, options.uid, { campaignId: options.campaignId });
    if (!value.deletion) throw new Error('A exclusão ainda não foi comprovada.');
    revokePresentation(value.deletion);
    return value;
  }
  return {
    control,
    progress,
    ready,
    busy,
    loading,
    error,
    notice,
    paused,
    conflict,
    start,
    recover,
    cancelStart,
    advance,
    resolveConflict,
    proof,
    refresh: () => read(true),
    pause: () => {
      if (active()) {
        pauseRef.current = true;
        setPaused(true);
      }
    },
  };
}
