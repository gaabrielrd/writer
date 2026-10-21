import type {
  LocalImportRecord,
  ImportJournal,
  ProtectedReviewSnapshot,
  ConfirmedReview,
  ImportRecoveryKey,
} from '../model/adventureImport';
import {
  importCheck,
  importObject,
  isImportHash,
  isImportId,
  isImportInteger,
  importActions,
  canonicalImport,
  describeConfirmedReview,
  normalizeConfirmedReview,
} from './adventureImportContracts';
export const ADVENTURE_IMPORT_RECOVERY_DB = 'writer.adventure-import';
export const ADVENTURE_IMPORT_RECOVERY_STORE = 'imports';
const channel = 'writer.adventure-import.change';
const key = (uid: string, id: string) => JSON.stringify([uid, id]);
export const adventureImportRecoveryAvailable = () =>
  !!globalThis.indexedDB &&
  !!globalThis.crypto?.subtle &&
  typeof globalThis.navigator?.locks?.request === 'function' &&
  globalThis.isSecureContext !== false;
function checked(v: unknown, uid: string, id: string): LocalImportRecord | null {
  if (v === undefined || v === null) return null;
  const r = v as LocalImportRecord;
  importObject(r, ['schemaVersion', 'ownerId', 'importId', 'stamp', 'journal', 'snapshot']);
  importCheck(
    r.schemaVersion === 1 &&
      r.ownerId === uid &&
      r.importId === id &&
      isImportId(id) &&
      isImportId(r.stamp),
  );
  if (r.journal) {
    const j = r.journal;
    importObject(j, [
      'schemaVersion',
      'ownerId',
      'importId',
      'jobToken',
      'action',
      'operationId',
      'expectedCheckpoint',
      'index',
      'fingerprint',
      'intent',
      'stamp',
    ]);
    importCheck(
      j.schemaVersion === 1 &&
        j.ownerId === uid &&
        j.importId === id &&
        (j.jobToken === null || isImportHash(j.jobToken)) &&
        importActions.includes(j.action) &&
        isImportId(j.operationId) &&
        isImportHash(j.fingerprint) &&
        isImportId(j.stamp) &&
        ['send', 'cancel'].includes(j.intent) &&
        (j.expectedCheckpoint === null || isImportInteger(j.expectedCheckpoint)) &&
        (j.index === null || isImportInteger(j.index)),
    );
    if (j.action === 'startAdventureImport')
      importCheck(
        j.operationId === id &&
          j.jobToken === null &&
          j.expectedCheckpoint === null &&
          j.index === null,
      );
    else importCheck(isImportHash(j.jobToken) && isImportInteger(j.expectedCheckpoint));
  }
  return r;
}
export function validateProtectedReviewSnapshot(
  value: unknown,
  uid: string,
  id: string,
): asserts value is ProtectedReviewSnapshot {
  const s = value as ProtectedReviewSnapshot;
  importObject(s, [
    'schemaVersion',
    'ownerId',
    'importId',
    'jobToken',
    'keyId',
    'reviewHash',
    'sectionCount',
    'nonce',
    'ciphertext',
  ]);
  importCheck(
    s.schemaVersion === 1 &&
      s.ownerId === uid &&
      s.importId === id &&
      [s.jobToken, s.keyId, s.reviewHash].every(isImportHash) &&
      isImportInteger(s.sectionCount) &&
      s.sectionCount > 0 &&
      Object.prototype.toString.call(s.nonce) === '[object Uint8Array]' &&
      s.nonce.byteLength === 12 &&
      Object.prototype.toString.call(s.ciphertext) === '[object ArrayBuffer]' &&
      s.ciphertext.byteLength >= 16,
  );
}

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (!globalThis.indexedDB) {
      reject(new Error('A recuperação protegida não está disponível.'));
      return;
    }
    const req = indexedDB.open(ADVENTURE_IMPORT_RECOVERY_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(ADVENTURE_IMPORT_RECOVERY_STORE);
    req.onerror = () => reject(new Error('Não foi possível abrir a cópia protegida.'));
    req.onblocked = () =>
      reject(new Error('Feche outras versões do Writer para acessar a recuperação.'));
    req.onsuccess = () => {
      req.result.onversionchange = () => req.result.close();
      resolve(req.result);
    };
  });
}
async function transact(
  uid: string,
  id: string,
  change?: (r: LocalImportRecord | null) => LocalImportRecord | null,
): Promise<LocalImportRecord | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ADVENTURE_IMPORT_RECOVERY_STORE, change ? 'readwrite' : 'readonly'),
      store = tx.objectStore(ADVENTURE_IMPORT_RECOVERY_STORE);
    let result: LocalImportRecord | null = null,
      error: unknown;
    const req = store.get(key(uid, id));
    req.onsuccess = () => {
      try {
        const current = checked(req.result, uid, id);
        result = change ? change(current) : current;
        if (change) {
          if (result) store.put(checked(result, uid, id), key(uid, id));
          else store.delete(key(uid, id));
        }
      } catch (cause) {
        error = cause;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(result);
    };
    tx.onerror = () => {
      error ??= new Error(
        'Não foi possível preservar a cópia protegida. Nenhum envio foi autorizado.',
      );
    };
    tx.onabort = () => {
      db.close();
      reject(
        error instanceof Error
          ? error
          : new Error('A cópia protegida foi preservada sem novo envio.'),
      );
    };
  });
}
export const readLocalAdventureImport = (uid: string, id: string) => transact(uid, id);
export async function listLocalAdventureImports(uid: string): Promise<LocalImportRecord[]> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(ADVENTURE_IMPORT_RECOVERY_STORE, 'readonly'),
      store = tx.objectStore(ADVENTURE_IMPORT_RECOVERY_STORE),
      req = store.openCursor();
    const rows: LocalImportRecord[] = [];
    let error: unknown;
    req.onsuccess = () => {
      const cur = req.result;
      if (!cur) return;
      try {
        importCheck(typeof cur.key === 'string');
        const parts = JSON.parse(cur.key) as unknown;
        if (Array.isArray(parts) && parts[0] === uid && typeof parts[1] === 'string') {
          const r = checked(cur.value, uid, parts[1]);
          if (r) rows.push(r);
        }
        cur.continue();
      } catch (cause) {
        error = cause;
        tx.abort();
      }
    };
    tx.oncomplete = () => {
      db.close();
      resolve(rows);
    };
    tx.onabort = () => {
      db.close();
      reject(
        error instanceof Error ? error : new Error('Não foi possível listar os controles locais.'),
      );
    };
    tx.onerror = () => {
      error ??= new Error('Não foi possível listar os controles locais.');
    };
  });
}
function notify(uid: string) {
  window.dispatchEvent(new CustomEvent(channel, { detail: uid }));
  try {
    const b = new BroadcastChannel(channel);
    b.postMessage(uid);
    b.close();
  } catch {
    /* Notifications do not replace the durable store. */
  }
}
/** Equality includes binary bytes, including malformed snapshots retained for cancellation. */
export function sameLocalAdventureImport(
  a: LocalImportRecord | null,
  b: LocalImportRecord | null,
): boolean {
  const binary = (value: unknown): unknown => {
    if (Object.prototype.toString.call(value) === '[object ArrayBuffer]')
      return { buffer: Array.from(new Uint8Array(value as ArrayBuffer)) };
    if (ArrayBuffer.isView(value))
      return {
        view: Object.prototype.toString.call(value),
        bytes: Array.from(new Uint8Array(value.buffer, value.byteOffset, value.byteLength)),
      };
    if (Array.isArray(value)) return value.map(binary);
    if (value && typeof value === 'object')
      return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, binary(v)]));
    return value;
  };
  return canonicalImport(binary(a)) === canonicalImport(binary(b));
}
export async function compareLocalAdventureImport(
  uid: string,
  id: string,
  expected: LocalImportRecord | null,
  next: LocalImportRecord | null,
  check: () => void,
): Promise<LocalImportRecord | null> {
  if (!adventureImportRecoveryAvailable())
    throw new Error(
      'Este navegador não oferece armazenamento, criptografia e reserva seguros. A revisão foi mantida na tela.',
    );
  const result = await navigator.locks.request(key(uid, id), () =>
    transact(uid, id, (current) => {
      check();
      importCheck(sameLocalAdventureImport(current, expected));
      if (next) checked(next, uid, id);
      return next;
    }),
  );
  notify(uid);
  return result;
}
export function newImportRecord(uid: string, id: string): LocalImportRecord {
  return {
    schemaVersion: 1,
    ownerId: uid,
    importId: id,
    stamp: crypto.randomUUID(),
    journal: null,
    snapshot: null,
  };
}
export const nextImportRecord = (
  record: LocalImportRecord,
  patch: Partial<Pick<LocalImportRecord, 'journal' | 'snapshot'>>,
): LocalImportRecord => ({ ...record, ...patch, stamp: crypto.randomUUID() });
export function importJournal(
  uid: string,
  id: string,
  action: ImportJournal['action'],
  operationId: string,
  fingerprint: string,
  jobToken: string | null = null,
  expectedCheckpoint: number | null = null,
  index: number | null = null,
): ImportJournal {
  return {
    schemaVersion: 1,
    ownerId: uid,
    importId: id,
    jobToken,
    action,
    operationId,
    expectedCheckpoint,
    index,
    fingerprint,
    intent: 'send',
    stamp: crypto.randomUUID(),
  };
}
export function subscribeAdventureImportRecovery(uid: string, listener: () => void): () => void {
  const local = (e: Event) => {
    if ((e as CustomEvent).detail === uid) listener();
  };
  window.addEventListener(channel, local);
  let b: BroadcastChannel | undefined;
  try {
    b = new BroadcastChannel(channel);
    b.onmessage = (e) => {
      if (e.data === uid) listener();
    };
  } catch {
    /* IDB is authoritative. */
  }
  return () => {
    window.removeEventListener(channel, local);
    b?.close();
  };
}
const aad = (s: Omit<ProtectedReviewSnapshot, 'nonce' | 'ciphertext'>) =>
  new TextEncoder().encode(
    JSON.stringify([1, s.ownerId, s.importId, s.jobToken, s.keyId, s.reviewHash, s.sectionCount]),
  );
