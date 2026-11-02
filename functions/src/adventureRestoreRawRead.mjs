import { readAdventureBackupFrame } from './adventureBackupContainer.mjs';
import {
  contentClosed as closed,
  contentCount as count,
  contentHash as hashValue,
  contentId as id,
  contentInvalid as bad,
  createAdventureUtf8State,
  advanceAdventureUtf8,
} from './adventureContentPrimitives.mjs';
const layouts = {
  'adventure-version-text': 'fixed-text',
  'adventure-draft-text': 'utf8-parts',
  'adventure-image-bytes': 'png',
};
function cursor(v, size) {
  if (
    !closed(v, [
      'schemaVersion',
      'size',
      'offset',
      'records',
      'payloadBytes',
      'previous',
      'done',
    ]) ||
    v.schemaVersion !== 1 ||
    v.size !== size ||
    !count(v.offset) ||
    v.offset < 16 ||
    v.offset > size ||
    !count(v.records) ||
    v.records > 0xffffffff ||
    !count(v.payloadBytes) ||
    !hashValue(v.previous) ||
    v.done !== false
  )
    bad();
}
/** Host-only checkpoint: consumers must authenticate persisted prefixes before passing them here. */
export async function prepareAdventureRestoreRawStep(
  source,
  descriptor,
  saved,
  { hash, signal } = {},
) {
  const d = structuredClone(descriptor),
    size = source?.size,
    read = source?.read?.bind(source),
    create = hash?.create?.bind(hash);
  if (
    !count(size) ||
    size < 16 ||
    !read ||
    !create ||
    !closed(d, ['sourceToken', 'record', 'manifest', 'layout', 'cursor']) ||
    !hashValue(d.sourceToken) ||
    !closed(d.record, ['kind', 'id', 'part']) ||
    !id(d.record.id) ||
    d.record.part !== 0 ||
    !Object.hasOwn(layouts, d.record.kind) ||
    layouts[d.record.kind] !== d.layout ||
    !closed(d.manifest, ['byteLength', 'chunkCount', 'contentHash']) ||
    !count(d.manifest.byteLength) ||
    !count(d.manifest.chunkCount) ||
    d.manifest.chunkCount < 1 ||
    d.manifest.chunkCount > 0xffffffff ||
    !hashValue(d.manifest.contentHash)
  )
    bad();
  cursor(d.cursor, size);
  const m = d.manifest;
  if (
    d.layout === 'utf8-parts'
      ? m.chunkCount < Math.max(1, Math.ceil(m.byteLength / 65536)) ||
        m.chunkCount > Math.max(1, Math.ceil(m.byteLength / 65533))
      : m.chunkCount !== Math.max(1, Math.ceil(m.byteLength / 65536))
  )
    bad();
  if (d.layout === 'png' && (m.byteLength < 8 || m.byteLength > 16 * 1024 * 1024)) bad();
  const initial = {
      schemaVersion: 1,
      sourceToken: d.sourceToken,
      part: 0,
      byteLength: 0,
      container: d.cursor,
      hashState: null,
      utf8: createAdventureUtf8State(),
      done: false,
    },
    state = saved === null || saved === undefined ? initial : structuredClone(saved);
  if (
    new TextEncoder().encode(JSON.stringify(state)).length > 8192 ||
    !closed(state, Object.keys(initial)) ||
    state.schemaVersion !== 1 ||
    state.sourceToken !== d.sourceToken ||
    !count(state.part) ||
    state.part >= m.chunkCount ||
    state.done !== false ||
    !count(state.byteLength) ||
    state.byteLength > m.byteLength ||
    (state.part === 0 ? state.hashState !== null : !state.hashState) ||
    (state.part === 0 &&
      (state.byteLength !== 0 ||
        Object.keys(d.cursor).some((k) => state.container?.[k] !== d.cursor[k]))) ||
    (d.layout !== 'utf8-parts' && state.byteLength !== state.part * 65536) ||
    (d.layout === 'utf8-parts' &&
      state.part &&
      (state.byteLength < state.part * 65533 || state.byteLength > state.part * 65536))
  )
    bad();
  cursor(state.container, size);
  if (
    state.container.records !== d.cursor.records + state.part ||
    state.container.payloadBytes !== d.cursor.payloadBytes + state.byteLength ||
    state.container.offset < d.cursor.offset
  )
    bad();
  // Validate even PNG/initial UTF-8 state; a corrupt private checkpoint never silently resets.
  advanceAdventureUtf8(state.utf8, new Uint8Array(), false);
  if ((state.part === 0 || d.layout !== 'fixed-text') && state.utf8.needed !== 0) bad();
  const check = () => {
    signal?.throwIfAborted();
    if (source.size !== size) bad();
  };
  check();
  const step = await readAdventureBackupFrame(
      {
        size,
        async read(offset, length) {
          check();
          const bytes = await read(offset, length);
          check();
          return bytes;
        },
      },
      state.container,
      { signal },
    ),
    record = step.record,
    final = state.part === m.chunkCount - 1,
    remaining = m.byteLength - state.byteLength;
  if (
    !record ||
    record.kind !== d.record.kind ||
    record.id !== d.record.id ||
    record.part !== state.part ||
    record.payload.length > 65536 ||
    record.payload.length > remaining ||
    (d.layout === 'utf8-parts'
      ? m.byteLength === 0
        ? record.payload.length !== 0
        : !record.payload.length ||
          (final ? record.payload.length !== remaining : record.payload.length < 65533)
      : record.payload.length !== Math.min(65536, remaining))
  )
    bad();
  if (d.layout === 'png') {
    if (
      state.part === 0 &&
      Array.from(record.payload.subarray(0, 8), (b) => b.toString(16).padStart(2, '0')).join('') !==
        '89504e470d0a1a0a'
    )
      bad();
  } else
    state.utf8 = advanceAdventureUtf8(
      d.layout === 'utf8-parts' ? createAdventureUtf8State() : state.utf8,
      record.payload,
      d.layout === 'utf8-parts' || final,
    );
  const h = create(state.hashState ?? undefined);
  try {
    h.update(record.payload);
    state.byteLength += record.payload.length;
    state.part++;
    state.container = step.cursor;
    state.done = final;
    if (final) {
      if (state.byteLength !== m.byteLength || h.digest() !== m.contentHash) bad();
      state.hashState = null;
    } else state.hashState = h.save();
  } finally {
    h.destroy();
  }
  check();
  return {
    record: { kind: record.kind, id: record.id, part: record.part },
    bytes: new Uint8Array(record.payload),
    done: final,
    checkpoint: state,
    validation: final ? 'raw-content-complete' : 'raw-part-only',
  };
}
