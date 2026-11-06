import { useEffect, useRef, useState } from 'react';
import type {
  ImpactFrame,
  ImpactScope,
  ImpactIntent,
  ImpactResolve,
  ImpactCancellation,
} from '../model/impact';
import * as api from '../services/literaryImpactService';
import * as storage from '../services/literaryImpactStorage';
import type { ImpactJournal } from '../services/literaryImpactStorage';
const canceled = () => new Error('A sessão do mapa mudou.');
export function useLiteraryImpact(actorId: string, bookId: string) {
  const [initial] = useState(() => {
    try {
      return { journal: storage.readImpactJournal(actorId, bookId), error: '' };
    } catch (cause) {
      return {
        journal: null,
        error: cause instanceof Error ? cause.message : 'Não foi possível ler o acompanhamento.',
      };
    }
  });
  const [journal, setJournal] = useState(initial.journal);
  const [frame, setFrame] = useState<ImpactFrame | null>(null);
  const [busy, setBusy] = useState(false),
    [closing, setClosing] = useState(false);
  const [error, setError] = useState(initial.error),
    [message, setMessage] = useState('');
  const active = useRef(false),
    epoch = useRef(0),
    running = useRef(false),
    closingRef = useRef(false);
  const pointer = useRef(journal),
    resolution = useRef<ImpactResolve | null>(null),
    pause = useRef(false);
  useEffect(() => {
    active.current = true;
    return () => {
      active.current = false;
      epoch.current++;
      resolution.current = null;
    };
  }, []);
  const valid = (own: number) => active.current && epoch.current === own;
  function check(own: number, expected?: ImpactJournal) {
    if (!valid(own)) throw canceled();
    if (
      expected &&
      JSON.stringify(storage.readImpactJournal(actorId, bookId)) !== JSON.stringify(expected)
    )
      throw new Error('O acompanhamento mudou. Consulte antes de continuar.');
  }
  function publish(value: ImpactJournal | null, own: number) {
    check(own);
    pointer.current = value;
    setJournal(value);
  }
  function tracked() {
    const value = pointer.current;
    if (!value) throw new Error('Selecione um mapa para acompanhar.');
    return value;
  }
  async function run(action: (own: number) => Promise<void>) {
    if (running.current || closingRef.current) return;
    running.current = true;
    const own = epoch.current;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await action(own);
    } catch (cause) {
      if (valid(own))
        setError(
          cause instanceof Error
            ? cause.message
            : 'O pedido não foi confirmado. Consulte seu resultado.',
        );
    } finally {
      running.current = false;
      if (active.current) setBusy(false);
    }
  }
  async function fresh(value: ImpactJournal, own: number) {
    check(own, value);
    const result = await api.getLiteraryImpact(bookId, value.jobId, value.originToken ?? undefined);
    check(own, value);
    if (
      result.jobId !== value.jobId ||
      result.bookToken !== value.bookToken ||
      (value.originToken && result.originToken !== value.originToken)
    )
      throw new Error('A origem observada do mapa mudou.');
    return result;
  }
  async function acknowledge(value: ImpactJournal, own: number, receiptOrigin?: string | null) {
    const result = await fresh(value, own);
    if (receiptOrigin && result.originToken !== receiptOrigin)
      throw new Error('O recibo pertence a outra origem do mapa.');
    const saved = value.pending?.closeRequested
      ? await storage.confirmImpactOperationClose(value, value.originToken!, () => valid(own))
      : await storage.acknowledgeImpactOperation(value, result, () => valid(own));
    publish(saved, own);
    setFrame(result);
    resolution.current = null;
  }
  async function dispatch(value: ImpactJournal, own: number) {
    check(own, value);
    if (value.cancelRequested || !value.pending || value.pending.closeRequested)
      throw new Error('Consulte ou encerre o pedido acompanhado.');
    const pending = value.pending;
    if (pending.kind === 'start') {
      if (!value.start) throw new Error('A intenção original está indisponível.');
      const result = await api.startLiteraryImpact(value.start);
      check(own, value);
      await acknowledge(value, own, result.originToken);
    } else if (pending.kind === 'advance') {
      const result = await api.advanceLiteraryImpact(pending.wire);
      check(own, value);
      if ('operationCanceled' in result)
        throw new Error('O pedido foi encerrado. Consulte o resultado original.');
      await acknowledge(value, own, result.originToken);
    } else {
      const input = resolution.current;
      if (
        !input ||
        input.operationId !== pending.wire.operationId ||
        input.requestHash !== pending.wire.requestHash
      )
        throw new Error(
          'O texto desta resolução não está nesta sessão. Consulte ou encerre o pedido original antes de escrever outro.',
        );
      const result = await api.resolveLiteraryImpact(input);
      check(own, value);
      if ('operationCanceled' in result)
        throw new Error('O pedido foi encerrado. Consulte o resultado original.');
      if (result.jobId !== value.jobId) throw new Error('A resolução retornou outro mapa.');
      await acknowledge(value, own, pending.wire.expectedOriginToken);
      setMessage(
        'Resolução salva. Consulte os vínculos para observar sua nova revisão; o rascunho permanece nesta sessão.',
      );
    }
  }
  const start = (intent: ImpactIntent, scope: ImpactScope) =>
    run(async (own) => {
      if (pointer.current) throw new Error('Já existe um mapa acompanhado.');
      const input = {
        ...structuredClone(intent),
        target: { kind: 'book' as const, id: bookId },
        jobId: crypto.randomUUID(),
        expectedBookToken: scope.bookToken,
        expectedScopeToken: scope.scopeToken,
      };
      const requestHash = await api.impactRequestHash(input);
      check(own);
      const saved = await storage.reserveImpactJournal(actorId, { ...input, requestHash });
      publish(saved, own);
      await dispatch(saved, own);
    });
  const refresh = () =>
    run(async (own) => {
      const local = storage.readImpactJournal(actorId, bookId);
      check(own);
      publish(local, own);
      if (local) setFrame(await fresh(local, own));
      else setFrame(null);
    });
  async function outcome(value: ImpactJournal, own: number) {
    const pending = value.pending;
    if (!pending) {
      setFrame(await fresh(value, own));
      return;
    }
    const identity = storage.impactPendingIdentity(pending);
    const result = await api.getLiteraryImpactOperation(
      bookId,
      value.jobId,
      identity.operationId,
      identity.requestHash,
      value.bookToken,
    );
    check(own, value);
    if (result.status === 'unknown') {
      setMessage('O servidor ainda não confirmou este pedido. A consulta não o reenviou.');
      return;
    }
    if (
      result.method !== identity.method ||
      (value.originToken && result.originToken !== value.originToken)
    )
      throw new Error('O resultado não corresponde ao pedido original.');
    if (result.status === 'registering') {
      setFrame(await fresh(value, own));
      setMessage(
        'O início está registrado. Confirme explicitamente sua continuação ou cancele o mapa.',
      );
      return;
    }
    if (!result.originToken) throw new Error('A origem do resultado ainda não foi confirmada.');
    await acknowledge(value, own, result.originToken);
    setMessage(
      result.status === 'canceled'
        ? 'Pedido encerrado. Nenhum novo passo foi enviado.'
        : 'Resultado original confirmado; estado atual consultado.',
    );
  }
  const consult = () =>
    run(async (own) => {
      const local = storage.readImpactJournal(actorId, bookId);
      check(own);
      publish(local, own);
      if (!local) {
        setFrame(null);
        return;
      }
      if (local.cancelRequested) {
        if (!local.cancel) throw new Error('O pedido original de cancelamento está indisponível.');
        const result = await api.getLiteraryImpactOperation(
          bookId,
          local.jobId,
          local.cancel.operationId,
          local.cancel.requestHash,
          local.bookToken,
        );
        check(own, local);
        if (
          result.status === 'done' &&
          result.method === 'cancelLiteraryImpact' &&
          result.result &&
          'phase' in result.result &&
          result.result.phase === 'canceled'
        ) {
          await storage.confirmImpactCancellation(local, result.result, () => valid(own));
          publish(null, own);
          setFrame(null);
          setMessage('Cancelamento original confirmado.');
        } else
          setMessage(
            'O cancelamento ainda não foi confirmado. Reenvie somente o mesmo pedido de encerramento.',
          );
      } else await outcome(local, own);
    });
  const advance = (count = 1) =>
    run(async (own) => {
      if (!Number.isSafeInteger(count) || count < 1 || count > 20)
        throw new Error('Escolha entre um e vinte passos por envio explícito.');
      pause.current = false;
      for (let index = 0; index < count && !pause.current; index++) {
        const value = tracked();
        if (value.pending || value.cancelRequested)
          throw new Error('Reconcilie o pedido anterior antes de avançar.');
        const current = await fresh(value, own);
        if (!current.current || ['done', 'partial', 'stale', 'canceled'].includes(current.phase)) {
          setFrame(current);
          break;
        }
        const input = {
          target: { kind: 'book' as const, id: bookId },
          jobId: value.jobId,
          operationId: crypto.randomUUID(),
          expectedOriginToken: current.originToken,
          expectedRevision: current.revision,
        };
        const requestHash = await api.impactRequestHash(input);
        check(own, value);
        if (pause.current) break;
        const saved = await storage.stageImpactOperation(value, {
          kind: 'advance',
          closeRequested: false,
          wire: { ...input, requestHash },
        });
        publish(saved, own);
        await dispatch(saved, own);
      }
    });
  const resolve = (
    input: Omit<
      ImpactResolve,
      | 'target'
      | 'jobId'
      | 'operationId'
      | 'expectedOriginToken'
      | 'expectedRevision'
      | 'requestHash'
    >,
  ) =>
    run(async (own) => {
      const value = tracked();
      if (value.pending || value.cancelRequested)
        throw new Error('Reconcilie o pedido anterior antes de salvar uma resolução.');
      const current = await fresh(value, own);
      const draft = {
        ...structuredClone(input),
        target: { kind: 'book' as const, id: bookId },
        jobId: value.jobId,
        operationId: crypto.randomUUID(),
        expectedOriginToken: current.originToken,
        expectedRevision: current.revision,
      };
      const requestHash = await api.impactRequestHash(draft);
      check(own, value);
      const wire: ImpactResolve = { ...draft, requestHash };
      const saved = await storage.stageImpactOperation(
        value,
        storage.impactResolutionPending(wire),
      );
      publish(saved, own);
      resolution.current = wire;
      await dispatch(saved, own);
    });
  const retry = () =>
    run(async (own) => {
      await dispatch(tracked(), own);
    });
  const closeOperation = () =>
    run(async (own) => {
      let value = tracked();
      if (
        !value.pending ||
        value.pending.kind === 'start' ||
        value.cancelRequested ||
        !value.originToken
      )
        throw new Error('Encerre o mapa para cancelar um início incerto.');
      if (!value.pending.closeRequested) {
        value = await storage.requestImpactOperationClose(value);
        publish(value, own);
      }
      const pending = value.pending!;
      const identity = storage.impactPendingIdentity(pending);
      if (identity.method === 'startLiteraryImpact')
        throw new Error('O início deve ser encerrado pelo mapa.');
      check(own, value);
      const result = await api.cancelLiteraryImpactOperation(
        bookId,
        value.jobId,
        identity.operationId,
        identity.method,
        identity.requestHash,
        value.originToken!,
      );
      check(own, value);
      if (
        !['done', 'canceled'].includes(result.status) ||
        result.method !== identity.method ||
        result.originToken !== value.originToken
      )
        throw new Error('O pedido original ainda não foi encerrado.');
      const current = await fresh(value, own);
      const saved = await storage.confirmImpactOperationClose(value, value.originToken!, () =>
        valid(own),
      );
      publish(saved, own);
      setFrame(current);
      resolution.current = null;
      setMessage(
        result.status === 'done'
          ? 'O pedido já havia sido aplicado; o resultado original foi preservado.'
          : 'Pedido encerrado antes da aplicação.',
      );
    });
  /** Independent of an in-flight producer. Epoch and local CAS prevent its ACK from clearing this intent. */
  async function cancel() {
    if (closingRef.current) return;
    closingRef.current = true;
    const own = ++epoch.current;
    setClosing(true);
    setError('');
    try {
      let value = tracked();
      if (!value.cancelRequested) {
        const input = {
          target: { kind: 'book' as const, id: bookId },
          jobId: value.jobId,
          operationId: crypto.randomUUID(),
          ...(value.originToken ? { expectedOriginToken: value.originToken } : {}),
          ...(value.start ? { start: value.start } : {}),
        };
        const requestHash = await api.impactRequestHash(input);
        check(own, value);
        value = await storage.requestImpactCancellation(value, { ...input, requestHash });
        publish(value, own);
      }
      check(own, value);
      const proof: ImpactCancellation = await api.cancelLiteraryImpact(value.cancel!);
      check(own, value);
      await storage.confirmImpactCancellation(value, proof, () => valid(own));
      publish(null, own);
      setFrame(null);
      resolution.current = null;
      setMessage('Mapa cancelado. Índices canônicos já preparados permanecem no livro.');
    } catch (cause) {
      if (valid(own))
        setError(cause instanceof Error ? cause.message : 'Confirme o cancelamento original.');
    } finally {
      closingRef.current = false;
      if (active.current) setClosing(false);
    }
  }
  const adopt = (candidate: ImpactFrame) =>
    run(async (own) => {
      if (pointer.current)
        throw new Error('Encerre o acompanhamento atual antes de selecionar outro.');
      const current = await api.getLiteraryImpact(bookId, candidate.jobId, candidate.originToken);
      check(own);
      if (current.bookToken !== candidate.bookToken) throw new Error('O livro original mudou.');
      const saved = await storage.adoptImpactJournal(actorId, bookId, current);
      publish(saved, own);
      setFrame(current);
    });
  const release = () =>
    run(async (own) => {
      const value = tracked(),
        current = await fresh(value, own);
      await storage.releaseImpactJournal(value, current, () => valid(own));
      publish(null, own);
      setFrame(null);
    });
  return {
    journal,
    frame,
    busy,
    closing,
    error,
    message,
    start,
    refresh,
    consult,
    advance,
    resolve,
    retry,
    closeOperation,
    cancel,
    adopt,
    release,
    pause: () => {
      pause.current = true;
    },
  };
}
