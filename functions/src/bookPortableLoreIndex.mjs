import {
  bookContentClosed as closed,
  bookContentInvalid as bad,
  bookContentCount as count,
} from './bookBackupSchema.mjs';
import {
  createBookLoreFieldValidation,
  advanceBookLoreFieldPrefixValidation,
  finishBookLoreFieldValidation,
  createBookPortableLoreRelationsValidation,
  advanceBookPortableLoreRelationsPrefixValidation,
  finishBookPortableLoreRelationsValidation,
} from './bookLoreFieldValidation.mjs';
export const BOOK_PORTABLE_LORE_FIELDS = Object.freeze([
  'name',
  'aliases',
  'category',
  'summary',
  'details',
  'structuredDetails',
  'isPublic',
  'createdAt',
  'updatedAt',
  'relations',
]);
export const BOOK_PORTABLE_LORE_INDEX_BYTES = 16384;
const fields = BOOK_PORTABLE_LORE_FIELDS,
  encoder = new TextEncoder(),
  safe = (n) => Number.isSafeInteger(n) && n >= 0,
  phases = ['open', 'firstKey', 'key', 'keyText', 'colon', 'value', 'after', 'done'],
  dates = ['createdAt', 'updatedAt'],
  required = (1 << fields.indexOf('name')) | (1 << fields.indexOf('category'));
