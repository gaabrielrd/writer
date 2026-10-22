import type { VersionSummary, VersionTarget, WorkHistoryBackupSource } from './workHistory';

export function summaryIdentity(version: VersionSummary): string {
  return JSON.stringify([
    version.id,
    version.target.kind,
    version.target.id,
    version.resource.kind,
    version.resource.id,
    version.createdAt,
    version.reason,
    version.label,
    version.wordCount,
    version.byteLength,
    version.contentHash,
    version.chunkCount,
  ]);
}
export function invalidBackup(): never {
  throw new Error('Não foi possível conferir o histórico completo. Faça um novo backup.');
}
export function closedBackupValue(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key)),
  );
}
export function backupSource(value: unknown): WorkHistoryBackupSource {
  if (
    !closedBackupValue(value, ['schemaVersion', 'historyRevision', 'sourceToken']) ||
    value.schemaVersion !== 1 ||
    typeof value.historyRevision !== 'number' ||
    !Number.isSafeInteger(value.historyRevision) ||
    value.historyRevision < 0 ||
    typeof value.sourceToken !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.sourceToken)
  )
    invalidBackup();
  return value as unknown as WorkHistoryBackupSource;
}
export function validBackupId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('/') &&
    value !== '.' &&
    value !== '..' &&
    new TextEncoder().encode(value).byteLength <= 1500
  );
}
export function backupSummary(value: unknown, target: VersionTarget): VersionSummary {
  if (
    !closedBackupValue(value, [
      'id',
      'target',
      'resource',
      'createdAt',
      'reason',
      'label',
      'wordCount',
      'byteLength',
      'contentHash',
      'chunkCount',
    ]) ||
    !validBackupId(value.id) ||
    !closedBackupValue(value.target, ['kind', 'id']) ||
    value.target.kind !== target.kind ||
    value.target.id !== target.id ||
    !closedBackupValue(value.resource, ['kind', 'id']) ||
    !validBackupId(value.resource.id) ||
    !(
      value.resource.kind === 'scene' ||
      (target.kind === 'book' && value.resource.kind === 'chapter') ||
      (target.kind === 'adventure' && value.resource.kind === 'block')
    ) ||
    typeof value.createdAt !== 'number' ||
    !Number.isSafeInteger(value.createdAt) ||
    value.createdAt < 0 ||
    value.createdAt > 8_640_000_000_000_000 ||
    !(value.reason === 'manual' || value.reason === 'before-restore') ||
    !(value.label === null || (typeof value.label === 'string' && value.label.length <= 300)) ||
    !['wordCount', 'byteLength', 'chunkCount'].every(
      (key) =>
        typeof value[key] === 'number' && Number.isSafeInteger(value[key]) && value[key] >= 0,
    ) ||
    (value.chunkCount as number) < 1 ||
    typeof value.contentHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.contentHash)
  )
    invalidBackup();
  return value as unknown as VersionSummary;
}
