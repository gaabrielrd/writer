import {
  bookContentClosed as closed,
  bookContentInvalid as bad,
  bookContentId as id,
} from './bookBackupSchema.mjs';
import {
  createBookLoreFieldValidation,
  advanceBookLoreFieldPrefixValidation,
  finishBookLoreFieldValidation,
} from './bookLoreFieldValidation.mjs';
import {
  createBookPortableLoreIndex,
  advanceBookPortableLoreIndex,
  advanceBookPortableLorePrefixIndex,
  finishBookPortableLoreIndex,
} from './bookPortableLoreIndex.mjs';
export const BOOK_PORTABLE_LORE_ITEM_INDEX_BYTES = 32768;
const fields = ['schemaVersion', 'kind', 'parentId', 'id', 'data'],
  phases = ['open', 'firstKey', 'key', 'keyText', 'colon', 'value', 'after', 'done'],
  literals = { schemaVersion: '1', kind: '"lore"', parentId: 'null' },
  encoder = new TextEncoder(),
  safe = (n) => Number.isSafeInteger(n) && n >= 0,
  bit = (key) => 1 << fields.indexOf(key);
function advanceId(input, bytes, observer) {
  try {
    return advanceBookLoreFieldPrefixValidation(input, bytes, observer);
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
    'literalAt',
    'id',
    'child',
    'data',
    'dataOffset',
    'byteLength',
  ]);
  if (
    s.schemaVersion !== 1 ||
    !phases.includes(s.phase) ||
    !safe(s.mask) ||
    s.mask > 31 ||
    !(s.key === null || fields.includes(s.key)) ||
    typeof s.keyText !== 'string' ||
    !/^[A-Za-z]{0,13}$/.test(s.keyText) ||
    !safe(s.literalAt) ||
    s.literalAt > 5 ||
    typeof s.id !== 'string' ||
    !s.id.isWellFormed() ||
    encoder.encode(s.id).length > 1500 ||
    !safe(s.byteLength)
  )
    bad();
  if (
    ['colon', 'value'].includes(s.phase)
      ? s.key === null || Boolean(s.mask & bit(s.key))
      : s.key !== null
  )
    bad();
  if (s.phase !== 'keyText' && s.keyText !== '') bad();
  if (s.phase === 'open' && (s.mask !== 0 || s.byteLength !== 0)) bad();
  if (s.phase === 'firstKey' && (s.mask !== 0 || s.byteLength !== 1)) bad();
  if (s.phase === 'done' && s.mask !== 31) bad();
  if (s.mask & bit('id')) id(s.id);
  else if (s.id !== '' && !(s.phase === 'value' && s.key === 'id')) bad();
  const inId = s.phase === 'value' && s.key === 'id',
    inData = s.phase === 'value' && s.key === 'data',
    literal = s.phase === 'value' ? literals[s.key] : undefined;
  if (literal ? s.literalAt >= literal.length : s.literalAt !== 0) bad();
  if (inId !== (s.child !== null)) bad();
  if (s.child !== null) {
    advanceId(s.child, new Uint8Array());
    if (s.child.field !== 'name' || s.child.mode === 'done' || s.child.byteLength > s.byteLength)
      bad();
  }
  if (s.data === null) {
    if (s.dataOffset !== null || inData || s.mask & bit('data')) bad();
  } else {
    advanceBookPortableLoreIndex(s.data, new Uint8Array());
    if (
      !safe(s.dataOffset) ||
      !safe(s.dataOffset + s.data.byteLength) ||
      s.dataOffset + s.data.byteLength > s.byteLength ||
      (inData && s.dataOffset + s.data.byteLength !== s.byteLength) ||
      (inData ? s.data.phase === 'done' : !(s.mask & bit('data')) || s.data.phase !== 'done')
    )
      bad();
  }
  if (encoder.encode(JSON.stringify(s)).length > BOOK_PORTABLE_LORE_ITEM_INDEX_BYTES) bad();
}
export function createBookPortableLoreItemIndex() {
  return {
    schemaVersion: 1,
    phase: 'open',
    mask: 0,
    key: null,
    keyText: '',
    literalAt: 0,
    id: '',
    child: null,
    data: null,
    dataOffset: null,
    byteLength: 0,
  };
}
function endValue(s) {
  if (s.key === 'id') {
    try {
      finishBookLoreFieldValidation(s.child);
    } catch {
      bad();
    }
    id(s.id);
    s.child = null;
  } else if (s.key === 'data') finishBookPortableLoreIndex(s.data);
  s.mask |= bit(s.key);
  s.key = null;
  s.literalAt = 0;
  s.phase = 'after';
}
/** A bounded JSON/item prefix. References and metadata are provisional, never grants. */
export function advanceBookPortableLoreItemIndex(input, bytes, referenceLimit = 64) {
  checked(input);
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > 65536 ||
    !safe(input.byteLength + bytes.length) ||
    !Number.isInteger(referenceLimit) ||
    referenceLimit < 1 ||
    referenceLimit > 64
  )
    bad();
  const s = structuredClone(input),
    references = [];
  let at = 0;
  while (at < bytes.length) {
    const byte = bytes[at];
    if (s.phase === 'value') {
      if (s.key === 'data') {
        const result = advanceBookPortableLorePrefixIndex(
          s.data,
          bytes.subarray(at),
          referenceLimit - references.length,
        );
        if (!result.consumed) bad();
        s.data = result.state;
        references.push(...result.references);
        at += result.consumed;
        if (s.data.phase === 'done') endValue(s);
        if (references.length === referenceLimit) break;
      } else if (s.key === 'id') {
        const result = advanceId(s.child, bytes.subarray(at), {
          text(code) {
            s.id += String.fromCodePoint(code);
            if (encoder.encode(s.id).length > 1500) bad();
          },
        });
        if (!result.consumed) bad();
        s.child = result.state;
        at += result.consumed;
        if (s.child.mode === 'done') endValue(s);
      } else {
        const literal = literals[s.key];
        if (byte !== literal.charCodeAt(s.literalAt++)) bad();
        at++;
        if (s.literalAt === literal.length) endValue(s);
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
        if (!fields.includes(s.keyText) || s.mask & bit(s.keyText)) bad();
        s.key = s.keyText;
        s.keyText = '';
        s.phase = 'colon';
      } else {
        s.keyText += String.fromCharCode(byte);
        if (!/^[A-Za-z]{0,13}$/.test(s.keyText)) bad();
      }
    } else if (s.phase === 'colon') {
      if (byte !== 58) bad();
      s.phase = 'value';
      if (s.key === 'id') s.child = createBookLoreFieldValidation({ field: 'name' });
      if (s.key === 'data') {
        s.data = createBookPortableLoreIndex();
        s.dataOffset = input.byteLength + at;
      }
    } else if (s.phase === 'after') {
      if (byte === 44) s.phase = 'key';
      else if (byte === 125 && s.mask === 31) s.phase = 'done';
      else bad();
    } else bad();
  }
  s.byteLength += at;
  checked(s);
  return { state: s, consumed: at, references };
}
export function finishBookPortableLoreItemIndex(s) {
  checked(s);
  if (s.phase !== 'done' || s.mask !== 31 || s.child !== null) bad();
  return {
    schemaVersion: 1,
    kind: 'lore',
    parentId: null,
    id: s.id,
    byteLength: s.byteLength,
    dataOffset: s.dataOffset,
    dataByteLength: s.data.byteLength,
    index: finishBookPortableLoreIndex(s.data),
  };
}
