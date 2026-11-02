import { useEffect, useRef, useState } from 'react';
import type { InspectedBookRestore } from '../model/bookRestoreReview';
import type { BookRestoreTransferJob } from '../services/bookRestoreTransferJob';
import type { BookRestoreActivationReview } from '../services/bookRestoreFinalizationViews';
import { inspectBookRestoreFile } from '../services/inspectBookRestoreFile';
import { createBookRestoreStartSession } from '../services/bookRestoreStartSession';
import { readStoredBookRestoreStart } from '../services/bookRestoreBootstrapStore';
import { createBookRestoreUploadDriver } from '../services/bookRestoreUploadDriver';
import { createBookRestorePreparationDriver } from '../services/bookRestorePreparationDriver';
import { createBookRestorePreparationJournal } from '../services/bookRestorePreparationJournal';
import { bookRestorePreparationApi } from '../services/bookRestorePreparationCallables';
import { createBookRestoreEffectSession } from '../services/bookRestoreEffectSession';
import {
  checkBookRestoreAccount,
  hasBookRestoreLocalRecovery,
  discardBookRestoreLocalRecovery,
} from '../services/bookRestoreLocalRecovery';
import { restorePreparationCheck as check } from '../services/bookRestorePreparationContracts';
type Guard = () => void;
export function useBookRestore(ownerId: string, initialId?: string) {
  const [id, setId] = useState(initialId ?? null),
    [job, setJob] = useState<BookRestoreTransferJob | null>(null),
    [inspection, setInspection] = useState<InspectedBookRestore | null>(null),
    [review, setReview] = useState<BookRestoreActivationReview | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(''),
    [message, setMessage] = useState('Selecione um backup para conferir.'),
    [localRecovery, setLocalRecovery] = useState(false),
    [done, setDone] = useState(false);
  const lifetime = useRef(0),
    running = useRef(false),
    paused = useRef(false),
    file = useRef<Blob | null>(null),
    selected = useRef<InspectedBookRestore | null>(null),
    currentId = useRef(initialId ?? null);
  useEffect(() => {
    const generation = ++lifetime.current;
    return () => {
      lifetime.current = generation + 1;
      paused.current = true;
    };
  }, []);
  async function operate(label: string, work: (guard: Guard) => Promise<void>) {
    if (running.current) return;
    const generation = lifetime.current,
      guard = () => {
        check(lifetime.current === generation);
        checkBookRestoreAccount(ownerId);
      };
    try {
      guard();
    } catch {
      return;
    }
    running.current = true;
    paused.current = false;
    setBusy(true);
    setError('');
    setMessage(label);
    try {
      await work(guard);
      guard();
    } catch (cause) {
      if (lifetime.current === generation) {
        try {
          checkBookRestoreAccount(ownerId);
          setError(
            cause instanceof Error ? cause.message : 'Não foi possível concluir a restauração.',
          );
        } catch {
          /* A different account must not receive the previous response. */
        }
      }
    } finally {
      running.current = false;
      if (lifetime.current === generation) {
        setBusy(false);
        if (paused.current) setMessage('Preparação pausada. Você pode retomar depois.');
      }
    }
  }
  const session = (guard: Guard) => createBookRestoreStartSession({ ownerId, check: guard });
  function identity(p: BookRestoreTransferJob) {
    return { ownerId, restoreId: p.restoreId, jobToken: p.jobToken, bookId: p.bookId };
  }
  const effects = (p: BookRestoreTransferJob, guard: Guard) =>
    createBookRestoreEffectSession({ identity: identity(p), check: guard });
  async function show(p: BookRestoreTransferJob, guard: Guard) {
    guard();
    setJob(p);
    setReview(null);
    setDone(false);
    if (p.state === 'activated' || p.state === 'cancelled') {
      const stored = await hasBookRestoreLocalRecovery(p, guard);
      guard();
      setLocalRecovery(stored);
      setMessage(
        p.state === 'activated'
          ? 'Sua cópia privada já foi criada. A finalização pode ser retomada.'
          : 'Preparação cancelada.',
      );
    } else if (p.state === 'content-verified' && p.preparation?.phase === 'activation-ready') {
      const terminal = effects(p, guard);
      if ((await terminal.pending()) === null) {
        const value = await terminal.review();
        guard();
        setReview(value);
        setMessage('Confira a cópia antes de criá-la.');
      } else
        setMessage('Há um pedido aguardando confirmação. Retome ou verifique antes de continuar.');
    } else if (p.state === 'uploading') setMessage('Selecione o mesmo backup e retome o envio.');
    else if (p.state === 'rejected' || p.state === 'content-rejected')
      setMessage('Este backup não pôde ser preparado. Você pode cancelar esta tentativa.');
    else setMessage('Preparação disponível para retomar.');
  }
  async function load(guard: Guard) {
    const restoreId = currentId.current;
    if (!restoreId) return;
    const start = await readStoredBookRestoreStart(ownerId, restoreId, guard);
    guard();
    if (start) {
      setJob(null);
      setMessage('O início desta preparação aguarda confirmação. Clique em Retomar.');
      return;
    }
    await show(await session(guard).get({ restoreId }), guard);
  }
  async function drive(guard: Guard) {
    const restoreId = currentId.current;
    check(restoreId);
    const s = session(guard),
      started = await s.resume(restoreId);
    guard();
    if (started.kind === 'cancelled') {
      setMessage('Início cancelado.');
      setDone(true);
      return;
    }
    let p = started.kind === 'confirmed' ? started.progress : await s.get({ restoreId });
    guard();
    setJob(p);
    let terminal = effects(p, guard);
    if (await terminal.pending()) {
      await terminal.resume();
      guard();
      p = await s.get(identity(p));
      guard();
      setJob(p);
    }
    if (paused.current) return;
    if (p.state === 'uploading') {
      const original = file.current,
        inspected = selected.current;
      if (!original || !inspected) {
        setMessage('Selecione o mesmo backup para retomar o envio.');
        return;
      }
      check(JSON.stringify(inspected.review.source) === JSON.stringify(p.source));
      const upload = createBookRestoreUploadDriver({
        identity: identity(p),
        source: p.source,
        reviewHash: p.reviewHash,
        file: original,
        check: guard,
      });
      while (!paused.current) {
        const step = await upload.step();
        guard();
        p = step.progress;
        setJob(p);
        setMessage(
          'Enviando backup: ' + Math.floor((p.uploadedBytes * 100) / p.source.byteLength) + '%.',
        );
        if (step.kind === 'paused') break;
      }
    }
    if (paused.current) return;
    if (!['activated', 'cancelling', 'cancelled'].includes(p.state)) {
      const preparation = createBookRestorePreparationDriver({
        identity: identity(p),
        check: guard,
        operationId: () => crypto.randomUUID(),
        api: bookRestorePreparationApi,
        journal: createBookRestorePreparationJournal(
          { ...identity(p), reviewHash: p.reviewHash, keyId: p.keyId },
          guard,
        ),
      });
      setMessage('Preparando texto, histórico e materiais da cópia...');
      while (!paused.current) {
        const step = await preparation.step();
        guard();
        if (step.kind === 'paused') break;
      }
      if (paused.current) return;
      p = await s.get(identity(p));
      guard();
      await show(p, guard);
      if (p.state !== 'activated' && p.state !== 'cancelling') return;
    }
    terminal = effects(p, guard);
    setMessage(
      p.state === 'activated' ? 'Finalizando materiais da cópia...' : 'Concluindo cancelamento...',
    );
    while (!paused.current) {
      const result = await terminal.advance();
      guard();
      if ('job' in result && result.job) {
        p = result.job;
        setJob(p);
      }
      if (result.kind === 'complete' || result.kind === 'cancelled') {
        setDone(true);
        setMessage(result.kind === 'complete' ? 'Cópia privada pronta.' : 'Preparação cancelada.');
        const stored = await hasBookRestoreLocalRecovery(p, guard);
        guard();
        setLocalRecovery(stored);
        return;
      }
      if (result.kind === 'needs-review') {
        await show(result.job, guard);
        return;
      }
    }
  }
  return {
    id,
    job,
    inspection,
    review,
    busy,
    error,
    message,
    localRecovery,
    done,
    load: () => operate('Conferindo preparação...', load),
    inspect: (value: Blob) =>
      operate('Conferindo backup...', async (guard) => {
        file.current = null;
        selected.current = null;
        setInspection(null);
        setReview(null);
        const inspected = await inspectBookRestoreFile(value, { check: guard });
        guard();
        if (job) check(JSON.stringify(inspected.review.source) === JSON.stringify(job.source));
        file.current = value;
        selected.current = inspected;
        setInspection(inspected);
        setMessage(
          job
            ? 'Backup original conferido. Clique em Retomar.'
            : 'Confira os dados antes de preparar a cópia.',
        );
      }),
    start: () =>
      operate('Iniciando preparação...', async (guard) => {
        check(!currentId.current && selected.current);
        const restoreId = crypto.randomUUID();
        currentId.current = restoreId;
        setId(restoreId);
        const s = createBookRestoreStartSession({
          ownerId,
          check: guard,
          operationId: () => restoreId,
        });
        const result = await s.begin(selected.current.review.source, selected.current.reviewHash);
        guard();
        if (result.kind === 'confirmed') {
          setJob(result.progress);
          await drive(guard);
        } else {
          setDone(true);
          setMessage('Início cancelado.');
        }
      }),
    resume: () => operate('Retomando preparação...', drive),
    verify: () =>
      operate('Verificando pedido...', async (guard) => {
        const restoreId = currentId.current;
        check(restoreId);
        const start = await readStoredBookRestoreStart(ownerId, restoreId, guard);
        guard();
        if (start) {
          setMessage(
            'O início aguarda confirmação. Clique em Retomar para repetir o pedido original.',
          );
          return;
        }
        const p = await session(guard).get({ restoreId }),
          terminal = effects(p, guard);
        const outcome = await terminal.reconcile();
        guard();
        if (outcome.kind === 'unconfirmed') {
          setMessage('O pedido continua sem confirmação. A tentativa foi preservada.');
          return;
        }
        await show(await session(guard).get(identity(p)), guard);
      }),
    activate: () =>
      operate('Criando cópia privada...', async (guard) => {
        check(job && review);
        const shown = review;
        setReview(null);
        await effects(job, guard).activate(shown);
        guard();
        await show(await session(guard).get(identity(job)), guard);
      }),
    cancel: () =>
      operate('Cancelando preparação...', async (guard) => {
        const restoreId = currentId.current;
        check(restoreId);
        const s = session(guard),
          outcome = await s.resolveStartForCancellation(restoreId);
        guard();
        if (outcome.kind === 'cancelled') {
          setDone(true);
          setMessage('Início cancelado.');
          return;
        }
        const p = outcome.kind === 'confirmed' ? outcome.progress : await s.get({ restoreId });
        guard();
        await effects(p, guard).cancel();
        guard();
        await drive(guard);
      }),
    discardLocal: () =>
      operate('Removendo recuperação local...', async (guard) => {
        check(job);
        await discardBookRestoreLocalRecovery(job, guard);
        guard();
        setLocalRecovery(false);
        setMessage('Recuperação local removida. O projeto foi preservado.');
      }),
    pause: () => {
      paused.current = true;
      setMessage('Pausando após concluir o pedido em andamento...');
    },
    open: (callback: (id: string, guard: Guard) => Promise<void>) =>
      operate('Conferindo acesso ao livro...', async (guard) => {
        check(job?.state === 'activated');
        await callback(job.bookId, guard);
        guard();
      }),
  };
}