const relations = (key) => key === 'relations';
function childAdvance(key, input, bytes, observer) {
  try {
    return relations(key)
      ? advanceBookPortableLoreRelationsPrefixValidation(input, bytes, observer)
      : advanceBookLoreFieldPrefixValidation(input, bytes, observer);
  } catch {
    bad();
  }
}
function childFinish(key, input) {
  try {
    return relations(key)
      ? finishBookPortableLoreRelationsValidation(input)
      : finishBookLoreFieldValidation(input);
  } catch {
    bad();
  }
}
function checked(s) {
  closed(s, [
    'schemaVersion',
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
    'relationCount',
    'referenceCount',
    'target',
  ]);
  if (
    s.schemaVersion !== 1 ||
    !phases.includes(s.phase) ||
    !safe(s.mask) ||
    s.mask >= 2 ** fields.length ||
    !(s.key === null || (safe(s.key) && s.key < fields.length)) ||
    typeof s.keyText !== 'string' ||
    s.keyText.length > 17 ||
    !/^[A-Za-z]*$/.test(s.keyText) ||
    typeof s.small !== 'string' ||
    !/^\d{0,16}$/.test(s.small) ||
    !(s.valueStart === null || (safe(s.valueStart) && s.valueStart <= s.byteLength)) ||
    !safe(s.valueBytes) ||
    !safe(s.byteLength) ||
    !(s.isPublic === null || typeof s.isPublic === 'boolean') ||
    !(s.relationCount === null || safe(s.relationCount)) ||
    !safe(s.referenceCount) ||
    typeof s.target !== 'string' ||
    !s.target.isWellFormed() ||
    encoder.encode(s.target).length > 3011
  )
    bad();
  closed(s.ranges, [], fields);
  closed(s.dates, [], dates);
  for (const [key, r] of Object.entries(s.ranges)) {
    closed(r, ['offset', 'byteLength']);
    if (
      !safe(r.offset) ||
      !safe(r.byteLength) ||
      !r.byteLength ||
      !safe(r.offset + r.byteLength) ||
      r.offset + r.byteLength > s.byteLength ||
      !(s.mask & (1 << fields.indexOf(key)))
    )
      bad();
  }
  if (Object.keys(s.ranges).length !== fields.filter((_, i) => s.mask & (1 << i)).length) bad();
  for (const [key, value] of Object.entries(s.dates))
    if (
      !safe(value) ||
      !Number.isFinite(new Date(value).getTime()) ||
      !Object.hasOwn(s.ranges, key)
    )
      bad();
  const key = fields[s.key];
  if (
    ['colon', 'value'].includes(s.phase)
      ? s.key === null || Boolean(s.mask & (1 << s.key))
      : s.key !== null
  )
    bad();
  if (s.phase !== 'keyText' && s.keyText !== '') bad();
  if (s.phase === 'open' && (s.byteLength !== 0 || s.mask !== 0)) bad();
  if (s.phase === 'firstKey' && (s.mask !== 0 || s.byteLength !== 1)) bad();
  if (dates.some((name) => Object.hasOwn(s.ranges, name) !== Object.hasOwn(s.dates, name))) bad();
  if (
    !Object.hasOwn(s.ranges, 'isPublic') &&
    !(key === 'isPublic' && s.phase === 'value' && s.valueBytes > 0) &&
    s.isPublic !== null
  )
    bad();
  if (Object.hasOwn(s.ranges, 'isPublic') && typeof s.isPublic !== 'boolean') bad();
  if (
    s.phase === 'value'
      ? s.valueStart + s.valueBytes !== s.byteLength
      : s.valueStart !== null || s.valueBytes !== 0 || s.child !== null || s.small !== ''
  )
    bad();
  if (s.child !== null) {
    childAdvance(key, s.child, new Uint8Array());
    if (s.phase !== 'value' || s.child.field !== key || s.child.byteLength !== s.valueBytes) bad();
  }
  if (
    s.phase === 'value' &&
    (s.key === null ||
      s.valueStart === null ||
      (dates.includes(key) ? s.child !== null : s.child === null))
  )
    bad();
  if (
    s.child?.role === 'target' ? key !== 'relations' || s.child.text !== s.target : s.target !== ''
  )
    bad();
  if (!Object.hasOwn(s.ranges, 'relations') && key !== 'relations' && s.referenceCount !== 0) bad();
  if (
    key === 'relations' &&
    s.child &&
    (s.referenceCount < s.child.relationCount || s.referenceCount > s.child.relationCount + 1)
  )
    bad();
  if (
    Object.hasOwn(s.ranges, 'relations') !== (s.relationCount !== null) ||
    (s.relationCount !== null && s.referenceCount !== s.relationCount)
  )
    bad();
  if (encoder.encode(JSON.stringify(s)).length > BOOK_PORTABLE_LORE_INDEX_BYTES) bad();
}
export function createBookPortableLoreIndex() {
  return {
    schemaVersion: 1,
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
    relationCount: null,
    referenceCount: 0,
    target: '',
  };
}
function endValue(s) {
  const key = fields[s.key];
  if (dates.includes(key)) {
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
    const result = childFinish(key, s.child);
    if (relations(key)) {
      if (result.count !== s.referenceCount || s.target) bad();
      s.relationCount = result.count;
    }
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
/** One canonical JSON unit. References remain provisional until EOF/integrity; metadata never grants access. */
export function advanceBookPortableLoreIndex(input, bytes) {
  checked(input);
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > 65536 ||
    !safe(input.byteLength + bytes.length)
  )
    bad();
  const s = structuredClone(input),
    references = [];
  const observer = {
    start(role) {
      if (role === 'target' && s.target) bad();
    },
    text(code, role) {
      if (role !== 'target') return;
      // The shared target grammar bounds UTF-8 bytes before invoking this observer.
      s.target += String.fromCodePoint(code);
    },
    end(role) {
      if (role !== 'target') return;
      const index = s.referenceCount++;
      count(s.referenceCount);
      references.push({ index, targetEntityId: s.target });
      s.target = '';
    },
  };
  let at = 0;
  while (at < bytes.length) {
    const byte = bytes[at],
      position = input.byteLength + at;
    if (s.phase === 'value') {
      const key = fields[s.key];
      if (dates.includes(key)) {
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
        const result = childAdvance(
          key,
          s.child,
          bytes.subarray(at),
          relations(key) ? observer : undefined,
        );
        if (!result.consumed) bad();
        if (key === 'isPublic' && s.valueBytes === 0) s.isPublic = byte === 116;
        s.child = result.state;
        s.valueBytes += result.consumed;
        at += result.consumed;
        if (s.child.mode === 'done') endValue(s);
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
        s.keyText += String.fromCharCode(byte);
        if (s.keyText.length > 17 || !/^[A-Za-z]*$/.test(s.keyText)) bad();
      }
    } else if (s.phase === 'colon') {
      if (byte !== 58) bad();
      s.phase = 'value';
      s.valueStart = position + 1;
      s.valueBytes = 0;
      if (!dates.includes(fields[s.key])) {
        try {
          s.child = relations(fields[s.key])
            ? createBookPortableLoreRelationsValidation()
            : createBookLoreFieldValidation({ field: fields[s.key] });
        } catch {
          bad();
        }
      }
    } else if (s.phase === 'after') {
      if (byte === 44) s.phase = 'key';
      else if (byte === 125 && (s.mask & required) === required) s.phase = 'done';
      else bad();
    } else bad();
  }
  s.byteLength += bytes.length;
  checked(s);
  return { state: s, references };
}
export function finishBookPortableLoreIndex(s) {
  checked(s);
  if (
    s.phase !== 'done' ||
    (s.mask & required) !== required ||
    s.child !== null ||
    s.key !== null ||
    s.target
  )
    bad();
  const present = (key) => Object.hasOwn(s.ranges, key);
  if (
    dates.some((key) => present(key) !== Object.hasOwn(s.dates, key)) ||
    present('isPublic') !== (s.isPublic !== null)
  )
    bad();
  return {
    schemaVersion: 1,
    fields: fields.filter(present),
    ranges: structuredClone(s.ranges),
    dates: structuredClone(s.dates),
    isPublic: { present: present('isPublic'), value: s.isPublic },
    relations: { present: present('relations'), count: s.relationCount ?? 0 },
  };
}
