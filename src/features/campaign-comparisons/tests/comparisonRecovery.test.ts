import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as store from '../services/campaignComparisonRecovery';
import * as api from '../services/campaignComparisonService';
import {
  campaignId,
  comparisonId,
  identity,
  progress,
  startPending,
  stepPending,
  uid,
  deferred,
  installBrowser,
} from './fixtures';
vi.mock('../services/campaignComparisonCallables', () => ({}));
beforeEach(() => installBrowser());
afterEach(() => vi.unstubAllGlobals());
it('preserva apenas controles, migra inicial conhecido antes de limpar e não bloqueia como pedido pendente', async () => {
  await store.reserveComparison(startPending, () => {});
  expect(store.pendingComparisonFor(uid, campaignId, comparisonId)).toEqual(startPending);
  const known = await store.finishComparisonStart(startPending, progress, () => {});
  expect(known?.scope.kind).toBe('known');
  expect(store.readComparisonControl(uid, campaignId)).toBeNull();
  expect(store.listComparisonControls(uid)).toEqual({
    items: [store.knownComparison(progress)],
    unreadable: false,
  });
  expect(JSON.stringify(known)).not.toContain('comparisonToken');
  const next = {
    ...stepPending,
    input: { ...stepPending.input, expectedCheckpoint: progress.checkpoint },
  };
  await store.reserveComparison(next, () => {});
  expect(store.pendingComparisonFor(uid, campaignId, comparisonId)).toEqual(next);
});
it('callback antigo não apaga a intenção de encerrar inicial nem um terceiro pedido', async () => {
  await store.reserveComparison(startPending, () => {});
  const cancel = await store.changeComparisonStart(startPending, () => {});
  await expect(store.finishComparisonStart(startPending, progress, () => {})).rejects.toThrow();
  expect(store.readComparisonControl(uid, campaignId)).toEqual(cancel);
  await store.finishComparisonStart(cancel, null, () => {});
  await store.reserveComparison(
    {
      ...startPending,
      input: { ...startPending.input, operationId: 'third' },
      expected: { ...startPending.expected, comparisonId: 'third' },
    },
    () => {},
  );
  await expect(store.finishComparisonStart(cancel, null, () => {})).rejects.toThrow();
  expect(store.readComparisonControl(uid, campaignId)?.expected.comparisonId).toBe('third');
});
it('erro entre escrever conhecido e limpar inicial conserva ambos descobríveis', async () => {
  await store.reserveComparison(startPending, () => {});
  vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
    throw new Error('Falha de remoção');
  });
  await expect(store.finishComparisonStart(startPending, progress, () => {})).rejects.toThrow(
    'Falha de remoção',
  );
  expect(store.listComparisonControls(uid).items).toHaveLength(2);
  expect(store.pendingComparisonFor(uid, campaignId, comparisonId)?.scope.kind).toBe('start');
  vi.restoreAllMocks();
  await store.finishComparisonStart(startPending, progress, () => {});
  expect(store.listComparisonControls(uid).items).toHaveLength(1);
});
it('reserva entre abas e revisão de sessão dentro do lock impedem envio de outro ator', async () => {
  const browser = installBrowser(),
    gate = deferred<void>();
  browser.hold(gate.promise);
  let active = true;
  const reserving = store.reserveComparison(startPending, () => {
    if (!active) throw new Error('Ator mudou');
  });
  active = false;
  gate.resolve();
  browser.release();
  await expect(reserving).rejects.toThrow('Ator mudou');
  expect(localStorage.length).toBe(0);
  await store.reserveComparison(startPending, () => {});
  await expect(
    store.reserveComparison(
      { ...startPending, input: { ...startPending.input, operationId: 'second' } },
      () => {},
    ),
  ).rejects.toThrow();
  expect(store.readComparisonControl(uid, campaignId)).toEqual(startPending);
});
it('última limpeza incerta é localmente descobrível sem listagem remota e não zera outro job', async () => {
  const cancel = { ...stepPending, method: 'cancel' as const };
  await store.reserveComparison(cancel, () => {});
  expect(store.listComparisonControls(uid, campaignId).items).toEqual([cancel]);
  await store.finishComparisonStep(
    cancel,
    { ...progress, state: 'deleted', phase: 'cleanup', cleanupComplete: true, checkpoint: 4 },
    () => {},
  );
  expect(store.listComparisonControls(uid).items).toEqual([]);
});
it('controle danificado em outra entrada não esconde controles íntegros e nunca é removido', async () => {
  await store.reserveComparison(startPending, () => {});
  localStorage.setItem(
    'writer:campaign-comparison:' + JSON.stringify([uid, 'another', 'start']),
    '{',
  );
  const listed = store.listComparisonControls(uid);
  expect(listed.unreadable).toBe(true);
  expect(listed.items).toEqual([startPending]);
  expect(localStorage.length).toBe(2);
});
it('sem WebLocks falha antes da escrita, enquanto a leitura permanece disponível', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  expect(store.comparisonStorageAvailable()).toBe(false);
  await expect(store.reserveComparison(startPending, () => {})).rejects.toThrow(/leitura continua/);
  expect(store.listComparisonControls(uid).items).toEqual([]);
});
it('recibo exato pode confirmar checkpoint antigo com progresso atual posterior, sem trocar identidade', () => {
  const result = {
    receipt: {
      operationId: stepPending.input.operationId,
      action: 'advance' as const,
      expectedCheckpoint: 1,
      confirmedCheckpoint: 2,
    },
    progress,
  };
  api.validateMutation(result, stepPending);
  expect(() =>
    api.validateMutation(
      { ...result, receipt: { ...result.receipt, operationId: 'other' } },
      stepPending,
    ),
  ).toThrow();
  expect(() =>
    api.validateMutation(
      { ...result, progress: { ...progress, candidateBaseId: 'f'.repeat(64) } },
      stepPending,
    ),
  ).toThrow();
  expect(() => api.validateProgress({ ...progress, ownerId: 'another' }, uid, identity)).toThrow();
});
it('fence exige eco completo do pedido e não aceita a identidade de outra conta', () => {
  const canceled = {
    kind: 'canceled' as const,
    schemaVersion: 1 as const,
    ownerId: uid,
    request: startPending.input,
  };
  api.validateCanceled(canceled, startPending);
  expect(() =>
    api.validateCanceled(
      { ...canceled, request: { ...canceled.request, expectedSourceToken: 'f'.repeat(64) } },
      startPending,
    ),
  ).toThrow();
  expect(() => api.validateCanceled({ ...canceled, ownerId: 'another' }, startPending)).toThrow();
});
it('uma aba antiga não substitui a descoberta de checkpoint maior ao reservar um passo', async () => {
  const current = { ...progress, checkpoint: 2 };
  await store.rememberComparison(current, () => {});
  await expect(store.reserveComparison(stepPending, () => {})).rejects.toThrow(
    /progresso|checkpoint/i,
  );
  expect(store.readComparisonControl(uid, campaignId, comparisonId)).toEqual(
    store.knownComparison(current),
  );
});
