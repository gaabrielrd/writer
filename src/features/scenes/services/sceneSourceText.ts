import { auth } from '@/shared/lib';
import type { SceneSource, SceneSourceListInput } from '../model/scene';
interface Manifest {
  schemaVersion: 1;
  bodyId: string;
  contentHash: string;
  byteLength: number;
  chunkCount: number;
}
export interface ExternalSceneSource extends Omit<SceneSource, 'content'> {
  content: null;
  contentStorage: unknown;
  sourceToken: string;
}
const invalid = () => new Error('Não foi possível conferir a fonte congelada.');
const hash = (v: unknown): v is string => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function manifest(value: unknown): Manifest {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
  const v = value as Record<string, unknown>;
  if (
    Object.keys(v).length !== 5 ||
    v.schemaVersion !== 1 ||
    !hash(v.bodyId) ||
    !hash(v.contentHash) ||
    !Number.isSafeInteger(v.byteLength) ||
    typeof v.byteLength !== 'number' ||
    v.byteLength < 1 ||
    v.byteLength > 8 * 1024 * 1024 ||
    v.chunkCount !== Math.ceil(v.byteLength / 65536)
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
export async function hydrateSceneSource(
  source: SceneSource | ExternalSceneSource,
  input: SceneSourceListInput,
  uid: string,
  call: (name: string, value: unknown) => Promise<unknown>,
): Promise<SceneSource> {
  const current = () => {
    if (auth.currentUser?.uid !== uid) throw new Error('A conta mudou. Reabra as fontes.');
  };
  current();
  if (typeof source.content === 'string') return source;
  if (
    source.content !== null ||
    !('contentStorage' in source) ||
    !hash(source.sourceToken) ||
    input.target.kind !== 'book'
  )
    throw invalid();
  if (
    !source.original ||
    typeof source.original !== 'object' ||
    Array.isArray(source.original) ||
    'content' in source.original ||
    'contentStorage' in source.original
  )
    throw invalid();
  const expected = manifest(source.contentStorage);
  if (expected.contentHash !== source.hash) throw invalid();
  const page = async (index: number) => {
    current();
    const value = await call('readSceneSourceText', {
      target: input.target,
      sourceId: source.id,
      expectedProjectRevision: input.expectedProjectRevision,
      sourceToken: source.sourceToken,
      index,
    });
    current();
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw invalid();
    const r = value as Record<string, unknown>,
      actual = manifest(r.manifest);
    if (
      Object.keys(r).length !== 6 ||
      r.sourceId !== source.id ||
      r.projectRevision !== input.expectedProjectRevision ||
      r.sourceToken !== source.sourceToken ||
      r.index !== index ||
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
    if (binary.length !== Math.min(65536, expected.byteLength - index * 65536)) throw invalid();
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
  };
  const first = await page(0),
    bytes = new Uint8Array(expected.byteLength);
  bytes.set(first);
  for (let start = 1; start < expected.chunkCount; start += 8) {
    const indexes = Array.from(
      { length: Math.min(8, expected.chunkCount - start) },
      (_, n) => start + n,
    );
    const parts = await Promise.all(indexes.map(page));
    parts.forEach((part, n) => bytes.set(part, indexes[n]! * 65536));
  }
  const actualHash = Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
    (byte) => byte.toString(16).padStart(2, '0'),
  ).join('');
  current();
  if (actualHash !== expected.contentHash) throw invalid();
  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    throw invalid();
  }
  const final = await page(0);
  if (final.some((byte, n) => byte !== first[n])) throw invalid();
  current();
  return { id: source.id, hash: source.hash, content, original: source.original };
}
