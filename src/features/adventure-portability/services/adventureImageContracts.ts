import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  closed,
  matches,
  validHash,
  validCount,
  validId,
  type AdventureInventorySource,
} from './adventureInventoryContracts';
export type AdventureImageMethod =
  | 'getAdventureBackupSource'
  | 'listAdventureBackupImageBindings'
  | 'getAdventureBackupImage'
  | 'readAdventureBackupImageChunk'
  | 'verifyAdventureBackupImage';
export interface AdventureImageApi {
  call(method: AdventureImageMethod, input: Readonly<Record<string, unknown>>): Promise<unknown>;
}
export interface AdventureImageOptions {
  guard: () => void;
  signal?: AbortSignal;
  source?: AdventureInventorySource;
}
export interface AdventureImageProof {
  readonly validation: 'images-data-only';
  readonly source: AdventureInventorySource;
  readonly bindings: number;
  readonly assets: number;
  readonly bytes: number;
  readonly digest: string;
  readonly sourceDigest: string;
}
export interface AdventureImageMetadata {
  kind: 'library';
  imageId: string;
  alt: string;
  caption: string;
  name?: string;
  createdAt?: number;
  updatedAt?: number;
  contentType: 'image/png';
  byteLength: number;
  chunkCount: number;
  contentHash: string;
}
export class AdventureImageError extends Error {
  readonly code = 'adventure-backup-invalid-images';
  constructor() {
    super('Não foi possível conferir as imagens da aventura. Faça um novo backup.');
    this.name = 'AdventureImageError';
  }
}
export function imageInvalid(): never {
  throw new AdventureImageError();
}
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const text = (v: unknown, max: number): v is string =>
  typeof v === 'string' && v.length <= max && decoder.decode(encoder.encode(v)) === v;
export function imageMetadata(
  raw: unknown,
  anchor: AdventureInventorySource,
  imageId: string | null,
) {
  if (
    !closed(raw, ['schemaVersion', 'adventureId', 'sourceToken', 'imageToken', 'image']) ||
    !matches(raw, anchor) ||
    !validHash(raw.imageToken)
  )
    imageInvalid();
  const v = raw.image;
  if (imageId === null) {
    if (!closed(v, ['kind']) || v.kind !== 'none') imageInvalid();
    return { imageToken: raw.imageToken, image: null };
  }
  if (!v || typeof v !== 'object' || Array.isArray(v)) imageInvalid();
  const optional = ['name', 'createdAt', 'updatedAt'].filter((k) => Object.hasOwn(v, k));
  if (
    !closed(v, [
      'kind',
      'imageId',
      'alt',
      'caption',
      'contentType',
      'byteLength',
      'chunkCount',
      'contentHash',
      ...optional,
    ]) ||
    v.kind !== 'library' ||
    v.imageId !== imageId ||
    !validId(v.imageId) ||
    !text(v.alt, 1000) ||
    !text(v.caption, 4000) ||
    (Object.hasOwn(v, 'name') && !text(v.name, 300)) ||
    ['createdAt', 'updatedAt'].some((k) => Object.hasOwn(v, k) && !validCount(v[k])) ||
    v.contentType !== 'image/png' ||
    !validCount(v.byteLength) ||
    v.byteLength < 8 ||
    v.byteLength > 16 * 1024 * 1024 ||
    !validCount(v.chunkCount) ||
    v.chunkCount !== Math.ceil(v.byteLength / 65536) ||
    !validHash(v.contentHash)
  )
    imageInvalid();
  const image: AdventureImageMetadata = {
    kind: 'library',
    imageId: v.imageId,
    alt: v.alt,
    caption: v.caption,
    contentType: 'image/png',
    byteLength: v.byteLength,
    chunkCount: v.chunkCount,
    contentHash: v.contentHash,
    ...(typeof v.name === 'string' ? { name: v.name } : {}),
    ...(typeof v.createdAt === 'number' ? { createdAt: v.createdAt } : {}),
    ...(typeof v.updatedAt === 'number' ? { updatedAt: v.updatedAt } : {}),
  };
  return { imageToken: raw.imageToken, image: Object.freeze(image) };
}
export function imagePart(
  raw: unknown,
  anchor: AdventureInventorySource,
  imageToken: string,
  index: number,
  metadata: AdventureImageMetadata,
) {
  if (
    !closed(raw, [
      'schemaVersion',
      'adventureId',
      'sourceToken',
      'imageToken',
      'index',
      'chunkBase64',
      'chunkHash',
    ]) ||
    !matches(raw, anchor) ||
    raw.imageToken !== imageToken ||
    raw.index !== index ||
    !validHash(raw.chunkHash) ||
    typeof raw.chunkBase64 !== 'string' ||
    raw.chunkBase64.length > 87384 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.chunkBase64)
  )
    imageInvalid();
  const binary = atob(raw.chunkBase64);
  if (btoa(binary) !== raw.chunkBase64) imageInvalid();
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (
    bytes.length !== Math.min(65536, metadata.byteLength - index * 65536) ||
    bytesToHex(sha256(bytes)) !== raw.chunkHash ||
    (index === 0 && bytesToHex(bytes.subarray(0, 8)) !== '89504e470d0a1a0a')
  )
    imageInvalid();
  return bytes;
}
