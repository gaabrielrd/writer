import {
  CAMPAIGN_OWN_CHUNK_BYTES,
  CAMPAIGN_OWN_PAGE_ITEMS,
  type CampaignOwnFamily,
} from '../../../../functions/src/campaignBackupOwnDefinitions.mjs';
export type { CampaignOwnFamily };
export type CampaignOwnKind = 'campaign' | 'progress' | CampaignOwnFamily;
export type CampaignOwnPortableKind = Exclude<
  CampaignOwnKind,
  'session-reference-state' | 'session-preparation-state'
>;
export type CampaignOwnMethod =
  'getCampaignBackupSource' | 'listCampaignBackupOwnInventory' | 'readCampaignBackupOwnContent';
export interface CampaignOwnApi {
  call(method: CampaignOwnMethod, input: Readonly<Record<string, unknown>>): Promise<unknown>;
}
export interface CampaignOwnSource {
  readonly schemaVersion: 1;
  readonly campaignId: string;
  readonly sourceToken: string;
}
export interface CampaignOwnItem {
  readonly id: string;
  readonly itemToken: string;
}
export interface CampaignOwnManifest {
  readonly byteLength: number;
  readonly chunkCount: number;
  readonly contentHash: string;
}
export type CampaignOwnOmission = 'control' | 'deleted' | 'inactive-parent';
export interface CampaignOwnInventoryProof {
  readonly pages: number;
  readonly items: number;
  readonly digest: string;
  readonly counts: Readonly<Record<CampaignOwnFamily, number>>;
}
export interface CampaignOwnCaptureProof {
  readonly validation: 'own-data-only';
  readonly source: CampaignOwnSource;
  readonly inventory: CampaignOwnInventoryProof;
  readonly content: Readonly<{
    units: number;
    chunks: number;
    payloadBytes: number;
    digest: string;
  }>;
  readonly omitted: Readonly<Record<CampaignOwnOmission, number>>;
}
export interface CampaignOwnChunk {
  readonly kind: CampaignOwnPortableKind;
  readonly id: string;
  readonly index: number;
  readonly payload: Uint8Array;
}
export interface CampaignOwnCaptureOptions {
  guard: () => void;
  signal?: AbortSignal;
  source?: CampaignOwnSource;
}
export class CampaignOwnCaptureError extends Error {
  readonly code: 'campaign-backup-invalid-capture' | 'campaign-backup-inventory-changed';
  constructor(code: CampaignOwnCaptureError['code'] = 'campaign-backup-invalid-capture') {
    super('Não foi possível conferir a captura própria da campanha. Faça um novo backup.');
    this.name = 'CampaignOwnCaptureError';
    this.code = code;
  }
}
export function invalid(): never {
  throw new CampaignOwnCaptureError();
}
export const closed = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  !!value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).length === keys.length &&
  Object.keys(value).every((key) => keys.includes(key));
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export const validHash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
export const validCount = (value: unknown): value is number =>
  Number.isSafeInteger(value) && (value as number) >= 0;
