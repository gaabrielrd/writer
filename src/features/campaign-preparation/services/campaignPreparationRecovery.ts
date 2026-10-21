import type { PendingCampaignPreparation } from '../model/campaignPreparation';
import { canonical, validatePending } from './campaignPreparationService';
export const campaignPreparationJournalKey = (uid: string, cid: string) =>
  'writer:campaign-preparation:' + JSON.stringify([uid, cid]);
const pulse = 'writer:campaign-preparation:change';
export const preparationLocksAvailable = () =>
  typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
export function readPendingCampaignPreparation(
  uid: string,
  cid: string,
): PendingCampaignPreparation | null {
  const raw = localStorage.getItem(campaignPreparationJournalKey(uid, cid));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as PendingCampaignPreparation;
    validatePending(value, uid, cid);
    return value;
  } catch {
    throw new Error(
      'O controle de preparação não pôde ser lido. Ele foi preservado e não será substituído.',
    );
  }
}
export function exactCampaignPreparation(
  expected: PendingCampaignPreparation,
  check: () => void,
): void {
  check();
  if (
    canonical(readPendingCampaignPreparation(expected.ownerId, expected.request.campaignId)) !==
    canonical(expected)
  )
    throw new Error('O pedido mudou em outra aba e foi preservado.');
}
async function lock<T>(
  value: PendingCampaignPreparation,
  check: () => void,
  work: () => T,
): Promise<T> {
  if (!preparationLocksAvailable())
    throw new Error(
      'Este navegador não permite reservar o pedido com segurança. A consulta continua disponível.',
    );
  return navigator.locks.request(
    campaignPreparationJournalKey(value.ownerId, value.request.campaignId),
    () => {
      check();
      return work();
    },
  );
}
function notify() {
  window.dispatchEvent(new Event(pulse));
}
export function reserveCampaignPreparation(
  value: PendingCampaignPreparation,
  check: () => void,
): Promise<void> {
  validatePending(value, value.ownerId, value.request.campaignId);
  return lock(value, check, () => {
    const prior = readPendingCampaignPreparation(value.ownerId, value.request.campaignId);
    if (prior && canonical(prior) !== canonical(value))
      throw new Error('Confirme o pedido preservado antes de outra alteração.');
    localStorage.setItem(
      campaignPreparationJournalKey(value.ownerId, value.request.campaignId),
      canonical(value),
    );
    exactCampaignPreparation(value, check);
    notify();
  });
}
export function cancelCampaignPreparation(
  expected: PendingCampaignPreparation,
  check: () => void,
): Promise<PendingCampaignPreparation> {
  return lock(expected, check, () => {
    exactCampaignPreparation(expected, check);
    const next = { ...expected, intent: 'cancel' as const };
    localStorage.setItem(
      campaignPreparationJournalKey(expected.ownerId, expected.request.campaignId),
      canonical(next),
    );
    exactCampaignPreparation(next, check);
    notify();
    return next;
  });
}
export function forgetCampaignPreparationRecovery(
  expected: PendingCampaignPreparation,
  check: () => void,
): Promise<void> {
  return lock(expected, check, () => {
    exactCampaignPreparation(expected, check);
    localStorage.removeItem(
      campaignPreparationJournalKey(expected.ownerId, expected.request.campaignId),
    );
    notify();
  });
}
export function subscribeCampaignPreparation(
  uid: string,
  cid: string,
  listener: () => void,
): () => void {
  const storage = (e: StorageEvent) => {
    if (e.key === null || e.key === campaignPreparationJournalKey(uid, cid)) listener();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(pulse, listener);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(pulse, listener);
  };
}
