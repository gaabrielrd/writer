import {
  summaryIdentity,
  invalidBackup,
  closedBackupValue,
  backupSource,
  backupSummary,
} from '../model/historyBackupContracts';
import { renderRichText } from '@/shared/lib';
import {
  sameVersionTarget,
  workHistoryHash,
  type CompleteWorkVersion,
  type VersionSummary,
  type VersionTarget,
  type WorkHistoryBackup,
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
