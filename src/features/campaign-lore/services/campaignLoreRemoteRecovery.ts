import type {
  CampaignLoreRemotePending,
  CampaignLoreRemoteResolution,
  CampaignLoreOperationsPage,
} from '../model/campaignLoreRemote';
const prefix = 'writer:campaign-lore-resolution:',
  pulseName = 'writer:campaign-lore-resolution-change';
const key = (uid: string, campaignId: string) => prefix + JSON.stringify([uid, campaignId]);
export const remoteCanonical = (v: unknown): string =>
  JSON.stringify(v, (_k, x: unknown) =>
    x && typeof x === 'object' && !Array.isArray(x)
      ? Object.fromEntries(Object.entries(x).sort(([a], [b]) => a.localeCompare(b)))
      : x,
  );
const hex = (v: unknown) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const integer = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
function keys(v: unknown, fields: string[]) {
  if (
    !v ||
    typeof v !== 'object' ||
    Array.isArray(v) ||
    Object.keys(v).length !== fields.length ||
    fields.some((k) => !Object.hasOwn(v, k))
  )
    throw new Error('O controle de resolução não pôde ser confirmado.');
}
function validInput(v: CampaignLoreRemotePending['input']) {
  keys(v, [
    'campaignId',
    'campaignToken',
    'baseId',
    'operationId',
    'statusToken',
    'resolutionId',
    'intent',
  ]);
  if (
    typeof v.campaignId !== 'string' ||
    !v.campaignId ||
    typeof v.operationId !== 'string' ||
    !v.operationId ||
    typeof v.resolutionId !== 'string' ||
    !v.resolutionId ||
    ![v.campaignToken, v.baseId, v.statusToken].every(hex) ||
    !['confirm', 'cancel'].includes(v.intent)
  )
    throw new Error('O pedido de resolução não pôde ser confirmado.');
}
export function readRemoteResolution(
  uid: string,
  campaignId: string,
): CampaignLoreRemotePending | null {
  const raw = localStorage.getItem(key(uid, campaignId));
  if (raw === null) return null;
  const v = JSON.parse(raw) as CampaignLoreRemotePending;
  keys(v, ['schemaVersion', 'ownerId', 'input']);
  validInput(v.input);
  if (v.schemaVersion !== 1 || v.ownerId !== uid || v.input.campaignId !== campaignId)
    throw new Error('O controle de outra identidade foi preservado.');
  return v;
}
export function remoteRecoveryAvailable() {
  try {
    return !!navigator.locks?.request && !!window.localStorage;
  } catch {
    return false;
  }
}
async function locked<T>(
  uid: string,
  campaignId: string,
  check: () => void,
  work: () => T,
): Promise<T> {
  if (!remoteRecoveryAvailable())
    throw new Error('A leitura permanece disponível, mas não há reserva segura para enviar.');
  const result = await navigator.locks.request(
    'writer:campaign-lore-resolution:' + JSON.stringify([uid, campaignId]),
    () => {
      check();
      return work();
    },
  );
  window.dispatchEvent(new Event(pulseName));
  return result;
}
export function reserveRemoteResolution(v: CampaignLoreRemotePending, check: () => void) {
  return locked(v.ownerId, v.input.campaignId, check, () => {
    if (readRemoteResolution(v.ownerId, v.input.campaignId))
      throw new Error('Confirme a resolução preservada antes de outro pedido.');
    validInput(v.input);
    localStorage.setItem(key(v.ownerId, v.input.campaignId), JSON.stringify(v));
    if (remoteCanonical(readRemoteResolution(v.ownerId, v.input.campaignId)) !== remoteCanonical(v))
      throw new Error('A resolução não pôde ser preservada.');
  });
}
export function clearRemoteResolution(v: CampaignLoreRemotePending, check: () => void) {
  return locked(v.ownerId, v.input.campaignId, check, () => {
    const actual = readRemoteResolution(v.ownerId, v.input.campaignId);
    if (remoteCanonical(actual) !== remoteCanonical(v))
      throw new Error('A resolução mudou em outra aba. O controle atual foi preservado.');
    localStorage.removeItem(key(v.ownerId, v.input.campaignId));
    return readRemoteResolution(v.ownerId, v.input.campaignId);
  });
}
export function validateRemotePage(
  v: CampaignLoreOperationsPage,
  uid: string,
  scope: { campaignId: string; campaignToken: string; baseId: string },
) {
  keys(v, [
    'schemaVersion',
    'ownerId',
    'campaignId',
    'campaignToken',
    'baseId',
    'items',
    'nextCursor',
  ]);
  if (
    v.schemaVersion !== 1 ||
    v.ownerId !== uid ||
    Object.entries(scope).some(([k, x]) => v[k as keyof CampaignLoreOperationsPage] !== x) ||
    !Array.isArray(v.items) ||
    v.items.length > 50 ||
    (v.nextCursor !== null && (typeof v.nextCursor !== 'string' || !v.nextCursor))
  )
    throw new Error('A lista de pedidos não pôde ser confirmada.');
  for (const item of v.items) {
    keys(item, ['operationId', 'state', 'revision', 'statusToken']);
    if (
      typeof item.operationId !== 'string' ||
      !item.operationId ||
      !['prepared', 'committed'].includes(item.state) ||
      !hex(item.statusToken) ||
      (item.state === 'committed' ? !integer(item.revision) : item.revision !== null)
    )
      throw new Error('Um controle remoto não pôde ser confirmado.');
  }
}
export function validateRemoteResolution(
  v: CampaignLoreRemoteResolution,
  op: CampaignLoreRemotePending,
) {
  keys(v, ['schemaVersion', 'ownerId', 'request', 'outcome', 'state', 'reason', 'revision']);
  if (
    v.schemaVersion !== 1 ||
    v.ownerId !== op.ownerId ||
    remoteCanonical(v.request) !== remoteCanonical(op.input) ||
    (v.outcome === 'rejected'
      ? v.state !== null || v.reason !== 'operation-changed' || v.revision !== null
      : v.outcome !== 'resolved' ||
        v.reason !== null ||
        v.state !== (op.input.intent === 'confirm' ? 'confirmed' : 'canceled') ||
        (v.state === 'confirmed' ? !integer(v.revision) : v.revision !== null))
  )
    throw new Error('O recibo não confirma a mesma resolução preservada.');
}
export function subscribeRemoteResolutions(fn: () => void) {
  const event = (e: StorageEvent) => {
    if (e.key === null || e.key.startsWith(prefix)) fn();
  };
  window.addEventListener('storage', event);
  window.addEventListener(pulseName, fn);
  window.addEventListener('focus', fn);
  return () => {
    window.removeEventListener('storage', event);
    window.removeEventListener(pulseName, fn);
    window.removeEventListener('focus', fn);
  };
}
