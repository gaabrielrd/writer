import { beforeEach, expect, it, vi } from 'vitest';
import * as store from '../services/campaignPreparationRecovery';
import { uid, campaignId, pending, installLocks } from './preparationTestHelpers';
import { canonical } from '../services/campaignPreparationService';
beforeEach(() => {
  localStorage.clear();
  installLocks();
});
it('reserva, compara todos os campos e conserva outra campanha', async () => {
  const a = pending(),
    b = structuredClone(a);
  if (b.action === 'save-item' && b.request.kind === 'clue') b.request.body.text = 'Pedido B';
  const check = vi.fn();
  await store.reserveCampaignPreparation(a, check);
  expect(store.readPendingCampaignPreparation(uid, campaignId)).toEqual(a);
  await expect(store.reserveCampaignPreparation(b, check)).rejects.toThrow();
  localStorage.setItem(store.campaignPreparationJournalKey(uid, campaignId), canonical(b));
  await expect(store.forgetCampaignPreparationRecovery(a, check)).rejects.toThrow();
  expect(store.readPendingCampaignPreparation(uid, campaignId)).toEqual(b);
  const other = { ...a, request: { ...a.request, campaignId: 'other' } };
  localStorage.setItem(store.campaignPreparationJournalKey(uid, 'other'), canonical(other));
  await store.forgetCampaignPreparationRecovery(b, check);
  expect(store.readPendingCampaignPreparation(uid, campaignId)).toBeNull();
  expect(store.readPendingCampaignPreparation(uid, 'other')).toEqual(other);
});
it('persiste intento de cancelamento e impede limpar snapshot anterior', async () => {
  const a = pending();
  await store.reserveCampaignPreparation(a, () => {});
  const canceled = await store.cancelCampaignPreparation(a, () => {});
  expect(canceled.intent).toBe('cancel');
  expect(store.readPendingCampaignPreparation(uid, campaignId)).toEqual(canceled);
  await expect(store.forgetCampaignPreparationRecovery(a, () => {})).rejects.toThrow();
  await store.forgetCampaignPreparationRecovery(canceled, () => {});
});
it('formato futuro ou inválido é preservado e bloqueia reserva', async () => {
  const key = store.campaignPreparationJournalKey(uid, campaignId);
  for (const raw of ['{broken', JSON.stringify({ ...pending(), schemaVersion: 2 })]) {
    localStorage.setItem(key, raw);
    expect(() => store.readPendingCampaignPreparation(uid, campaignId)).toThrow();
    await expect(store.reserveCampaignPreparation(pending(), () => {})).rejects.toThrow();
    expect(localStorage.getItem(key)).toBe(raw);
  }
});
it('falha fechada sem locks ou storage e confere autorização dentro do lock', async () => {
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  await expect(store.reserveCampaignPreparation(pending(), () => {})).rejects.toThrow(/reserva/);
  installLocks();
  const spy = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('quota');
  });
  await expect(store.reserveCampaignPreparation(pending(), () => {})).rejects.toThrow();
  spy.mockRestore();
  await expect(
    store.reserveCampaignPreparation(pending(), () => {
      throw new Error('actor changed');
    }),
  ).rejects.toThrow('actor changed');
  expect(store.readPendingCampaignPreparation(uid, campaignId)).toBeNull();
});
it('concorrência reserva somente um pedido e eventos não alteram outro escopo', async () => {
  const a = pending(),
    b = structuredClone(a);
  b.request.operationId = 'operation-000000002';
  const results = await Promise.allSettled([
    store.reserveCampaignPreparation(a, () => {}),
    store.reserveCampaignPreparation(b, () => {}),
  ]);
  expect(results.map((r) => r.status)).toEqual(['fulfilled', 'rejected']);
  const listener = vi.fn(),
    off = store.subscribeCampaignPreparation(uid, campaignId, listener);
  window.dispatchEvent(new StorageEvent('storage', { key: 'other' }));
  expect(listener).not.toHaveBeenCalled();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
  expect(listener).toHaveBeenCalledTimes(1);
  off();
  window.dispatchEvent(new StorageEvent('storage', { key: null }));
  expect(listener).toHaveBeenCalledTimes(1);
});
