import { renderRichText } from '@/shared/lib';
import {
  sameVersionTarget,
  workHistoryHash,
  type CompleteWorkVersion,
  type VersionSummary,
  type VersionTarget,
} from '../model/workHistory';
import { readWorkVersion } from './workHistoryCallables';
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
  input: { target: VersionTarget; versionId: string },
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
