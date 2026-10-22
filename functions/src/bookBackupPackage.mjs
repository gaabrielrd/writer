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
      state.sectionIndex >= BOOK_PACKAGE_SECTIONS.length ||
      typeof state.ended !== 'boolean' ||
      state.done !== false
    )
      invalid();
    state.counts = structuredClone(countsCopy(state.counts, false));
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
        JSON.stringify(header(bookPackageHeader(state.manifest.bookId)))
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
      if (state.ended && state.sectionIndex !== BOOK_PACKAGE_SECTIONS.length - 1) invalid();
    }
  }
  const next = await readBookBackupFrame(source, state.container, options);
  state.container = next.cursor;
  if (state.manifest === null) {
    if (next.seal || !next.record) invalid();
    state.manifest = header(next.record);
    return { cursor: state, event: { type: 'manifest', manifest: state.manifest } };
  }
  if (next.seal) {
    if (!state.ended) invalid();
    state.done = true;
    return {
      cursor: state,
      report: Object.freeze({
        validation: 'envelope-only',
        manifest: header(bookPackageHeader(state.manifest.bookId)),
        sections: countsCopy(state.counts),
        seal: Object.freeze({ ...next.seal }),
      }),
    };
  }
  const record = next.record;
  if (state.ended) invalid();
  if (record.kind === 'book-package-end') {
    if (
      record.id !== state.manifest.bookId ||
      state.sectionIndex !== BOOK_PACKAGE_SECTIONS.length - 1
    )
      invalid();
    const parsed = control(record);
    if (
      !closed(parsed.value, ['schemaVersion', 'sections']) ||
      parsed.value.schemaVersion !== 1 ||
      JSON.stringify(countsCopy(parsed.value.sections)) !==
        JSON.stringify(countsCopy(state.counts)) ||
      parsed.text !== decoder.decode(bookPackageEnd(state.manifest.bookId, state.counts).payload)
    )
      invalid();
    state.ended = true;
    return { cursor: state, event: { type: 'footer' } };
  }
  const section = bookPackageSection(record.kind),
    index = BOOK_PACKAGE_SECTIONS.indexOf(section);
  if (!section || index < state.sectionIndex || index > state.sectionIndex + 1) invalid();
  state.sectionIndex = index;
  countBookPackageRecord(state.counts, section, record);
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
