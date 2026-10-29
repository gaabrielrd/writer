import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { asyncRecordStream } from '@/shared/streams';
import {
  CAMPAIGN_IMAGE_LIMITS as LIMITS,
  CAMPAIGN_IMAGE_PNG_SIGNATURE as PNG,
} from '../../../../functions/src/campaignBackupImageDefinitions.mjs';
import { closed, validHash, validId, validCount } from './campaignOwnContracts';
export interface CampaignImageRef {
  readonly campaignId: string;
  readonly sourceToken: string;
  readonly derivedToken: string;
  readonly baseId: string;
  readonly id: string;
  readonly resourceToken: string;
}
export type CampaignImageMethod =
  'getCampaignBackupImage' | 'readCampaignBackupImageChunk' | 'verifyCampaignBackupImage';
export interface CampaignImageApi {
  call(method: CampaignImageMethod, input: Readonly<Record<string, unknown>>): Promise<unknown>;
}
export interface CampaignImageChunk {
  readonly id: string;
  readonly index: number;
  readonly payload: Uint8Array;
}
export type CampaignImageProof =
  | Readonly<{ validation: 'image-unavailable'; reference: CampaignImageRef }>
  | Readonly<{
      validation: 'frozen-image-bytes-only';
      reference: CampaignImageRef;
      byteLength: number;
      chunkCount: number;
      contentHash: string;
    }>;
export class CampaignImageCaptureError extends Error {
  readonly code = 'campaign-backup-invalid-image';
  constructor() {
    super('Não foi possível conferir a imagem congelada. Faça um novo backup.');
    this.name = 'CampaignImageCaptureError';
  }
}
function invalid(): never {
  throw new CampaignImageCaptureError();
}
const refKeys = ['campaignId', 'sourceToken', 'derivedToken', 'baseId', 'id', 'resourceToken'];
const commonKeys = ['schemaVersion', ...refKeys];
function reference(raw: CampaignImageRef): CampaignImageRef {
  if (
    !closed(raw, refKeys) ||
    !validId(raw.campaignId) ||
    !['sourceToken', 'derivedToken', 'baseId', 'id', 'resourceToken'].every((k) =>
      validHash(raw[k]),
    )
  )
    invalid();
  return Object.freeze({
    campaignId: raw.campaignId,
    sourceToken: raw.sourceToken,
    derivedToken: raw.derivedToken,
    baseId: raw.baseId,
    id: raw.id,
    resourceToken: raw.resourceToken,
  });
}
const common = (raw: Record<string, unknown>, ref: CampaignImageRef) =>
  raw.schemaVersion === 1 && refKeys.every((k) => raw[k] === ref[k as keyof CampaignImageRef]);
function manifest(raw: unknown, ref: CampaignImageRef) {
  if (closed(raw, [...commonKeys, 'outcome']) && common(raw, ref) && raw.outcome === 'unavailable')
    return null;
  if (
    !closed(raw, [
      ...commonKeys,
      'outcome',
      'imageToken',
      'contentType',
      'byteLength',
      'chunkCount',
      'contentHash',
    ]) ||
    !common(raw, ref) ||
    raw.outcome !== 'available' ||
    !validHash(raw.imageToken) ||
    raw.contentType !== 'image/png' ||
    !validHash(raw.contentHash) ||
    !validCount(raw.byteLength) ||
    raw.byteLength < 8 ||
    raw.byteLength > LIMITS.imageBytes ||
    raw.chunkCount !== Math.ceil(raw.byteLength / LIMITS.chunkBytes)
  )
    invalid();
  return Object.freeze({
    imageToken: raw.imageToken,
    byteLength: raw.byteLength,
    chunkCount: raw.chunkCount,
    contentHash: raw.contentHash,
  });
}
type Manifest = NonNullable<ReturnType<typeof manifest>>;
function part(raw: unknown, ref: CampaignImageRef, m: Manifest, index: number) {
  if (
    !closed(raw, [
      ...commonKeys,
      'imageToken',
      'index',
      'byteLength',
      'chunkCount',
      'chunkBase64',
      'chunkHash',
    ]) ||
    !common(raw, ref) ||
    raw.imageToken !== m.imageToken ||
    raw.index !== index ||
    raw.byteLength !== m.byteLength ||
    raw.chunkCount !== m.chunkCount ||
    !validHash(raw.chunkHash) ||
    typeof raw.chunkBase64 !== 'string' ||
    raw.chunkBase64.length > 87384 ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(raw.chunkBase64)
  )
    invalid();
  let binary: string;
  try {
    binary = atob(raw.chunkBase64);
  } catch {
    invalid();
  }
  if (
    btoa(binary) !== raw.chunkBase64 ||
    binary.length !== Math.min(LIMITS.chunkBytes, m.byteLength - index * LIMITS.chunkBytes)
  )
    invalid();
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (
    bytesToHex(sha256(bytes)) !== raw.chunkHash ||
    (index === 0 && bytesToHex(bytes.subarray(0, 8)) !== PNG)
  )
    invalid();
  return bytes;
}
/** Provisional image bytes; natural completion verifies state again, not the whole campaign archive. */
export function streamCampaignImage(
  input: CampaignImageRef,
  api: CampaignImageApi,
  options: { guard: () => void; signal?: AbortSignal },
): AsyncGenerator<CampaignImageChunk, CampaignImageProof | undefined, void> {
  const ref = reference(input);
  if (typeof api?.call !== 'function' || typeof options?.guard !== 'function') invalid();
  const invoke = api.call.bind(api),
    guard = options.guard,
    signal = options.signal;
  return asyncRecordStream(
    async (write, activeSignal) => {
      const check = () => {
          guard();
          signal?.throwIfAborted();
          activeSignal.throwIfAborted();
        },
        call = async (method: CampaignImageMethod, input: Readonly<Record<string, unknown>>) => {
          check();
          const raw = await invoke(method, Object.freeze({ ...input }));
          check();
          return raw;
        };
      const request = {
          campaignId: ref.campaignId,
          sourceToken: ref.sourceToken,
          derivedToken: ref.derivedToken,
          id: ref.id,
          resourceToken: ref.resourceToken,
        },
        m = manifest(await call('getCampaignBackupImage', request), ref);
      if (m === null) return Object.freeze({ validation: 'image-unavailable', reference: ref });
      const hash = sha256.create();
      let bytes = 0;
      try {
        for (let index = 0; index < m.chunkCount; index++) {
          const chunk = part(
            await call('readCampaignBackupImageChunk', {
              ...request,
              imageToken: m.imageToken,
              index,
            }),
            ref,
            m,
            index,
          );
          bytes += chunk.length;
          hash.update(chunk);
          if (
            index === m.chunkCount - 1 &&
            (bytes !== m.byteLength || bytesToHex(hash.digest()) !== m.contentHash)
          )
            invalid();
          check();
          await write(Object.freeze({ id: ref.id, index, payload: chunk }));
          check();
        }
        const last = await call('verifyCampaignBackupImage', {
          ...request,
          imageToken: m.imageToken,
        });
        if (
          !closed(last, [...commonKeys, 'imageToken']) ||
          !common(last, ref) ||
          last.imageToken !== m.imageToken
        )
          invalid();
        check();
        return Object.freeze({
          validation: 'frozen-image-bytes-only',
          reference: ref,
          byteLength: m.byteLength,
          chunkCount: m.chunkCount,
          contentHash: m.contentHash,
        });
      } finally {
        hash.destroy();
      }
    },
    {
      signal,
      check: () => {
        guard();
        signal?.throwIfAborted();
      },
    },
  );
}
