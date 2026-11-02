import { getFunctions, httpsCallable } from 'firebase/functions';
import { getFirebaseApp } from '@/shared/lib';
import { extractLoreDocument } from '@/features/document-import';
import {
  validateLoreImportFiles,
  type LoreImportExisting,
  type LoreImportReview,
  type LoreImportSubmission,
} from '../model/loreImport';

async function call<T>(name: string, input: unknown): Promise<T> {
  return (
    await httpsCallable<unknown, T>(getFunctions(getFirebaseApp(), 'us-central1'), name, {
      timeout: 120000,
    })(input)
  ).data;
}
const storageKey = (uid: string, universeId?: string) =>
  `writer:lore-import:${uid}:${universeId ?? 'new'}`;
export function getPendingLoreImport(uid: string, universeId?: string) {
  return sessionStorage.getItem(storageKey(uid, universeId));
}
export function clearPendingLoreImport(uid: string, universeId?: string) {
  sessionStorage.removeItem(storageKey(uid, universeId));
}
export function rememberLoreImport(uid: string, id: string, universeId?: string) {
  sessionStorage.setItem(storageKey(uid, universeId), id);
}
export const getLoreImport = (id: string) =>
  call<LoreImportReview>('getUniverseLoreImport', { id });
export const getLoreImportTarget = (id: string, targetId: string) =>
  call<LoreImportExisting>('getUniverseLoreImportTarget', { id, targetId });
export const advanceLoreImport = (id: string, cursor: number) =>
  call<LoreImportReview>('advanceUniverseLoreImport', { id, cursor });
export const saveLoreImportReview = (input: LoreImportSubmission) =>
  call('saveUniverseLoreImportReview', input);
export const applyLoreImport = (input: LoreImportSubmission) =>
  call<NonNullable<LoreImportReview['result']>>('applyUniverseLoreImport', input);
export const cancelLoreImport = (id: string) => call('cancelUniverseLoreImport', { id });
function base64(bytes: Uint8Array) {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
}
function sourceParts(pages: Array<{ page: number | null; text: string }>) {
  return pages.flatMap(({ page, text }) => {
    const parts: Array<{ page: number | null; text: string }> = [];
    for (let start = 0; start < text.length;) {
      let end = Math.min(start + 12000, text.length);
      if (end < text.length && /[\uD800-\uDBFF]/.test(text[end - 1] ?? '')) end--;
      const part = text.slice(start, end);
      if (part.trim()) parts.push({ page, text: part });
      if (end === text.length) break;
      start = end - 300;
      if (/[\uDC00-\uDFFF]/.test(text[start] ?? '')) start--;
    }
    return parts;
  });
}
export async function uploadLoreImport(input: {
  id: string;
  universeId?: string;
  files: File[];
  signal: AbortSignal;
  onProgress: (message: string) => void;
}) {
  validateLoreImportFiles(input.files);
  const sources: Array<Array<{ page: number | null; text: string }>> = [];
  for (const file of input.files) {
    input.signal.throwIfAborted();
    input.onProgress(`Extraindo ${file.name}…`);
    const pages = await extractLoreDocument(file, {
      signal: input.signal,
      onProgress: (current, total) =>
        input.onProgress(`Extraindo ${file.name}: página ${current} de ${total}`),
    });
    sources.push(sourceParts(pages));
  }
  input.signal.throwIfAborted();
  let review = await call<LoreImportReview>('startUniverseLoreImport', {
    id: input.id,
    universeId: input.universeId ?? null,
    files: input.files.map((file, index) => ({
      name: file.name,
      size: file.size,
      parts: sources[index]!.length,
    })),
  });
  if (review.state !== 'uploading') return review;
  for (const [index, file] of input.files.entries()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    for (let start = 0; start < bytes.length; start += 500000) {
      input.signal.throwIfAborted();
      input.onProgress(`Enviando ${file.name}: ${Math.round((start / bytes.length) * 100)}%`);
      await call('appendUniverseLoreImport', {
        id: input.id,
        kind: 'bytes',
        file: index,
        index: start / 500000,
        payload: base64(bytes.subarray(start, start + 500000)),
      });
    }
    for (const [partIndex, part] of sources[index]!.entries()) {
      input.signal.throwIfAborted();
      input.onProgress(
        `Preparando ${file.name}: trecho ${partIndex + 1} de ${sources[index]!.length}`,
      );
      await call('appendUniverseLoreImport', {
        id: input.id,
        kind: 'source',
        file: index,
        index: partIndex,
        payload: part.text,
        page: part.page,
      });
    }
  }
  input.signal.throwIfAborted();
  review = await call<LoreImportReview>('sealUniverseLoreImport', { id: input.id });
  return review;
}