export function validId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    !!value &&
    !value.includes('/') &&
    !['.', '..'].includes(value) &&
    encoder.encode(value).length <= 1500 &&
    decoder.decode(encoder.encode(value)) === value
  );
}
export function compareIds(a: string, b: string): number {
  const left = encoder.encode(a),
    right = encoder.encode(b);
  for (let index = 0; index < Math.min(left.length, right.length); index++)
    if (left[index] !== right[index]) return left[index]! - right[index]!;
  return left.length - right.length;
}
export function source(value: unknown, campaignId: string, expected?: string): CampaignOwnSource {
  if (
    !closed(value, ['schemaVersion', 'campaignId', 'sourceToken']) ||
    value.schemaVersion !== 1 ||
    value.campaignId !== campaignId ||
    !validHash(value.sourceToken) ||
    (expected !== undefined && value.sourceToken !== expected)
  )
    invalid();
  return Object.freeze({ schemaVersion: 1, campaignId, sourceToken: value.sourceToken });
}
export function item(value: unknown): CampaignOwnItem {
  if (!closed(value, ['id', 'itemToken']) || !validId(value.id) || !validHash(value.itemToken))
    invalid();
  return Object.freeze({ id: value.id, itemToken: value.itemToken });
}
export function page(value: unknown, anchor: CampaignOwnSource, family: CampaignOwnFamily) {
  if (
    !closed(value, [
      'schemaVersion',
      'campaignId',
      'sourceToken',
      'family',
      'items',
      'pageToken',
      'nextCursor',
    ]) ||
    value.schemaVersion !== 1 ||
    value.campaignId !== anchor.campaignId ||
    value.sourceToken !== anchor.sourceToken ||
    value.family !== family ||
    !validHash(value.pageToken) ||
    !Array.isArray(value.items) ||
    value.items.length > CAMPAIGN_OWN_PAGE_ITEMS
  )
    invalid();
  const items = Object.freeze(value.items.map((value: unknown) => item(value))),
    next = value.nextCursor,
    pageToken = value.pageToken;
  if (
    next !== null &&
    (typeof next !== 'string' || items.length !== CAMPAIGN_OWN_PAGE_ITEMS || !next)
  )
    invalid();
  return Object.freeze({ items, pageToken, nextCursor: next });
}
export function cursor(
  value: string,
  anchor: CampaignOwnSource,
  family: CampaignOwnFamily,
  after: string,
): void {
  if (value.length > 24576 || !/^[A-Za-z0-9_-]+$/.test(value)) invalid();
  let parsed: unknown, text: string;
  try {
    const binary = atob(
      value.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (value.length % 4)) % 4),
    );
    if (btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '') !== value)
      invalid();
    text = decoder.decode(Uint8Array.from(binary, (char) => char.charCodeAt(0)));
    parsed = JSON.parse(text);
  } catch {
    invalid();
  }
  if (
    !closed(parsed, ['version', 'uid', 'campaignId', 'sourceToken', 'family', 'limit', 'after']) ||
    parsed.version !== 1 ||
    !validId(parsed.uid) ||
    parsed.campaignId !== anchor.campaignId ||
    parsed.sourceToken !== anchor.sourceToken ||
    parsed.family !== family ||
    parsed.limit !== CAMPAIGN_OWN_PAGE_ITEMS ||
    parsed.after !== after ||
    JSON.stringify(parsed) !== text
  )
    invalid();
}
export function part(
  value: unknown,
  anchor: CampaignOwnSource,
  kind: CampaignOwnKind,
  ref: CampaignOwnItem,
  index: number,
  first?: CampaignOwnManifest,
):
  | { outcome: 'omitted'; reason: CampaignOwnOmission }
  | { outcome: 'chunk'; bytes: Uint8Array; manifest: CampaignOwnManifest } {
  const base = ['schemaVersion', 'campaignId', 'sourceToken', 'kind', 'id', 'itemToken', 'outcome'];
  if (!value || typeof value !== 'object') invalid();
  const raw = value as Record<string, unknown>,
    omitted = raw.outcome === 'omitted';
  if (
    !closed(raw, [
      ...base,
      ...(omitted
        ? ['reason']
        : ['index', 'byteLength', 'chunkCount', 'contentHash', 'chunkBase64']),
    ]) ||
    raw.schemaVersion !== 1 ||
    raw.campaignId !== anchor.campaignId ||
    raw.sourceToken !== anchor.sourceToken ||
    raw.kind !== kind ||
    raw.id !== ref.id ||
    raw.itemToken !== ref.itemToken
  )
    invalid();
  const control = ['session-reference-state', 'session-preparation-state'].includes(kind);
  if (omitted) {
    if (
      index !== 0 ||
      first ||
      (control
        ? raw.reason !== 'control'
        : ['campaign', 'progress'].includes(kind) ||
          (raw.reason === 'deleted' &&
            ![
              'note',
              'session',
              'preparation-item',
              'session-reference',
              'session-preparation-link',
            ].includes(kind)) ||
          !['deleted', 'inactive-parent'].includes(raw.reason as string) ||
          (raw.reason === 'inactive-parent' &&
            !['session-reference', 'session-preparation-link'].includes(kind)))
    )
      invalid();
    return Object.freeze({ outcome: 'omitted', reason: raw.reason as CampaignOwnOmission });
  }
  if (
    raw.outcome !== 'chunk' ||
    control ||
    raw.index !== index ||
    !validCount(raw.byteLength) ||
    raw.byteLength < 1 ||
    !validCount(raw.chunkCount) ||
    raw.chunkCount < 1 ||
    raw.chunkCount !== Math.ceil(raw.byteLength / CAMPAIGN_OWN_CHUNK_BYTES) ||
    index >= raw.chunkCount ||
    !validHash(raw.contentHash) ||
    (first &&
      (raw.byteLength !== first.byteLength ||
        raw.chunkCount !== first.chunkCount ||
        raw.contentHash !== first.contentHash)) ||
    typeof raw.chunkBase64 !== 'string' ||
    !raw.chunkBase64 ||
    raw.chunkBase64.length > 4 * Math.ceil(CAMPAIGN_OWN_CHUNK_BYTES / 3) ||
    !/^[A-Za-z0-9+/]*={0,2}$/.test(raw.chunkBase64)
  )
    invalid();
  let bytes: Uint8Array;
  try {
    const binary = atob(raw.chunkBase64);
    if (btoa(binary) !== raw.chunkBase64) invalid();
    bytes = Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    invalid();
  }
  if (
    bytes.length !==
    Math.min(CAMPAIGN_OWN_CHUNK_BYTES, raw.byteLength - index * CAMPAIGN_OWN_CHUNK_BYTES)
  )
    invalid();
  return {
    outcome: 'chunk',
    bytes,
    manifest: Object.freeze({
      byteLength: raw.byteLength,
      chunkCount: raw.chunkCount,
      contentHash: raw.contentHash,
    }),
  };
}
