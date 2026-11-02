import type {
  CampaignLoreEntityInput,
  CampaignLoreOperation,
  CampaignLoreSealed,
} from '../model/campaignLore';
import { invalid, relatedKeys, utf8, validateEntity } from './campaignLoreService';
export function toBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let text = '';
  for (let i = 0; i < bytes.length; i += 8192)
    text += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(text);
}
export function fromBase64(value: string): ArrayBuffer {
  try {
    const bytes = Uint8Array.from(atob(value), (c) => c.charCodeAt(0));
    if (toBase64(bytes.buffer) !== value) invalid();
    return bytes.buffer;
  } catch {
    return invalid('Os dados cifrados não puderam ser confirmados.');
  }
}
function aad(op: CampaignLoreOperation): Uint8Array<ArrayBuffer> {
  const h = op.header;
  return utf8.encode(
    JSON.stringify([
      1,
      op.ownerId,
      h.campaignId,
      h.campaignToken,
      h.baseId,
      h.sourceKey,
      h.operationId,
      h.expectedRevision,
      'save',
      op.relatedSourceKeys,
    ]),
  );
}
async function importKey(raw: string): Promise<CryptoKey> {
  const bytes = fromBase64(raw);
  if (bytes.byteLength !== 32) invalid();
  return crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
}
export async function sealLore(
  op: CampaignLoreOperation,
  entity: CampaignLoreEntityInput,
  rawKey: string,
): Promise<{ nonce: ArrayBuffer; ciphertext: ArrayBuffer }> {
  validateEntity(entity, op.header.sourceKey);
  if (JSON.stringify(relatedKeys(entity)) !== JSON.stringify(op.relatedSourceKeys)) invalid();
  const key = await importKey(rawKey),
    nonce = crypto.getRandomValues(new Uint8Array(12));
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: nonce, additionalData: aad(op) },
    key,
    utf8.encode(JSON.stringify(entity)),
  );
  return { nonce: nonce.buffer, ciphertext };
}
export async function unsealLore(
  op: CampaignLoreOperation,
  rawKey: string,
): Promise<CampaignLoreEntityInput> {
  if (!op.nonce || !op.ciphertext) return invalid();
  const key = await importKey(rawKey);
  const bytes = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: op.nonce, additionalData: aad(op) },
    key,
    op.ciphertext,
  );
  const raw = JSON.parse(
    new TextDecoder('utf-8', { fatal: true }).decode(bytes),
  ) as CampaignLoreEntityInput;
  // Only this closed shape may leave the cryptographic boundary.
  const value = {
    name: raw.name,
    aliases: raw.aliases,
    category: raw.category,
    summary: raw.summary,
    details: raw.details,
    structuredDetails: raw.structuredDetails,
    relations: raw.relations,
  };
  if (
    JSON.stringify(raw) !== JSON.stringify(value) ||
    Object.keys(raw.structuredDetails ?? {})
      .sort()
      .join() !== 'appearance,history,notes,personality' ||
    raw.relations?.some(
      (r) => Object.keys(r).sort().join() !== 'description,relationType,targetKey',
    )
  )
    invalid();
  validateEntity(value, op.header.sourceKey);
  if (JSON.stringify(relatedKeys(value)) !== JSON.stringify(op.relatedSourceKeys)) invalid();
  return value;
}
export function sealedRequest(op: CampaignLoreOperation): CampaignLoreSealed {
  if (
    !op.nonce ||
    op.nonce.byteLength !== 12 ||
    !op.ciphertext ||
    op.ciphertext.byteLength < 16 ||
    op.ciphertext.byteLength > 900016
  )
    return invalid();
  return {
    version: 1,
    algorithm: 'AES-GCM',
    nonce: toBase64(op.nonce),
    ciphertext: toBase64(op.ciphertext),
  };
}
