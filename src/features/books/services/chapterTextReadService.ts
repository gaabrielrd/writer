import { getFunctions } from 'firebase/functions';
import { httpsDomainCallable as httpsCallable } from '@/shared/api/domainCallable';
import { auth, getFirebaseApp } from '@/shared/lib';

interface TextManifest {
  schemaVersion: 1;
  bodyId: string;
  contentHash: string;
  byteLength: number;
  chunkCount: number;
}
const PART_BYTES = 65536;
const invalid = () => new Error('Não foi possível conferir o texto salvo do capítulo.');
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function manifest(value: unknown): TextManifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).length !== 5 ||
    v.schemaVersion !== 1 ||
    !hash(v.bodyId) ||
    !hash(v.contentHash) ||
    typeof v.byteLength !== 'number' ||
    !Number.isSafeInteger(v.byteLength) ||
    v.byteLength < 1 ||
    v.byteLength > 8 * 1024 * 1024 ||
    v.chunkCount !== Math.ceil(v.byteLength / PART_BYTES)
  )
    throw invalid();
  return {
    schemaVersion: 1,
    bodyId: v.bodyId,
    contentHash: v.contentHash,
    byteLength: v.byteLength,
    chunkCount: v.chunkCount,
  };
}
/** No cache or persistence: reauthorize every page and final confirmation. */
export async function readServerLegacyChapterText(
  bookId: string,
  chapterId: string,
  descriptor: unknown,
): Promise<string> {
  const uid = auth.currentUser?.uid;
  if (!uid) throw new Error('Entre na sua conta para ler o manuscrito.');
  const expected = manifest(descriptor);
  const assertOwner = () => {
    if (auth.currentUser?.uid !== uid) throw new Error('A conta mudou. Reabra o capítulo.');
  };
  const call = httpsCallable<unknown, unknown>(
    getFunctions(getFirebaseApp(), 'us-central1'),
    'readLegacyChapterText',
  );
  const page = async (index: number, sourceToken: string | null) => {
    assertOwner();
    const response = (
      await call({ bookId, chapterId, bodyId: expected.bodyId, index, sourceToken })
    ).data;
    assertOwner();
    if (!response || typeof response !== 'object' || Array.isArray(response)) throw invalid();
    const r = response as Record<string, unknown>,
      actual = manifest(r.manifest);
    if (
      Object.keys(r).length !== 6 ||
      r.bookId !== bookId ||
      r.chapterId !== chapterId ||
      r.index !== index ||
      !hash(r.sourceToken) ||
      (sourceToken !== null && r.sourceToken !== sourceToken) ||
      JSON.stringify(actual) !== JSON.stringify(expected) ||
      typeof r.chunkBase64 !== 'string' ||
      r.chunkBase64.length > 87384
    )
      throw invalid();
    let binary: string;
    try {
      binary = atob(r.chunkBase64);
      if (btoa(binary) !== r.chunkBase64) throw invalid();
    } catch {
      throw invalid();
    }
    if (binary.length !== Math.min(PART_BYTES, expected.byteLength - index * PART_BYTES))
      throw invalid();
    return { token: r.sourceToken, bytes: Uint8Array.from(binary, (c) => c.charCodeAt(0)) };
  };
  const first = await page(0, null),
    bytes = new Uint8Array(expected.byteLength);
  bytes.set(first.bytes);
  for (let start = 1; start < expected.chunkCount; start += 8) {
    const indexes = Array.from(
      { length: Math.min(8, expected.chunkCount - start) },
      (_, n) => start + n,
    );
    const parts = await Promise.all(indexes.map((index) => page(index, first.token)));
    parts.forEach((part, offset) => bytes.set(part.bytes, indexes[offset]! * PART_BYTES));
  }
  const actualHash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  assertOwner();
  if (actualHash !== expected.contentHash) throw invalid();
  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw invalid();
  }
  const final = await page(0, first.token);
  if (final.bytes.some((byte, index) => byte !== first.bytes[index])) throw invalid();
  assertOwner();
  return content;
}