async function aes(keyValue: ImportRecoveryKey): Promise<CryptoKey> {
  const raw = Uint8Array.from(atob(keyValue.keyBase64), (c) => c.charCodeAt(0));
  try {
    importCheck(raw.byteLength === 32);
    return await crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  } finally {
    raw.fill(0);
  }
}
export async function sealAdventureImportReview(
  review: ConfirmedReview,
  keyValue: ImportRecoveryKey,
): Promise<ProtectedReviewSnapshot> {
  const { review: normalized, start } = await describeConfirmedReview(review, keyValue.importId);
  importCheck(start.reviewHash === keyValue.reviewHash);
  const header = {
    schemaVersion: 1 as const,
    ownerId: keyValue.ownerId,
    importId: keyValue.importId,
    jobToken: keyValue.jobToken,
    keyId: keyValue.keyId,
    reviewHash: keyValue.reviewHash,
    sectionCount: review.sections.length,
  };
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad(header), tagLength: 128 },
    await aes(keyValue),
    new TextEncoder().encode(JSON.stringify(normalized)),
  );
  return { ...header, nonce, ciphertext };
}
export async function openAdventureImportReview(
  snapshot: ProtectedReviewSnapshot,
  keyValue: ImportRecoveryKey,
): Promise<ConfirmedReview> {
  importCheck(
    snapshot.ownerId === keyValue.ownerId &&
      snapshot.importId === keyValue.importId &&
      snapshot.jobToken === keyValue.jobToken &&
      snapshot.keyId === keyValue.keyId &&
      snapshot.reviewHash === keyValue.reviewHash,
  );
  validateProtectedReviewSnapshot(snapshot, keyValue.ownerId, keyValue.importId);
  const plain = await crypto.subtle.decrypt(
    {
      name: 'AES-GCM',
      iv: new Uint8Array(snapshot.nonce),
      additionalData: aad(snapshot),
      tagLength: 128,
    },
    await aes(keyValue),
    snapshot.ciphertext,
  );
  const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
  const review = normalizeConfirmedReview(value as ConfirmedReview);
  const described = await describeConfirmedReview(review, snapshot.importId);
  importCheck(
    described.start.reviewHash === snapshot.reviewHash &&
      review.sections.length === snapshot.sectionCount,
  );
  return review;
}
