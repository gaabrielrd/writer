import type { PendingSessionReference } from '../model/sessionReference';
import { canonical, validatePending } from './sessionReferenceService';
const prefix = 'writer:session-references:',
  pulse = 'writer:session-references:change';
const key = (uid: string, cid: string) => prefix + JSON.stringify([uid, cid]);
export const referenceLocksAvailable = () =>
  typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function';
export function readPendingSessionReference(
  uid: string,
  cid: string,
): PendingSessionReference | null {
  const raw = localStorage.getItem(key(uid, cid));
  if (raw === null) return null;
  try {
    const value = JSON.parse(raw) as PendingSessionReference;
    validatePending(value, uid, cid);
    return value;
  } catch {
    throw new Error(
      'O controle de vínculo não pôde ser lido. Ele foi preservado e não será substituído.',
    );
  }
}
async function lock<T>(
  value: PendingSessionReference,
  check: () => void,
  work: () => T,
): Promise<T> {
  if (!referenceLocksAvailable())
    throw new Error(
      'Este navegador não permite preservar o pedido com reserva segura. A consulta continua disponível.',
    );
  return navigator.locks.request(key(value.ownerId, value.request.campaignId), () => {
    check();
    return work();
  });
}
export function exactSessionReference(value: PendingSessionReference, check: () => void) {
  check();
  if (
    canonical(readPendingSessionReference(value.ownerId, value.request.campaignId)) !==
    canonical(value)
  )
    throw new Error('O pedido mudou em outra aba e foi preservado.');
}
export function reserveSessionReference(
  value: PendingSessionReference,
  check: () => void,
): Promise<void> {
  validatePending(value, value.ownerId, value.request.campaignId);
  return lock(value, check, () => {
    const prior = readPendingSessionReference(value.ownerId, value.request.campaignId);
    if (prior && canonical(prior) !== canonical(value))
      throw new Error('Confirme o pedido preservado antes de outro vínculo.');
    localStorage.setItem(key(value.ownerId, value.request.campaignId), canonical(value));
    window.dispatchEvent(new Event(pulse));
  });
}
export function cancelSessionReference(
  expected: PendingSessionReference,
  check: () => void,
): Promise<PendingSessionReference> {
  return lock(expected, check, () => {
    exactSessionReference(expected, check);
    const next = { ...expected, intent: 'cancel' as const };
    localStorage.setItem(key(expected.ownerId, expected.request.campaignId), canonical(next));
    window.dispatchEvent(new Event(pulse));
    return next;
  });
}
export function forgetSessionReferenceRecovery(
  expected: PendingSessionReference,
  check: () => void,
): Promise<void> {
  return lock(expected, check, () => {
    exactSessionReference(expected, check);
    localStorage.removeItem(key(expected.ownerId, expected.request.campaignId));
    window.dispatchEvent(new Event(pulse));
  });
}
export function subscribeSessionReferences(
  uid: string,
  cid: string,
  listener: () => void,
): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key === key(uid, cid)) listener();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(pulse, listener);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(pulse, listener);
  };
}
