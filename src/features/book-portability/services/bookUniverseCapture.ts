import {
  validateBookBackupUniverseOrigin,
  type BookUniverseApi,
  type BookUniverseCapture,
  type BookUniverseOrigin,
} from '../../../../functions/src/bookBackupUniverse.mjs';
import type { BookStructureSource } from '../../../../functions/src/bookBackupStructure.mjs';
import type { BookBackupRecord } from '../model/backupContainer';
import { bookUniverseApi } from './bookUniverseCallables';
import { check, closed, invalid, validId, validHash, source, matches } from './bookSnapshotCapture';
export interface BookUniverseProof {
  source: BookStructureSource;
  origin: BookUniverseOrigin;
  universeToken: string;
}
function origin(value: unknown): BookUniverseOrigin {
  try {
    const result = validateBookBackupUniverseOrigin(value);
    if (result.kind === 'reference')
      return Object.freeze({ ...result, created: Object.freeze({ ...result.created }) });
    return Object.freeze(result);
  } catch {
    return invalid();
  }
}
function response(value: BookUniverseCapture, anchor: BookStructureSource): BookUniverseProof {
  if (
    !closed(value, ['schemaVersion', 'bookId', 'sourceToken', 'origin', 'universeToken']) ||
    !matches(value, anchor) ||
    !validHash(value.universeToken)
  )
    invalid();
  return Object.freeze({
    source: anchor,
    origin: origin(value.origin),
    universeToken: value.universeToken,
  });
}
/** The record remains provisional until all proofs pass and M2 is sealed. */
export async function captureBookBackupUniverse(options: {
  bookId: string;
  write: (record: BookBackupRecord) => Promise<void>;
  source?: BookStructureSource;
  signal?: AbortSignal;
  api?: BookUniverseApi;
}): Promise<BookUniverseProof> {
  const { bookId, write, signal, api = bookUniverseApi } = options;
  if (!validId(bookId)) invalid();
  const expected =
    options.source === undefined ? undefined : source(options.source, bookId).sourceToken;
  check(signal);
  const anchor = source(
    await api.getSource({
      bookId,
      ...(expected === undefined ? {} : { expectedSourceToken: expected }),
    }),
    bookId,
    expected,
  );
  check(signal);
  const proof = response(await api.read({ bookId, sourceToken: anchor.sourceToken }), anchor);
  check(signal);
  await write({
    kind: 'book-universe',
    id: bookId,
    part: 0,
    payload: new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, origin: proof.origin })),
  });
  check(signal);
  return proof;
}
export async function verifyBookBackupUniverse(
  proof: BookUniverseProof,
  options: { signal?: AbortSignal; api?: BookUniverseApi } = {},
): Promise<void> {
  if (
    !closed(proof, ['source', 'origin', 'universeToken']) ||
    !proof.source ||
    !validId(proof.source.bookId) ||
    !validHash(proof.universeToken)
  )
    invalid();
  const anchor = source(proof.source, proof.source.bookId),
    expectedOrigin = origin(proof.origin),
    expectedToken = proof.universeToken,
    { signal, api = bookUniverseApi } = options;
  check(signal);
  const current = response(
    await api.read({
      bookId: anchor.bookId,
      sourceToken: anchor.sourceToken,
      expectedUniverseToken: expectedToken,
    }),
    anchor,
  );
  check(signal);
  if (
    current.universeToken !== expectedToken ||
    JSON.stringify(current.origin) !== JSON.stringify(expectedOrigin)
  )
    invalid();
}
