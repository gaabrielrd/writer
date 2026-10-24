import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { bookContentId } from '../../../../functions/src/bookBackupSchema.mjs';
import {
  freezeBookLoreUpload,
  invalidLoreEdit,
  type BookLorePlannedUpload,
} from './bookLoreWritePlan';

const PART_BYTES = 65536,
  encoder = new TextEncoder();
export interface BookLoreWriteOptions {
  signal?: AbortSignal;
  guard?: () => void;
  yieldControl?: () => Promise<void>;
}
export interface BookLoreWriteManifest {
  readonly schemaVersion: 1;
  readonly bodyId: string;
  readonly byteLength: number;
  readonly chunkCount: number;
  readonly contentHash: string;
  readonly merkleRoot: string;
}
export interface BookLoreWritePart {
  index: number;
  chunkBase64: string;
  proof: readonly string[];
}
function check(options: BookLoreWriteOptions) {
  options.signal?.throwIfAborted();
  options.guard?.();
}
function canonical(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort()
        .map((key) => [key, canonical((value as Record<string, unknown>)[key])]),
    );
  return value;
}
const metadataHash = (value: unknown) =>
  bytesToHex(sha256(encoder.encode(JSON.stringify(canonical(value)))));
function* jsonAtoms(value: unknown): Generator<Uint8Array> {
  if (typeof value === 'string') {
    yield encoder.encode('"');
    for (let start = 0; start < value.length;) {
      let end = Math.min(start + 4096, value.length);
      if (
        end < value.length &&
        value.charCodeAt(end - 1) >= 0xd800 &&
        value.charCodeAt(end - 1) <= 0xdbff
      )
        end--;
      // Only a bounded slice is escaped/encoded; BOM, whitespace and composition stay literal.
      yield encoder.encode(JSON.stringify(value.slice(start, end)).slice(1, -1));
      start = end;
    }
    yield encoder.encode('"');
    return;
  }
  if (value === null || typeof value === 'boolean' || typeof value === 'number') {
    yield encoder.encode(JSON.stringify(value));
    return;
  }
  if (Array.isArray(value)) {
    yield encoder.encode('[');
    for (let i = 0; i < value.length; i++) {
      if (i) yield encoder.encode(',');
      yield* jsonAtoms(value[i]);
    }
    yield encoder.encode(']');
    return;
  }
  if (!value || typeof value !== 'object') invalidLoreEdit();
  yield encoder.encode('{');
  for (const [i, key] of Object.keys(value).entries()) {
    if (i) yield encoder.encode(',');
    yield encoder.encode(JSON.stringify(key) + ':');
    yield* jsonAtoms((value as Record<string, unknown>)[key]);
  }
  yield encoder.encode('}');
}
function* jsonParts(value: unknown, options: BookLoreWriteOptions): Generator<Uint8Array> {
  check(options);
  let bytes = new Uint8Array(PART_BYTES),
    length = 0;
  for (const atom of jsonAtoms(value)) {
    for (let offset = 0; offset < atom.length;) {
      const take = Math.min(PART_BYTES - length, atom.length - offset);
      bytes.set(atom.subarray(offset, offset + take), length);
      length += take;
      offset += take;
      if (length === PART_BYTES) {
        check(options);
        yield bytes;
        bytes = new Uint8Array(PART_BYTES);
        length = 0;
      }
    }
  }
  check(options);
  if (length) yield bytes.slice(0, length);
}
function leaf(index: number, bytes: Uint8Array): Uint8Array {
  const prefix = new Uint8Array(17),
    view = new DataView(prefix.buffer);
  view.setBigUint64(1, BigInt(index));
  view.setBigUint64(9, BigInt(bytes.length));
  return sha256.create().update(prefix).update(bytes).digest();
}
const branch = (a: Uint8Array, b: Uint8Array) =>
  sha256
    .create()
    .update(new Uint8Array([1]))
    .update(a)
    .update(b)
    .digest();
const base64 = (bytes: Uint8Array) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192)
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
};
/** Pure private staging. This manifest/proof never authorizes a server write. */
export async function prepareBookLoreWritePayload(
  input: { uid: string; bookId: string; loreId: string; uploadId: string } & BookLorePlannedUpload,
  options: BookLoreWriteOptions = {},
) {
  check(options);
  const uid = bookContentId(input.uid),
    bookId = bookContentId(input.bookId),
    loreId = bookContentId(input.loreId),
    uploadId = bookContentId(input.uploadId);
  if (uid.length > 128) invalidLoreEdit();
  const upload = freezeBookLoreUpload({ target: input.target, value: input.value }),
    target = upload.target,
    value = upload.value,
    operationId = metadataHash({
      domain: 'writer-lore-field-operation',
      uid,
      bookId,
      loreId,
      uploadId,
      target,
    }),
    content = sha256.create(),
    layers: Uint8Array[][] = [[]];
  let byteLength = 0;
  const yieldControl =
    options.yieldControl ?? (() => new Promise<void>((resolve) => setTimeout(resolve, 0)));
  for (const bytes of jsonParts(value, options)) {
    byteLength += bytes.length;
    if (!Number.isSafeInteger(byteLength)) invalidLoreEdit();
    content.update(bytes);
    layers[0]!.push(leaf(layers[0]!.length, bytes));
    await yieldControl();
    check(options);
  }
  const contentHash = bytesToHex(content.digest()),
    chunkCount = layers[0]!.length;
  while (layers[layers.length - 1]!.length > 1) {
    const previous = layers[layers.length - 1]!,
      next: Uint8Array[] = [];
    for (let i = 0; i < previous.length; i += 2)
      next.push(branch(previous[i]!, previous[i + 1] ?? previous[i]!));
    layers.push(next);
    check(options);
  }
  const merkleRoot = bytesToHex(layers[layers.length - 1]![0]!),
    bodyId = metadataHash({
      domain: 'writer-book-resource-payload',
      schemaVersion: 1,
      uid,
      bookId,
      resource: { kind: 'lore', parentId: null, id: loreId },
      operationId,
      contentHash,
      merkleRoot,
    }),
    manifest: BookLoreWriteManifest = Object.freeze({
      schemaVersion: 1,
      bodyId,
      byteLength,
      chunkCount,
      contentHash,
      merkleRoot,
    });
  check(options);
  return Object.freeze({
    uploadId,
    target,
    operationId,
    manifest,
    async *parts(from = 0): AsyncGenerator<BookLoreWritePart> {
      if (!Number.isSafeInteger(from) || from < 0 || from > chunkCount) invalidLoreEdit();
      check(options);
      if (from === chunkCount) return;
      let index = 0;
      // One sequential pass per resume, rather than rescanning the prefix for each part.
      for (const bytes of jsonParts(value, options)) {
        if (index >= from) {
          let position = index;
          const proof: string[] = [];
          for (const layer of layers.slice(0, -1)) {
            const sibling = position % 2 === 0 ? position + 1 : position - 1;
            proof.push(bytesToHex(layer[sibling] ?? layer[position]!));
            position = Math.floor(position / 2);
          }
          check(options);
          yield { index, chunkBase64: base64(bytes), proof: Object.freeze(proof) };
          check(options);
        } else {
          await yieldControl();
          check(options);
        }
        index++;
      }
      if (index !== chunkCount) invalidLoreEdit();
    },
  });
}
