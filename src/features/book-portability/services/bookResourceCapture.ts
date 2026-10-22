import {
  BOOK_RESOURCE_KINDS,
  BOOK_RESOURCE_ROOTS,
  BOOK_RESOURCE_CHILDREN,
  BOOK_RESOURCE_SINGLETONS,
  type BookResourceApi,
  type BookResourceKind,
  type BookResourceScope,
  type BookResourcePage,
} from '../../../../functions/src/bookBackupResources.mjs';
import type {
  BookStructureSource,
  BookStructureItem,
} from '../../../../functions/src/bookBackupStructure.mjs';
import type { BookBackupRecord } from '../model/backupContainer';
import { bookResourceApi } from './bookResourceCallables';
import {
  check,
  closed,
  invalid,
  validId,
  validHash,
  validCount,
  source,
  matches,
  hash,
  textHash,
  compareIds,
  writeSnapshotItem,
} from './bookSnapshotCapture';

export interface BookResourceProof {
  source: BookStructureSource;
  digest: string;
  counts: Record<BookResourceKind, number>;
}
function countsCopy(value?: Record<BookResourceKind, number>) {
  if (
    value &&
    (!closed(value, [...BOOK_RESOURCE_KINDS]) ||
      !BOOK_RESOURCE_KINDS.every((kind) => validCount(value[kind])))
  )
    invalid();
  return Object.fromEntries(
    BOOK_RESOURCE_KINDS.map((kind) => [kind, value?.[kind] ?? 0]),
  ) as Record<BookResourceKind, number>;
}
function page(
  value: BookResourcePage,
  anchor: BookStructureSource,
  scope: BookResourceScope,
  last: string | null,
) {
  if (
    !closed(value, [
      'schemaVersion',
      'bookId',
      'sourceToken',
      'kind',
      'parentId',
      'items',
      'nextCursor',
    ]) ||
    !matches(value, anchor) ||
    value.kind !== scope.kind ||
    value.parentId !== scope.parentId ||
    !Array.isArray(value.items) ||
    value.items.length > 50 ||
    (value.nextCursor !== null &&
      (typeof value.nextCursor !== 'string' ||
        !value.nextCursor ||
        value.nextCursor.length > 16000 ||
        value.items.length !== 50))
  )
    invalid();
  const singleton = BOOK_RESOURCE_SINGLETONS[scope.kind];
  if (singleton && (value.items.length > 1 || value.nextCursor !== null)) invalid();
  if (scope.kind === 'scene-body' && value.items.length !== 1) invalid();
  let previous = last;
  for (const item of value.items) {
    if (
      !closed(item, ['id', 'itemToken']) ||
      !validId(item.id) ||
      !validHash(item.itemToken) ||
      (singleton !== undefined && item.id !== singleton) ||
      (previous !== null && compareIds(previous, item.id) >= 0)
    )
      invalid();
    previous = item.id;
  }
}
async function scan(
  api: BookResourceApi,
  anchor: BookStructureSource,
  signal?: AbortSignal,
  visit?: (scope: BookResourceScope, item: BookStructureItem) => Promise<void>,
): Promise<Pick<BookResourceProof, 'digest' | 'counts'>> {
  let digest = await textHash('writer-book-resources-v1');
  const counts = countsCopy();
  async function walk(scope: BookResourceScope, depth = 0) {
    if (depth > 1) invalid();
    check(signal);
    digest = await textHash(JSON.stringify([digest, 'scope', scope.kind, scope.parentId]));
    let cursor: string | null = null,
      last: string | null = null;
    do {
      check(signal);
      const current = await api.list({
        bookId: anchor.bookId,
        sourceToken: anchor.sourceToken,
        ...scope,
        cursor,
        limit: 50,
      });
      check(signal);
      page(current, anchor, scope, last);
      const next: string | null = current.nextCursor;
      if (next !== null && next === cursor) invalid();
      const items = current.items.map((item) => ({ id: item.id, itemToken: item.itemToken }));
      for (const item of items) {
        digest = await textHash(
          JSON.stringify([digest, 'item', scope.kind, scope.parentId, item.id, item.itemToken]),
        );
        check(signal);
        if (visit) await visit(scope, item);
        check(signal);
        counts[scope.kind]++;
        if (!validCount(counts[scope.kind])) invalid();
        last = item.id;
        for (const kind of BOOK_RESOURCE_CHILDREN[scope.kind] ?? [])
          await walk({ kind, parentId: item.id }, depth + 1);
      }
      cursor = next;
    } while (cursor !== null);
  }
  for (const kind of BOOK_RESOURCE_ROOTS) await walk({ kind, parentId: null });
  return { digest, counts };
}
export interface BookResourceCaptureOptions {
  bookId: string;
  write: (record: BookBackupRecord) => Promise<void>;
  source?: BookStructureSource;
  signal?: AbortSignal;
  api?: BookResourceApi;
}
/** Provisional until every section is revalidated and the M2 archive is sealed. */
export async function captureBookBackupResources(
  options: BookResourceCaptureOptions,
): Promise<BookResourceProof> {
  const { bookId, write, signal, api = bookResourceApi } = options;
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
  const result = await scan(api, anchor, signal, async (scope, item) => {
    const address = await hash(
      new TextEncoder().encode(JSON.stringify([scope.kind, scope.parentId, item.id])),
    );
    check(signal);
    await writeSnapshotItem(
      anchor,
      { ...scope, ...item },
      (index) => api.read({ bookId, sourceToken: anchor.sourceToken, ...scope, ...item, index }),
      (part, payload) => write({ kind: 'book-' + scope.kind, id: address, part, payload }),
      signal,
      (value) =>
        closed(value, ['schemaVersion', 'kind', 'parentId', 'id', 'data']) &&
        value.schemaVersion === 1 &&
        value.kind === scope.kind &&
        value.parentId === scope.parentId &&
        value.id === item.id &&
        Boolean(value.data && typeof value.data === 'object' && !Array.isArray(value.data)),
    );
  });
  check(signal);
  const counts = Object.freeze({ ...result.counts });
  await write({
    kind: 'book-resources',
    id: bookId,
    part: 0,
    payload: new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, counts })),
  });
  check(signal);
  return Object.freeze({ source: anchor, digest: result.digest, counts });
}
export async function verifyBookBackupResources(
  proof: BookResourceProof,
  options: { signal?: AbortSignal; api?: BookResourceApi } = {},
): Promise<void> {
  if (
    !closed(proof, ['source', 'digest', 'counts']) ||
    !validHash(proof.digest) ||
    !closed(proof.counts, [...BOOK_RESOURCE_KINDS]) ||
    !proof.source ||
    !validId(proof.source.bookId)
  )
    invalid();
  const anchor = source(proof.source, proof.source.bookId),
    counts = countsCopy(proof.counts),
    expected = proof.digest,
    { signal, api = bookResourceApi } = options;
  check(signal);
  const current = await scan(api, anchor, signal);
  if (
    current.digest !== expected ||
    BOOK_RESOURCE_KINDS.some((kind) => current.counts[kind] !== counts[kind])
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
