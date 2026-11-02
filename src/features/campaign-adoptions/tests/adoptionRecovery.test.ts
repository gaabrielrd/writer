import { beforeEach, afterEach, it, expect, vi } from 'vitest';
import * as store from '../services/campaignAdoptionRecovery';
import * as api from '../services/campaignAdoptionService';
import {
  uid,
  campaignId,
  adoptionId,
  identity,
  progress,
  start,
  step,
  row,
  installBrowser,
  deferred,
} from './fixtures';
vi.mock('../services/campaignAdoptionCallables', () => ({}));
beforeEach(() => installBrowser());
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});
it('migra inicial para conhecido antes de limpar e conhecido não autoriza outro pedido sozinho', async () => {
  await store.reserveAdoption(start, () => {});
  await store.finishAdoptionStart(start, progress, () => {});
  expect(store.readAdoptionControl(uid, campaignId)).toBeNull();
  expect(store.readAdoptionControl(uid, campaignId, adoptionId)).toEqual(
    store.knownAdoption(progress),
  );
  expect(JSON.stringify(store.listAdoptionControls(uid))).not.toContain('Guardiã');
  await store.reserveAdoption(step, () => {});
  expect(store.pendingAdoptionFor(uid, campaignId, adoptionId)).toEqual(step);
});
it('conhecido mais recente impede reserva obsoleta e preserva checkpoint', async () => {
  await store.rememberAdoption({ ...progress, checkpoint: 2 }, () => {});
  await expect(store.reserveAdoption(step, () => {})).rejects.toThrow(/avançou/);
  expect(store.readAdoptionControl(uid, campaignId, adoptionId)).toEqual(
    store.knownAdoption({ ...progress, checkpoint: 2 }),
  );
});
it('cancel-start é CAS integral e resposta antiga não limpa intenção nova', async () => {
  await store.reserveAdoption(start, () => {});
  const cancel = await store.changeAdoptionStart(start, () => {});
  await expect(store.finishAdoptionStart(start, progress, () => {})).rejects.toThrow();
  expect(store.readAdoptionControl(uid, campaignId)).toEqual(cancel);
  await store.finishAdoptionStart(cancel, null, () => {});
  expect(store.listAdoptionControls(uid).items).toEqual([]);
});
it('controle inválido é preservado e bloqueia substituto', async () => {
  const key = 'writer:campaign-adoption:' + JSON.stringify([uid, campaignId, 'start']);
  localStorage.setItem(key, '{');
  await expect(store.reserveAdoption(start, () => {})).rejects.toThrow(/inválido/);
  expect(localStorage.getItem(key)).toBe('{');
});
it('troca de UID aguardando WebLock não preserva nem autoriza pedido antigo', async () => {
  const browser = installBrowser(),
    gate = deferred<void>();
  browser.hold(gate.promise);
  let active = true;
  const run = store.reserveAdoption(start, () => {
    if (!active) throw new Error('Ator mudou');
  });
  active = false;
  gate.resolve();
  browser.release();
  await expect(run).rejects.toThrow('Ator mudou');
  expect(localStorage.length).toBe(0);
});
it('última limpeza continua descobrível até recibo e não remove outro pedido', async () => {
  const cancel = { ...step, method: 'cancel' as const };
  await store.reserveAdoption(cancel, () => {});
  expect(store.listAdoptionControls(uid).items).toEqual([cancel]);
  await store.finishAdoptionStep(
    cancel,
    { ...progress, state: 'deleted', phase: 'cleanup', cleanupComplete: true, checkpoint: 1 },
    () => {},
  );
  expect(store.listAdoptionControls(uid).items).toEqual([]);
  await store.reserveAdoption(
    { ...step, input: { ...step.input, operationId: 'third' } },
    () => {},
  );
  await expect(store.finishAdoptionStep(cancel, progress, () => {})).rejects.toThrow();
  expect(store.readAdoptionControl(uid, campaignId, adoptionId)).not.toBeNull();
});
it('escolha ausente não aceita candidata e recibo confirma escolha exata', () => {
  expect(() => api.validateDecision({ ...row, choice: 'use-candidate' })).toThrow();
  api.validateDecision({ ...row, choice: 'keep-local' });
  const op = {
    ...step,
    method: 'decide' as const,
    input: {
      ...step.input,
      sourceKey: row.sourceKey,
      expectedRevision: row.revision,
      choice: 'keep-local' as const,
    },
  };
  const receipt = {
    operationId: op.input.operationId,
    action: 'decide' as const,
    expectedCheckpoint: 0,
    confirmedCheckpoint: 1,
    outcome: 'confirmed' as const,
    sourceKey: row.sourceKey,
    expectedRevision: row.revision,
    choice: 'keep-local' as const,
  };
  api.validateMutation({ receipt, progress: { ...progress, checkpoint: 1 } }, op);
  expect(() =>
    api.validateMutation(
      {
        receipt: { ...receipt, choice: 'discard-local' },
        progress: { ...progress, checkpoint: 1 },
      },
      op,
    ),
  ).toThrow();
  expect(() => api.validateProgress({ ...progress, ownerId: 'another' }, uid, identity)).toThrow();
});
it('sem WebLocks preserva leitura e falha antes de reservar', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  expect(store.listAdoptionControls(uid).items).toEqual([]);
  await expect(store.reserveAdoption(start, () => {})).rejects.toThrow(/leitura continua/);
});
it('GET deleted antigo não remove conhecido mais recente sob a reserva', async () => {
  const newer = { ...progress, checkpoint: 4 };
  await store.rememberAdoption(newer, () => {});
  const actual = await store.rememberAdoption(
    { ...progress, checkpoint: 2, state: 'deleted', phase: 'cleanup', cleanupComplete: true },
    () => {},
  );
  expect(actual).toEqual(store.knownAdoption(newer));
  expect(store.readAdoptionControl(uid, campaignId, adoptionId)).toEqual(
    store.knownAdoption(newer),
  );
});
it('progresso oculta contagem de ficha indisponível sem perder controle próprio', () => {
  expect(() =>
    api.validateProgress({ ...progress, sourceAvailable: true, processed: null }, uid, identity),
  ).not.toThrow();
  expect(() =>
    api.validateProgress({ ...progress, sourceAvailable: false, processed: 1 }, uid, identity),
  ).toThrow();
});
