import { createHash } from 'node:crypto';
import { digest } from './sceneContracts.mjs';
import {
  authorize,
  bornEqual,
  chunkId,
  closed,
  inconsistent,
  integer,
  restoreHash,
  restoreId,
} from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
export const BOOK_CHAPTER_INLINE_BYTES = 512 * 1024;
export const BOOK_CHAPTER_TEXT_BYTES = 8 * 1024 * 1024;
export const BOOK_CHAPTER_TEXT_PART_BYTES = 65536;
export function chapterTextManifest(value) {
  closed(value, ['schemaVersion', 'bodyId', 'contentHash', 'byteLength', 'chunkCount']);
  if (value.schemaVersion !== 1) inconsistent();
  restoreHash(value.bodyId);
  restoreHash(value.contentHash);
  integer(value.byteLength, 1);
  integer(value.chunkCount, 1);
  if (
    value.byteLength > BOOK_CHAPTER_TEXT_BYTES ||
    value.chunkCount !== Math.ceil(value.byteLength / BOOK_CHAPTER_TEXT_PART_BYTES)
  )
    inconsistent();
  return structuredClone(value);
}
/** Immutable generation for one chapter. No credentials, client I/O or activation. */
export function prepareRestoredChapterText({
  uid,
  bookId,
  chapterId,
  operationId,
  timestamp,
  content,
}) {
  authorize(uid);
  bookContentId(bookId);
  bookContentId(chapterId);
  restoreId(operationId);
  integer(timestamp);
  if (typeof content !== 'string' || !content.isWellFormed()) inconsistent();
  const bytes = Buffer.from(content, 'utf8');
  if (bytes.length > BOOK_CHAPTER_TEXT_BYTES) inconsistent();
  if (bytes.length <= BOOK_CHAPTER_INLINE_BYTES) return null;
  const contentHash = digest(content),
    bodyId = digest({
      domain: 'book-chapter-text',
      schemaVersion: 1,
      uid,
      bookId,
      chapterId,
      operationId,
      contentHash,
    }),
    manifest = {
      schemaVersion: 1,
      bodyId,
      contentHash,
      byteLength: bytes.length,
      chunkCount: Math.ceil(bytes.length / BOOK_CHAPTER_TEXT_PART_BYTES),
    },
    writes = [
      {
        kind: 'text-body',
        id: bodyId,
        value: {
          schemaVersion: 1,
          ownerId: uid,
          bookId,
          bodyId,
          resource: { kind: 'chapter', id: chapterId },
          ...manifest,
          pins: 1,
          state: 'ready',
          createdAt: timestamp,
          updatedAt: timestamp,
        },
      },
    ];
  for (let index = 0; index < manifest.chunkCount; index++) {
    const part = bytes.subarray(
      index * BOOK_CHAPTER_TEXT_PART_BYTES,
      (index + 1) * BOOK_CHAPTER_TEXT_PART_BYTES,
    );
    writes.push({
      kind: 'text-chunk',
      id: bodyId + ':' + chunkId(index),
      value: {
        schemaVersion: 1,
        ownerId: uid,
        bookId,
        bodyId,
        chapterId,
        index,
        byteLength: part.length,
        contentHash: createHash('sha256').update(part).digest('hex'),
        bytes: Buffer.from(part),
      },
    });
  }
  return { manifest, writes, patch: { content: null, contentStorage: manifest } };
}
/** Internal reader: caller must authorize the owning project before calling. */
export async function openBookChapterText(tx, db, { uid, bookId, chapterId, chapter }) {
  authorize(uid);
  bookContentId(bookId);
  bookContentId(chapterId);
  if (
    !chapter ||
    (chapter.bookId !== undefined && chapter.bookId !== bookId) ||
    (chapter.ownerId !== undefined && chapter.ownerId !== uid)
  )
    inconsistent();
  if (chapter.contentStorage == null) {
    if (chapter.content === null) inconsistent();
    const content = chapter.content ?? '';
    if (typeof content !== 'string' || !content.isWellFormed()) inconsistent();
    return { inline: content };
  }
  if (chapter.content !== null) inconsistent();
  const manifest = chapterTextManifest(chapter.contentStorage),
    path = 'books/' + bookId + '/bookTextBodies/' + manifest.bodyId,
    body = await tx.get(db.doc(path)),
    value = body.data();
  if (
    !value ||
    value.schemaVersion !== 1 ||
    value.ownerId !== uid ||
    value.bookId !== bookId ||
    value.bodyId !== manifest.bodyId ||
    value.resource?.kind !== 'chapter' ||
    value.resource.id !== chapterId ||
    value.state !== 'ready' ||
    !Number.isSafeInteger(value.pins) ||
    value.pins < 1 ||
    digest(
      chapterTextManifest({
        schemaVersion: value.schemaVersion,
        bodyId: value.bodyId,
        contentHash: value.contentHash,
        byteLength: value.byteLength,
        chunkCount: value.chunkCount,
      }),
    ) !== digest(manifest)
  )
    inconsistent();
  return { manifest, body, path, uid, bookId, chapterId };
}
/** Must use an opening from this same transaction; never accepts a client opening. */
export async function readBookChapterTextPart(tx, db, opened, index) {
  const { manifest, body, path, uid, bookId, chapterId } = opened;
  integer(index);
  if (index >= manifest.chunkCount) inconsistent();
  const snapshot = await tx.get(db.doc(path + '/chunks/' + chunkId(index))),
    part = snapshot.data(),
    expected = Math.min(
      BOOK_CHAPTER_TEXT_PART_BYTES,
      manifest.byteLength - index * BOOK_CHAPTER_TEXT_PART_BYTES,
    );
  if (
    !part ||
    part.schemaVersion !== 1 ||
    part.ownerId !== uid ||
    part.bookId !== bookId ||
    part.bodyId !== manifest.bodyId ||
    part.chapterId !== chapterId ||
    part.index !== index ||
    part.byteLength !== expected ||
    !(part.bytes instanceof Uint8Array) ||
    part.bytes.length !== expected ||
    createHash('sha256').update(part.bytes).digest('hex') !== part.contentHash ||
    !bornEqual(snapshot, body) ||
    !bornEqual(snapshot, { createTime: snapshot.updateTime })
  )
    inconsistent();
  return part.bytes;
}
/** Internal reader: caller must authorize the owning project before calling. */
export async function readBookChapterText(tx, db, input) {
  const opened = await openBookChapterText(tx, db, input);
  if ('inline' in opened) return opened.inline;
  const { manifest } = opened,
    bytes = new Uint8Array(manifest.byteLength),
    hasher = createHash('sha256');
  let offset = 0;
  for (let index = 0; index < manifest.chunkCount; index++) {
    const part = await readBookChapterTextPart(tx, db, opened, index);
    bytes.set(part, offset);
    offset += part.length;
    hasher.update(part);
  }
  if (offset !== manifest.byteLength || hasher.digest('hex') !== manifest.contentHash)
    inconsistent();
  try {
    return new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
  } catch {
    inconsistent();
  }
}
