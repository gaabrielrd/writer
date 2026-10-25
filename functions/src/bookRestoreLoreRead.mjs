import { readBookBackupIndexedPart } from './bookBackupContainer.mjs';
import { BOOK_PORTABLE_LORE_FIELDS } from './bookPortableLoreIndex.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { validateBookRestoreRawPosition } from './bookRestoreHistoryContracts.mjs';
import { inconsistent } from './bookRestoreUploadContracts.mjs';
import { digest } from './sceneContracts.mjs';
const safe = (n) => Number.isSafeInteger(n) && n >= 0,
  closed = (v, keys) =>
    v &&
    typeof v === 'object' &&
    !Array.isArray(v) &&
    Object.keys(v).length === keys.length &&
    keys.every((key) => Object.hasOwn(v, key));
/** Bounds/shape only. The host must prove the original immutable validation pointer. */
export function bookRestoreIndexedLore(pointer) {
  const p = pointer,
    lore = p?.lore,
    meta = lore?.metadata,
    index = meta?.index;
  if (
    !closed(p?.record, ['kind', 'id', 'part']) ||
    p.record.kind !== 'book-lore' ||
    p.record.part !== 0 ||
    Object.hasOwn(p, 'legacy') ||
    Object.hasOwn(p, 'spans') ||
    p.raw !== null ||
    !safe(p.byteLength) ||
    p.byteLength < 2 ||
    !closed(lore, ['schemaVersion', 'cursor', 'chunkCount', 'contentHash', 'metadata']) ||
    lore.schemaVersion !== 1 ||
    !/^[a-f0-9]{64}$/.test(lore.contentHash) ||
    lore.chunkCount !== Math.ceil(p.byteLength / 65536) ||
    !closed(meta, [
      'schemaVersion',
      'kind',
      'parentId',
      'id',
      'byteLength',
      'dataOffset',
      'dataByteLength',
      'index',
    ]) ||
    meta.schemaVersion !== 1 ||
    meta.kind !== 'lore' ||
    meta.parentId !== null ||
    meta.byteLength !== p.byteLength ||
    !safe(meta.dataOffset) ||
    meta.dataOffset < 1 ||
    !safe(meta.dataByteLength) ||
    meta.dataByteLength < 2 ||
    !safe(meta.dataOffset + meta.dataByteLength) ||
    meta.dataOffset + meta.dataByteLength >= p.byteLength ||
    !closed(index, ['schemaVersion', 'fields', 'ranges', 'dates', 'isPublic', 'relations']) ||
    index.schemaVersion !== 1 ||
    !Array.isArray(index.fields) ||
    JSON.stringify(index.fields) !==
      JSON.stringify(
        BOOK_PORTABLE_LORE_FIELDS.filter((field) => Object.hasOwn(index.ranges ?? {}, field)),
      ) ||
    !closed(index.ranges, index.fields) ||
    !index.fields.includes('name') ||
    !index.fields.includes('category')
  )
    inconsistent();
  try {
    bookContentId(meta.id);
    validateBookRestoreRawPosition(lore.cursor);
  } catch {
    inconsistent();
  }
  if (p.record.id !== digest(['lore', null, meta.id])) inconsistent();
  const spans = [];
  for (const span of Object.values(index.ranges)) {
    if (
      !closed(span, ['offset', 'byteLength']) ||
      !safe(span.offset) ||
      span.offset < 1 ||
      !safe(span.byteLength) ||
      span.byteLength < 1 ||
      !safe(span.offset + span.byteLength) ||
      span.offset + span.byteLength >= meta.dataByteLength
    )
      inconsistent();
    spans.push(span);
  }
  spans.sort((a, b) => a.offset - b.offset);
  for (let at = 1; at < spans.length; at++)
    if (spans[at].offset < spans[at - 1].offset + spans[at - 1].byteLength) inconsistent();
  const dates = ['createdAt', 'updatedAt'].filter((field) => index.fields.includes(field));
  if (
    !closed(index.dates, dates) ||
    dates.some(
      (field) =>
        !safe(index.dates[field]) || !Number.isFinite(new Date(index.dates[field]).getTime()),
    ) ||
    !closed(index.isPublic, ['present', 'value']) ||
    index.isPublic.present !== index.fields.includes('isPublic') ||
    (index.isPublic.present
      ? typeof index.isPublic.value !== 'boolean'
      : index.isPublic.value !== null) ||
    !closed(index.relations, ['present', 'count']) ||
    index.relations.present !== index.fields.includes('relations') ||
    !safe(index.relations.count) ||
    (!index.relations.present && index.relations.count !== 0)
  )
    inconsistent();
  return structuredClone({
    record: p.record,
    byteLength: p.byteLength,
    chunkCount: lore.chunkCount,
    contentHash: lore.contentHash,
    cursor: lore.cursor,
    metadata: meta,
  });
}
/** <=64 KiB logical bytes; each touched frame is verified, without scanning prior item parts. */
export async function readBookRestoreLoreRange(source, descriptor, offset, length) {
  if (
    !safe(offset) ||
    !safe(length) ||
    length > 65536 ||
    !safe(offset + length) ||
    offset + length > descriptor.byteLength
  )
    inconsistent();
  const bytes = new Uint8Array(length);
  if (length === 0) return bytes;
  let consumed = 0;
  for (let part = Math.floor(offset / 65536); consumed < length; part++) {
    const unit = await readBookBackupIndexedPart(source, descriptor.cursor, descriptor, part),
      start = Math.max(0, offset - part * 65536),
      take = Math.min(length - consumed, unit.bytes.length - start);
    if (take < 1) inconsistent();
    bytes.set(unit.bytes.subarray(start, start + take), consumed);
    consumed += take;
  }
  return bytes;
}
export function freezeBookRestoreLoreMetadata(value) {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freezeBookRestoreLoreMetadata(child);
    Object.freeze(value);
  }
  return value;
}
