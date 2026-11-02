import {
  readAdventureRestoreRecoveryRequest,
  readAdventureRestoreRecoveryContext,
  recoveryCheck as check,
  recoveryObject as object,
  type AdventureRestoreRecoveryRequest,
  type AdventureRestoreRecoveryGrant,
} from './adventureRestoreRecoveryContracts';

const statuses: Readonly<Record<string, number>> = {
  'invalid-argument': 400,
  unauthenticated: 401,
  'permission-denied': 403,
  'not-found': 404,
  'failed-precondition': 412,
  'resource-exhausted': 429,
  unavailable: 503,
};
const reasons = new Set([
  'invalid-input',
  'invalid-id',
  'invalid-hash',
  'payload-too-large',
  'auth-required',
  'app-check-required',
  'restore-unavailable',
  'state-conflict',
  'identity-conflict',
  'review-mismatch',
  'recovery-key-unavailable',
  'key-mismatch',
  'temporary-unavailable',
]);

async function readJSON(response: Response, guard: () => void): Promise<unknown> {
  check(
    /^application\/json(?:\s*;|$)/i.test(response.headers.get('content-type') ?? '') &&
      response.body,
  );
  const reader = response.body.getReader(),
    parts: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      guard();
      const next = await reader.read();
      if (!next.done) parts.push(next.value);
      guard();
      if (next.done) break;
      size += next.value.byteLength;
      check(size <= 8192);
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

/** Reauthorize on every call. Key bytes never become part of the returned grant. */
export async function getAdventureRestoreRecoveryGrant(
  expected: AdventureRestoreRecoveryRequest,
  guard: () => void,
): Promise<AdventureRestoreRecoveryGrant> {
  guard();
  const request = readAdventureRestoreRecoveryRequest(expected);
  const [{ getToken }, { auth, appCheck }] = await Promise.all([
    import('firebase/app-check'),
    import('@/shared/lib'),
  ]);
  guard();
  check(auth.currentUser?.uid === request.ownerId && appCheck);
  const active = () => {
      guard();
      check(auth.currentUser?.uid === request.ownerId);
    },
    user = auth.currentUser;
  check(user);
  const idToken = await user.getIdToken();
  active();
  check(typeof idToken === 'string' && idToken);
  const appToken = await getToken(appCheck);
  active();
  check(typeof appToken.token === 'string' && appToken.token);
  const response = await fetch('/api/adventure-restore/recovery-key', {
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
      restoreId: request.restoreId,
      jobToken: request.jobToken,
      reviewHash: request.reviewHash,
      ...(request.keyId === undefined ? {} : { expectedKeyId: request.keyId }),
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
        Object.hasOwn(statuses, code) &&
        statuses[code] === response.status &&
        typeof details.reason === 'string' &&
        reasons.has(details.reason),
    );
    throw Object.assign(
      new Error('Não foi possível autorizar a recuperação protegida. Seus dados foram mantidos.'),
      { code, details: { reason: details.reason } },
    );
  }
  check(
    object(raw, ['data']) &&
      object(raw.data, [
        'schemaVersion',
        'ownerId',
        'restoreId',
        'adventureId',
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
      Object.entries(request).every(([field, expectedValue]) => value[field] === expectedValue) &&
      typeof value.keyBase64 === 'string' &&
      /^[A-Za-z0-9+/]{43}=$/.test(value.keyBase64),
  );
  const context = readAdventureRestoreRecoveryContext({
    ownerId: value.ownerId,
    restoreId: value.restoreId,
    adventureId: value.adventureId,
    jobToken: value.jobToken,
    reviewHash: value.reviewHash,
    keyId: value.keyId,
  });
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
