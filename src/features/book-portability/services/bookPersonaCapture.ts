import {
  BOOK_PERSONA_SCOPES,
  projectBookBackupPersona,
  type BookPersonaApi,
  type BookPersonaScope,
  type BookPersonaPage,
  type BookPersonaBinding,
} from '../../../../functions/src/bookBackupPersonas.mjs';
import type { BookStructureSource } from '../../../../functions/src/bookBackupStructure.mjs';
import type { BookBackupRecord } from '../model/backupContainer';
import { bookPersonaApi } from './bookPersonaCallables';
import {
  check,
  closed,
  invalid,
  validId,
  validHash,
  validCount,
  source,
  matches,
  compareIds,
  textHash,
  writeSnapshotItem,
} from './bookSnapshotCapture';
type Counts = Record<BookPersonaScope, number>;
export interface BookPersonaProof {
  source: BookStructureSource;
  digest: string;
  owners: Counts;
  bindings: Counts;
}
const emptyCounts = (): Counts => ({ book: 0, chapter: 0, 'scene-source': 0 });
function counts(value: unknown): Counts {
  if (
    !closed(value, [...BOOK_PERSONA_SCOPES]) ||
    !BOOK_PERSONA_SCOPES.every((kind) => validCount(value[kind]))
  )
    invalid();
  return {
    book: Number(value.book),
    chapter: Number(value.chapter),
    'scene-source': Number(value['scene-source']),
  };
}
function page(
  value: BookPersonaPage,
  anchor: BookStructureSource,
  kind: BookPersonaScope,
  last: string | null,
) {
  if (
    !closed(value, ['schemaVersion', 'bookId', 'sourceToken', 'kind', 'items', 'nextCursor']) ||
    !matches(value, anchor) ||
    value.kind !== kind ||
    !Array.isArray(value.items) ||
    value.items.length > 50 ||
    (value.nextCursor !== null &&
      (typeof value.nextCursor !== 'string' ||
        !value.nextCursor ||
        value.nextCursor.length > 16000 ||
        value.items.length !== 50))
  )
    invalid();
  if (kind === 'book' && (value.items.length !== 1 || value.nextCursor !== null)) invalid();
  let previous = last;
  for (const item of value.items) {
    if (
      !closed(item, ['id', 'personaId', 'itemToken']) ||
      !validId(item.id) ||
      !validHash(item.itemToken) ||
      (item.personaId !== null &&
        (typeof item.personaId !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(item.personaId))) ||
      (kind === 'book' && item.id !== anchor.bookId) ||
      (previous !== null && compareIds(previous, item.id) >= 0)
    )
      invalid();
    previous = item.id;
  }
}
async function scan(
  api: BookPersonaApi,
  anchor: BookStructureSource,
  signal?: AbortSignal,
  visit?: (kind: BookPersonaScope, item: BookPersonaBinding) => Promise<void>,
): Promise<Pick<BookPersonaProof, 'digest' | 'owners' | 'bindings'>> {
  let digest = await textHash('writer-book-personas-v1');
  const owners = emptyCounts(),
    bindings = emptyCounts();
  for (const kind of BOOK_PERSONA_SCOPES) {
    check(signal);
    digest = await textHash(JSON.stringify([digest, 'scope', kind]));
    let cursor: string | null = null,
      last: string | null = null;
    do {
      check(signal);
      const current = await api.list({
        bookId: anchor.bookId,
        sourceToken: anchor.sourceToken,
        kind,
        cursor,
        limit: 50,
      });
      check(signal);
      page(current, anchor, kind, last);
      const next: string | null = current.nextCursor;
      if (next !== null && next === cursor) invalid();
      const items = current.items.map((item) => ({ ...item }));
      for (const item of items) {
        digest = await textHash(
          JSON.stringify([digest, kind, item.id, item.personaId, item.itemToken]),
        );
        check(signal);
        if (item.personaId !== null) {
          if (visit) await visit(kind, item);
          bindings[kind]++;
        }
        check(signal);
        owners[kind]++;
        if (!validCount(owners[kind]) || !validCount(bindings[kind])) invalid();
        last = item.id;
      }
      cursor = next;
    } while (cursor !== null);
  }
  return { digest, owners, bindings };
}
function envelope(value: unknown, kind: BookPersonaScope, item: BookPersonaBinding): boolean {
  if (
    !closed(value, ['schemaVersion', 'scope', 'ownerId', 'personaId', 'profile']) ||
    value.schemaVersion !== 1 ||
    value.scope !== kind ||
    value.ownerId !== item.id ||
    value.personaId !== item.personaId ||
    !closed(value.profile, [
      'id',
      'schemaVersion',
      'name',
      'description',
      'instructions',
      'traits',
      'revision',
      'archived',
      'createdAt',
      'updatedAt',
    ]) ||
    value.profile.id !== item.personaId ||
    !Array.isArray(value.profile.traits) ||
    !value.profile.traits.every((trait) =>
      closed(trait, ['id', 'name', 'description', 'low', 'high', 'value']),
    )
  )
    return false;
  projectBookBackupPersona(value.profile);
  return true;
}
export async function captureBookBackupPersonas(options: {
  bookId: string;
  write: (record: BookBackupRecord) => Promise<void>;
  source?: BookStructureSource;
  signal?: AbortSignal;
  api?: BookPersonaApi;
}): Promise<BookPersonaProof> {
  const { bookId, write, signal, api = bookPersonaApi } = options;
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
  const result = await scan(api, anchor, signal, async (kind, item) => {
    const id = await textHash(JSON.stringify([kind, item.id]));
    check(signal);
    await writeSnapshotItem(
      anchor,
      { kind, id: item.id, itemToken: item.itemToken },
      (index) =>
        api.read({
          bookId,
          sourceToken: anchor.sourceToken,
          kind,
          id: item.id,
          itemToken: item.itemToken,
          index,
        }),
      (part, payload) => write({ kind: 'book-persona', id, part, payload }),
      signal,
      (value) => envelope(value, kind, item),
    );
  });
  check(signal);
  const owners = Object.freeze({ ...result.owners }),
    bindings = Object.freeze({ ...result.bindings });
  await write({
    kind: 'book-personas',
    id: bookId,
    part: 0,
    payload: new TextEncoder().encode(JSON.stringify({ schemaVersion: 1, owners, bindings })),
  });
  check(signal);
  return Object.freeze({ source: anchor, digest: result.digest, owners, bindings });
}
export async function verifyBookBackupPersonas(
  proof: BookPersonaProof,
  options: { signal?: AbortSignal; api?: BookPersonaApi } = {},
): Promise<void> {
  if (
    !closed(proof, ['source', 'digest', 'owners', 'bindings']) ||
    !validHash(proof.digest) ||
    !proof.source ||
    !validId(proof.source.bookId)
  )
    invalid();
  const anchor = source(proof.source, proof.source.bookId),
    owners = counts(proof.owners),
    bindings = counts(proof.bindings),
    expected = proof.digest,
    { signal, api = bookPersonaApi } = options;
  check(signal);
  const current = await scan(api, anchor, signal);
  if (
    current.digest !== expected ||
    BOOK_PERSONA_SCOPES.some(
      (kind) => current.owners[kind] !== owners[kind] || current.bindings[kind] !== bindings[kind],
    )
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
