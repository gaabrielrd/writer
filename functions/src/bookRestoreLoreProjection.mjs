import { createSHA256 } from 'hash-wasm';
import { BOOK_PORTABLE_LORE_FIELDS } from './bookPortableLoreIndex.mjs';
import { inconsistent, integer } from './bookRestoreUploadContracts.mjs';
import {
  createBookRestoreLoreTransform,
  checkBookRestoreLoreTransform,
  advanceBookRestoreLoreTransform,
} from './bookRestoreLoreTransform.mjs';
const algorithm = 'sha256/hash-wasm@4.12.0',
  safe = (n) => Number.isSafeInteger(n) && n >= 0;
export const BOOK_RESTORE_LORE_PROJECTION_CURSOR_BYTES = 16384;
function checkpoint(p, contextToken, field, length) {
  const keys = [
    'schemaVersion',
    'contextToken',
    'field',
    'algorithm',
    'inputOffset',
    'outputBytes',
    'hashState',
    'relations',
  ];
  if (
    !p ||
    typeof p !== 'object' ||
    Array.isArray(p) ||
    Object.keys(p).length !== keys.length ||
    keys.some((k) => !Object.hasOwn(p, k)) ||
    p.schemaVersion !== 1 ||
    p.contextToken !== contextToken ||
    p.field !== field ||
    p.algorithm !== algorithm ||
    !safe(p.inputOffset) ||
    p.inputOffset > length ||
    !safe(p.outputBytes) ||
    typeof p.hashState !== 'string' ||
    p.hashState.length > 1024 ||
    Buffer.byteLength(JSON.stringify(p)) > BOOK_RESTORE_LORE_PROJECTION_CURSOR_BYTES
  )
    inconsistent();
  if (p.inputOffset === 0 && p.outputBytes !== 0) inconsistent();
  if (field === 'relations') {
    try {
      checkBookRestoreLoreTransform(p.relations);
    } catch {
      inconsistent();
    }
    if (p.relations.parser.byteLength !== p.inputOffset) inconsistent();
    if ((p.relations.parser.mode === 'done') !== (p.inputOffset === length)) inconsistent();
    if (p.outputBytes > p.inputOffset + p.relations.targets * 74 + 6024) inconsistent();
  } else if (p.relations !== null || p.outputBytes !== p.inputOffset) inconsistent();
}
/** Internal projection. Persisted cursors require the host's native journal/receipt, never client trust. */
export async function readMappedBookRestoreLoreField({
  lore,
  contextToken,
  field,
  cursor = null,
  limit = 65536,
  mapTarget,
}) {
  if (!BOOK_PORTABLE_LORE_FIELDS.includes(field) || !/^[a-f0-9]{64}$/.test(contextToken))
    inconsistent();
  integer(limit, 1);
  if (limit > 65536) inconsistent();
  const savedCursor = cursor === null ? null : structuredClone(cursor),
    span = lore.metadata.index.ranges[field],
    h = await createSHA256();
  let p;
  if (savedCursor === null)
    p = {
      schemaVersion: 1,
      contextToken,
      field,
      algorithm,
      inputOffset: 0,
      outputBytes: 0,
      hashState: Buffer.from(h.save()).toString('base64'),
      relations: field === 'relations' ? createBookRestoreLoreTransform() : null,
    };
  else p = savedCursor;
  if (!span) {
    if (savedCursor !== null) inconsistent();
    return lore.readField(field, { limit });
  }
  checkpoint(p, contextToken, field, span.byteLength);
  const saved = Buffer.from(p.hashState, 'base64');
  if (saved.length !== h.save().length || saved.toString('base64') !== p.hashState) inconsistent();
  try {
    h.load(saved);
  } catch {
    inconsistent();
  }
  const unit = await lore.readField(field, { offset: p.inputOffset, limit });
  if (!unit.present) inconsistent();
  let bytes = unit.bytes,
    consumed = bytes.length,
    references = 0;
  if (field === 'relations') {
    const result = await advanceBookRestoreLoreTransform(p.relations, bytes, mapTarget);
    p.relations = result.state;
    bytes = result.bytes;
    consumed = result.consumed;
    references = result.references;
    if (result.done && consumed !== unit.bytes.length) inconsistent();
  }
  if (consumed < 1 && p.inputOffset < span.byteLength) inconsistent();
  p.inputOffset += consumed;
  p.outputBytes += bytes.length;
  if (!safe(p.outputBytes)) inconsistent();
  h.update(bytes);
  p.hashState = Buffer.from(h.save()).toString('base64');
  checkpoint(p, contextToken, field, span.byteLength);
  const done = p.inputOffset === span.byteLength;
  if (done && field === 'relations' && p.relations.targets !== lore.metadata.index.relations.count)
    inconsistent();
  return {
    field,
    present: true,
    bytes,
    cursor: p,
    done,
    references,
    summary: done
      ? {
          byteLength: p.outputBytes,
          contentHash: h.digest(),
          ...(field === 'relations' ? { relations: p.relations.targets } : {}),
        }
      : null,
    verify: unit.verify,
  };
}
