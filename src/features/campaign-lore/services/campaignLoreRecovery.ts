import type { CampaignLoreOperation } from '../model/campaignLore';
const DB = 'writer.campaign-lore',
  STORE = 'operations',
  CHANNEL = 'writer.campaign-lore.pulse';
const key = (uid: string, campaignId: string) => JSON.stringify([uid, campaignId]);
export function recoveryAvailable(): boolean {
  return (
    !!globalThis.indexedDB &&
    !!globalThis.navigator?.locks?.request &&
    !!globalThis.crypto?.subtle &&
    globalThis.isSecureContext !== false
  );
}
function unavailable(): never {
  throw new Error(
    'Este navegador não oferece armazenamento, criptografia e reserva seguros. Seus campos foram mantidos; use um navegador compatível para enviar.',
  );
}
function open(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB)
    return Promise.reject(new Error('Não foi possível abrir a recuperação cifrada.'));
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE);
    request.onerror = () => reject(new Error('Não foi possível abrir a recuperação cifrada.'));
    request.onblocked = () =>
      reject(new Error('Feche outras versões do Writer para abrir a recuperação.'));
    request.onsuccess = () => {
      const db = request.result;
      db.onversionchange = () => db.close();
      resolve(db);
    };
  });
}
function checked(raw: unknown, uid: string, campaignId: string): CampaignLoreOperation | null {
  if (raw === undefined || raw === null) return null;
  const v = raw as CampaignLoreOperation,
    h = v.header;
  const hex = (s: unknown) => typeof s === 'string' && /^[a-f0-9]{64}$/.test(s);
  const binary = (b: unknown) => Object.prototype.toString.call(b) === '[object ArrayBuffer]';
  if (
    !v ||
    v.schemaVersion !== 1 ||
    v.ownerId !== uid ||
    !h ||
    h.campaignId !== campaignId ||
    !hex(h.campaignToken) ||
    !hex(h.baseId) ||
    !hex(h.sourceKey) ||
    typeof h.operationId !== 'string' ||
    !h.operationId ||
    h.operationId.length > 128 ||
    !Number.isSafeInteger(h.expectedRevision) ||
    h.expectedRevision < 0 ||
    !['save', 'remove', 'restore', 'discard'].includes(v.action) ||
    !['preparing', 'sealed', 'metadata-ready', 'confirmed'].includes(v.phase) ||
    Object.keys(v).some(
      (k) =>
        ![
          'schemaVersion',
          'ownerId',
          'header',
          'action',
          'relatedSourceKeys',
          'phase',
          'nonce',
          'ciphertext',
          'confirmedRevision',
        ].includes(k),
    ) ||
    Object.keys(h).sort().join() !==
      'baseId,campaignId,campaignToken,expectedRevision,operationId,sourceKey'
  )
    throw new Error('O controle de recuperação é inválido. Nenhum pedido novo foi enviado.');
  if (
    v.action === 'save'
      ? !Array.isArray(v.relatedSourceKeys) ||
        v.relatedSourceKeys.length > 50 ||
        !v.relatedSourceKeys.every(hex) ||
        JSON.stringify([...new Set(v.relatedSourceKeys)].sort()) !==
          JSON.stringify(v.relatedSourceKeys)
      : v.relatedSourceKeys !== undefined
  )
    throw new Error('O controle de relações da recuperação é inválido.');
  if (
    v.phase === 'sealed'
      ? v.action !== 'save' ||
        !binary(v.nonce) ||
        v.nonce!.byteLength !== 12 ||
        !binary(v.ciphertext) ||
        v.ciphertext!.byteLength < 16 ||
        v.ciphertext!.byteLength > 900016
      : v.nonce !== undefined || v.ciphertext !== undefined
  )
    throw new Error('O conteúdo cifrado da recuperação é inválido.');
  if (
    (v.phase === 'preparing' && v.action !== 'save') ||
    (v.phase === 'metadata-ready' && v.action === 'save') ||
    (v.phase === 'confirmed'
      ? v.confirmedRevision !== h.expectedRevision + 1
      : v.confirmedRevision !== undefined)
  )
    throw new Error('A fase de recuperação é inválida.');
  return v;
}
async function transaction<T>(
  uid: string,
  campaignId: string,
  update?: (current: CampaignLoreOperation | null) => CampaignLoreOperation | null,
): Promise<T> {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    let result: CampaignLoreOperation | null = null,
      error: unknown;
    const tx = db.transaction(STORE, update ? 'readwrite' : 'readonly'),
      store = tx.objectStore(STORE),
      request = store.get(key(uid, campaignId));
    request.onsuccess = () => {
      try {
        const current = checked(request.result, uid, campaignId);
        result = update ? update(current) : current;
        if (update) {
          if (result) store.put(checked(result, uid, campaignId), key(uid, campaignId));
          else store.delete(key(uid, campaignId));
        }
      } catch (cause) {
        error = cause;
        tx.abort();
      }
    };
    // A successful put is not a durable reservation: only transaction completion is.
    tx.oncomplete = () => {
      db.close();
      resolve(result as T);
    };
    tx.onerror = () => {
      error ??= new Error(
        'Não foi possível preservar o pedido cifrado. Nenhum novo envio foi autorizado.',
      );
    };
    tx.onabort = () => {
      db.close();
      reject(
        error instanceof Error
          ? error
          : new Error('A gravação da recuperação foi cancelada. Seus campos foram mantidos.'),
      );
    };
  });
}
export function readLoreOperation(
  uid: string,
  campaignId: string,
): Promise<CampaignLoreOperation | null> {
  return transaction(uid, campaignId);
}
function pulse(): void {
  try {
    if (typeof BroadcastChannel === 'undefined') return;
    const channel = new BroadcastChannel(CHANNEL);
    try {
      channel.postMessage('changed');
    } finally {
      channel.close();
    }
  } catch {
    /* Notifications are optional. IDB remains the source of truth. */
  }
}
async function locked(
  uid: string,
  campaignId: string,
  work: () => Promise<CampaignLoreOperation | null>,
): Promise<CampaignLoreOperation | null> {
  if (!recoveryAvailable()) return unavailable();
  const result = await navigator.locks.request(
    'writer.campaign-lore:' + key(uid, campaignId),
    work,
  );
  pulse();
  return result;
}
export function reserveLoreOperation(
  op: CampaignLoreOperation,
  assertActive: () => void = () => {},
): Promise<CampaignLoreOperation | null> {
  return locked(op.ownerId, op.header.campaignId, () =>
    transaction(op.ownerId, op.header.campaignId, (current) => {
      assertActive();
      if (current)
        throw new Error(
          'Há outro pedido preservado nesta campanha. Confirme ou encerre esse pedido primeiro.',
        );
      return op;
    }),
  );
}
export function replaceLoreOperation(
  op: CampaignLoreOperation,
  expectedPhase: CampaignLoreOperation['phase'],
  assertActive: () => void = () => {},
): Promise<CampaignLoreOperation | null> {
  return locked(op.ownerId, op.header.campaignId, () =>
    transaction(op.ownerId, op.header.campaignId, (current) => {
      assertActive();
      if (
        !current ||
        current.header.operationId !== op.header.operationId ||
        current.phase !== expectedPhase ||
        JSON.stringify(current.header) !== JSON.stringify(op.header) ||
        current.action !== op.action ||
        JSON.stringify(current.relatedSourceKeys) !== JSON.stringify(op.relatedSourceKeys)
      )
        throw new Error(
          'O pedido preservado mudou em outra aba. Nenhum novo envio foi autorizado.',
        );
      return op;
    }),
  );
}
export function clearLoreOperation(
  op: CampaignLoreOperation,
  assertActive: () => void = () => {},
): Promise<CampaignLoreOperation | null> {
  return locked(op.ownerId, op.header.campaignId, () =>
    transaction(op.ownerId, op.header.campaignId, (current) => {
      assertActive();
      return sameLoreOperation(current, op) ? null : current;
    }),
  );
}
export function sameLoreOperation(
  a: CampaignLoreOperation | null,
  b: CampaignLoreOperation,
): boolean {
  if (!a) return false;
  const metadata = (v: CampaignLoreOperation) =>
    JSON.stringify({ ...v, nonce: undefined, ciphertext: undefined });
  const binary = (x: ArrayBuffer | undefined, y: ArrayBuffer | undefined) =>
    x === undefined || y === undefined
      ? x === y
      : x.byteLength === y.byteLength &&
        new Uint8Array(x).every((byte, index) => byte === new Uint8Array(y)[index]);
  return (
    metadata(a) === metadata(b) && binary(a.nonce, b.nonce) && binary(a.ciphertext, b.ciphertext)
  );
}
export function subscribeLoreOperations(listener: () => void): () => void {
  let channel: BroadcastChannel | null = null;
  try {
    channel = typeof BroadcastChannel === 'undefined' ? null : new BroadcastChannel(CHANNEL);
  } catch {
    /* Focus still rechecks the journal. */
  }
  if (channel) channel.onmessage = () => listener();
  window.addEventListener('focus', listener);
  return () => {
    channel?.close();
    window.removeEventListener('focus', listener);
  };
}
