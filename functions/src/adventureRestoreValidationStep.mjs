import {
  readAdventurePackageStep,
  adventurePackageSection,
  ADVENTURE_PACKAGE_SECTIONS as sections,
} from './adventureBackupPackage.mjs';
import {
  createAdventureContentState,
  createAdventureContentMachine,
} from './adventureContentMachine.mjs';
import {
  ADVENTURE_CONTENT_LIMITS,
  contentInvalid as bad,
  contentClosed as closed,
  contentCount as count,
  contentHash as validHash,
  contentId as validId,
  decodeAdventureContentJSON,
} from './adventureContentPrimitives.mjs';
export const ADVENTURE_VALIDATION_SNAPSHOT_BYTES = 65536;
const encoder = new TextEncoder();
const metadata = (r) => ({ kind: r.kind, id: r.id, part: r.part });
const identity = (r) =>
  closed(r, ['kind', 'id', 'part']) &&
  adventurePackageSection(r.kind) !== null &&
  validId(r.id) &&
  r.part === 0;
function digest(hash, bytes, saved) {
  const h = hash.create(saved);
  try {
    if (bytes) h.update(bytes);
    return h.digest();
  } finally {
    h.destroy();
  }
}
function cursor(value, size, done) {
  if (
    !closed(value, [
      'schemaVersion',
      'size',
      'offset',
      'records',
      'payloadBytes',
      'previous',
      'done',
    ]) ||
    value.schemaVersion !== 1 ||
    value.size !== size ||
    !count(value.offset) ||
    value.offset < 16 ||
    value.offset > size ||
    !count(value.records) ||
    value.records > 0xffffffff ||
    !count(value.payloadBytes) ||
    !validHash(value.previous) ||
    value.done !== done
  )
    bad();
}
function spans(value, size, bytes) {
  if (
    !Array.isArray(value) ||
    value.length < 1 ||
    value.length > 128 ||
    !count(bytes) ||
    bytes < 1 ||
    bytes > ADVENTURE_CONTENT_LIMITS.itemBytes
  )
    bad();
  let total = 0,
    end = 16;
  for (let i = 0; i < value.length; i++) {
    const s = value[i];
    if (
      !closed(s, ['offset', 'length']) ||
      !count(s.offset) ||
      s.offset < end ||
      !count(s.length) ||
      s.length < 1 ||
      s.length > 65536 ||
      s.offset + s.length > size ||
      (i < value.length - 1 && s.length !== 65536)
    )
      bad();
    end = s.offset + s.length;
    total += s.length;
  }
  if (total !== bytes) bad();
}
function rawPointer(value, record, size) {
  if (value === null) {
    if (['adventure-version-body', 'adventure-draft', 'adventure-image'].includes(record.kind))
      bad();
    return;
  }
  if (
    !closed(value, ['record', 'manifest', 'layout', 'cursor']) ||
    !closed(value.record, ['kind', 'id', 'part']) ||
    value.record.id !== record.id ||
    value.record.part !== 0 ||
    !closed(value.manifest, ['byteLength', 'chunkCount', 'contentHash']) ||
    !count(value.manifest.byteLength) ||
    !count(value.manifest.chunkCount) ||
    value.manifest.chunkCount < 1 ||
    value.manifest.chunkCount > 0xffffffff ||
    !validHash(value.manifest.contentHash)
  )
    bad();
  const kinds = {
    'adventure-version-body': ['adventure-version-text', 'fixed-text'],
    'adventure-draft': ['adventure-draft-text', 'utf8-parts'],
    'adventure-image': ['adventure-image-bytes', 'png'],
  };
  const expected = kinds[record.kind];
  if (!expected || value.record.kind !== expected[0] || value.layout !== expected[1]) bad();
  cursor(value.cursor, size, false);
}
function itemPointer(value, size) {
  if (
    !closed(value, ['schemaVersion', 'record', 'spans', 'byteLength', 'contentHash', 'raw']) ||
    value.schemaVersion !== 1 ||
    !identity(value.record) ||
    !validHash(value.contentHash)
  )
    bad();
  spans(value.spans, size, value.byteLength);
  rawPointer(value.raw, value.record, size);
  if (
    value.raw &&
    value.raw.cursor.offset < value.spans.at(-1).offset + value.spans.at(-1).length + 32
  )
    bad();
}
function manifest(value) {
  if (
    !closed(value, [
      'format',
      'version',
      'containerVersion',
      'projectKind',
      'adventureId',
      'sections',
    ]) ||
    value.format !== 'writer-adventure-archive' ||
    value.version !== 1 ||
    value.containerVersion !== 1 ||
    value.projectKind !== 'adventure' ||
    !validId(value.adventureId) ||
    JSON.stringify(value.sections) !== JSON.stringify(sections)
  )
    bad();
}
function envelope(value, parser, size) {
  if (
    !closed(value, ['validation', 'manifest', 'sections', 'seal']) ||
    value.validation !== 'envelope-only' ||
    !closed(value.sections, [...sections]) ||
    !closed(value.seal, ['records', 'payloadBytes', 'archiveBytes', 'chainHash'])
  )
    bad();
  manifest(value.manifest);
  if (
    value.manifest.adventureId !== parser.manifest.adventureId ||
    value.seal.archiveBytes !== size ||
    value.seal.records !== parser.container.records ||
    value.seal.payloadBytes !== parser.container.payloadBytes ||
    value.seal.chainHash !== parser.container.previous
  )
    bad();
  for (const section of sections) {
    if (
      !closed(value.sections[section], ['records', 'payloadBytes']) ||
      value.sections[section].records !== parser.counts[section].records ||
      value.sections[section].payloadBytes !== parser.counts[section].payloadBytes
    )
      bad();
  }
}
export function initialAdventureRestoreValidation() {
  return {
    schemaVersion: 1,
    phase: 'frames',
    sourceSize: null,
    parser: null,
    machine: null,
    json: null,
    envelope: null,
    items: 0,
  };
}
/** Host checkpoint only: the future coordinator must authenticate its birth, hash and operation before loading it. */
export function readAdventureRestoreValidationSnapshot(saved) {
  let state;
  try {
    state = structuredClone(saved);
  } catch {
    bad();
  }
  if (
    encoder.encode(JSON.stringify(state)).length > ADVENTURE_VALIDATION_SNAPSHOT_BYTES ||
    !closed(state, [
      'schemaVersion',
      'phase',
      'sourceSize',
      'parser',
      'machine',
      'json',
      'envelope',
      'items',
    ]) ||
    state.schemaVersion !== 1 ||
    !['frames', 'semantic', 'done'].includes(state.phase) ||
    !count(state.items)
  )
    bad();
  if (state.parser === null) {
    if (
      state.sourceSize !== null ||
      state.machine !== null ||
      state.json !== null ||
      state.envelope !== null ||
      state.items !== 0 ||
      state.phase !== 'frames'
    )
      bad();
    return state;
  }
  if (
    !count(state.sourceSize) ||
    state.sourceSize < 16 ||
    !closed(state.parser, [
      'schemaVersion',
      'container',
      'manifest',
      'counts',
      'sectionIndex',
      'ended',
      'done',
    ]) ||
    state.parser.schemaVersion !== 1 ||
    !state.parser.manifest ||
    !validId(state.parser.manifest.adventureId) ||
    !state.machine ||
    state.machine.adventureId !== state.parser.manifest.adventureId ||
    !closed(state.parser.counts, [...sections]) ||
    !closed(state.machine.counts, [...sections]) ||
    state.parser.done !== (state.phase !== 'frames') ||
    typeof state.parser.ended !== 'boolean'
  )
    bad();
  manifest(state.parser.manifest);
  cursor(state.parser.container, state.sourceSize, state.parser.done);
  if (state.json !== null) {
    const j = state.json;
    if (
      state.phase !== 'frames' ||
      state.machine.pending?.stage === 'raw' ||
      !closed(j, ['record', 'spans', 'byteLength', 'hashState']) ||
      !identity(j.record) ||
      !closed(j.hashState, ['algorithm', 'state']) ||
      typeof j.hashState.state !== 'string' ||
      j.hashState.state.length > 4096
    )
      bad();
    spans(j.spans, state.sourceSize, j.byteLength);
    if (j.spans.at(-1).offset + j.spans.at(-1).length + 32 !== state.parser.container.offset) bad();
  }
  let records = 0;
  for (const s of sections) {
    const p = state.parser.counts[s],
      m = state.machine.counts[s],
      pending =
        state.json !== null && adventurePackageSection(state.json.record.kind) === s
          ? state.json
          : null;
    if (
      !closed(p, ['records', 'payloadBytes']) ||
      !closed(m, ['records', 'payloadBytes']) ||
      ![p.records, p.payloadBytes, m.records, m.payloadBytes].every(count) ||
      p.records !== m.records + (pending?.spans.length ?? 0) ||
      p.payloadBytes !== m.payloadBytes + (pending?.byteLength ?? 0)
    )
      bad();
    records += p.records;
  }
  if (
    state.items > records ||
    state.parser.container.records !== records + 1 + (state.parser.ended ? 1 : 0)
  )
    bad();
  const activeSection = sections.findLastIndex((s) => state.parser.counts[s].records > 0);
  if (
    state.parser.sectionIndex !== activeSection ||
    sections.slice(0, activeSection + 1).some((s) => state.parser.counts[s].records < 1)
  )
    bad();
  if (state.phase !== 'frames') envelope(state.envelope, state.parser, state.sourceSize);
  if (state.phase === 'frames') {
    if (state.envelope !== null || state.machine.phase !== 'records') bad();
  } else if (
    state.json !== null ||
    !state.parser.ended ||
    state.envelope?.validation !== 'envelope-only' ||
    state.envelope.manifest?.adventureId !== state.machine.adventureId ||
    state.envelope.seal?.archiveBytes !== state.sourceSize ||
    (state.phase === 'semantic' ? state.machine.phase !== 'finish' : state.machine.phase !== 'done')
  )
    bad();
  return state;
}
function sourcePort(source, signal) {
  const size = source?.size,
    read = source?.read?.bind(source);
  if (!count(size) || size < 16 || !read) bad();
  const check = () => {
    signal?.throwIfAborted();
    if (source.size !== size) bad();
  };
  return {
    check,
    size,
    async read(offset, length) {
      check();
      if (!count(offset) || !count(length) || offset + length > size) bad();
      const bytes = await read(offset, length);
      check();
      if (!(bytes instanceof Uint8Array) || bytes.length !== length) bad();
      return new Uint8Array(bytes);
    },
  };
}
async function reread(source, pointer, hash) {
  spans(pointer.spans, source.size, pointer.byteLength);
  const bytes = new Uint8Array(pointer.byteLength);
  let at = 0;
  for (const span of pointer.spans) {
    bytes.set(await source.read(span.offset, span.length), at);
    at += span.length;
  }
  if (digest(hash, bytes) !== pointer.contentHash) bad();
  source.check();
  return decodeAdventureContentJSON(bytes);
}
/** The pointer is trusted private host metadata; byte hashes do not grant access or authenticate a remote job. */
export async function readAdventureValidationItem(source, pointer, { hash, signal } = {}) {
  const input = sourcePort(source, signal),
    saved = structuredClone(pointer);
  itemPointer(saved, input.size);
  if (typeof hash?.create !== 'function') bad();
  const create = hash.create.bind(hash);
  const value = await reread(input, saved, { create });
  if (saved.raw) {
    if (
      ['byteLength', 'chunkCount', 'contentHash'].some((k) => value[k] !== saved.raw.manifest[k]) ||
      (saved.record.kind === 'adventure-version-body' && value.versionId !== saved.record.id) ||
      (saved.record.kind === 'adventure-image' && value.assetId !== saved.record.id)
    )
      bad();
  }
  input.check();
  return { record: saved.record, value, raw: saved.raw };
}
/** One frame OR one bounded JSON item OR up to64 semantic rows. Host must buffer/discard all index/item effects atomically. */
export async function prepareAdventureRestoreValidationStep(
  saved,
  source,
  store,
  { hash, signal } = {},
) {
  const state = readAdventureRestoreValidationSnapshot(saved),
    input = sourcePort(source, signal),
    suppliedIndex = store?.index,
    addItem = store?.addItem?.bind(store);
  if (
    typeof hash?.create !== 'function' ||
    typeof suppliedIndex?.get !== 'function' ||
    typeof suppliedIndex?.add !== 'function' ||
    !addItem ||
    state.phase === 'done'
  )
    bad();
  const get = suppliedIndex.get.bind(suppliedIndex),
    add = suppliedIndex.add.bind(suppliedIndex),
    boundHash = Object.freeze({ create: hash.create.bind(hash) });
  const index = {
    async get(key) {
      input.check();
      const v = await get(key);
      input.check();
      return v;
    },
    async add(key, value) {
      input.check();
      await add(key, value);
      input.check();
    },
  };
  input.check();
  if (state.sourceSize === null) state.sourceSize = input.size;
  else if (state.sourceSize !== input.size) bad();
  const machine = state.machine
    ? createAdventureContentMachine(state.machine, { index, hash: boundHash, signal })
    : null;
  const result = () => {
    input.check();
    return readAdventureRestoreValidationSnapshot(state);
  };
  if (state.phase === 'semantic') {
    await machine.advanceFinish(64);
    state.machine = machine.checkpoint();
    if (state.machine.phase === 'done') state.phase = 'done';
    return result();
  }
  const before = state.parser,
    step = await readAdventurePackageStep(input, before, { signal }),
    record = step.event?.type === 'record' ? step.event.record : null;
  if (
    state.json &&
    (!record || record.kind !== state.json.record.kind || record.id !== state.json.record.id)
  ) {
    if (!machine) bad();
    const pending = state.json,
      contentHash = digest(boundHash, null, pending.hashState),
      pointer = {
        schemaVersion: 1,
        record: pending.record,
        spans: pending.spans,
        byteLength: pending.byteLength,
        contentHash,
        raw: null,
      };
    const value = await reread(input, pointer, boundHash);
    await machine.acceptJSON(pending.record, value);
    state.machine = machine.checkpoint();
    const raw = state.machine.pending;
    if (raw?.stage === 'raw')
      pointer.raw = {
        record: { kind: raw.kind, id: raw.id, part: 0 },
        manifest: raw.manifest,
        layout: raw.layout,
        cursor: structuredClone(before.container),
      };
    itemPointer(pointer, input.size);
    await addItem(state.items, structuredClone(pointer));
    input.check();
    state.items++;
    state.json = null;
    // Lookahead stays uncommitted: the next operation verifies that frame again.
    return result();
  }
  if (step.event?.type === 'manifest') {
    if (machine || state.json || state.items !== 0) bad();
    state.machine = createAdventureContentState(step.event.manifest.adventureId);
  } else if (machine?.checkpoint().pending?.stage === 'raw') {
    if (!record || state.json) bad();
    await machine.acceptRaw(metadata(record), record.payload);
    state.machine = machine.checkpoint();
  } else if (record) {
    if (!machine || !record.payload.length || record.payload.length > 65536) bad();
    if (!state.json) {
      if (record.part !== 0) bad();
      state.json = { record: metadata(record), spans: [], byteLength: 0, hashState: null };
    }
    const j = state.json;
    if (record.part !== j.spans.length || (j.spans.length && j.spans.at(-1).length !== 65536))
      bad();
    j.spans.push(step.span);
    j.byteLength += record.payload.length;
    spans(j.spans, input.size, j.byteLength);
    const h = j.hashState ? boundHash.create(j.hashState) : boundHash.create();
    try {
      h.update(record.payload);
      j.hashState = h.save();
    } finally {
      h.destroy();
    }
  } else if (step.report) {
    if (!machine || state.json) bad();
    await machine.beginFinish(step.report);
    state.machine = machine.checkpoint();
    state.envelope = structuredClone(step.report);
    state.phase = 'semantic';
  } else if (step.event?.type !== 'footer' || !machine || state.json) bad();
  state.parser = step.cursor;
  return result();
}
export function completeAdventureRestoreValidation(saved, { index, hash, signal } = {}) {
  signal?.throwIfAborted();
  const state = readAdventureRestoreValidationSnapshot(saved);
  if (state.phase !== 'done') bad();
  const report = createAdventureContentMachine(state.machine, { index, hash, signal }).result();
  return {
    validation: 'stepped-content-only',
    version: 1,
    sourceAdventureId: report.adventureId,
    envelope: structuredClone(state.envelope),
    items: state.items,
    totals: report.totals,
    warnings: report.warnings,
  };
}
