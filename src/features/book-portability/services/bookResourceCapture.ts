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
import { createBookBackupLorePort, type BookBackupLorePort } from './bookBackupLorePort';
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
  loreDigest: string;
}
const contexts = new WeakMap<BookResourceProof, BookBackupLorePort>();
const loreSeed = () => textHash('writer-book-logical-lore-v1');
function loreSource(
  bookId: string,
  id: string,
  value: { bookId: string; id: string; readToken: string },
) {
  if (!value || value.bookId !== bookId || value.id !== id || !validHash(value.readToken))
    invalid();
  return value.readToken;
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
  lore: BookBackupLorePort,
  signal?: AbortSignal,
  visit?: (scope: BookResourceScope, item: BookStructureItem) => Promise<void>,
): Promise<Pick<BookResourceProof, 'digest' | 'counts'>> {
  let digest = await textHash('writer-book-resources-v1');
  const counts = countsCopy();
  async function walk(scope: BookResourceScope, depth = 0) {
    if (depth > 1) invalid();
    check(signal);
    lore.guard();
    digest = await textHash(JSON.stringify([digest, 'scope', scope.kind, scope.parentId]));
    let cursor: string | null = null,
      last: string | null = null;
    do {
      check(signal);
      lore.guard();
      const current = await api.list({
        bookId: anchor.bookId,
        sourceToken: anchor.sourceToken,
        ...scope,
        cursor,
        limit: 50,
      });
      check(signal);
      lore.guard();
      page(current, anchor, scope, last);
      const next: string | null = current.nextCursor;
      if (next !== null && next === cursor) invalid();
      const items = current.items.map((item) => ({ id: item.id, itemToken: item.itemToken }));
      for (const item of items) {
        digest = await textHash(
          JSON.stringify([digest, 'item', scope.kind, scope.parentId, item.id, item.itemToken]),
        );
        check(signal);
        lore.guard();
        if (visit) await visit(scope, item);
        check(signal);
        lore.guard();
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
  lore?: BookBackupLorePort;
}
/** Provisional until every section is revalidated and the M2 archive is sealed. */
export async function captureBookBackupResources(
  options: BookResourceCaptureOptions,
): Promise<BookResourceProof> {
  const { bookId, write, signal, api = bookResourceApi } = options,
    lore = { ...(options.lore ?? createBookBackupLorePort()) };
  if (!validId(bookId)) invalid();
  const expected =
    options.source === undefined ? undefined : source(options.source, bookId).sourceToken;
  check(signal);
  lore.guard();
  let loreDigest = await loreSeed();
  check(signal);
  lore.guard();
  const emit = async (record: BookBackupRecord) => {
    check(signal);
    lore.guard();
    await write(record);
    check(signal);
    lore.guard();
  };
  const anchor = source(
    await api.getSource({
      bookId,
      ...(expected === undefined ? {} : { expectedSourceToken: expected }),
    }),
    bookId,
    expected,
  );
  check(signal);
  lore.guard();
  const result = await scan(api, anchor, lore, signal, async (scope, item) => {
    const address = await hash(
      new TextEncoder().encode(JSON.stringify([scope.kind, scope.parentId, item.id])),
    );
    check(signal);
    lore.guard();
    if (scope.kind === 'lore') {
      const proof = await lore.writePortable(
        bookId,
        item.id,
        (part, payload) => emit({ kind: 'book-lore', id: address, part, payload }),
        signal,
      );
      loreDigest = await textHash(
        JSON.stringify([loreDigest, item.id, loreSource(bookId, item.id, proof.source)]),
      );
      return;
    }
    await writeSnapshotItem(
      anchor,
      { ...scope, ...item },
      async (index) => {
        check(signal);
        lore.guard();
        const result = await api.read({
          bookId,
          sourceToken: anchor.sourceToken,
          ...scope,
          ...item,
          index,
        });
        check(signal);
        lore.guard();
        return result;
      },
      (part, payload) => emit({ kind: 'book-' + scope.kind, id: address, part, payload }),
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
  lore.guard();
  const counts = Object.freeze({ ...result.counts });
  await emit({
    kind: 'book-resources',
    id: bookId,
    part: 0,
    payload: new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, counts })),
  });
  check(signal);
  lore.guard();
  const proof = Object.freeze({ source: anchor, digest: result.digest, counts, loreDigest });
  contexts.set(proof, lore);
  return proof;
}
export async function verifyBookBackupResources(
  proof: BookResourceProof,
  options: { signal?: AbortSignal; api?: BookResourceApi; lore?: BookBackupLorePort } = {},
): Promise<void> {
  if (
    !closed(proof, ['source', 'digest', 'counts', 'loreDigest']) ||
    !validHash(proof.loreDigest) ||
    !validHash(proof.digest) ||
    !closed(proof.counts, [...BOOK_RESOURCE_KINDS]) ||
    !proof.source ||
    !validId(proof.source.bookId)
  )
    invalid();
  const anchor = source(proof.source, proof.source.bookId),
    counts = countsCopy(proof.counts),
    expected = proof.digest,
    expectedLore = proof.loreDigest,
    { signal, api = bookResourceApi } = options,
    original = contexts.get(proof),
    selected = { ...(options.lore ?? original ?? createBookBackupLorePort()) },
    lore = {
      ...selected,
      guard: () => {
        original?.guard();
        selected.guard();
      },
    };
  let loreDigest = await loreSeed();
  check(signal);
  lore.guard();
  const current = await scan(api, anchor, lore, signal, async (scope, item) => {
    if (scope.kind !== 'lore') return;
    const header = await lore.portableMetadata(anchor.bookId, item.id, signal);
    loreDigest = await textHash(
      JSON.stringify([loreDigest, item.id, loreSource(anchor.bookId, item.id, header)]),
    );
  });
  if (
    current.digest !== expected ||
    loreDigest !== expectedLore ||
    BOOK_RESOURCE_KINDS.some((kind) => current.counts[kind] !== counts[kind])
  )
    invalid();
  check(signal);
  lore.guard();
  source(
    await api.getSource({ bookId: anchor.bookId, expectedSourceToken: anchor.sourceToken }),
    anchor.bookId,
    anchor.sourceToken,
  );
  check(signal);
  lore.guard();
}
