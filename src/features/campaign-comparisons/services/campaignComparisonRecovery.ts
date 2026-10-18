import type {
  ComparisonControl,
  ComparisonIdentity,
  ComparisonProgress,
  KnownComparisonControl,
  StartComparisonPending,
  StepComparisonPending,
} from '../model/campaignComparison';
import { canonical, identityOf, validateControl } from './campaignComparisonService';
const PREFIX = 'writer:campaign-comparison:',
  PULSE = 'writer:campaign-comparison-change';
const storageKey = (uid: string, campaignId: string, slot: string) =>
  PREFIX + JSON.stringify([uid, campaignId, slot]);
export function comparisonStorageAvailable(): boolean {
  try {
    return !!navigator.locks?.request && !!window.localStorage;
  } catch {
    return false;
  }
}
const slotOf = (entry: ComparisonControl) =>
  entry.scope.kind === 'start' ? 'start' : 'job:' + entry.scope.comparisonId;
export function readComparisonControl(
  uid: string,
  campaignId: string,
  comparisonId?: string,
): ComparisonControl | null {
  const raw = localStorage.getItem(
    storageKey(uid, campaignId, comparisonId ? 'job:' + comparisonId : 'start'),
  );
  if (raw === null) return null;
  let value: ComparisonControl;
  try {
    value = JSON.parse(raw) as ComparisonControl;
  } catch {
    throw new Error('O pedido local não pôde ser lido. Nenhum pedido substituto foi enviado.');
  }
  validateControl(value, uid, campaignId);
  if (slotOf(value) !== (comparisonId ? 'job:' + comparisonId : 'start'))
    throw new Error('O pedido local pertence a outro escopo e foi preservado.');
  return value;
}
export function listComparisonControls(
  uid: string,
  campaignId?: string,
): { items: ComparisonControl[]; unreadable: boolean } {
  const items: ComparisonControl[] = [];
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
        const entry = readComparisonControl(
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
function current(entry: ComparisonControl): ComparisonControl | null {
  return readComparisonControl(
    entry.ownerId,
    entry.scope.campaignId,
    entry.scope.kind === 'start' ? undefined : entry.scope.comparisonId,
  );
}
function same(a: ComparisonControl | null, b: ComparisonControl): boolean {
  return canonical(a) === canonical(b);
}
function put(entry: ComparisonControl): void {
  validateControl(entry, entry.ownerId, entry.scope.campaignId);
  const key = storageKey(entry.ownerId, entry.scope.campaignId, slotOf(entry));
  localStorage.setItem(key, JSON.stringify(entry));
  if (!same(current(entry), entry))
    throw new Error(
      'Não foi possível preservar o controle local. Nenhum envio novo foi autorizado.',
    );
}
function remove(entry: ComparisonControl): void {
  localStorage.removeItem(storageKey(entry.ownerId, entry.scope.campaignId, slotOf(entry)));
}
async function lock<T>(
  uid: string,
  campaignId: string,
  assertActive: () => void,
  work: () => T,
): Promise<T> {
  if (!comparisonStorageAvailable())
    throw new Error(
      'Este navegador não oferece reserva segura entre abas. A leitura continua disponível; nenhum pedido novo foi enviado.',
    );
  const result = await navigator.locks.request(
    'writer:campaign-comparison:' + JSON.stringify([uid, campaignId]),
    () => {
      assertActive();
      return work();
    },
  );
  window.dispatchEvent(new Event(PULSE));
  return result;
}
function requireExact(entry: ComparisonControl): void {
  if (!same(current(entry), entry))
    throw new Error(
      'O controle mudou em outra aba. Confirme o pedido preservado antes de continuar.',
    );
}
export function reserveComparison(
  entry: StartComparisonPending | StepComparisonPending,
  assertActive: () => void,
): Promise<void> {
  return lock(entry.ownerId, entry.scope.campaignId, assertActive, () => {
    const all = listComparisonControls(entry.ownerId, entry.scope.campaignId);
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
      throw new Error('A identidade da candidata mudou.');
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
export function changeComparisonStart(
  entry: StartComparisonPending,
  assertActive: () => void,
): Promise<StartComparisonPending> {
  return lock(entry.ownerId, entry.scope.campaignId, assertActive, () => {
    requireExact(entry);
    const next: StartComparisonPending = { ...entry, phase: 'cancel-start' };
    put(next);
    return next;
  });
}
export function knownComparison(progress: ComparisonProgress): KnownComparisonControl {
  return {
    schemaVersion: 1,
    ownerId: progress.ownerId,
    scope: { kind: 'known', campaignId: progress.campaignId, comparisonId: progress.comparisonId },
    expected: identityOf(progress),
    checkpoint: progress.checkpoint,
  };
}
export function finishComparisonStart(
  entry: StartComparisonPending,
  progress: ComparisonProgress | null,
  assertActive: () => void,
): Promise<ComparisonControl | null> {
  return lock(entry.ownerId, entry.scope.campaignId, assertActive, () => {
    requireExact(entry);
    if (progress) {
      const known = knownComparison(progress),
        prior = readComparisonControl(entry.ownerId, entry.scope.campaignId, progress.comparisonId);
      if (prior && canonical(prior.expected) !== canonical(known.expected))
        throw new Error('O controle conhecido pertence a outra identidade.');
      // Write the neutral marker first. Interrupted migration keeps start discoverable.
      if (!prior || prior.scope.kind === 'known')
        put(prior && 'checkpoint' in prior && prior.checkpoint > known.checkpoint ? prior : known);
      requireExact(entry);
      remove(entry);
      return readComparisonControl(entry.ownerId, entry.scope.campaignId, progress.comparisonId);
    }
    remove(entry);
    return null;
  });
}
export function finishComparisonStep(
  entry: StepComparisonPending,
  progress: ComparisonProgress,
  assertActive: () => void,
): Promise<ComparisonControl | null> {
  return lock(entry.ownerId, entry.scope.campaignId, assertActive, () => {
    requireExact(entry);
    if (progress.state === 'deleted' && progress.cleanupComplete) remove(entry);
    else put(knownComparison(progress));
    return current(entry);
  });
}
export function rememberComparison(
  progress: ComparisonProgress,
  assertActive: () => void,
): Promise<ComparisonControl | null> {
  return lock(progress.ownerId, progress.campaignId, assertActive, () => {
    const entry = readComparisonControl(
      progress.ownerId,
      progress.campaignId,
      progress.comparisonId,
    );
    if (entry && entry.scope.kind !== 'known') return entry;
    if (entry && canonical(entry.expected) !== canonical(identityOf(progress)))
      throw new Error('O controle conhecido mudou de identidade.');
    if (progress.state === 'deleted' && progress.cleanupComplete) {
      if (entry) remove(entry);
      return null;
    }
    const next = knownComparison(progress);
    if (!entry || ('checkpoint' in entry && entry.checkpoint <= next.checkpoint)) put(next);
    return current(next);
  });
}
export function subscribeComparisons(listener: () => void): () => void {
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
export function pendingComparisonFor(
  uid: string,
  campaignId: string,
  comparisonId?: string,
): ComparisonControl | null {
  const initial = readComparisonControl(uid, campaignId);
  if (
    initial?.scope.kind === 'start' &&
    (!comparisonId || initial.expected.comparisonId === comparisonId)
  )
    return initial;
  return comparisonId ? readComparisonControl(uid, campaignId, comparisonId) : null;
}
export function matchesComparisonIdentity(a: ComparisonIdentity, b: ComparisonIdentity): boolean {
  return canonical(a) === canonical(b);
}
