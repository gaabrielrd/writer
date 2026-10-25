import {
  invalidLoreRead,
  readObject,
  readManifest,
  readCount,
  type LoreReadHeader,
  type LoreReadField,
  type LoreReadManifest,
  type LoreReadCall,
  type LoreReadGuard,
} from './bookLoreReadContracts';
const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
/** One authenticated native unit. Whole-body SHA/domain remain the consumer's responsibility. */
export function createBookLoreUnitReader(
  call: LoreReadCall,
  guard: LoreReadGuard,
  view: LoreReadHeader,
  kind: 'base' | 'relations' | 'field',
  page: number,
  field?: LoreReadField,
) {
  readCount(page);
  if (
    (kind === 'base' && (page !== 0 || view.base === null)) ||
    (kind === 'field' &&
      (page !== 0 || view.schemaVersion !== 2 || !field || !view.fields[field])) ||
    (kind === 'relations' && (!view.relations || page >= view.relations.pages))
  )
    throw invalidLoreRead();
  let manifest: LoreReadManifest | undefined =
    kind === 'base'
      ? (view.base ?? undefined)
      : kind === 'field' && view.schemaVersion === 2 && field
        ? (view.fields[field] ?? undefined)
        : undefined;
  const offset = kind === 'relations' ? page * 64 : null,
    count = kind === 'relations' ? Math.min(64, view.relations!.count - page * 64) : null;
  return async (index: number) => {
    readCount(index);
    if ((manifest && index >= manifest.chunkCount) || (!manifest && index !== 0))
      throw invalidLoreRead();
    guard();
    const raw = await call('readBookLorePart', {
      bookId: view.bookId,
      id: view.id,
      readToken: view.readToken,
      section: kind,
      ...(kind === 'field' ? { field } : {}),
      page,
      index,
    });
    guard();
    const r = readObject(raw, [
        'schemaVersion',
        'bookId',
        'id',
        'readToken',
        'section',
        'page',
        'index',
        'manifest',
        'offset',
        'count',
        'chunkBase64',
        ...(kind === 'field' ? ['field'] : []),
      ]),
      actual = readManifest(r.manifest);
    if (
      r.schemaVersion !== 1 ||
      r.bookId !== view.bookId ||
      r.id !== view.id ||
      r.readToken !== view.readToken ||
      r.section !== kind ||
      (kind === 'field' && r.field !== field) ||
      r.page !== page ||
      r.index !== index ||
      r.offset !== offset ||
      r.count !== count ||
      (manifest !== undefined && !equal(actual, manifest)) ||
      typeof r.chunkBase64 !== 'string' ||
      r.chunkBase64.length > 87384
    )
      throw invalidLoreRead();
    manifest ??= actual;
    let binary: string;
    try {
      binary = atob(r.chunkBase64);
      if (btoa(binary) !== r.chunkBase64) throw invalidLoreRead();
    } catch {
      throw invalidLoreRead();
    }
    if (binary.length !== Math.min(65536, manifest.byteLength - index * 65536))
      throw invalidLoreRead();
    return { bytes: Uint8Array.from(binary, (c) => c.charCodeAt(0)), manifest };
  };
}
