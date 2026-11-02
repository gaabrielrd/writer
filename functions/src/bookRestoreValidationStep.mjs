import { createSHA256 } from 'hash-wasm';
import { createHash } from 'node:crypto';
import { readBookPackageStep } from './bookBackupPackage.mjs';
import {
  createBookContentMachine,
  createBookContentState,
  BOOK_CONTENT_ITEM_BYTES,
} from './bookContentMachine.mjs';
import { decodeBookContentJSON, validateBookContentRawPart } from './bookBackupContent.mjs';
import { bookContentInvalid as bad } from './bookBackupSchema.mjs';
import { inconsistent } from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
import {
  beginBookRestoreLoreValidation,
  acceptBookRestoreLoreFrame,
  resumeBookRestoreLoreFrame,
  finishBookRestoreLoreValidation,
} from './bookRestoreLoreValidation.mjs';
const hash = {
  create() {
    const h = createHash('sha256');
    return {
      update: (bytes) => {
        h.update(bytes);
      },
      digest: () => h.digest('hex'),
      destroy: () => h.destroy(),
    };
  },
};
export { hash as bookRestoreValidationHash };
export const VALIDATION_SNAPSHOT_BYTES = 65536;
export const LEGACY_VALIDATION_SNAPSHOT_BYTES = 640 * 1024;
export function initialBookValidation() {
  return {
    phase: 'frames',
    parser: null,
    machine: null,
    json: null,
    relations: null,
    raw: null,
    envelope: null,
    items: 0,
    recheck: 0,
  };
}
export function validationMeta(state, failure = null, reportHash = null) {
  return {
    phase: state.phase,
    frames: state.parser?.container?.records ?? 0,
    items: state.items,
    checkedChunks: state.recheck,
    failure,
    reportHash,
  };
}
async function item(source, pending) {
  if (
    !pending ||
    !Array.isArray(pending.spans) ||
    pending.spans.length < 1 ||
    pending.spans.length > 128 ||
    pending.byteLength > BOOK_CONTENT_ITEM_BYTES
  )
    inconsistent();
  const parts = [];
  let length = 0;
  for (const span of pending.spans) {
    const bytes = await source.read(span.offset, span.length);
    parts.push(bytes);
    length += bytes.length;
  }
  if (length !== pending.byteLength) inconsistent();
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }
  return decodeBookContentJSON(bytes);
}
/** One bounded semantic/parser unit. All writes remain buffered until the coordinator commits. */
export async function prepareBookValidationStep(state, source, store) {
  if (!['frames', 'semantic', 'recheck'].includes(state.phase)) inconsistent();
  const machine = state.machine
    ? createBookContentMachine(state.machine, { index: store.index, hash })
    : null;
  if (state.phase === 'recheck') return;
  if (state.phase === 'semantic') {
    if (!machine || !state.envelope) inconsistent();
    await machine.advanceFinish(64);
    state.machine = machine.checkpoint();
    if (state.machine.phase === 'done') state.phase = 'recheck';
    return;
  }
  if (state.lore?.frame) {
    if (!machine || state.json || state.relations || state.raw) inconsistent();
    store.setItemIndex(state.items);
    await resumeBookRestoreLoreFrame(state.lore, source, machine);
    state.machine = machine.checkpoint();
    return;
  }
  if (state.relations) {
    if (!machine) inconsistent();
    const pending = state.relations;
    store.setItemIndex(pending.index);
    await machine.advanceRelations(pending.record, await item(source, pending), 64);
    state.machine = machine.checkpoint();
    if (!state.machine.relations) state.relations = null;
    return;
  }
  const before = state.parser,
    step = await readBookPackageStep(source, before);
  const record = step.event?.type === 'record' ? step.event.record : null;
  if (
    state.json &&
    (!record || record.kind !== state.json.record.kind || record.id !== state.json.record.id)
  ) {
    if (!machine) inconsistent();
    const pending = state.json,
      value = await item(source, pending);
    store.setItemIndex(state.items);
    await machine.acceptJSON(pending.record, value);
    state.machine = machine.checkpoint();
    const raw = state.machine.raw;
    await store.addItem(state.items, {
      record: pending.record,
      spans: pending.spans,
      byteLength: pending.byteLength,
      raw: raw ? { manifest: raw, cursor: structuredClone(before.container) } : null,
    });
    if (state.machine.relations) state.relations = { ...pending, index: state.items };
    if (raw) {
      const h = await createSHA256();
      state.raw = {
        algorithm: 'sha256/hash-wasm@4.12.0',
        hashState: Buffer.from(h.save()).toString('base64'),
        part: 0,
        bytes: 0,
      };
    }
    state.items++;
    state.json = null;
    // Lookahead is deliberately not committed: the next unit reads the same frame.
    return;
  }
  if (
    state.lore &&
    (!record || record.kind !== state.lore.record.kind || record.id !== state.lore.record.id)
  ) {
    if (!machine || state.json || state.relations || state.raw) inconsistent();
    store.setItemIndex(state.items);
    const pending = state.lore,
      lore = await finishBookRestoreLoreValidation(pending, machine);
    await store.addItem(state.items, {
      record: pending.record,
      byteLength: lore.metadata.byteLength,
      raw: null,
      lore,
    });
    state.items++;
    state.machine = machine.checkpoint();
    delete state.lore;
    // Keep the lookahead frame uncommitted until the next operation.
    return;
  }
  if (state.raw) {
    if (!machine || !state.machine.raw || state.raw.algorithm !== 'sha256/hash-wasm@4.12.0')
      inconsistent();
    const manifest = state.machine.raw,
      payload = validateBookContentRawPart(manifest, record, state.raw.part),
      h = await createSHA256();
    const saved = Buffer.from(state.raw.hashState, 'base64');
    if (saved.length !== h.save().length || saved.toString('base64') !== state.raw.hashState)
      inconsistent();
    try {
      h.load(saved);
    } catch {
      inconsistent();
    }
    h.update(payload);
    state.raw.bytes += payload.length;
    state.raw.part++;
    if (state.raw.bytes > manifest.byteLength) bad();
    state.parser = step.cursor;
    if (state.raw.part === manifest.chunkCount) {
      await machine.acceptRawProof({
        byteLength: state.raw.bytes,
        chunkCount: state.raw.part,
        contentHash: h.digest(),
      });
      state.machine = machine.checkpoint();
      state.raw = null;
    } else state.raw.hashState = Buffer.from(h.save()).toString('base64');
    return;
  }
  if (step.event?.type === 'manifest') {
    if (machine || state.json) bad();
    state.machine = createBookContentState(step.event.manifest.bookId, false);
    state.parser = step.cursor;
    return;
  }
  if (record?.kind === 'book-lore' && !state.json) {
    if (!machine || state.json || state.relations || state.raw) bad();
    store.setItemIndex(state.items);
    if (!state.lore) {
      await machine.beginLore({ kind: record.kind, id: record.id, part: record.part });
      state.lore = await beginBookRestoreLoreValidation(
        { kind: record.kind, id: record.id, part: 0 },
        before.container,
      );
    }
    await acceptBookRestoreLoreFrame(state.lore, record, step.span, machine);
    state.machine = machine.checkpoint();
    state.parser = step.cursor;
    return;
  }
  if (record) {
    if (!machine || record.payload.length === 0) bad();
    if (state.json) {
      if (record.part !== state.json.spans.length || state.json.spans.at(-1).length !== 65536)
        bad();
      state.json.spans.push(step.span);
      state.json.byteLength += record.payload.length;
    } else {
      if (record.part !== 0) bad();
      state.json = {
        record: { kind: record.kind, id: record.id, part: 0 },
        spans: [step.span],
        byteLength: record.payload.length,
      };
    }
    if (state.json.byteLength > BOOK_CONTENT_ITEM_BYTES || state.json.spans.length > 128) bad();
    state.parser = step.cursor;
    return;
  }
  if (step.report) {
    if (!machine || state.json || state.lore) bad();
    await machine.beginFinish();
    state.machine = machine.checkpoint();
    state.envelope = step.report;
    state.phase = 'semantic';
  }
  state.parser = step.cursor;
}
export function completeBookValidation(state, sourceHash, index) {
  const machine = createBookContentMachine(state.machine, { index, hash }),
    summary = machine.result();
  if (
    state.phase !== 'recheck' ||
    !state.envelope ||
    summary.legacy ||
    summary.bookId !== state.envelope.manifest.bookId
  )
    inconsistent();
  return {
    validation: 'server-content-only',
    sourceSha256: sourceHash,
    sourceBookId: summary.bookId,
    envelope: state.envelope,
    totals: summary.totals,
    warnings: summary.warnings,
  };
}

