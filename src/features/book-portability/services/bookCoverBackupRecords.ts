import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  BOOK_COVER_LIMITS,
  BOOK_COVER_PNG_SIGNATURE,
  validateBookBackupCover,
  type BookCoverApi,
  type BookCoverSource,
  type BookCoverChunk,
  type BookCoverDescriptor,
} from '../../../../functions/src/bookBackupCover.mjs';
import type { BookStructureSource } from '../../../../functions/src/bookBackupStructure.mjs';
import { BookBackupFormatError, type BookBackupRecord } from '../model/backupContainer';
import { bookCoverApi } from './bookCoverCallables';
import { closed, validId, validHash, source, matches } from './bookSnapshotCapture';
export interface BookCoverProof {
  source: BookStructureSource;
  coverToken: string;
  cover: BookCoverDescriptor;
}
export interface BookCoverOptions {
  api?: BookCoverApi;
  source?: BookStructureSource;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
}
function invalid(): never {
  throw new BookBackupFormatError(
    'integrity-mismatch',
    'Não foi possível conferir os bytes autorizados da capa.',
  );
}
function check(options: BookCoverOptions) {
  options.signal?.throwIfAborted();
  if (options.isCurrent && !options.isCurrent())
    throw new DOMException('A captura não pertence mais à sessão atual.', 'AbortError');
}
function descriptor(value: unknown): BookCoverDescriptor {
  try {
    return Object.freeze(validateBookBackupCover(value));
  } catch {
    return invalid();
  }
}
function captured(value: BookCoverSource, anchor: BookStructureSource): BookCoverProof {
  if (
    !closed(value, ['schemaVersion', 'bookId', 'sourceToken', 'coverToken', 'cover']) ||
    !matches(value, anchor) ||
    !validHash(value.coverToken)
  )
    invalid();
  return Object.freeze({
    source: anchor,
    coverToken: value.coverToken,
    cover: descriptor(value.cover),
  });
}
function payload(value: BookCoverChunk, proof: BookCoverProof, index: number): Uint8Array {
  const cover = proof.cover;
  if (
    cover.kind !== 'library' ||
    !closed(value, [
      'schemaVersion',
      'bookId',
      'sourceToken',
      'coverToken',
      'index',
      'chunkBase64',
      'chunkHash',
    ]) ||
    !matches(value, proof.source) ||
    value.coverToken !== proof.coverToken ||
    value.index !== index ||
    typeof value.chunkBase64 !== 'string' ||
    value.chunkBase64.length > 4 * Math.ceil(BOOK_COVER_LIMITS.chunkBytes / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.chunkBase64) ||
    !validHash(value.chunkHash)
  )
    invalid();
  const raw = atob(value.chunkBase64);
  if (btoa(raw) !== value.chunkBase64) invalid();
  const bytes = Uint8Array.from(raw, (character) => character.charCodeAt(0));
  if (
    bytes.length !==
      Math.min(
        BOOK_COVER_LIMITS.chunkBytes,
        cover.byteLength - index * BOOK_COVER_LIMITS.chunkBytes,
      ) ||
    bytesToHex(sha256(bytes)) !== value.chunkHash ||
    (index === 0 && bytesToHex(bytes.subarray(0, 8)) !== BOOK_COVER_PNG_SIGNATURE)
  )
    invalid();
  return bytes;
}
export async function verifyBookBackupCover(
  proof: BookCoverProof,
  options: BookCoverOptions = {},
): Promise<void> {
  if (
    !closed(proof, ['source', 'coverToken', 'cover']) ||
    !proof.source ||
    !validId(proof.source.bookId) ||
    !validHash(proof.coverToken)
  )
    invalid();
  const anchor = source(proof.source, proof.source.bookId),
    token = proof.coverToken;
  descriptor(proof.cover);
  check(options);
  const result = await (options.api ?? bookCoverApi).verify({
    bookId: anchor.bookId,
    sourceToken: anchor.sourceToken,
    coverToken: token,
  });
  check(options);
  if (
    !closed(result, ['schemaVersion', 'bookId', 'sourceToken', 'coverToken']) ||
    !matches(result, anchor) ||
    result.coverToken !== token
  )
    invalid();
}
/** All records are provisional until every proof passes and the complete M2 seal is written. */
export async function* bookCoverBackupRecords(
  bookId: string,
  options: BookCoverOptions = {},
): AsyncGenerator<BookBackupRecord, BookCoverProof | undefined, void> {
  if (!validId(bookId)) invalid();
  const settings = { ...options },
    api = settings.api ?? bookCoverApi;
  const expected =
    settings.source === undefined ? undefined : source(settings.source, bookId).sourceToken;
  check(settings);
  const anchor = source(
    await api.getSource({
      bookId,
      ...(expected === undefined ? {} : { expectedSourceToken: expected }),
    }),
    bookId,
    expected,
  );
  check(settings);
  const proof = captured(await api.cover({ bookId, sourceToken: anchor.sourceToken }), anchor);
  check(settings);
  yield {
    kind: 'book-cover',
    id: bookId,
    part: 0,
    payload: new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, cover: proof.cover })),
  };
  check(settings);
  if (proof.cover.kind === 'library') {
    const hasher = sha256.create();
    try {
      for (let index = 0; index < proof.cover.chunkCount; index++) {
        check(settings);
        const result = await api.read({
          bookId,
          sourceToken: anchor.sourceToken,
          coverToken: proof.coverToken,
          index,
        });
        check(settings);
        const bytes = payload(result, proof, index);
        hasher.update(bytes);
        yield { kind: 'book-cover-bytes', id: proof.cover.imageId, part: index, payload: bytes };
        check(settings);
      }
      if (bytesToHex(hasher.digest()) !== proof.cover.contentHash) invalid();
    } finally {
      hasher.destroy();
    }
  }
  await verifyBookBackupCover(proof, settings);
  check(settings);
  return proof;
}
