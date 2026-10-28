export type AdventureRestoreRecoveryIdentity = Readonly<{
  ownerId: string;
  restoreId: string;
  adventureId: string;
  jobToken: string;
  reviewHash: string;
}>;
export type AdventureRestoreRecoveryContext = AdventureRestoreRecoveryIdentity &
  Readonly<{ keyId: string }>;
export type AdventureRestoreRecoveryRequest = AdventureRestoreRecoveryIdentity &
  Readonly<{ keyId?: string }>;
export type AdventureRestoreRecoveryGrant = AdventureRestoreRecoveryContext &
  Readonly<{ key: CryptoKey }>;

export class AdventureRestoreRecoveryError extends Error {
  readonly code = 'adventure-restore-recovery-invalid';
  constructor() {
    super(
      'Não foi possível autorizar a recuperação protegida da aventura. Seus dados foram mantidos.',
    );
    this.name = 'AdventureRestoreRecoveryError';
  }
}
export function recoveryCheck(condition: unknown): asserts condition {
  if (!condition) throw new AdventureRestoreRecoveryError();
}
export function recoveryObject(
  value: unknown,
  keys: readonly string[],
  optional: readonly string[] = [],
): value is Record<string, unknown> {
  return (
    !!value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    keys.every((key) => Object.hasOwn(value, key)) &&
    Object.keys(value).every((key) => keys.includes(key) || optional.includes(key))
  );
}
export const recoveryHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const recoveryOperationId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9-]{16,80}$/.test(value);
export const recoveryOwner = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= 128 &&
  new TextDecoder('utf-8', { ignoreBOM: true }).decode(new TextEncoder().encode(value)) === value &&
  !['.', '..'].includes(value) &&
  ![...value].some(
    (c) => c === '/' || c === '\\' || c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
  );

export function readAdventureRestoreRecoveryRequest(raw: unknown): AdventureRestoreRecoveryRequest {
  recoveryCheck(
    recoveryObject(
      raw,
      ['ownerId', 'restoreId', 'adventureId', 'jobToken', 'reviewHash'],
      ['keyId'],
    ) &&
      recoveryOwner(raw.ownerId) &&
      recoveryOperationId(raw.restoreId) &&
      recoveryOperationId(raw.adventureId) &&
      recoveryHash(raw.jobToken) &&
      recoveryHash(raw.reviewHash) &&
      (!Object.hasOwn(raw, 'keyId') || recoveryHash(raw.keyId)),
  );
  return Object.freeze({
    ownerId: raw.ownerId,
    restoreId: raw.restoreId,
    adventureId: raw.adventureId,
    jobToken: raw.jobToken,
    reviewHash: raw.reviewHash,
    ...(Object.hasOwn(raw, 'keyId') ? { keyId: raw.keyId as string } : {}),
  });
}
export function readAdventureRestoreRecoveryContext(raw: unknown): AdventureRestoreRecoveryContext {
  const request = readAdventureRestoreRecoveryRequest(raw);
  recoveryCheck(recoveryHash(request.keyId));
  return Object.freeze({ ...request, keyId: request.keyId });
}
