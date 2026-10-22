import { BookBackupFormatError } from './bookBackupContainer.mjs';
import { scanBookLegacyJSON, readBookLegacyJSONSpan } from './bookLegacyJSON.mjs';
import {
  bookContentInvalid as bad,
  bookContentClosed as closed,
  bookContentCount as count,
  bookContentId as id,
  validateBookBackupJSONItem as validate,
} from './bookBackupSchema.mjs';
const roots = [
  'format',
  'version',
  'book',
  'chapters',
  'lore',
  'universe',
  'personas',
  'acts',
  'scenes',
  'narrative',
];
export const BOOK_LEGACY_SECTIONS = Object.freeze([
  'chapters',
  'lore',
  'personas',
  'acts',
  'groups',
  'scenes',
  'sources',
  'arcs',
  'milestones',
  'events',
]);
const containers = {
  scenes: ['schemaVersion', 'projectRevision', 'groups', 'scenes', 'sources'],
  narrative: ['schemaVersion', 'projectRevision', 'sceneRevision', 'arcs', 'milestones', 'events'],
  universe: ['id', 'name', 'description', 'lore'],
};
const arrays = {
  scenes: ['groups', 'scenes', 'sources'],
  narrative: ['arcs', 'milestones', 'events'],
};
export const legacyPick = (value, keys) =>
  Object.fromEntries(keys.filter((k) => Object.hasOwn(value, k)).map((k) => [k, value[k]]));
