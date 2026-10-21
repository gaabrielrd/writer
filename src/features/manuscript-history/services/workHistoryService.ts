import { renderRichText } from '@/shared/lib';
import {
  sameVersionTarget,
  workHistoryHash,
  type CompleteWorkVersion,
  type VersionSummary,
  type VersionTarget,
  type WorkHistoryBackup,
  type WorkHistoryBackupSource,
} from '../model/workHistory';
import {
  getWorkHistoryBackupSource,
  listWorkVersions,
  readWorkVersion,
} from './workHistoryCallables';
export * from './workHistoryCallables';

function invalidBody(): never {
  throw new Error('Não foi possível verificar esta versão. Reabra o histórico antes de continuar.');
}
function summaryIdentity(version: VersionSummary): string {
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
/** Only a fully reconstructed, verified and still-authorized body leaves this service. */
export async function readCompleteWorkVersion(
  input: { target: VersionTarget; versionId: string; expectedHistoryToken?: string },
  isCurrent: () => boolean = () => true,
): Promise<CompleteWorkVersion | null> {
  let version: VersionSummary | undefined;
  let cursor: string | null = null;
  let index = 0;
  const parts: string[] = [];
  while (isCurrent()) {
    const page = await readWorkVersion({ ...input, cursor, limit: 4 });
    if (!isCurrent()) return null;
    if (
      !page ||
      !page.version ||
      page.version.id !== input.versionId ||
      !sameVersionTarget(page.version.target, input.target) ||
      !Array.isArray(page.chunks) ||
      page.chunks.length > 8
    )
      invalidBody();
    if (version && summaryIdentity(version) !== summaryIdentity(page.version)) invalidBody();
    version = page.version;
    if (
      !Number.isSafeInteger(version.chunkCount) ||
      version.chunkCount < 0 ||
      !Number.isSafeInteger(version.byteLength) ||
      version.byteLength < 0 ||
      !/^[a-f0-9]{64}$/.test(version.contentHash)
    )
      invalidBody();
    for (const chunk of page.chunks) {
      if (
        chunk.index !== index ||
        typeof chunk.content !== 'string' ||
        new TextEncoder().encode(chunk.content).byteLength > 65_536 ||
        index >= version.chunkCount
      )
        invalidBody();
      parts.push(chunk.content);
      index++;
    }
    if (page.nextCursor === null) {
      if (index !== version.chunkCount) invalidBody();
      const content = parts.join('');
      if (new TextEncoder().encode(content).byteLength !== version.byteLength) invalidBody();
      const hash = await workHistoryHash(content);
      if (!isCurrent()) return null;
      if (hash !== version.contentHash) invalidBody();
      return { version, content };
    }
    if (
      typeof page.nextCursor !== 'string' ||
      !page.nextCursor ||
      page.nextCursor === cursor ||
      !page.chunks.length
    )
      invalidBody();
    cursor = page.nextCursor;
  }
  return null;
}

export async function copyWorkVersionText(content: string): Promise<void> {
  const document = new DOMParser().parseFromString(renderRichText(content), 'text/html');
  document.querySelectorAll('br').forEach((element) => element.replaceWith('\n'));
  document
    .querySelectorAll('p,div,blockquote,li,h1,h2,h3,h4,h5,h6,pre')
    .forEach((element) => element.append('\n'));
  await navigator.clipboard.writeText(
    (document.body.textContent ?? '').replace(/\n{3,}/g, '\n\n').trim(),
  );
}

function invalidBackup(): never {
  throw new Error('Não foi possível conferir o histórico completo. Faça um novo backup.');
}
function closedBackupValue(value: unknown, keys: string[]): value is Record<string, unknown> {
  return Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key)),
  );
}
function backupSource(value: unknown): WorkHistoryBackupSource {
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
function validBackupId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    !value.includes('/') &&
    value !== '.' &&
    value !== '..' &&
    new TextEncoder().encode(value).byteLength <= 1500
  );
}
function backupSummary(value: unknown, target: VersionTarget): VersionSummary {
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
/** All project versions, including removed resources; no partial result or origin token in the file. */
export async function captureWorkHistoryBackup(
  target: VersionTarget,
  isCurrent: () => boolean = () => true,
): Promise<WorkHistoryBackup | null> {
  if (!isCurrent()) return null;
  const observed = await getWorkHistoryBackupSource({ target });
  if (!isCurrent()) return null;
  const source = backupSource(observed);
  const ids = new Set<string>(),
    cursors = new Set<string>();
  const versions: CompleteWorkVersion[] = [];
  let cursor: string | null = null;
  do {
    if (!isCurrent()) return null;
    const page = await listWorkVersions({
      target,
      cursor,
      limit: 50,
      expectedHistoryToken: source.sourceToken,
    });
    if (!isCurrent()) return null;
    if (
      !closedBackupValue(page, ['items', 'nextCursor']) ||
      !Array.isArray(page.items) ||
      page.items.length > 50
    )
      invalidBackup();
    for (const row of page.items) {
      const summary = backupSummary(row, target),
        identity = summaryIdentity(summary);
      if (ids.has(summary.id)) invalidBackup();
      ids.add(summary.id);
      const complete = await readCompleteWorkVersion(
        { target, versionId: summary.id, expectedHistoryToken: source.sourceToken },
        isCurrent,
      );
      if (!isCurrent() || !complete) return null;
      const confirmed = backupSummary(complete.version, target);
      if (summaryIdentity(confirmed) !== identity) invalidBackup();
      versions.push({ version: confirmed, content: complete.content });
    }
    const next = page.nextCursor;
    if (
      next !== null &&
      (typeof next !== 'string' || !next || cursors.has(next) || !page.items.length)
    )
      invalidBackup();
    cursor = next;
    if (cursor) cursors.add(cursor);
  } while (cursor);
  if (!isCurrent()) return null;
  const final = await getWorkHistoryBackupSource({ target });
  if (!isCurrent()) return null;
  const current = backupSource(final);
  if (
    current.sourceToken !== source.sourceToken ||
    current.historyRevision !== source.historyRevision
  )
    invalidBackup();
  return { schemaVersion: 1, versions };
}
