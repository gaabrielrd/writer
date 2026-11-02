import { createHash } from 'node:crypto';
import { serializeBookBackupResource } from './bookBackupResources.mjs';
import { BOOK_STRUCTURE_LIMITS } from './bookBackupStructure.mjs';
import {
  BOOK_CHAPTER_TEXT_PART_BYTES,
  readBookChapterTextPart,
  chapterTextManifest,
} from './bookChapterText.mjs';
import { inconsistent } from './bookRestoreUploadContracts.mjs';
import { workFail } from './workProgressContracts.mjs';
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
const escaped = (text) => Buffer.from(JSON.stringify(text).slice(1, -1), 'utf8');
/** The closed portable chapter projection has exactly one content property. */
export function bookSceneSourceJSONEdges(sourceId, source) {
  const encoded = serializeBookBackupResource('scene-source', null, sourceId, {
      ...source,
      original: { ...source.original, content: '' },
    }),
    needle = '"content":""',
    at = encoded.json.indexOf(needle);
  if (at < 0 || at !== encoded.json.lastIndexOf(needle)) inconsistent();
  const cut = at + needle.length - 1;
  return {
    prefix: Buffer.from(encoded.json.slice(0, cut)),
    suffix: Buffer.from(encoded.json.slice(cut)),
  };
}
/** Immutable offset index, generated from the exact raw parts before their creation. */
export function createBookSceneSourceEncoding(sourceId, source, manifest, parts) {
  manifest = chapterTextManifest(manifest);
  const { prefix, suffix } = bookSceneSourceJSONEdges(sourceId, source),
    output = createHash('sha256').update(prefix),
    raw = createHash('sha256'),
    decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }),
    offsets = [0],
    carry = [0];
  if (parts.length !== manifest.chunkCount) inconsistent();
  let pending = 0,
    total = 0;
  for (const [index, bytes] of parts.entries()) {
    if (
      !(bytes instanceof Uint8Array) ||
      bytes.length !==
        Math.min(
          BOOK_CHAPTER_TEXT_PART_BYTES,
          manifest.byteLength - index * BOOK_CHAPTER_TEXT_PART_BYTES,
        )
    )
      inconsistent();
    const text = decoder.decode(bytes, { stream: true }),
      segment = escaped(text);
    pending += bytes.length - Buffer.byteLength(text);
    if (!Number.isInteger(pending) || pending < 0 || pending > 3) inconsistent();
    total += bytes.length;
    raw.update(bytes);
    output.update(segment);
    offsets.push(offsets.at(-1) + segment.length);
    carry.push(pending);
  }
  if (
    decoder.decode() !== '' ||
    pending !== 0 ||
    total !== manifest.byteLength ||
    raw.digest('hex') !== manifest.contentHash ||
    manifest.contentHash !== source.hash
  )
    inconsistent();
  return {
    schemaVersion: 1,
    contentHash: output.update(suffix).digest('hex'),
    byteLength: prefix.length + offsets.at(-1) + suffix.length,
    prefixHash: sha(prefix),
    suffixHash: sha(suffix),
    offsets,
    carry,
  };
}
function checked(value, manifest, edges) {
  const keys = [
    'schemaVersion',
    'contentHash',
    'byteLength',
    'prefixHash',
    'suffixHash',
    'offsets',
    'carry',
  ];
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(value, k)) ||
    value.schemaVersion !== 1 ||
    !hash(value.contentHash) ||
    !hash(value.prefixHash) ||
    !hash(value.suffixHash) ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 1 ||
    !Array.isArray(value.offsets) ||
    !Array.isArray(value.carry) ||
    value.offsets.length !== manifest.chunkCount + 1 ||
    value.carry.length !== value.offsets.length ||
    value.offsets[0] !== 0 ||
    value.carry[0] !== 0 ||
    value.carry.at(-1) !== 0 ||
    value.prefixHash !== sha(edges.prefix) ||
    value.suffixHash !== sha(edges.suffix)
  )
    inconsistent();
  for (let i = 0; i <= manifest.chunkCount; i++) {
    if (
      !Number.isSafeInteger(value.offsets[i]) ||
      value.offsets[i] < 0 ||
      !Number.isInteger(value.carry[i]) ||
      value.carry[i] < 0 ||
      value.carry[i] > 3
    )
      inconsistent();
    if (i === 0) continue;
    const rawLength = Math.min(
        BOOK_CHAPTER_TEXT_PART_BYTES,
        manifest.byteLength - (i - 1) * BOOK_CHAPTER_TEXT_PART_BYTES,
      ),
      size = value.offsets[i] - value.offsets[i - 1];
    if (size < Math.max(1, rawLength - 3) || size > 6 * (rawLength + 3)) inconsistent();
  }
  if (
    value.offsets.at(-1) > 6 * manifest.byteLength ||
    value.byteLength !== edges.prefix.length + value.offsets.at(-1) + edges.suffix.length
  )
    inconsistent();
  return value;
}
/** No cache across requests: reauthorize/open in this transaction, then read only this range. */
export async function readIndexedBookSceneSource(tx, db, { sourceId, source, opened, index }) {
  const body = opened.body.data();
  if (!Object.hasOwn(body, 'sceneSourceEncoding')) return null;
  const edges = bookSceneSourceJSONEdges(sourceId, source),
    encoding = checked(body.sceneSourceEncoding, opened.manifest, edges);
  if (encoding.byteLength > BOOK_STRUCTURE_LIMITS.itemBytes)
    workFail('failed-precondition', 'Item excede o limite de leitura.');
  const chunkCount = Math.ceil(encoding.byteLength / BOOK_STRUCTURE_LIMITS.chunkBytes);
  if (index >= chunkCount) workFail('invalid-argument', 'Parte fora do recurso.');
  const start = index * BOOK_STRUCTURE_LIMITS.chunkBytes,
    end = Math.min(encoding.byteLength, start + BOOK_STRUCTURE_LIMITS.chunkBytes),
    bytes = Buffer.alloc(end - start),
    parts = new Map();
  let covered = 0;
  function copy(buffer, position) {
    const from = Math.max(start, position),
      until = Math.min(end, position + buffer.length);
    if (until <= from) return;
    bytes.set(buffer.subarray(from - position, until - position), from - start);
    covered += until - from;
  }
  async function part(i) {
    if (!parts.has(i)) parts.set(i, await readBookChapterTextPart(tx, db, opened, i));
    return parts.get(i);
  }
  copy(edges.prefix, 0);
  let segments = 0;
  for (let i = 0; i < opened.manifest.chunkCount; i++) {
    const position = edges.prefix.length + encoding.offsets[i];
    if (position >= end || edges.prefix.length + encoding.offsets[i + 1] <= start) continue;
    if (++segments > 3) inconsistent();
    const raw = await part(i),
      tail = encoding.carry[i + 1],
      previous = encoding.carry[i],
      current = raw.subarray(0, raw.length - tail),
      input = previous
        ? Buffer.concat([
            (await part(i - 1)).subarray(BOOK_CHAPTER_TEXT_PART_BYTES - previous),
            current,
          ])
        : current;
    let text;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(input);
    } catch {
      inconsistent();
    }
    const segment = escaped(text);
    if (segment.length !== encoding.offsets[i + 1] - encoding.offsets[i]) inconsistent();
    copy(segment, position);
  }
  copy(edges.suffix, edges.prefix.length + encoding.offsets.at(-1));
  if (covered !== bytes.length || parts.size > 4) inconsistent();
  return { bytes, byteLength: encoding.byteLength, contentHash: encoding.contentHash, chunkCount };
}
