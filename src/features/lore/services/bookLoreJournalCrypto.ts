import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { bookLoreJSONParts, type BookLoreWriteOptions } from './bookLoreWritePayload';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { readObject, readCount, readHash } from './bookLoreReadContracts';
import {
  journalFail,
  journalIdentity,
  sameJournalIdentity,
  type LoreJournalIdentity,
  type LoreJournalBlob,
  type LoreJournalSection,
  type LoreJournalFrame,
  type LoreJournalGrant,
} from './bookLoreJournalContracts';
export interface JournalDigest {
  byteLength: number;
  chunkCount: number;
  contentHash: string;
}
export function journalCheck(options: BookLoreWriteOptions) {
  options.guard?.();
  options.signal?.throwIfAborted();
}
export async function prepareJournalJSON(
  value: unknown,
  options: BookLoreWriteOptions = {},
  limit = Number.MAX_SAFE_INTEGER,
) {
  journalCheck(options);
  const frozen = freezeLoreEditValue(value),
    hasher = sha256.create();
  let byteLength = 0,
    chunkCount = 0;
  for (const bytes of bookLoreJSONParts(frozen, options)) {
    byteLength += bytes.length;
    chunkCount++;
    if (!Number.isSafeInteger(byteLength) || byteLength > limit) journalFail();
    hasher.update(bytes);
    await (options.yieldControl?.() ?? new Promise<void>((r) => setTimeout(r, 0)));
    journalCheck(options);
  }
  return {
    value: frozen,
    manifest: { byteLength, chunkCount, contentHash: bytesToHex(hasher.digest()) },
  };
}
const aad = (
  identity: LoreJournalIdentity,
  section: LoreJournalSection,
  blob: LoreJournalBlob,
  index: number,
) =>
  new TextEncoder().encode(
    JSON.stringify([
      'writer-lore-journal',
      1,
      identity,
      section,
      blob.generation,
      blob.byteLength,
      blob.chunkCount,
      index,
    ]),
  );
export function journalGrant(grant: LoreJournalGrant, identity: LoreJournalIdentity): CryptoKey {
  if (
    !sameJournalIdentity(journalIdentity(grant.identity), identity) ||
    grant.key.type !== 'secret' ||
    grant.key.extractable ||
    grant.key.algorithm.name !== 'AES-GCM' ||
    (grant.key.algorithm as AesKeyAlgorithm).length !== 256 ||
    !grant.key.usages.includes('encrypt') ||
    !grant.key.usages.includes('decrypt')
  )
    journalFail();
  return grant.key;
}
export async function sealJournalFrame(
  key: CryptoKey,
  identity: LoreJournalIdentity,
  section: LoreJournalSection,
  blob: LoreJournalBlob,
  index: number,
  bytes: Uint8Array,
): Promise<LoreJournalFrame> {
  const nonce = crypto.getRandomValues(new Uint8Array(12));
  return {
    nonce: nonce.buffer,
    ciphertext: await crypto.subtle.encrypt(
      {
        name: 'AES-GCM',
        iv: nonce,
        additionalData: aad(identity, section, blob, index),
        tagLength: 128,
      },
      key,
      new Uint8Array(bytes),
    ),
  };
}
export async function openJournalFrame(
  key: CryptoKey,
  identity: LoreJournalIdentity,
  section: LoreJournalSection,
  blob: LoreJournalBlob,
  index: number,
  frame: LoreJournalFrame,
) {
  return new Uint8Array(
    await crypto.subtle.decrypt(
      {
        name: 'AES-GCM',
        iv: new Uint8Array(frame.nonce),
        additionalData: aad(identity, section, blob, index),
        tagLength: 128,
      },
      key,
      frame.ciphertext,
    ),
  );
}
export function readJournalDigest(value: unknown, blob: LoreJournalBlob): JournalDigest {
  const v = readObject(value, ['byteLength', 'chunkCount', 'contentHash']);
  if (readCount(v.byteLength) !== blob.byteLength || readCount(v.chunkCount) !== blob.chunkCount)
    journalFail();
  return {
    byteLength: blob.byteLength,
    chunkCount: blob.chunkCount,
    contentHash: readHash(v.contentHash),
  };
}
export function journalDigestBytes(manifest: JournalDigest) {
  return new TextEncoder().encode(JSON.stringify(manifest));
}
