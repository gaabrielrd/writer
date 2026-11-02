import type {
  AdventureDeletionControl as Control,
  AdventureDeletionPending as Pending,
  AdventureDeletionStartPending as StartPending,
  AdventureDeletionStepPending as StepPending,
  AdventureDeletionKnown as Known,
  AdventureDeletionProgress as Progress,
  AdventureDeletionOutcome as Outcome,
} from '../model/adventureDeletion';
import {
  assertScope,
  adventureOf,
  canonical,
  checkFloor,
  identityOf,
  floorOf,
  fail,
  readControl,
  readProgress,
  readMutation,
  readCanceled,
  readLookup,
} from '../model/adventureDeletionContracts';
const prefix = 'writer:adventure-deletion:',
  pulse = 'writer:adventure-deletion-change';
const key = (uid: string, adventureId: string) => {
  assertScope(uid, adventureId);
  return prefix + JSON.stringify([uid, adventureId]);
};
export function recoveryAvailable(): boolean {
  try {
    return !!navigator.locks?.request && !!window.localStorage;
  } catch {
    return false;
  }
}
export function readDeletion(uid: string, adventureId: string): Control | null {
  const raw = localStorage.getItem(key(uid, adventureId));
  if (raw === null) return null;
  try {
    if (raw.length > 1024 * 1024) fail();
    return readControl(JSON.parse(raw) as unknown, uid, adventureId);
  } catch {
    return fail('O controle local inválido foi preservado. Nenhum pedido novo será enviado.');
  }
}
export function listDeletions(uid: string): { items: Control[]; unreadable: boolean } {
  assertScope(uid, 'metadata');
  const items: Control[] = [];
  let unreadable = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (!name?.startsWith(prefix)) continue;
      let address: unknown;
      try {
        address = JSON.parse(name.slice(prefix.length));
      } catch {
        continue;
      }
      if (!Array.isArray(address) || address[0] !== uid) continue;
      try {
        if (address.length !== 2 || typeof address[1] !== 'string') fail();
        const value = readDeletion(uid, address[1]);
        if (value) items.push(value);
      } catch {
        unreadable = true;
      }
    }
  } catch {
    unreadable = true;
  }
  return { items, unreadable };
}
async function lock<T>(
  uid: string,
  adventureId: string,
  check: () => void,
  work: () => T,
): Promise<T> {
  if (!recoveryAvailable())
    fail(
      'Este navegador não permite preservar pedidos com reserva segura. A leitura continua disponível.',
    );
  const result = await navigator.locks.request(key(uid, adventureId), () => {
    check();
    return work();
  });
  check();
  window.dispatchEvent(new Event(pulse));
  return result;
}
function exact(expected: Control | null, uid: string, adventureId: string): void {
  if (canonical(readDeletion(uid, adventureId)) !== canonical(expected))
    fail('O controle mudou em outra aba e foi preservado.');
}
function put(value: Control): void {
  const own = readControl(value, value.ownerId, adventureOf(value));
  localStorage.setItem(key(own.ownerId, adventureOf(own)), JSON.stringify(own));
  exact(own, own.ownerId, adventureOf(own));
}
export const knownDeletion = (p: Progress): Known => ({
  schemaVersion: 1,
  ownerId: p.ownerId,
  kind: 'known',
  identity: identityOf(p),
  floor: floorOf(p),
});
export async function reserveDeletion(value: Pending, check: () => void): Promise<void> {
  const op = readControl(value, value.ownerId, adventureOf(value));
  if (op.kind === 'known') fail();
  await lock(op.ownerId, adventureOf(op), check, () => {
    const old = readDeletion(op.ownerId, adventureOf(op));
    if (op.kind === 'start') {
      if (old !== null) fail('Confirme o controle preservado antes de outro pedido.');
    } else if (
      old?.kind !== 'known' ||
      canonical(old.identity) !== canonical(op.identity) ||
      canonical(old.floor) !== canonical(op.floor)
    )
      fail('O progresso conhecido mudou. Consulte novamente.');
    put(op);
  });
}
export async function rememberDeletion(
  uid: string,
  adventureId: string,
  expected: Known | null,
  progress: Progress,
  check: () => void,
): Promise<Known> {
  const old = expected === null ? null : readControl(expected, uid, adventureId);
  if (old !== null && old.kind !== 'known') fail();
  const p = readProgress(progress, uid, old?.identity ?? { adventureId }, old?.floor),
    next = knownDeletion(p);
  return lock(uid, adventureId, check, () => {
    exact(old, uid, adventureId);
    put(next);
    return structuredClone(next);
  });
}
export async function cancelDeletionStart(
  value: StartPending,
  check: () => void,
): Promise<StartPending> {
  const old = readControl(value, value.ownerId, adventureOf(value));
  if (old.kind !== 'start') fail();
  return lock(old.ownerId, adventureOf(old), check, () => {
    exact(old, old.ownerId, adventureOf(old));
    const next = { ...old, phase: 'cancel-start' as const };
    put(next);
    return structuredClone(next);
  });
}
export async function settleDeletion(
  value: Pending,
  response: unknown,
  check: () => void,
): Promise<Outcome> {
  const op = readControl(value, value.ownerId, adventureOf(value));
  if (op.kind === 'known') fail();
  const canceled = !!response && typeof response === 'object' && 'kind' in response,
    result = canceled ? readCanceled(response, op) : readMutation(response, op);
  return lock(op.ownerId, adventureOf(op), check, () => {
    exact(op, op.ownerId, adventureOf(op));
    if ('kind' in result) localStorage.removeItem(key(op.ownerId, adventureOf(op)));
    else put(knownDeletion(result.progress));
    const expected = 'kind' in result ? null : knownDeletion(result.progress);
    exact(expected, op.ownerId, adventureOf(op));
    return structuredClone(result);
  });
}
export async function settleDeletionConflict(
  value: StepPending,
  response: unknown,
  check: () => void,
): Promise<Known> {
  const op = readControl(value, value.ownerId, adventureOf(value));
  if (op.kind !== 'step') fail();
  const lookup = readLookup(response, op.ownerId, adventureOf(op), op.identity, op.floor),
    p = lookup.deletion;
  if (!p || p.checkpoint <= op.input.expectedCheckpoint)
    fail('O conflito ainda não foi confirmado pelo servidor.');
  checkFloor(floorOf(p), op.floor);
  const next = knownDeletion(p);
  return lock(op.ownerId, adventureOf(op), check, () => {
    exact(op, op.ownerId, adventureOf(op));
    put(next);
    return structuredClone(next);
  });
}
export function assertCurrent(value: Control): void {
  exact(value, value.ownerId, adventureOf(value));
}
export function subscribeDeletions(listener: () => void): () => void {
  const changed = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(prefix)) listener();
  };
  window.addEventListener('storage', changed);
  window.addEventListener(pulse, listener);
  window.addEventListener('focus', listener);
  return () => {
    window.removeEventListener('storage', changed);
    window.removeEventListener(pulse, listener);
    window.removeEventListener('focus', listener);
  };
}
