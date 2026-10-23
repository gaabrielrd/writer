import { createHash } from 'node:crypto';
import { digest } from './sceneContracts.mjs';
import {
  closed,
  inconsistent,
  integer,
  restoreHash,
  restoreId,
} from './bookRestoreUploadContracts.mjs';
import {
  BOOK_RESOURCE_PAYLOAD_PART_BYTES,
  resourcePayloadScope,
  resourcePayloadManifest,
  resourcePayloadPartIndex,
} from './bookResourcePayloadContracts.mjs';

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function leaf(index, bytes) {
  const prefix = Buffer.alloc(17);
  prefix[0] = 0;
  prefix.writeBigUInt64BE(BigInt(index), 1);
  prefix.writeBigUInt64BE(BigInt(bytes.length), 9);
  return sha(Buffer.concat([prefix, bytes]));
}
const branch = (left, right) =>
  sha(Buffer.concat([Buffer.from([1]), Buffer.from(left, 'hex'), Buffer.from(right, 'hex')]));

function jsonValue(value, depth = 0) {
  if (value === null || ['string', 'boolean'].includes(typeof value)) return;
  if (typeof value === 'number' && Number.isFinite(value)) return;
  if (!value || typeof value !== 'object' || depth > 24) inconsistent();
  if (Array.isArray(value)) {
    if (
      Object.getPrototypeOf(value) !== Array.prototype ||
      Reflect.ownKeys(value).length !== value.length + 1 ||
      Object.getOwnPropertySymbols(value).length
    )
      inconsistent();
    for (let index = 0; index < value.length; index++) {
      const field = Object.getOwnPropertyDescriptor(value, index);
      if (!field || !Object.hasOwn(field, 'value')) inconsistent();
      jsonValue(field.value, depth + 1);
    }
    return;
  }
  if (
    Object.getPrototypeOf(value) !== Object.prototype ||
    Object.getOwnPropertySymbols(value).length
  )
    inconsistent();
  for (const field of Object.values(Object.getOwnPropertyDescriptors(value))) {
    if (!field.enumerable || !Object.hasOwn(field, 'value')) inconsistent();
    jsonValue(field.value, depth + 1);
  }
}
/** Pure staging codec. The producer must authenticate its input and journal each write. */
export function prepareBookResourcePayload({
  uid,
  bookId,
  resource,
  operationId,
  timestamp,
  value,
}) {
  const scope = resourcePayloadScope({ uid, bookId, resource });
  restoreId(operationId);
  integer(timestamp);
  jsonValue(value);
  const bytes = Buffer.from(JSON.stringify(value), 'utf8'),
    chunkCount = Math.ceil(bytes.length / BOOK_RESOURCE_PAYLOAD_PART_BYTES),
    contentHash = sha(bytes),
    layers = [[]];
  for (let index = 0; index < chunkCount; index++)
    layers[0].push(
      leaf(
        index,
        bytes.subarray(
          index * BOOK_RESOURCE_PAYLOAD_PART_BYTES,
          (index + 1) * BOOK_RESOURCE_PAYLOAD_PART_BYTES,
        ),
      ),
    );
  while (layers.at(-1).length > 1) {
    const old = layers.at(-1),
      next = [];
    for (let index = 0; index < old.length; index += 2)
      next.push(branch(old[index], old[index + 1] ?? old[index]));
    layers.push(next);
  }
  const merkleRoot = layers.at(-1)[0],
    bodyId = digest({
      domain: 'writer-book-resource-payload',
      schemaVersion: 1,
      ...scope,
      operationId,
      contentHash,
      merkleRoot,
    }),
    manifest = Object.freeze(
      resourcePayloadManifest({
        schemaVersion: 1,
        bodyId,
        byteLength: bytes.length,
        chunkCount,
        contentHash,
        merkleRoot,
      }),
    ),
    header = Object.freeze({
      ...manifest,
      ownerId: uid,
      bookId,
      resource: Object.freeze({ ...scope.resource }),
      createdAt: timestamp,
    });
  return Object.freeze({
    manifest,
    header,
    part(index) {
      resourcePayloadPartIndex(manifest, index);
      const proof = [];
      let position = index;
      for (const layer of layers.slice(0, -1)) {
        const sibling = position % 2 === 0 ? position + 1 : position - 1;
        proof.push(layer[sibling] ?? layer[position]);
        position = Math.floor(position / 2);
      }
      return {
        schemaVersion: 1,
        ownerId: uid,
        bookId,
        bodyId,
        index,
        bytes: Buffer.from(
          bytes.subarray(
            index * BOOK_RESOURCE_PAYLOAD_PART_BYTES,
            (index + 1) * BOOK_RESOURCE_PAYLOAD_PART_BYTES,
          ),
        ),
        proof,
      };
    },
  });
}
/** Verify one unit against a trusted manifest; no I/O, authorization or client opening. */
export function verifyBookResourcePayloadPart(manifestInput, part) {
  const manifest = resourcePayloadManifest(manifestInput);
  closed(part, ['index', 'bytes', 'proof']);
  const index = resourcePayloadPartIndex(manifest, part.index),
    expected = Math.min(
      BOOK_RESOURCE_PAYLOAD_PART_BYTES,
      manifest.byteLength - index * BOOK_RESOURCE_PAYLOAD_PART_BYTES,
    );
  if (
    !(part.bytes instanceof Uint8Array) ||
    part.bytes.length !== expected ||
    !Array.isArray(part.proof)
  )
    inconsistent();
  let width = manifest.chunkCount,
    position = index,
    hash = leaf(index, part.bytes),
    level = 0;
  while (width > 1) {
    const sibling = part.proof[level++];
    restoreHash(sibling);
    if (position % 2 === 0 && position + 1 >= width && sibling !== hash) inconsistent();
    hash = position % 2 === 0 ? branch(hash, sibling) : branch(sibling, hash);
    position = Math.floor(position / 2);
    width = Math.ceil(width / 2);
  }
  if (level !== part.proof.length || hash !== manifest.merkleRoot) inconsistent();
  return Buffer.from(part.bytes);
}
