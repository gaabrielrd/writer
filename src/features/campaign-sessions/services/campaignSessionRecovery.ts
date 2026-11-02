import type { PendingCampaignSession } from '../model/campaignSession';
import { canonical, validatePending } from './campaignSessionService';
const prefix = 'writer:campaign-sessions:',
  pulse = 'writer:campaign-sessions:change';
const key = (uid: string, cid: string) => prefix + JSON.stringify([uid, cid]);
export const sessionLocksAvailable = () =>
  typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
export function readPendingCampaignSession(
  uid: string,
  cid: string,
): PendingCampaignSession | null {
  const raw = localStorage.getItem(key(uid, cid));
  if (raw === null) return null;
  let value: PendingCampaignSession;
  try {
    value = JSON.parse(raw) as PendingCampaignSession;
    validatePending(value, uid, cid);
  } catch {
    throw new Error('O pedido de sessão preservado não pôde ser lido. Ele não será substituído.');
  }
  return value;
}
async function lock<T>(uid: string, cid: string, check: () => void, work: () => T): Promise<T> {
  if (!sessionLocksAvailable())
    throw new Error(
      'Este navegador não permite reservar alterações com segurança. Seus campos foram mantidos; a leitura continua disponível.',
    );
  return navigator.locks.request(key(uid, cid), () => {
    check();
    return work();
  });
}
export function exactPendingCampaignSession(
  expected: PendingCampaignSession,
  check: () => void,
): void {
  check();
  if (
    canonical(readPendingCampaignSession(expected.ownerId, expected.input.campaignId)) !==
    canonical(expected)
  )
    throw new Error('O pedido mudou em outra aba e foi preservado.');
}
export function reserveCampaignSession(
  value: PendingCampaignSession,
  check: () => void,
): Promise<void> {
  validatePending(value, value.ownerId, value.input.campaignId);
  return lock(value.ownerId, value.input.campaignId, check, () => {
    const prior = readPendingCampaignSession(value.ownerId, value.input.campaignId);
    if (prior && canonical(prior) !== canonical(value))
      throw new Error('Há outro pedido preservado. Confirme-o antes de enviar uma alteração.');
    localStorage.setItem(key(value.ownerId, value.input.campaignId), canonical(value));
    window.dispatchEvent(new Event(pulse));
  });
}
export function forgetCampaignSessionRecovery(
  expected: PendingCampaignSession,
  check: () => void,
): Promise<void> {
  return lock(expected.ownerId, expected.input.campaignId, check, () => {
    exactPendingCampaignSession(expected, check);
    localStorage.removeItem(key(expected.ownerId, expected.input.campaignId));
    window.dispatchEvent(new Event(pulse));
  });
}
export function subscribeSessionRecovery(
  uid: string,
  cid: string,
  listener: () => void,
): () => void {
  const storage = (e: StorageEvent) => {
    if (e.key === null || e.key === key(uid, cid)) listener();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(pulse, listener);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(pulse, listener);
  };
}
