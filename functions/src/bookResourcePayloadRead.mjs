import { createHash } from 'node:crypto';
import { digest } from './sceneContracts.mjs';
import { born, bornEqual, closed, inconsistent, integer } from './bookRestoreUploadContracts.mjs';
import {
  resourcePayloadScope,
  resourcePayloadManifest,
  resourcePayloadPartIndex,
} from './bookResourcePayloadContracts.mjs';
import { verifyBookResourcePayloadPart } from './bookResourcePayload.mjs';
import { resourcePayloadBodyPath, resourcePayloadChunkPath } from './bookResourcePayloadPaths.mjs';

const transactions = new WeakMap();
const immutable = (snapshot) => bornEqual(snapshot, { createTime: snapshot.updateTime });
function notAfter(a, b) {
  const first = born(a),
    last = born(b);
  return (
    first.seconds < last.seconds ||
    (first.seconds === last.seconds && first.nanoseconds <= last.nanoseconds)
  );
}
/** Caller authorizes the project and current resource pointer before opening. */
export async function openBookResourcePayload(tx, db, input) {
  const scope = resourcePayloadScope(input),
    manifest = resourcePayloadManifest(input.manifest),
    path = resourcePayloadBodyPath(scope.bookId, manifest.bodyId),
    header = await tx.get(db.doc(path)),
    value = header.data();
  closed(input.expectedBirth, ['seconds', 'nanoseconds']);
  if (
    !header.exists ||
    header.ref?.path !== path ||
    !immutable(header) ||
    !bornEqual(header, { createTime: input.expectedBirth })
  )
    inconsistent();
  closed(value, [...Object.keys(manifest), 'ownerId', 'bookId', 'resource', 'createdAt']);
  integer(value.createdAt);
  if (
    value.ownerId !== scope.uid ||
    value.bookId !== scope.bookId ||
    digest(
      resourcePayloadScope({ uid: value.ownerId, bookId: value.bookId, resource: value.resource }),
    ) !== digest(scope) ||
    digest(Object.fromEntries(Object.keys(manifest).map((key) => [key, value[key]]))) !==
      digest(manifest)
  )
    inconsistent();
  const opened = { ...scope, manifest, path, header };
  transactions.set(opened, tx);
  return opened;
}
/** Native snapshot only, from the same authorized transaction; never a transport DTO. */
export function validateBookResourcePayloadSnapshot(opened, index, snapshot) {
  resourcePayloadPartIndex(opened.manifest, index);
  if (
    !snapshot.exists ||
    snapshot.ref?.path !== resourcePayloadChunkPath(opened.bookId, opened.manifest.bodyId, index) ||
    !immutable(snapshot) ||
    !notAfter(snapshot, opened.header)
  )
    inconsistent();
  const part = snapshot.data();
  closed(part, ['schemaVersion', 'ownerId', 'bookId', 'bodyId', 'index', 'bytes', 'proof']);
  if (
    part.schemaVersion !== 1 ||
    part.ownerId !== opened.uid ||
    part.bookId !== opened.bookId ||
    part.bodyId !== opened.manifest.bodyId ||
    part.index !== index
  )
    inconsistent();
  return verifyBookResourcePayloadPart(opened.manifest, {
    index,
    bytes: part.bytes,
    proof: part.proof,
  });
}
export async function readBookResourcePayloadPart(tx, db, opened, index) {
  if (transactions.get(opened) !== tx) inconsistent();
  resourcePayloadPartIndex(opened.manifest, index);
  const snapshot = await tx.get(
    db.doc(resourcePayloadChunkPath(opened.bookId, opened.manifest.bodyId, index)),
  );
  return validateBookResourcePayloadSnapshot(opened, index, snapshot);
}
/** Complete logical object. Domain schema/authorization remains the caller's responsibility. */
export async function readBookResourcePayload(tx, db, input) {
  const opened = await openBookResourcePayload(tx, db, input),
    parts = [],
    hasher = createHash('sha256');
  for (let index = 0; index < opened.manifest.chunkCount; index++) {
    const bytes = await readBookResourcePayloadPart(tx, db, opened, index);
    hasher.update(bytes);
    parts.push(bytes);
  }
  if (hasher.digest('hex') !== opened.manifest.contentHash) inconsistent();
  let value;
  try {
    const json = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
      Buffer.concat(parts),
    );
    value = JSON.parse(json);
    if (JSON.stringify(value) !== json) inconsistent();
  } catch {
    inconsistent();
  }
  return value;
}
