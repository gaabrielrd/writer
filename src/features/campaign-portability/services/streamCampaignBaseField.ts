import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { asyncRecordStream } from '@/shared/streams';
import {
  CAMPAIGN_BASE_FIELDS,
  CAMPAIGN_BASE_CHUNK_BYTES,
} from '../../../../functions/src/campaignBackupBaseDefinitions.mjs';
import { closed, validHash, validId, validCount } from './campaignOwnContracts';

export interface CampaignBaseFieldManifest {
  readonly field: string;
  readonly sha256: string;
  readonly bytes: number;
  readonly chunkCount: number;
  readonly bodySourceKey: string;
}
export interface CampaignBaseFieldRef {
  readonly campaignId: string;
  readonly sourceToken: string;
  readonly derivedToken: string;
  readonly baseId: string;
  readonly id: string;
  readonly itemToken: string;
  readonly field: string;
  readonly manifest: CampaignBaseFieldManifest;
}
export interface CampaignBaseFieldApi {
  call(
    method: 'readCampaignBackupBaseText',
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}
export interface CampaignBaseFieldChunk {
  readonly index: number;
  readonly payload: Uint8Array;
  readonly bodyToken: string;
}
export interface CampaignBaseFieldProof {
  readonly validation: 'frozen-field-bytes-only';
  readonly bytes: number;
  readonly sha256: string;
  readonly chunkCount: number;
}
export class CampaignBaseCaptureError extends Error {
  readonly code = 'campaign-backup-invalid-frozen-field';
  constructor() {
    super('Não foi possível conferir o texto congelado. Faça um novo backup.');
    this.name = 'CampaignBaseCaptureError';
  }
}
function invalid(): never {
  throw new CampaignBaseCaptureError();
}
const refKeys = [
  'campaignId',
  'sourceToken',
  'derivedToken',
  'baseId',
  'id',
  'itemToken',
  'field',
  'manifest',
];
const manifestKeys = ['field', 'sha256', 'bytes', 'chunkCount', 'bodySourceKey'];
const responseKeys = [
  'schemaVersion',
  'campaignId',
  'sourceToken',
  'derivedToken',
  'baseId',
  'id',
  'itemToken',
  'field',
  'index',
  'byteLength',
  'fieldBytes',
  'fieldChunkCount',
  'fieldHash',
  'bodyToken',
  'chunkBase64',
];
function reference(raw: CampaignBaseFieldRef): CampaignBaseFieldRef {
  if (
    !closed(raw, refKeys) ||
    !validId(raw.campaignId) ||
    !['sourceToken', 'derivedToken', 'baseId', 'id', 'itemToken'].every((k) => validHash(raw[k])) ||
    typeof raw.field !== 'string' ||
    !Object.values(CAMPAIGN_BASE_FIELDS).some((v) => v.includes(raw.field)) ||
    !closed(raw.manifest, manifestKeys)
  )
    invalid();
  const m = raw.manifest;
  if (
    m.field !== raw.field ||
    !validHash(m.sha256) ||
    !validHash(m.bodySourceKey) ||
    !validCount(m.bytes) ||
    m.bytes > 2 * 1024 * 1024 ||
    !validCount(m.chunkCount) ||
    m.chunkCount < 1 ||
    m.chunkCount > Math.max(1, Math.ceil(m.bytes / (CAMPAIGN_BASE_CHUNK_BYTES - 3)))
  )
    invalid();
  return Object.freeze({
    campaignId: raw.campaignId,
    sourceToken: raw.sourceToken,
    derivedToken: raw.derivedToken,
    baseId: raw.baseId,
    id: raw.id,
    itemToken: raw.itemToken,
    field: raw.field,
    manifest: Object.freeze({
      field: m.field,
      sha256: m.sha256,
      bytes: m.bytes,
      chunkCount: m.chunkCount,
      bodySourceKey: m.bodySourceKey,
    }),
  });
}
function part(raw: unknown, ref: CampaignBaseFieldRef, index: number) {
  if (
    !closed(raw, responseKeys) ||
    raw.schemaVersion !== 1 ||
    ['campaignId', 'sourceToken', 'derivedToken', 'baseId', 'id', 'itemToken', 'field'].some(
      (k) => raw[k] !== ref[k as keyof CampaignBaseFieldRef],
    ) ||
    raw.index !== index ||
    raw.fieldBytes !== ref.manifest.bytes ||
    raw.fieldChunkCount !== ref.manifest.chunkCount ||
    raw.fieldHash !== ref.manifest.sha256 ||
    !validCount(raw.byteLength) ||
    raw.byteLength > CAMPAIGN_BASE_CHUNK_BYTES ||
    !validHash(raw.bodyToken) ||
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
    binary.length !== raw.byteLength ||
    (binary.length === 0 &&
      !(ref.manifest.bytes === 0 && ref.manifest.chunkCount === 1 && index === 0))
  )
    invalid();
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  try {
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    invalid();
  }
  return { bytes, bodyToken: raw.bodyToken };
}
/** Provisional bytes of one frozen field. Full base coverage and archive authorization are separate. */
export function streamCampaignBaseField(
  input: CampaignBaseFieldRef,
  api: CampaignBaseFieldApi,
  options: { guard: () => void; signal?: AbortSignal },
): AsyncGenerator<CampaignBaseFieldChunk, CampaignBaseFieldProof | undefined, void> {
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
      };
      const hash = sha256.create();
      let bytes = 0;
      try {
        for (let index = 0; index < ref.manifest.chunkCount; index++) {
          check();
          const raw = await invoke(
            'readCampaignBackupBaseText',
            Object.freeze({
              campaignId: ref.campaignId,
              sourceToken: ref.sourceToken,
              derivedToken: ref.derivedToken,
              id: ref.id,
              itemToken: ref.itemToken,
              field: ref.field,
              index,
            }),
          );
          check();
          const chunk = part(raw, ref, index);
          bytes += chunk.bytes.length;
          if (!validCount(bytes) || bytes > ref.manifest.bytes) invalid();
          hash.update(chunk.bytes);
          if (
            index === ref.manifest.chunkCount - 1 &&
            (bytes !== ref.manifest.bytes || bytesToHex(hash.digest()) !== ref.manifest.sha256)
          )
            invalid();
          check();
          await write(Object.freeze({ index, payload: chunk.bytes, bodyToken: chunk.bodyToken }));
          check();
        }
        return Object.freeze({
          validation: 'frozen-field-bytes-only',
          bytes,
          sha256: ref.manifest.sha256,
          chunkCount: ref.manifest.chunkCount,
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
