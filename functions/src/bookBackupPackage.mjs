import { BookBackupFormatError, decodeBookBackup } from './bookBackupContainer.mjs';
export const BOOK_PACKAGE_FORMAT = 'writer-book-archive';
export const BOOK_PACKAGE_VERSION = 1;
export const BOOK_PACKAGE_SECTIONS = Object.freeze([
  'structure',
  'resources',
  'personas',
  'universe',
  'history',
  'draft',
  'cover',
]);
const kinds = Object.freeze({
  structure: Object.freeze(['book-metadata', 'act', 'chapter']),
  resources: Object.freeze([
    'book-lore',
    'book-scene-control',
    'book-scene-source',
    'book-scene',
    'book-scene-body',
    'book-scene-planning',
    'book-scene-reference',
    'book-narrative-control',
    'book-arc',
    'book-milestone',
    'book-event',
    'book-narrative-link',
    'book-resources',
  ]),
  personas: Object.freeze(['book-persona', 'book-personas']),
  universe: Object.freeze(['book-universe']),
  history: Object.freeze(['work-version', 'work-version-text', 'work-history']),
  draft: Object.freeze(['book-draft', 'book-draft-text']),
  cover: Object.freeze(['book-cover', 'book-cover-bytes']),
});
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
function invalid() {
  throw new BookBackupFormatError(
    'invalid-record',
    'O pacote de livro está incompleto ou fora do contrato.',
  );
}
const closed = (value, keys) =>
  Boolean(
    value &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    Object.keys(value).every((key) => keys.includes(key)),
  );
function id(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    // eslint-disable-next-line no-control-regex -- Portable IDs reject control characters.
    /[\\/\u0000-\u001f\u007f]/.test(value) ||
    ['.', '..'].includes(value) ||
    encoder.encode(value).length > 1500 ||
    decoder.decode(encoder.encode(value)) !== value
  )
    invalid();
  return value;
}
const count = (value) => Number.isSafeInteger(value) && value >= 0;
export function bookPackageSection(kind) {
  return BOOK_PACKAGE_SECTIONS.find((section) => kinds[section].includes(kind)) ?? null;
}
export function createBookPackageCounts() {
  return Object.fromEntries(
    BOOK_PACKAGE_SECTIONS.map((section) => [section, { records: 0, payloadBytes: 0 }]),
  );
}
export function countBookPackageRecord(counts, section, record) {
  if (
    !BOOK_PACKAGE_SECTIONS.includes(section) ||
    bookPackageSection(record.kind) !== section ||
    record.payload.byteLength > 65536
  )
    invalid();
  const item = counts[section],
    records = item.records + 1,
    payloadBytes = item.payloadBytes + record.payload.byteLength;
  if (!count(records) || !count(payloadBytes)) invalid();
  item.records = records;
  item.payloadBytes = payloadBytes;
}
function countsCopy(value, complete = true) {
  if (!closed(value, [...BOOK_PACKAGE_SECTIONS])) invalid();
  return Object.freeze(
    Object.fromEntries(
      BOOK_PACKAGE_SECTIONS.map((section) => {
        const item = value[section];
        if (
          !closed(item, ['records', 'payloadBytes']) ||
          !count(item.records) ||
          !count(item.payloadBytes) ||
          (complete && item.records < 1)
        )
          invalid();
        return [section, Object.freeze({ records: item.records, payloadBytes: item.payloadBytes })];
      }),
    ),
  );
}
export function bookPackageHeader(bookId) {
  return {
    kind: 'book-package',
    id: id(bookId),
    part: 0,
    payload: encoder.encode(
      JSON.stringify({
        format: BOOK_PACKAGE_FORMAT,
        version: BOOK_PACKAGE_VERSION,
        containerVersion: 1,
        projectKind: 'book',
        bookId,
        sections: [...BOOK_PACKAGE_SECTIONS],
      }),
    ),
  };
}
export function bookPackageEnd(bookId, counts) {
  return {
    kind: 'book-package-end',
    id: id(bookId),
    part: 0,
    payload: encoder.encode(JSON.stringify({ schemaVersion: 1, sections: countsCopy(counts) })),
  };
}
function control(record) {
  if (record.part !== 0 || record.payload.byteLength > 65536) invalid();
  try {
    const text = decoder.decode(record.payload);
    return { text, value: JSON.parse(text) };
  } catch {
    return invalid();
  }
}
function header(record) {
  if (record.kind !== 'book-package') invalid();
  const parsed = control(record),
    value = parsed.value;
  if (
    !closed(value, [
      'format',
      'version',
      'containerVersion',
      'projectKind',
      'bookId',
      'sections',
    ]) ||
    value.format !== BOOK_PACKAGE_FORMAT
  )
    invalid();
  if (value.version !== BOOK_PACKAGE_VERSION || value.containerVersion !== 1)
    throw new BookBackupFormatError('unsupported-version', 'Versão de pacote não suportada.');
  if (
    value.projectKind !== 'book' ||
    value.bookId !== record.id ||
    JSON.stringify(value.sections) !== JSON.stringify(BOOK_PACKAGE_SECTIONS) ||
    parsed.text !== decoder.decode(bookPackageHeader(value.bookId).payload)
  )
    invalid();
  return Object.freeze({
    format: BOOK_PACKAGE_FORMAT,
    version: 1,
    containerVersion: 1,
    projectKind: 'book',
    bookId: value.bookId,
    sections: BOOK_PACKAGE_SECTIONS,
  });
}
/** Exposed data remain provisional until the returned report proves footer, seal and exact EOF. */
export async function* readBookBackupPackage(source, options = {}) {
  const stream = decodeBookBackup(source, options),
    counts = createBookPackageCounts();
  let complete = false,
    manifest,
    ended = false,
    sectionIndex = -1;
  try {
    const first = await stream.next();
    if (first.done) invalid();
    manifest = header(first.value);
    yield { type: 'manifest', manifest };
    for (;;) {
      options.signal?.throwIfAborted();
      const next = await stream.next();
      if (next.done) {
        if (!ended || !next.value) invalid();
        complete = true;
        return Object.freeze({
          validation: 'envelope-only',
          manifest,
          sections: countsCopy(counts),
          seal: Object.freeze({ ...next.value }),
        });
      }
      const record = next.value;
      if (ended) invalid();
      if (record.kind === 'book-package-end') {
        if (record.id !== manifest.bookId || sectionIndex !== BOOK_PACKAGE_SECTIONS.length - 1)
          invalid();
        const parsed = control(record);
        if (
          !closed(parsed.value, ['schemaVersion', 'sections']) ||
          parsed.value.schemaVersion !== 1 ||
          JSON.stringify(countsCopy(parsed.value.sections)) !==
            JSON.stringify(countsCopy(counts)) ||
          parsed.text !== decoder.decode(bookPackageEnd(manifest.bookId, counts).payload)
        )
          invalid();
        ended = true;
        continue;
      }
      const section = bookPackageSection(record.kind),
        index = BOOK_PACKAGE_SECTIONS.indexOf(section);
      if (!section || index < sectionIndex || index > sectionIndex + 1) invalid();
      sectionIndex = index;
      countBookPackageRecord(counts, section, record);
      yield { type: 'record', section, record };
    }
  } finally {
    if (!complete) await stream.return(undefined);
  }
}
export async function inspectBookBackupPackage(source, options = {}) {
  const stream = readBookBackupPackage(source, options);
  for (;;) {
    const next = await stream.next();
    if (next.done) {
      if (!next.value) invalid();
      return next.value;
    }
  }
}
