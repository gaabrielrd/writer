import type { BookRestoreIdentity } from '../model/bookRestorePreparation';
import {
  readBookRestoreIdentity,
  restorePreparationCheck as check,
} from './bookRestorePreparationContracts';
export type BookRestoreRecoveryContext = BookRestoreIdentity & {
  reviewHash: string;
  keyId: string;
};
export type BookRestoreRecoveryGrant = BookRestoreRecoveryContext & { key: CryptoKey };
export function readBookRestoreRecoveryContext(
  value: BookRestoreRecoveryContext,
): BookRestoreRecoveryContext {
  const identity = readBookRestoreIdentity(value);
  check(
    typeof value.reviewHash === 'string' &&
      /^[a-f0-9]{64}$/.test(value.reviewHash) &&
      typeof value.keyId === 'string' &&
      /^[a-f0-9]{64}$/.test(value.keyId),
  );
  return { ...identity, reviewHash: value.reviewHash, keyId: value.keyId };
}
const object = (value: unknown, keys: string[]): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  keys.every((k) => Object.hasOwn(value, k));
async function readJSON(response: Response, guard: () => void): Promise<unknown> {
  check(
    response.headers.get('content-type')?.toLowerCase().includes('application/json') &&
      response.body,
  );
  const reader = response.body.getReader(),
    parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      guard();
      const next = await reader.read();
      guard();
      if (next.done) break;
      size += next.value.byteLength;
      check(size <= 8192);
      parts.push(next.value);
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.byteLength;
    }
    try {
      return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch {
      check(false);
    } finally {
      bytes.fill(0);
    }
  } finally {
    await reader.cancel().catch(() => {});
    reader.releaseLock();
    for (const part of parts) part.fill(0);
  }
}
export async function getBookRestoreRecoveryGrant(
  expected: BookRestoreRecoveryContext,
  guard: () => void,
): Promise<BookRestoreRecoveryGrant> {
  guard();
  const context = Object.freeze(readBookRestoreRecoveryContext(expected));
  const [{ getToken }, { auth, appCheck }] = await Promise.all([
    import('firebase/app-check'),
    import('@/shared/lib'),
  ]);
  guard();
  check(auth.currentUser?.uid === context.ownerId && appCheck);
  const active = () => {
      guard();
      check(auth.currentUser?.uid === context.ownerId);
    },
    user = auth.currentUser;
  check(user);
  const idToken = await user.getIdToken();
  active();
  check(typeof idToken === 'string' && idToken);
  const appToken = await getToken(appCheck);
  active();
  check(typeof appToken.token === 'string' && appToken.token);
  const response = await fetch('/api/book-restore/recovery-key', {
    method: 'POST',
    credentials: 'omit',
    cache: 'no-store',
    redirect: 'error',
    headers: {
      'Content-Type': 'text/plain;charset=UTF-8',
      Authorization: 'Bearer ' + idToken,
      'X-Firebase-AppCheck': appToken.token,
    },
    body: JSON.stringify({
      restoreId: context.restoreId,
      jobToken: context.jobToken,
      reviewHash: context.reviewHash,
      expectedKeyId: context.keyId,
    }),
  });
  active();
  const raw = await readJSON(response, active);
  active();
  if (!response.ok) {
    check(
      object(raw, ['error']) &&
        object(raw.error, ['code', 'message', 'details']) &&
        object(raw.error.details, ['reason']),
    );
    const { code, details } = raw.error;
    check(
      typeof code === 'string' &&
        [
          'invalid-argument',
          'unauthenticated',
          'permission-denied',
          'not-found',
          'failed-precondition',
          'resource-exhausted',
          'unavailable',
        ].includes(code) &&
        typeof details.reason === 'string' &&
        /^[a-z][a-z0-9-]{0,79}$/.test(details.reason),
    );
    throw Object.assign(
      new Error('Não foi possível autorizar a cópia protegida. Seus dados foram mantidos.'),
      { code, details: { reason: details.reason } },
    );
  }
  check(
    object(raw, ['data']) &&
      object(raw.data, [
        'schemaVersion',
        'ownerId',
        'restoreId',
        'bookId',
        'jobToken',
        'reviewHash',
        'keyId',
        'algorithm',
        'keyBase64',
      ]),
  );
  const value = raw.data;
  check(
    value.schemaVersion === 1 &&
      value.algorithm === 'AES-GCM' &&
      Object.entries(context).every(([k, v]) => value[k] === v) &&
      typeof value.keyBase64 === 'string' &&
      /^[A-Za-z0-9+/]{43}=$/.test(value.keyBase64),
  );
  const encoded = value.keyBase64,
    decoded = atob(encoded);
  check(decoded.length === 32 && btoa(decoded) === encoded);
  const bytes = Uint8Array.from(decoded, (c) => c.charCodeAt(0));
  try {
    const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
      'encrypt',
      'decrypt',
    ]);
    active();
    return Object.freeze({ ...context, key });
  } finally {
    bytes.fill(0);
  }
}