export const bookValidationVersion = (source) => (source.format === 'writer-book-backup' ? 2 : 1);
export function readValidationSnapshot(value, loaded) {
  const version = loaded.job.validationVersion;
  if (version === 1) {
    if (
      Object.hasOwn(value, 'stateJSON') ||
      Object.hasOwn(value, 'validationVersion') ||
      Buffer.byteLength(JSON.stringify(value), 'utf8') > VALIDATION_SNAPSHOT_BYTES ||
      !value.state ||
      typeof value.state !== 'object' ||
      Array.isArray(value.state)
    )
      inconsistent();
    return structuredClone(value.state);
  }
  if (
    version !== 2 ||
    value.validationVersion !== 2 ||
    Object.hasOwn(value, 'state') ||
    Object.keys(value).length !== 7 ||
    typeof value.stateJSON !== 'string' ||
    Buffer.byteLength(value.stateJSON, 'utf8') > LEGACY_VALIDATION_SNAPSHOT_BYTES
  )
    inconsistent();
  let state;
  try {
    state = JSON.parse(value.stateJSON);
  } catch {
    inconsistent();
  }
  if (
    !state ||
    typeof state !== 'object' ||
    Array.isArray(state) ||
    JSON.stringify(state) !== value.stateJSON ||
    !state.legacy
  )
    inconsistent();
  return state;
}
export function validationSnapshot(loaded, state, checkpoint) {
  const value = {
    schemaVersion: 1,
    ownerId: loaded.job.ownerId,
    restoreId: loaded.job.restoreId,
    jobToken: loaded.view.jobToken,
    checkpoint,
  };
  if (bookValidationVersion(loaded.job.source) === 2) {
    const stateJSON = JSON.stringify(state);
    if (Buffer.byteLength(stateJSON, 'utf8') > LEGACY_VALIDATION_SNAPSHOT_BYTES) inconsistent();
    value.validationVersion = 2;
    value.stateJSON = stateJSON;
  } else {
    value.state = state;
    if (Buffer.byteLength(JSON.stringify(value), 'utf8') > VALIDATION_SNAPSHOT_BYTES)
      inconsistent();
  }
  return { value, hash: digest(value) };
}
