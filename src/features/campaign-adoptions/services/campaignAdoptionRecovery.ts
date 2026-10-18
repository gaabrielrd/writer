import type {
  AdoptionControl,
  AdoptionIdentity,
  AdoptionProgress,
  KnownAdoptionControl,
  StartAdoptionPending,
  StepAdoptionPending,
} from '../model/campaignAdoption';
import { canonical, identityOf, validateControl } from './campaignAdoptionService';
const PREFIX = 'writer:campaign-adoption:',
  PULSE = 'writer:campaign-adoption-change';
const storageKey = (uid: string, campaignId: string, slot: string) =>
  PREFIX + JSON.stringify([uid, campaignId, slot]);
export function adoptionStorageAvailable(): boolean {
  try {
    return !!navigator.locks?.request && !!window.localStorage;
  } catch {
    return false;
  }
}
const slotOf = (entry: AdoptionControl) =>
  entry.scope.kind === 'start' ? 'start' : 'job:' + entry.scope.adoptionId;
export function readAdoptionControl(
  uid: string,
  campaignId: string,
  adoptionId?: string,
): AdoptionControl | null {
  const raw = localStorage.getItem(
    storageKey(uid, campaignId, adoptionId ? 'job:' + adoptionId : 'start'),
  );
  if (raw === null) return null;
  let value: AdoptionControl;
  try {
    value = JSON.parse(raw) as AdoptionControl;
  } catch {
    throw new Error('O pedido local não pôde ser lido. Nenhum pedido substituto foi enviado.');
  }
  validateControl(value, uid, campaignId);
  if (slotOf(value) !== (adoptionId ? 'job:' + adoptionId : 'start'))
    throw new Error('O pedido local pertence a outro escopo e foi preservado.');
  return value;
}
export function listAdoptionControls(
  uid: string,
  campaignId?: string,
): { items: AdoptionControl[]; unreadable: boolean } {
  const items: AdoptionControl[] = [];
  let unreadable = false;
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const name = localStorage.key(i);
      if (!name?.startsWith(PREFIX)) continue;
      let identity: unknown;
      try {
        identity = JSON.parse(name.slice(PREFIX.length));
      } catch {
        continue;
      }
      if (
        !Array.isArray(identity) ||
        identity[0] !== uid ||
        typeof identity[1] !== 'string' ||
        (campaignId && identity[1] !== campaignId)
      )
        continue;
      try {
        if (
          identity.length !== 3 ||
          typeof identity[2] !== 'string' ||
          (identity[2] !== 'start' && !identity[2].startsWith('job:'))
        )
          throw new Error();
        const entry = readAdoptionControl(
          uid,
          identity[1],
          identity[2] === 'start' ? undefined : identity[2].slice(4),
        );
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
function current(entry: AdoptionControl): AdoptionControl | null {
  return readAdoptionControl(
    entry.ownerId,
    entry.scope.campaignId,
    entry.scope.kind === 'start' ? undefined : entry.scope.adoptionId,
  );
}
function same(a: AdoptionControl | null, b: AdoptionControl): boolean {
  return canonical(a) === canonical(b);
}
function put(entry: AdoptionControl): void {
  validateControl(entry, entry.ownerId, entry.scope.campaignId);
  const key = storageKey(entry.ownerId, entry.scope.campaignId, slotOf(entry));
  localStorage.setItem(key, JSON.stringify(entry));
  if (!same(current(entry), entry))
    throw new Error(
      'Não foi possível preservar o controle local. Nenhum envio novo foi autorizado.',
    );
}
function remove(entry: AdoptionControl): void {
  localStorage.removeItem(storageKey(entry.ownerId, entry.scope.campaignId, slotOf(entry)));
}
async function lock<T>(
  uid: string,
  campaignId: string,
  assertActive: () => void,
  work: () => T,
): Promise<T> {
  if (!adoptionStorageAvailable())
    throw new Error(
      'Este navegador não oferece reserva segura entre abas. A leitura continua disponível; nenhum pedido novo foi enviado.',
    );
  const result = await navigator.locks.request(
    'writer:campaign-adoption:' + JSON.stringify([uid, campaignId]),
    () => {
      assertActive();
      return work();
    },
  );
  window.dispatchEvent(new Event(PULSE));
  return result;
}
function requireExact(entry: AdoptionControl): void {
  if (!same(current(entry), entry))
    throw new Error(
      'O controle mudou em outra aba. Confirme o pedido preservado antes de continuar.',
    );
}
export function reserveAdoption(
  entry: StartAdoptionPending | StepAdoptionPending,
  assertActive: () => void,
): Promise<void> {
  return lock(entry.ownerId, entry.scope.campaignId, assertActive, () => {
    const all = listAdoptionControls(entry.ownerId, entry.scope.campaignId);
    if (all.unreadable)
      throw new Error('Há um controle local inválido preservado. Nenhum pedido novo foi enviado.');
    if (all.items.some((v) => v.scope.kind !== 'known'))
      throw new Error(
        'Confirme ou encerre o pedido pendente desta campanha antes de iniciar outro.',
      );
    const prior = current(entry);
    if (prior && prior.scope.kind !== 'known') throw new Error('Existe outro pedido neste escopo.');
    if (
      prior &&
      entry.scope.kind === 'job' &&
      canonical(prior.expected) !== canonical(entry.expected)
    )
      throw new Error('A identidade da adoção mudou.');
    if (
      prior?.scope.kind === 'known' &&
      'checkpoint' in prior &&
      entry.scope.kind === 'job' &&
      'method' in entry &&
      prior.checkpoint > entry.input.expectedCheckpoint
    )
      throw new Error('O progresso conhecido avançou em outra aba. Consulte o controle novamente.');
    put(entry);
  });
}
export function changeAdoptionStart(
  entry: StartAdoptionPending,
  assertActive: () => void,
): Promise<StartAdoptionPending> {
  return lock(entry.ownerId, entry.scope.campaignId, assertActive, () => {
    requireExact(entry);
    const next: StartAdoptionPending = { ...entry, phase: 'cancel-start' };
    put(next);
    return next;
  });
}
export function knownAdoption(progress: AdoptionProgress): KnownAdoptionControl {
  return {
    schemaVersion: 1,
    ownerId: progress.ownerId,
    scope: { kind: 'known', campaignId: progress.campaignId, adoptionId: progress.adoptionId },
    expected: identityOf(progress),
    checkpoint: progress.checkpoint,
  };
}
export function finishAdoptionStart(
  entry: StartAdoptionPending,
  progress: AdoptionProgress | null,
  assertActive: () => void,
): Promise<AdoptionControl | null> {
  return lock(entry.ownerId, entry.scope.campaignId, assertActive, () => {
    requireExact(entry);
    if (progress) {
      const known = knownAdoption(progress),
        prior = readAdoptionControl(entry.ownerId, entry.scope.campaignId, progress.adoptionId);
      if (prior && canonical(prior.expected) !== canonical(known.expected))
        throw new Error('O controle conhecido pertence a outra identidade.');
      // Write the neutral marker first. Interrupted migration keeps start discoverable.
      if (!prior || prior.scope.kind === 'known')
        put(prior && 'checkpoint' in prior && prior.checkpoint > known.checkpoint ? prior : known);
      requireExact(entry);
      remove(entry);
      return readAdoptionControl(entry.ownerId, entry.scope.campaignId, progress.adoptionId);
    }
    remove(entry);
    return null;
  });
}
export function finishAdoptionStep(
  entry: StepAdoptionPending,
  progress: AdoptionProgress,
  assertActive: () => void,
): Promise<AdoptionControl | null> {
  return lock(entry.ownerId, entry.scope.campaignId, assertActive, () => {
    requireExact(entry);
    if (progress.state === 'deleted' && progress.cleanupComplete) remove(entry);
    else put(knownAdoption(progress));
    return current(entry);
  });
}
export function rememberAdoption(
  progress: AdoptionProgress,
  assertActive: () => void,
): Promise<AdoptionControl | null> {
  return lock(progress.ownerId, progress.campaignId, assertActive, () => {
    const entry = readAdoptionControl(progress.ownerId, progress.campaignId, progress.adoptionId);
    if (entry && entry.scope.kind !== 'known') return entry;
    if (entry && canonical(entry.expected) !== canonical(identityOf(progress)))
      throw new Error('O controle conhecido mudou de identidade.');
    if (entry && 'checkpoint' in entry && entry.checkpoint > progress.checkpoint) return entry;
    if (progress.state === 'deleted' && progress.cleanupComplete) {
      if (entry) remove(entry);
      return null;
    }
    const next = knownAdoption(progress);
    if (!entry || ('checkpoint' in entry && entry.checkpoint <= next.checkpoint)) put(next);
    return current(next);
  });
}
export function subscribeAdoptions(listener: () => void): () => void {
  const storage = (event: StorageEvent) => {
    if (event.key === null || event.key.startsWith(PREFIX)) listener();
  };
  window.addEventListener('storage', storage);
  window.addEventListener('focus', listener);
  window.addEventListener(PULSE, listener);
  return () => {
    window.removeEventListener('storage', storage);
    window.removeEventListener('focus', listener);
    window.removeEventListener(PULSE, listener);
  };
}
export function pendingAdoptionFor(
  uid: string,
  campaignId: string,
  adoptionId?: string,
): AdoptionControl | null {
  const initial = readAdoptionControl(uid, campaignId);
  if (
    initial?.scope.kind === 'start' &&
    (!adoptionId || initial.expected.adoptionId === adoptionId)
  )
    return initial;
  return adoptionId ? readAdoptionControl(uid, campaignId, adoptionId) : null;
}
export function matchesAdoptionIdentity(a: AdoptionIdentity, b: AdoptionIdentity): boolean {
  return canonical(a) === canonical(b);
}
