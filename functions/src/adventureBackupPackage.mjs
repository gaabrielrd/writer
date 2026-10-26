import {
  AdventureBackupFormatError,
  readAdventureBackupFrame,
} from './adventureBackupContainer.mjs';
export const ADVENTURE_PACKAGE_FORMAT = 'writer-adventure-archive';
export const ADVENTURE_PACKAGE_VERSION = 1;
export const ADVENTURE_PACKAGE_SECTIONS = Object.freeze([
  'structure',
  'resources',
  'lore',
  'personas',
  'universe',
  'history',
  'drafts',
  'images',
]);
const kinds = Object.freeze({
  structure: Object.freeze(['adventure-metadata', 'adventure-part']),
  resources: Object.freeze(['adventure-resource', 'adventure-resources']),
  lore: Object.freeze(['adventure-lore', 'adventure-lore-body', 'adventure-lore-end']),
  personas: Object.freeze(['adventure-persona', 'adventure-personas']),
  universe: Object.freeze(['adventure-universe']),
  history: Object.freeze(['adventure-version', 'adventure-version-text', 'adventure-history']),
  drafts: Object.freeze(['adventure-draft', 'adventure-draft-text', 'adventure-drafts']),
  images: Object.freeze([
    'adventure-image-binding',
    'adventure-image',
    'adventure-image-bytes',
    'adventure-images',
  ]),
});
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
function invalid() {
  throw new AdventureBackupFormatError(
    'invalid-record',
    'O pacote de aventura está incompleto ou fora do contrato.',
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
export function adventurePackageSection(kind) {
  return ADVENTURE_PACKAGE_SECTIONS.find((section) => kinds[section].includes(kind)) ?? null;
}
export function createAdventurePackageCounts() {
  return Object.fromEntries(
    ADVENTURE_PACKAGE_SECTIONS.map((section) => [section, { records: 0, payloadBytes: 0 }]),
  );
}
export function countAdventurePackageRecord(counts, section, record) {
  if (
    !ADVENTURE_PACKAGE_SECTIONS.includes(section) ||
    adventurePackageSection(record.kind) !== section ||
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
  if (!closed(value, [...ADVENTURE_PACKAGE_SECTIONS])) invalid();
  return Object.freeze(
    Object.fromEntries(
      ADVENTURE_PACKAGE_SECTIONS.map((section) => {
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
export function adventurePackageHeader(adventureId) {
  return {
    kind: 'adventure-package',
    id: id(adventureId),
    part: 0,
    payload: encoder.encode(
      JSON.stringify({
        format: ADVENTURE_PACKAGE_FORMAT,
        version: ADVENTURE_PACKAGE_VERSION,
        containerVersion: 1,
        projectKind: 'adventure',
        adventureId,
        sections: [...ADVENTURE_PACKAGE_SECTIONS],
      }),
    ),
  };
}
export function adventurePackageEnd(adventureId, counts) {
  return {
    kind: 'adventure-package-end',
    id: id(adventureId),
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
  if (record.kind !== 'adventure-package') invalid();
  const parsed = control(record),
    value = parsed.value;
  if (
    !closed(value, [
      'format',
      'version',
      'containerVersion',
      'projectKind',
      'adventureId',
      'sections',
    ]) ||
    value.format !== ADVENTURE_PACKAGE_FORMAT
  )
    invalid();
  if (value.version !== ADVENTURE_PACKAGE_VERSION || value.containerVersion !== 1)
    throw new AdventureBackupFormatError('unsupported-version', 'Versão de pacote não suportada.');
  if (
    value.projectKind !== 'adventure' ||
    value.adventureId !== record.id ||
    JSON.stringify(value.sections) !== JSON.stringify(ADVENTURE_PACKAGE_SECTIONS) ||
    parsed.text !== decoder.decode(adventurePackageHeader(value.adventureId).payload)
  )
    invalid();
  return Object.freeze({
    format: ADVENTURE_PACKAGE_FORMAT,
    version: 1,
    containerVersion: 1,
    projectKind: 'adventure',
    adventureId: value.adventureId,
    sections: ADVENTURE_PACKAGE_SECTIONS,
  });
}
/** A bounded frame/package transition. Cursor must come from the trusted host. */
export async function readAdventurePackageStep(source, cursor = null, options = {}) {
  let state;
  if (cursor === null)
    state = {
      schemaVersion: 1,
      container: null,
      manifest: null,
      counts: createAdventurePackageCounts(),
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
      state.sectionIndex >= ADVENTURE_PACKAGE_SECTIONS.length ||
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
        JSON.stringify(header(adventurePackageHeader(state.manifest.adventureId)))
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
      if (state.ended && state.sectionIndex !== ADVENTURE_PACKAGE_SECTIONS.length - 1) invalid();
    }
  }
  const next = await readAdventureBackupFrame(source, state.container, options);
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
        manifest: header(adventurePackageHeader(state.manifest.adventureId)),
        sections: countsCopy(state.counts),
        seal: Object.freeze({ ...next.seal }),
      }),
    };
  }
  const record = next.record;
  if (state.ended) invalid();
  if (record.kind === 'adventure-package-end') {
    if (
      record.id !== state.manifest.adventureId ||
      state.sectionIndex !== ADVENTURE_PACKAGE_SECTIONS.length - 1
    )
      invalid();
    const parsed = control(record);
    if (
      !closed(parsed.value, ['schemaVersion', 'sections']) ||
      parsed.value.schemaVersion !== 1 ||
      JSON.stringify(countsCopy(parsed.value.sections)) !==
        JSON.stringify(countsCopy(state.counts)) ||
      parsed.text !==
        decoder.decode(adventurePackageEnd(state.manifest.adventureId, state.counts).payload)
    )
      invalid();
    state.ended = true;
    return { cursor: state, event: { type: 'footer' } };
  }
  const section = adventurePackageSection(record.kind),
    index = ADVENTURE_PACKAGE_SECTIONS.indexOf(section);
  if (!section || index < state.sectionIndex || index > state.sectionIndex + 1) invalid();
  state.sectionIndex = index;
  countAdventurePackageRecord(state.counts, section, record);
  return { cursor: state, event: { type: 'record', section, record }, span: next.span };
}
/** The generator and server checkpoints share exactly the same framing rules. */
export async function* readAdventureBackupPackage(source, options = {}) {
  let cursor = null;
  for (;;) {
    const step = await readAdventurePackageStep(source, cursor, options);
    cursor = step.cursor;
    if (step.report) return step.report;
    if (step.event.type !== 'footer') yield step.event;
  }
}
export async function inspectAdventureBackupPackage(source, options = {}) {
  const stream = readAdventureBackupPackage(source, options);
  for (;;) {
    const next = await stream.next();
    if (next.done) {
      if (!next.value) invalid();
      return next.value;
    }
  }
}
