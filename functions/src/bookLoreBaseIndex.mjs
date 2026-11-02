import { bookContentId } from './bookBackupSchema.mjs';
import { closed } from './bookRestoreInput.mjs';
import { GenerationError } from './generationError.mjs';
import {
  createBookLoreFieldValidation,
  advanceBookLoreFieldPrefixValidation,
  finishBookLoreFieldValidation,
} from './bookLoreFieldValidation.mjs';
export const BOOK_LORE_BASE_FIELDS = Object.freeze([
  'name',
  'category',
  'summary',
  'details',
  'aliases',
  'structuredDetails',
  'isPublic',
  'bookId',
  'createdAt',
  'updatedAt',
]);
const fields = BOOK_LORE_BASE_FIELDS,
  encoder = new TextEncoder(),
  required = fields.reduce(
    (mask, key, i) =>
      ['name', 'category', 'bookId', 'createdAt', 'updatedAt'].includes(key)
        ? mask | (1 << i)
        : mask,
    0,
  );
const bad = () => {
  const error = new GenerationError(
    'failed-precondition',
    'A base do lore não corresponde ao formato esperado.',
  );
  error.details = { reason: 'book-lore-base-invalid' };
  throw error;
};
const safe = (v) => Number.isSafeInteger(v) && v >= 0;
function checkpoint(s) {
  closed(s, [
    'schemaVersion',
    'bookId',
    'phase',
    'mask',
    'key',
    'keyText',
    'child',
    'small',
    'valueStart',
    'valueBytes',
    'byteLength',
    'ranges',
    'isPublic',
    'dates',
  ]);
  bookContentId(s.bookId);
  if (
    s.schemaVersion !== 1 ||
    !['open', 'firstKey', 'key', 'keyText', 'colon', 'value', 'after', 'done'].includes(s.phase) ||
    !safe(s.mask) ||
    s.mask >= 2 ** fields.length ||
    !(s.key === null || (safe(s.key) && s.key < fields.length)) ||
    typeof s.keyText !== 'string' ||
    s.keyText.length > 17 ||
    !/^[A-Za-z]*$/.test(s.keyText) ||
    typeof s.small !== 'string' ||
    s.small.length > 16 ||
    !/^\d*$/.test(s.small) ||
    !(s.valueStart === null || (safe(s.valueStart) && s.valueStart <= s.byteLength)) ||
    !safe(s.valueBytes) ||
    !safe(s.byteLength) ||
    !(s.isPublic === null || typeof s.isPublic === 'boolean')
  )
    bad();
  closed(s.ranges, [], fields);
  closed(s.dates, [], ['createdAt', 'updatedAt']);
  for (const [key, r] of Object.entries(s.ranges)) {
    closed(r, ['offset', 'byteLength']);
    if (
      !safe(r.offset) ||
      !safe(r.byteLength) ||
      !r.byteLength ||
      r.offset + r.byteLength > s.byteLength ||
      !(s.mask & (1 << fields.indexOf(key)))
    )
      bad();
  }
  if (Object.keys(s.ranges).length !== fields.filter((_, i) => s.mask & (1 << i)).length) bad();
  for (const value of Object.values(s.dates))
    if (!safe(value) || !Number.isFinite(new Date(value).getTime())) bad();
  if (s.child !== null) {
    advanceBookLoreFieldPrefixValidation(s.child, new Uint8Array());
    if (
      s.phase !== 'value' ||
      s.child.byteLength !== s.valueBytes ||
      s.child.field !== (fields[s.key] === 'bookId' ? 'name' : fields[s.key])
    )
      bad();
  }
  if (
    s.phase === 'value' &&
    (s.key === null ||
      s.valueStart === null ||
      (['createdAt', 'updatedAt'].includes(fields[s.key]) ? s.child !== null : s.child === null))
  )
    bad();
}
export function createBookLoreBaseIndex(bookId) {
  bookContentId(bookId);
  return {
    schemaVersion: 1,
    bookId,
    phase: 'open',
    mask: 0,
    key: null,
    keyText: '',
    child: null,
    small: '',
    valueStart: null,
    valueBytes: 0,
    byteLength: 0,
    ranges: {},
    isPublic: null,
    dates: {},
  };
}
function endValue(s) {
  const key = fields[s.key];
  if (['createdAt', 'updatedAt'].includes(key)) {
    const value = Number(s.small);
    if (
      !s.small ||
      String(value) !== s.small ||
      !safe(value) ||
      !Number.isFinite(new Date(value).getTime())
    )
      bad();
    s.dates[key] = value;
  } else {
    finishBookLoreFieldValidation(s.child);
    if (key === 'bookId' && s.valueBytes !== encoder.encode(JSON.stringify(s.bookId)).length) bad();
  }
  s.ranges[key] = { offset: s.valueStart, byteLength: s.valueBytes };
  s.mask |= 1 << s.key;
  s.key = null;
  s.child = null;
  s.small = '';
  s.valueStart = null;
  s.valueBytes = 0;
  s.phase = 'after';
}
/** One bounded canonical-JSON unit. Raw value callbacks are RAM-only; numeric dates stay in metadata. */
export function advanceBookLoreBaseIndex(input, bytes, observers, valueBytes) {
  checkpoint(input);
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > 65536 ||
    !safe(input.byteLength + bytes.length)
  )
    bad();
  const s = structuredClone(input);
  let at = 0;
  while (at < bytes.length) {
    const byte = bytes[at],
      position = input.byteLength + at;
    if (s.phase === 'value') {
      const key = fields[s.key];
      if (['createdAt', 'updatedAt'].includes(key)) {
        if (byte >= 48 && byte <= 57) {
          s.small += String.fromCharCode(byte);
          s.valueBytes++;
          at++;
          if (s.small.length > 16) bad();
        } else {
          if (byte !== 44 && byte !== 125) bad();
          endValue(s);
        }
      } else {
        const result = advanceBookLoreFieldPrefixValidation(
            s.child,
            bytes.subarray(at),
            observers?.[key],
          ),
          end = at + result.consumed;
        if (!result.consumed) bad();
        if (key === 'bookId') {
          const expected = encoder.encode(JSON.stringify(s.bookId));
          for (let i = at; i < end; i++) if (bytes[i] !== expected[s.valueBytes + i - at]) bad();
        }
        if (key === 'isPublic' && s.valueBytes === 0) s.isPublic = byte === 116;
        s.valueBytes += result.consumed;
        s.child = result.state;
        const start = at,
          complete = s.child.mode === 'done';
        at = end;
        if (complete) endValue(s);
        valueBytes?.(key, bytes.subarray(start, end), complete);
      }
      continue;
    }
    at++;
    if (s.phase === 'open') {
      if (byte !== 123) bad();
      s.phase = 'firstKey';
    } else if (s.phase === 'firstKey' || s.phase === 'key') {
      if (byte !== 34) bad();
      s.phase = 'keyText';
      s.keyText = '';
    } else if (s.phase === 'keyText') {
      if (byte === 34) {
        const key = fields.indexOf(s.keyText);
        if (key < 0 || s.mask & (1 << key)) bad();
        s.key = key;
        s.keyText = '';
        s.phase = 'colon';
      } else {
        if (!((byte >= 65 && byte <= 90) || (byte >= 97 && byte <= 122))) bad();
        s.keyText += String.fromCharCode(byte);
        if (s.keyText.length > 17) bad();
      }
    } else if (s.phase === 'colon') {
      if (byte !== 58) bad();
      s.phase = 'value';
      s.valueStart = position + 1;
      s.valueBytes = 0;
      if (!['createdAt', 'updatedAt'].includes(fields[s.key]))
        s.child = createBookLoreFieldValidation({
          field: fields[s.key] === 'bookId' ? 'name' : fields[s.key],
        });
    } else if (s.phase === 'after') {
      if (byte === 44) s.phase = 'key';
      else if (byte === 125 && (s.mask & required) === required) s.phase = 'done';
      else bad();
    } else bad();
  }
  s.byteLength += bytes.length;
  return s;
}
export function finishBookLoreBaseIndex(s) {
  checkpoint(s);
  if (s.phase !== 'done' || (s.mask & required) !== required || s.child !== null || s.key !== null)
    bad();
  return {
    schemaVersion: 1,
    fields: fields.slice(0, 7).filter((_, i) => s.mask & (1 << i)),
    isPublic: { present: !!(s.mask & (1 << 6)), value: s.isPublic },
    dates: structuredClone(s.dates),
    ranges: structuredClone(s.ranges),
  };
}
