import { BookBackupFormatError, readBookBackupFrame } from './bookBackupContainer.mjs';
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
// Reader support is separate from the production default. V2 producers stay gated.
export const BOOK_PACKAGE_SUPPORTED_VERSIONS = Object.freeze([1, 2]);
const editorialSections = Object.freeze([...BOOK_PACKAGE_SECTIONS, 'editorial']);
export function bookPackageSections(version = BOOK_PACKAGE_VERSION) {
  if (!BOOK_PACKAGE_SUPPORTED_VERSIONS.includes(version))
    throw new BookBackupFormatError('unsupported-version', 'Versão de pacote não suportada.');
  return version === 1 ? BOOK_PACKAGE_SECTIONS : editorialSections;
}
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
  editorial: Object.freeze(['book-editorial-artifact', 'book-editorial-link', 'book-editorial']),
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
  return editorialSections.find((section) => kinds[section].includes(kind)) ?? null;
}
export function createBookPackageCounts(version = BOOK_PACKAGE_VERSION) {
  return Object.fromEntries(
    bookPackageSections(version).map((section) => [section, { records: 0, payloadBytes: 0 }]),
  );
}
export function countBookPackageRecord(counts, section, record, version = BOOK_PACKAGE_VERSION) {
  if (
    !bookPackageSections(version).includes(section) ||
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
function countsCopy(value, complete = true, version = BOOK_PACKAGE_VERSION) {
  const sections = bookPackageSections(version);
  if (!closed(value, [...sections])) invalid();
  return Object.freeze(
    Object.fromEntries(
      sections.map((section) => {
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
export function bookPackageHeader(bookId, version = BOOK_PACKAGE_VERSION) {
  return {
    kind: 'book-package',
    id: id(bookId),
    part: 0,
    payload: encoder.encode(
      JSON.stringify({
        format: BOOK_PACKAGE_FORMAT,
        version,
        containerVersion: 1,
        projectKind: 'book',
        bookId,
        sections: [...bookPackageSections(version)],
      }),
    ),
  };
}
export function bookPackageEnd(bookId, counts, version = BOOK_PACKAGE_VERSION) {
  return {
    kind: 'book-package-end',
    id: id(bookId),
    part: 0,
    payload: encoder.encode(
      JSON.stringify({ schemaVersion: 1, sections: countsCopy(counts, true, version) }),
    ),
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
  if (!BOOK_PACKAGE_SUPPORTED_VERSIONS.includes(value.version) || value.containerVersion !== 1)
    throw new BookBackupFormatError('unsupported-version', 'Versão de pacote não suportada.');
  if (
    value.projectKind !== 'book' ||
    value.bookId !== record.id ||
    JSON.stringify(value.sections) !== JSON.stringify(bookPackageSections(value.version)) ||
    parsed.text !== decoder.decode(bookPackageHeader(value.bookId, value.version).payload)
  )
    invalid();
  return Object.freeze({
    format: BOOK_PACKAGE_FORMAT,
    version: value.version,
    containerVersion: 1,
    projectKind: 'book',
    bookId: value.bookId,
    sections: bookPackageSections(value.version),
  });
}
/** A bounded frame/package transition. Cursor must come from the trusted host. */
export async function readBookPackageStep(source, cursor = null, options = {}) {
  let state;
  if (cursor === null)
    state = {
      schemaVersion: 1,
      container: null,
      manifest: null,
      counts: createBookPackageCounts(),
      sectionIndex: -1,
      ended: false,
      done: false,
    };
  else {
    try {
      state = structuredClone(cursor);
    } catch {
      invalid();
    }
    if (
      !closed(state, [
        'schemaVersion',
        'container',
        'manifest',
        'counts',
        'sectionIndex',
        'ended',
        'done',
      ]) ||
      state.schemaVersion !== 1 ||
      !Number.isInteger(state.sectionIndex) ||
      state.sectionIndex < -1 ||
      state.sectionIndex >=
        bookPackageSections(state.manifest?.version ?? BOOK_PACKAGE_VERSION).length ||
      typeof state.ended !== 'boolean' ||
      state.done !== false
    )
      invalid();
    state.counts = structuredClone(
      countsCopy(state.counts, false, state.manifest?.version ?? BOOK_PACKAGE_VERSION),
    );
    if (state.manifest === null) {
      if (
        state.container !== null ||
        state.sectionIndex !== -1 ||
        state.ended ||
        Object.values(state.counts).some((v) => v.records || v.payloadBytes)
      )
        invalid();
    } else {
      if (
        JSON.stringify(state.manifest) !==
        JSON.stringify(header(bookPackageHeader(state.manifest.bookId, state.manifest.version)))
      )
        invalid();
      if (
        !state.container ||
        state.container.records !==
          1 +
            (state.ended ? 1 : 0) +
            Object.values(state.counts).reduce((sum, v) => sum + v.records, 0)
      )
        invalid();
      if (
        state.ended &&
        state.sectionIndex !== bookPackageSections(state.manifest.version).length - 1
      )
        invalid();
    }
  }
  const next = await readBookBackupFrame(source, state.container, options);
  state.container = next.cursor;
  if (state.manifest === null) {
    if (next.seal || !next.record) invalid();
    state.manifest = header(next.record);
    state.counts = createBookPackageCounts(state.manifest.version);
    return { cursor: state, event: { type: 'manifest', manifest: state.manifest } };
  }
  if (next.seal) {
    if (!state.ended) invalid();
    state.done = true;
    return {
      cursor: state,
      report: Object.freeze({
        validation: 'envelope-only',
        manifest: header(bookPackageHeader(state.manifest.bookId, state.manifest.version)),
        sections: countsCopy(state.counts, true, state.manifest.version),
        seal: Object.freeze({ ...next.seal }),
      }),
    };
  }
  const record = next.record;
  if (state.ended) invalid();
  if (record.kind === 'book-package-end') {
    if (
      record.id !== state.manifest.bookId ||
      state.sectionIndex !== bookPackageSections(state.manifest.version).length - 1
    )
      invalid();
    const parsed = control(record);
    if (
      !closed(parsed.value, ['schemaVersion', 'sections']) ||
      parsed.value.schemaVersion !== 1 ||
      JSON.stringify(countsCopy(parsed.value.sections, true, state.manifest.version)) !==
        JSON.stringify(countsCopy(state.counts, true, state.manifest.version)) ||
      parsed.text !==
        decoder.decode(
          bookPackageEnd(state.manifest.bookId, state.counts, state.manifest.version).payload,
        )
    )
      invalid();
    state.ended = true;
    return { cursor: state, event: { type: 'footer' } };
  }
  const section = bookPackageSection(record.kind),
    index = bookPackageSections(state.manifest.version).indexOf(section);
  if (!section || index < 0 || index < state.sectionIndex || index > state.sectionIndex + 1)
    invalid();
  state.sectionIndex = index;
  countBookPackageRecord(state.counts, section, record, state.manifest.version);
  return { cursor: state, event: { type: 'record', section, record }, span: next.span };
}
/** The generator and server checkpoints share exactly the same framing rules. */
export async function* readBookBackupPackage(source, options = {}) {
  let cursor = null;
  for (;;) {
    const step = await readBookPackageStep(source, cursor, options);
    cursor = step.cursor;
    if (step.report) return step.report;
    if (step.event.type !== 'footer') yield step.event;
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