export async function createBookLegacyCatalog(source, { index, hash, signal }) {
  const counts = Object.fromEntries(BOOK_LEGACY_SECTIONS.map((k) => [k, 0])),
    present = new Set(),
    nested = { scenes: new Set(), narrative: new Set(), universe: new Set() };
  let format,
    version,
    universeId = null,
    ignoredGlobalEntries = 0;
  const scalar = (span) => readBookLegacyJSONSpan(source, span, { signal });
  const add = async (key, value) => {
    signal?.throwIfAborted();
    await index.add(key, value);
    signal?.throwIfAborted();
  };
  const receipt = await scanBookLegacyJSON(source, {
    hash,
    signal,
    onValue: async (span) => {
      const p = span.path,
        [a, b, c] = p;
      if (p.length === 0 && span.type !== 'object') bad();
      if (p.length === 1) {
        if (!roots.includes(a)) bad();
        present.add(a);
        if (a === 'format') {
          if (span.type !== 'string' || (await scalar(span)) !== 'writer-book-backup') bad();
          format = 'writer-book-backup';
        } else if (a === 'version') {
          version = await scalar(span);
          if (![1, 2, 3, 4, 5, 6].includes(version))
            throw new BookBackupFormatError(
              'unsupported-version',
              'Versão de backup JSON não suportada.',
            );
        } else if (a === 'book') {
          if (span.type !== 'object' || span.end - span.start > 8 * 1024 * 1024) bad();
          await add(['legacy', 'book', '0'], { start: span.start, end: span.end });
        } else if (['chapters', 'lore', 'personas', 'acts'].includes(a)) {
          if (span.type !== 'array') bad();
        } else if (span.type !== 'object') bad();
      }
      if (p.length === 2 && Object.hasOwn(containers, a)) {
        if (!containers[a].includes(b)) bad();
        nested[a].add(b);
        if (a === 'universe') {
          if (b === 'id') {
            universeId = await scalar(span);
            if (typeof universeId !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(universeId)) bad();
          } else if (b === 'lore') {
            if (span.type !== 'array') bad();
          } else if (span.type !== 'string') bad();
        } else if (arrays[a].includes(b)) {
          if (span.type !== 'array') bad();
        } else {
          const value = await scalar(span);
          count(value);
          if (b === 'schemaVersion' && value !== 1) bad();
        }
      }
      if (p.length === 3 && a === 'universe' && b === 'lore' && typeof c === 'number')
        ignoredGlobalEntries = count(ignoredGlobalEntries + 1);
      const section =
        p.length === 2 &&
        ['chapters', 'lore', 'personas', 'acts'].includes(a) &&
        typeof b === 'number'
          ? a
          : p.length === 3 && arrays[a]?.includes(b) && typeof c === 'number'
            ? b
            : null;
      if (section) {
        if (span.type !== 'object' || span.end - span.start > 8 * 1024 * 1024) bad();
        const position = counts[section]++;
        count(counts[section]);
        await add(['legacy', section, String(position)], { start: span.start, end: span.end });
      }
    },
  });
  if (
    !['format', 'version', 'book', 'chapters', 'lore'].every((k) => present.has(k)) ||
    !format ||
    !version
  )
    bad();
  for (const [key, min] of [
    ['universe', 2],
    ['personas', 3],
    ['acts', 4],
    ['scenes', 5],
    ['narrative', 6],
  ])
    if (present.has(key) && version < min) bad();
  if (
    (version === 2 && !present.has('universe')) ||
    (version === 3 && !present.has('personas')) ||
    (version === 4 && !present.has('acts')) ||
    (version === 5 && !present.has('scenes')) ||
    (version === 6 && !present.has('narrative'))
  )
    bad();
  for (const kind of ['scenes', 'narrative'])
    if (present.has(kind) && !containers[kind].every((k) => nested[kind].has(k))) bad();
  if (present.has('universe') && !nested.universe.has('id')) bad();
  async function item(section, position = 0) {
    signal?.throwIfAborted();
    const span = await index.get(['legacy', section, String(position)]);
    signal?.throwIfAborted();
    if (!span) bad();
    return readBookLegacyJSONSpan(source, span, { signal });
  }
  const book = await item('book');
  closed(
    book,
    ['id', 'title'],
    [
      'genre',
      'synopsis',
      'status',
      'coverUrl',
      'createdAt',
      'updatedAt',
      'personaId',
      'universeId',
    ],
  );
  id(book.id);
  if (Object.hasOwn(book, 'status') && !['draft', 'published'].includes(book.status)) bad();
  if (
    Object.hasOwn(book, 'coverUrl') &&
    book.coverUrl !== null &&
    typeof book.coverUrl !== 'string'
  )
    bad();
  if (
    (book.personaId && version < 3) ||
    (book.universeId && version < 2) ||
    (universeId !== null && book.universeId !== universeId)
  )
    bad();
  if (
    book.universeId !== undefined &&
    book.universeId !== null &&
    !/^[a-zA-Z0-9_-]{1,128}$/.test(book.universeId)
  )
    bad();
  const coverState = !Object.hasOwn(book, 'coverUrl')
    ? 'not-recorded'
    : book.coverUrl
      ? 'url-only'
      : 'none-declared';
  const cover = { kind: coverState === 'none-declared' ? 'none' : 'legacy-unavailable' };
  validate(
    'book-metadata',
    {
      book: legacyPick(book, [
        'title',
        'genre',
        'synopsis',
        'createdAt',
        'updatedAt',
        'personaId',
        'universeId',
      ]),
      progress: {},
      cover,
    },
    book.id,
  );
  const provenance = {
    format,
    version,
    ...receipt,
    bookId: book.id,
    universeCandidate: book.universeId
      ? { id: book.universeId, incarnation: 'not-recorded' }
      : null,
    availability: {
      history: 'not-recorded',
      progress: 'not-recorded',
      draft: 'not-separable',
      cover: coverState,
      inactiveRanks:
        present.has('scenes') || present.has('narrative') ? 'not-recorded' : 'not-applicable',
    },
    ignoredGlobalEntries,
    publicationDiscarded: book.status === 'published',
  };
  return {
    counts,
    provenance,
    bookId: book.id,
    bookPersonaId: book.personaId ?? null,
    bookUniverseId: book.universeId ?? null,
    cover,
    item,
    present,
  };
}
