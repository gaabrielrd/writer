import {
  closed,
  invalid,
  validId,
  validHash,
  validCount,
  source,
  matches,
  compareIds,
  textHash,
  check,
  writeSnapshotItem,
} from './bookSnapshotCapture';
export { BookStructureCaptureError } from './bookSnapshotCapture';
import {
  BOOK_STRUCTURE_LIMITS,
  type BookStructureApi,
  type BookStructureItem,
  type BookStructureKind,
  type BookStructurePage,
  type BookStructureSource,
} from '../../../../functions/src/bookBackupStructure.mjs';
import type { BookBackupRecord } from '../model/backupContainer';
import { bookStructureApi } from './bookStructureCallables';

export interface BookStructureProof {
  source: BookStructureSource;
  digest: string;
  acts: number;
  chapters: number;
}
function page(
  value: BookStructurePage,
  anchor: BookStructureSource,
  kind: 'act' | 'chapter',
  last: string | null,
) {
  if (
    !closed(value, ['schemaVersion', 'bookId', 'sourceToken', 'kind', 'items', 'nextCursor']) ||
    !matches(value, anchor) ||
    value.kind !== kind ||
    !Array.isArray(value.items) ||
    value.items.length > BOOK_STRUCTURE_LIMITS.pageItems ||
    (value.nextCursor !== null &&
      (typeof value.nextCursor !== 'string' ||
        !value.nextCursor ||
        value.nextCursor.length > 16000 ||
        value.items.length !== BOOK_STRUCTURE_LIMITS.pageItems))
  )
    invalid();
  let previous = last;
  for (const item of value.items) {
    if (
      !closed(item, ['id', 'itemToken']) ||
      !validId(item.id) ||
      !validHash(item.itemToken) ||
      (previous !== null && compareIds(previous, item.id) >= 0)
    )
      invalid();
    previous = item.id;
  }
}
async function scan(
  api: BookStructureApi,
  anchor: BookStructureSource,
  signal?: AbortSignal,
  visit?: (kind: 'act' | 'chapter', item: BookStructureItem) => Promise<void>,
): Promise<Pick<BookStructureProof, 'digest' | 'acts' | 'chapters'>> {
  let digest = await textHash('writer-book-structure-v1'),
    acts = 0,
    chapters = 0;
  check(signal);
  for (const kind of ['act', 'chapter'] as const) {
    let cursor: string | null = null,
      last: string | null = null;
    do {
      check(signal);
      const current = await api.list({
        bookId: anchor.bookId,
        sourceToken: anchor.sourceToken,
        kind,
        cursor,
        limit: BOOK_STRUCTURE_LIMITS.pageItems,
      });
      check(signal);
      page(current, anchor, kind, last);
      if (current.nextCursor !== null && current.nextCursor === cursor) invalid();
      const items = current.items.map((item) => ({ id: item.id, itemToken: item.itemToken }));
      const nextCursor: string | null = current.nextCursor;
      for (const item of items) {
        digest = await textHash(JSON.stringify([digest, kind, item.id, item.itemToken]));
        check(signal);
        if (visit) await visit(kind, item);
        check(signal);
        if (kind === 'act') acts++;
        else chapters++;
        if (!validCount(acts) || !validCount(chapters)) invalid();
        last = item.id;
      }
      cursor = nextCursor;
    } while (cursor !== null);
  }
  return { digest, acts, chapters };
}
function writeItem(
  api: BookStructureApi,
  anchor: BookStructureSource,
  kind: BookStructureKind,
  item: BookStructureItem,
  write: (record: BookBackupRecord) => Promise<void>,
  signal?: AbortSignal,
) {
  return writeSnapshotItem(
    anchor,
    { ...item, kind },
    (index) =>
      api.read({ bookId: anchor.bookId, sourceToken: anchor.sourceToken, kind, ...item, index }),
    (part, payload) =>
      write({ kind: kind === 'book' ? 'book-metadata' : kind, id: item.id, part, payload }),
    signal,
  );
}
export interface BookStructureCaptureOptions {
  bookId: string;
  write: (record: BookBackupRecord) => Promise<void>;
  source?: BookStructureSource;
  signal?: AbortSignal;
  api?: BookStructureApi;
}
/** Writes provisional records. Verify this proof after ALL other sections and before the archive seal. */
export async function captureBookBackupStructure(
  options: BookStructureCaptureOptions,
): Promise<BookStructureProof> {
  const { bookId, write, signal, api = bookStructureApi } = options;
  if (!validId(bookId)) invalid();
  const expected =
    options.source !== undefined ? source(options.source, bookId).sourceToken : undefined;
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
  await writeItem(
    api,
    anchor,
    'book',
    { id: bookId, itemToken: anchor.sourceToken },
    write,
    signal,
  );
  const result = await scan(api, anchor, signal, (kind, item) =>
    writeItem(api, anchor, kind, item, write, signal),
  );
  return Object.freeze({ source: anchor, ...result });
}
/** A successful check proves this segment only, never completeness or authorization of a whole archive. */
export async function verifyBookBackupStructure(
  proof: BookStructureProof,
  options: { signal?: AbortSignal; api?: BookStructureApi } = {},
): Promise<void> {
  if (
    !closed(proof, ['source', 'digest', 'acts', 'chapters']) ||
    !validHash(proof.digest) ||
    !validCount(proof.acts) ||
    !validCount(proof.chapters) ||
    !proof.source ||
    !validId(proof.source.bookId)
  )
    invalid();
  const anchor = source(proof.source, proof.source.bookId),
    expected = {
      digest: proof.digest,
      acts: proof.acts,
      chapters: proof.chapters,
    },
    { signal, api = bookStructureApi } = options;
  check(signal);
  const current = await scan(api, anchor, signal);
  if (
    current.digest !== expected.digest ||
    current.acts !== expected.acts ||
    current.chapters !== expected.chapters
  )
    invalid();
  check(signal);
  source(
    await api.getSource({ bookId: anchor.bookId, expectedSourceToken: anchor.sourceToken }),
    anchor.bookId,
    anchor.sourceToken,
  );
  check(signal);
}
