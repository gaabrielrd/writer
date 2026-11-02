import { createSHA256 } from 'hash-wasm';
import { bookContentInvalid as bad } from './bookBackupSchema.mjs';
import { inconsistent } from './bookRestoreUploadContracts.mjs';
import { validateBookRestoreRawPosition } from './bookRestoreHistoryContracts.mjs';
const algorithm = 'sha256/hash-wasm@4.12.0',
  safe = (n) => Number.isSafeInteger(n) && n >= 0,
  closed = (v, keys) =>
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).length === keys.length &&
    keys.every((key) => Object.hasOwn(v, key));
function checked(p) {
  if (
    !closed(p, [
      'schemaVersion',
      'record',
      'cursor',
      'part',
      'previousBytes',
      'algorithm',
      'hashState',
      'frame',
    ]) ||
    p.schemaVersion !== 1 ||
    !closed(p.record, ['kind', 'id', 'part']) ||
    p.record.kind !== 'book-lore' ||
    !/^[a-f0-9]{64}$/.test(p.record.id) ||
    p.record.part !== 0 ||
    !safe(p.part) ||
    p.part > 0xffffffff ||
    (p.part === 0
      ? p.previousBytes !== null
      : !safe(p.previousBytes) || p.previousBytes < 1 || p.previousBytes > 65536) ||
    p.algorithm !== algorithm ||
    typeof p.hashState !== 'string' ||
    p.hashState.length > 1024
  )
    inconsistent();
  try {
    validateBookRestoreRawPosition(p.cursor);
  } catch {
    inconsistent();
  }
  if (p.frame !== null) {
    const f = p.frame;
    if (
      !closed(f, ['span', 'offset']) ||
      !closed(f.span, ['offset', 'length']) ||
      !safe(f.span.offset) ||
      !safe(f.span.length) ||
      f.span.length < 1 ||
      f.span.length > 65536 ||
      !safe(f.span.offset + f.span.length) ||
      f.span.offset + f.span.length > p.cursor.size ||
      !safe(f.offset) ||
      f.offset >= f.span.length ||
      (p.part > 0 && p.previousBytes !== 65536)
    )
      inconsistent();
  }
  return p;
}
const consumedBytes = (p) =>
  (p.part === 0 ? 0 : (p.part - 1) * 65536 + p.previousBytes) + (p.frame?.offset ?? 0);
async function hasher(p) {
  const h = await createSHA256(),
    saved = Buffer.from(p.hashState, 'base64');
  if (saved.length !== h.save().length || saved.toString('base64') !== p.hashState) inconsistent();
  try {
    h.load(saved);
  } catch {
    inconsistent();
  }
  return h;
}
export async function beginBookRestoreLoreValidation(record, cursor) {
  const h = await createSHA256(),
    pending = {
      schemaVersion: 1,
      record: structuredClone(record),
      cursor: structuredClone(cursor),
      part: 0,
      previousBytes: null,
      algorithm,
      hashState: Buffer.from(h.save()).toString('base64'),
      frame: null,
    };
  checked(pending);
  return pending;
}
async function consume(p, bytes, machine) {
  checked(p);
  if (
    !p.frame ||
    !(bytes instanceof Uint8Array) ||
    bytes.length !== p.frame.span.length - p.frame.offset ||
    machine.checkpoint().lore?.index.byteLength !== consumedBytes(p)
  )
    inconsistent();
  const unit = new Uint8Array(bytes),
    h = await hasher(p),
    result = await machine.advanceLore(unit, 64);
  if (!safe(result.consumed) || result.consumed < 1 || result.consumed > bytes.length)
    inconsistent();
  h.update(unit.subarray(0, result.consumed));
  p.hashState = Buffer.from(h.save()).toString('base64');
  p.frame.offset += result.consumed;
  if (p.frame.offset === p.frame.span.length) {
    p.previousBytes = p.frame.span.length;
    p.part++;
    p.frame = null;
  }
  checked(p);
  if (machine.checkpoint().lore?.index.byteLength !== consumedBytes(p)) inconsistent();
}
export async function acceptBookRestoreLoreFrame(pending, record, span, machine) {
  const p = checked(pending);
  if (p.frame !== null) inconsistent();
  if (
    !record ||
    record.kind !== p.record.kind ||
    record.id !== p.record.id ||
    record.part !== p.part ||
    !(record.payload instanceof Uint8Array) ||
    record.payload.length < 1 ||
    record.payload.length > 65536 ||
    (p.part > 0 && p.previousBytes !== 65536)
  )
    bad();
  if (!span || span.length !== record.payload.length) inconsistent();
  p.frame = { span: structuredClone(span), offset: 0 };
  await consume(p, record.payload, machine);
}
export async function resumeBookRestoreLoreFrame(pending, source, machine) {
  const p = checked(pending);
  if (!p.frame || p.frame.offset === 0 || source.size !== p.cursor.size) inconsistent();
  const { span, offset } = p.frame,
    bytes = await source.read(span.offset + offset, span.length - offset);
  await consume(p, bytes, machine);
}
export async function finishBookRestoreLoreValidation(pending, machine) {
  const p = checked(pending);
  if (p.frame || p.part < 1) bad();
  const metadata = await machine.finishLore(),
    h = await hasher(p);
  if (metadata.byteLength !== consumedBytes(p) || p.part !== Math.ceil(metadata.byteLength / 65536))
    inconsistent();
  return {
    schemaVersion: 1,
    cursor: structuredClone(p.cursor),
    chunkCount: p.part,
    contentHash: h.digest(),
    metadata,
  };
}
