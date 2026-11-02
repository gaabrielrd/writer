import type { AdventureRestorePreparationIntent } from './adventureRestorePreparationContracts';
import {
  readAdventureRestoreRecoveryContext,
  type AdventureRestoreRecoveryContext,
  type AdventureRestoreRecoveryGrant,
} from './adventureRestoreRecoveryContracts';
import {
  readAdventureRestorePreparationIntent,
  adventurePreparationCheck as check,
} from './adventureRestorePreparationContracts';
export type AdventureRestorePreparationEnvelope = {
  schemaVersion: 1;
  context: AdventureRestoreRecoveryContext;
  stamp: string;
  nonce: string;
  ciphertext: string;
};
const keys = ['ownerId', 'restoreId', 'jobToken', 'adventureId', 'reviewHash', 'keyId'];
const closed = (v: unknown, names: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === names.length &&
  names.every((k) => Object.hasOwn(v, k));
const encode = (bytes: Uint8Array) => btoa(String.fromCharCode(...bytes));
function decode(value: unknown, minimum: number, maximum: number) {
  check(
    typeof value === 'string' &&
      value.length <= 4 * Math.ceil(maximum / 3) &&
      /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value),
  );
  const text = atob(value),
    bytes = Uint8Array.from(text, (c) => c.charCodeAt(0));
  check(bytes.length >= minimum && bytes.length <= maximum && encode(bytes) === value);
  return bytes;
}
export function readAdventureRestorePreparationEnvelope(
  raw: unknown,
  expected: AdventureRestoreRecoveryContext,
): AdventureRestorePreparationEnvelope {
  const context = readAdventureRestoreRecoveryContext(expected);
  check(
    closed(raw, ['schemaVersion', 'context', 'stamp', 'nonce', 'ciphertext']) &&
      raw.schemaVersion === 1,
  );
  const observed = raw.context;
  check(
    closed(observed, keys) &&
      Object.entries(context).every(([k, v]) => observed[k] === v) &&
      typeof raw.stamp === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(raw.stamp),
  );
  decode(raw.nonce, 12, 12);
  decode(raw.ciphertext, 17, 4112);
  return Object.freeze({
    schemaVersion: 1,
    context: Object.freeze(context),
    stamp: raw.stamp,
    nonce: raw.nonce as string,
    ciphertext: raw.ciphertext as string,
  });
}
export function sameAdventureRestorePreparationEnvelope(
  a: unknown,
  b: unknown,
  context: AdventureRestoreRecoveryContext,
) {
  if (a === null || b === null) return a === b;
  return (
    JSON.stringify(readAdventureRestorePreparationEnvelope(a, context)) ===
    JSON.stringify(readAdventureRestorePreparationEnvelope(b, context))
  );
}
export function sameAdventureRestorePreparationIntent(
  a: AdventureRestorePreparationIntent,
  b: AdventureRestorePreparationIntent,
  context: AdventureRestoreRecoveryContext,
) {
  return (
    JSON.stringify(readAdventureRestorePreparationIntent(a, context)) ===
    JSON.stringify(readAdventureRestorePreparationIntent(b, context))
  );
}
function grantedKey(
  grant: AdventureRestoreRecoveryGrant,
  context: AdventureRestoreRecoveryContext,
): CryptoKey {
  check(
    grant &&
      Object.entries(context).every(
        ([k, v]) => grant[k as keyof AdventureRestoreRecoveryContext] === v,
      ),
  );
  const key = grant.key;
  check(
    key?.type === 'secret' &&
      !key.extractable &&
      key.algorithm.name === 'AES-GCM' &&
      (key.algorithm as AesKeyAlgorithm).length === 256 &&
      key.usages.includes('encrypt') &&
      key.usages.includes('decrypt'),
  );
  return key;
}
const aad = (context: AdventureRestoreRecoveryContext, stamp: string) =>
  new TextEncoder().encode(
    JSON.stringify([
      'writer-adventure-restore-preparation',
      1,
      context.ownerId,
      context.restoreId,
      context.jobToken,
      context.adventureId,
      context.reviewHash,
      context.keyId,
      stamp,
    ]),
  );
export async function sealAdventureRestorePreparationIntent(
  expected: AdventureRestoreRecoveryContext,
  grant: AdventureRestoreRecoveryGrant,
  pending: AdventureRestorePreparationIntent,
  guard: () => void,
): Promise<AdventureRestorePreparationEnvelope> {
  guard();
  const context = Object.freeze(readAdventureRestoreRecoveryContext(expected)),
    intent = readAdventureRestorePreparationIntent(pending, context),
    key = grantedKey(grant, context),
    bytes = new TextEncoder().encode(JSON.stringify(intent)),
    stamp = crypto.randomUUID(),
    nonce = crypto.getRandomValues(new Uint8Array(12));
  check(bytes.byteLength <= 4096);
  try {
    const encrypted = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv: nonce, additionalData: aad(context, stamp), tagLength: 128 },
      key,
      bytes,
    );
    guard();
    return readAdventureRestorePreparationEnvelope(
      {
        schemaVersion: 1,
        context,
        stamp,
        nonce: encode(nonce),
        ciphertext: encode(new Uint8Array(encrypted)),
      },
      context,
    );
  } finally {
    bytes.fill(0);
  }
}
export async function openAdventureRestorePreparationIntent(
  expected: AdventureRestoreRecoveryContext,
  grant: AdventureRestoreRecoveryGrant,
  raw: unknown,
  guard: () => void,
): Promise<AdventureRestorePreparationIntent> {
  guard();
  const context = Object.freeze(readAdventureRestoreRecoveryContext(expected)),
    envelope = readAdventureRestorePreparationEnvelope(raw, context),
    key = grantedKey(grant, context),
    plaintext = await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: decode(envelope.nonce, 12, 12),
        additionalData: aad(context, envelope.stamp),
        tagLength: 128,
      },
      key,
      decode(envelope.ciphertext, 17, 4112),
    );
  const bytes = new Uint8Array(plaintext);
  try {
    guard();
    check(bytes.byteLength <= 4096);
    let value: unknown;
    try {
      value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)) as unknown;
    } catch {
      check(false);
    }
    return readAdventureRestorePreparationIntent(value, context);
  } finally {
    bytes.fill(0);
  }
}
