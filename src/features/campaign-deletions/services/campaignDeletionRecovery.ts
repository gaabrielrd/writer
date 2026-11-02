import type { DeletionControl, DeletionPending, DeletionProgress } from '../model/campaignDeletion';
import { campaignOf, canonical, identityOf, validateControl } from './campaignDeletionService';
const prefix = 'writer:campaign-deletion:',
  pulse = 'writer:campaign-deletion-change';
const key = (uid: string, cid: string) => prefix + JSON.stringify([uid, cid]);
export function recoveryAvailable(): boolean {
  try {
    return !!navigator.locks?.request && !!window.localStorage;
  } catch {
    return false;
  }
}
export function readDeletion(uid: string, cid: string): DeletionControl | null {
  const raw = localStorage.getItem(key(uid, cid));
  if (raw === null) return null;
  let value: DeletionControl;
  try {
    value = JSON.parse(raw) as DeletionControl;
  } catch {
    throw new Error('O controle local inválido foi preservado. Nenhum pedido novo será enviado.');
  }
  validateControl(value, uid, cid);
  return value;
}
export function listDeletions(uid: string): { items: DeletionControl[]; unreadable: boolean } {
  const items: DeletionControl[] = [];
  let unreadable = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (!k?.startsWith(prefix)) continue;
      let parts: unknown;
      try {
        parts = JSON.parse(k.slice(prefix.length));
      } catch {
        continue;
      }
      if (!Array.isArray(parts) || parts[0] !== uid) continue;
      try {
        if (parts.length !== 2 || typeof parts[1] !== 'string') throw new Error();
        const entry = readDeletion(uid, parts[1]);
        if (entry) items.push(entry);
      } catch {
        unreadable = true;
      }
    }
  } catch {
    unreadable = true;
  }
  return { items, unreadable };
}
async function lock<T>(uid: string, cid: string, check: () => void, work: () => T): Promise<T> {
  if (!recoveryAvailable())
    throw new Error(
      'Este navegador não permite preservar pedidos com reserva segura. A leitura continua disponível.',
    );
  const result = await navigator.locks.request(key(uid, cid), () => {
    check();
    return work();
  });
  window.dispatchEvent(new Event(pulse));
  return result;
}
function put(v: DeletionControl) {
  validateControl(v, v.ownerId, campaignOf(v));
  localStorage.setItem(key(v.ownerId, campaignOf(v)), JSON.stringify(v));
  if (canonical(readDeletion(v.ownerId, campaignOf(v))) !== canonical(v))
    throw new Error('O controle não pôde ser preservado.');
}
function exact(v: DeletionControl) {
  if (canonical(readDeletion(v.ownerId, campaignOf(v))) !== canonical(v))
    throw new Error('O controle mudou em outra aba e foi preservado.');
}
export function reserveDeletion(v: DeletionPending, check: () => void): Promise<void> {
  return lock(v.ownerId, campaignOf(v), check, () => {
    const old = readDeletion(v.ownerId, campaignOf(v));
    if (old && (old.kind !== 'known' || v.kind === 'start'))
      throw new Error('Confirme ou consulte o controle preservado antes de outro pedido.');
    if (
      old?.kind === 'known' &&
      v.kind === 'step' &&
      (canonical(old.identity) !== canonical(v.identity) ||
        old.checkpoint > v.input.expectedCheckpoint)
    )
      throw new Error('O progresso conhecido mudou. Consulte novamente.');
    put(v);
  });
}
export function changeDeletionStart(v: DeletionPending & { kind: 'start' }, check: () => void) {
  return lock(v.ownerId, campaignOf(v), check, () => {
    exact(v);
    const next = { ...v, phase: 'cancel-start' as const };
    put(next);
    return next;
  });
}
export const knownDeletion = (p: DeletionProgress): DeletionControl => ({
  schemaVersion: 1,
  ownerId: p.ownerId,
  kind: 'known',
  identity: identityOf(p),
  checkpoint: p.checkpoint,
});
export function finishDeletion(
  v: DeletionPending,
  p: DeletionProgress | null,
  check: () => void,
): Promise<DeletionControl | null> {
  return lock(v.ownerId, campaignOf(v), check, () => {
    exact(v);
    if (p) put(knownDeletion(p));
    else localStorage.removeItem(key(v.ownerId, campaignOf(v)));
    return readDeletion(v.ownerId, campaignOf(v));
  });
}
export function subscribeDeletions(listener: () => void): () => void {
  const storage = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(prefix)) listener();
  };
  window.addEventListener('storage', storage);
  window.addEventListener(pulse, listener);
  window.addEventListener('focus', listener);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener(pulse, listener);
    window.removeEventListener('focus', listener);
  };
}
