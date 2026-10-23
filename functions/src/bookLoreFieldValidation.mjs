import { bookContentId } from './bookBackupSchema.mjs';
import { workFail } from './workProgressContracts.mjs';

export const BOOK_LORE_EDIT_FIELDS = Object.freeze([
  'name',
  'category',
  'summary',
  'details',
  'aliases',
  'structuredDetails',
  'isPublic',
  'relations',
]);
const partBytes = 65536;
const encoder = new TextEncoder();
const bad = () =>
  workFail(
    'invalid-argument',
    'O campo de lore não corresponde ao formato esperado.',
    'book-lore-field-invalid',
  );
const structuredKeys = ['appearance', 'personality', 'history', 'notes'];
const relationKeys = ['targetEntityId', 'relationType', 'description'];
const modes = ['syntax', 'string', 'escape', 'unicode', 'literal', 'done'];
const phases = ['first', 'value', 'after', 'key', 'colon'];
const roles = ['text', 'key', 'target', 'category'];
const fields = [
  'schemaVersion',
  'field',
  'relationCount',
  'mode',
  'stack',
  'role',
  'text',
  'textBytes',
  'unicode',
  'literal',
  'literalIndex',
  'utf8',
  'byteLength',
];
const safe = (v) => Number.isSafeInteger(v) && v >= 0;
function closed(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    bad();
}
function checkpoint(value) {
  closed(value, fields);
  if (
    value.schemaVersion !== 1 ||
    !BOOK_LORE_EDIT_FIELDS.includes(value.field) ||
    !modes.includes(value.mode) ||
    !Array.isArray(value.stack) ||
    value.stack.length > 2 ||
    !(value.role === null || roles.includes(value.role)) ||
    typeof value.text !== 'string' ||
    !value.text.isWellFormed() ||
    value.text.length > 3011 ||
    !safe(value.textBytes) ||
    value.textBytes > 3011 ||
    !safe(value.byteLength) ||
    typeof value.unicode !== 'string' ||
    !/^[0-9a-f]{0,3}$/.test(value.unicode) ||
    !['', 'true', 'false'].includes(value.literal) ||
    !safe(value.literalIndex) ||
    value.literalIndex > 5 ||
    (value.field === 'relations'
      ? !safe(value.relationCount) || value.relationCount > 64
      : value.relationCount !== null)
  )
    bad();
  const maximum = value.role === 'key' ? 16 : value.role === 'category' ? 9 : 3011;
  if (
    encoder.encode(value.text).length !== value.textBytes ||
    value.textBytes > maximum ||
    ((value.role === null || value.role === 'text') && value.text !== '')
  )
    bad();
  closed(value.utf8, ['remaining', 'code', 'min', 'max']);
  const u = value.utf8;
  if (
    !safe(u.remaining) ||
    u.remaining > 3 ||
    !safe(u.code) ||
    u.code > 0x10ffff ||
    !Number.isInteger(u.min) ||
    !Number.isInteger(u.max) ||
    u.min < 0x80 ||
    u.max > 0xbf ||
    u.min > u.max
  )
    bad();
  for (const frame of value.stack) {
    closed(frame, ['kind', 'phase', 'count', 'mask', 'key']);
    const keys = frame.kind === 'structured' ? structuredKeys : relationKeys;
    if (
      !['aliases', 'relations', 'structured', 'relation'].includes(frame.kind) ||
      !phases.includes(frame.phase) ||
      !safe(frame.count) ||
      !safe(frame.mask) ||
      frame.mask >= 2 ** keys.length ||
      !(frame.key === null || (safe(frame.key) && frame.key < keys.length))
    )
      bad();
  }
  return value;
}
export function createBookLoreFieldValidation(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) bad();
  const relation = input.field === 'relations';
  closed(input, relation ? ['field', 'count'] : ['field']);
  if (
    !BOOK_LORE_EDIT_FIELDS.includes(input.field) ||
    (relation && (!safe(input.count) || input.count > 64))
  )
    bad();
  return {
    schemaVersion: 1,
    field: input.field,
    relationCount: relation ? input.count : null,
    mode: 'syntax',
    stack: [],
    role: null,
    text: '',
    textBytes: 0,
    unicode: '',
    literal: '',
    literalIndex: 0,
    utf8: { remaining: 0, code: 0, min: 0x80, max: 0xbf },
    byteLength: 0,
  };
}
function expected(state) {
  const frame = state.stack.at(-1);
  if (!frame) {
    if (state.field === 'category') return 'category';
    if (state.field === 'isPublic') return 'boolean';
    if (state.field === 'aliases') return 'aliases';
    if (state.field === 'structuredDetails') return 'structured';
    if (state.field === 'relations') return 'relations';
    return 'text';
  }
  if (!['first', 'value'].includes(frame.phase)) bad();
  if (frame.kind === 'aliases') return 'text';
  if (frame.kind === 'relations') return 'relation';
  if (frame.phase !== 'value' || frame.key === null) bad();
  return frame.kind === 'relation' && frame.key === 0 ? 'target' : 'text';
}
function complete(state) {
  const frame = state.stack.at(-1);
  if (!frame) {
    state.mode = 'done';
    return;
  }
  if (!['first', 'value'].includes(frame.phase)) bad();
  if (frame.kind === 'aliases' || frame.kind === 'relations') {
    frame.count++;
    if (!safe(frame.count) || (frame.kind === 'relations' && frame.count > state.relationCount))
      bad();
  }
  frame.key = null;
  frame.phase = 'after';
  state.mode = 'syntax';
}
function collect(state, code) {
  if (state.role === 'text') return;
  if ((state.role === 'key' || state.role === 'category') && (code < 0x20 || code > 0x7e)) bad();
  if (state.role === 'target' && (code < 32 || code === 127 || code === 47 || code === 92)) bad();
  state.text += String.fromCodePoint(code);
  state.textBytes += code < 0x80 ? 1 : code < 0x800 ? 2 : code < 0x10000 ? 3 : 4;
  const maximum = state.role === 'key' ? 16 : state.role === 'category' ? 9 : 3011;
  if (state.textBytes > maximum) bad();
}
function target(value) {
  try {
    const qualified = /^(adventure|universe):([^:]+):(.+)$/.exec(value);
    if (qualified) {
      bookContentId(qualified[2]);
      bookContentId(qualified[3]);
    } else bookContentId(value);
  } catch {
    bad();
  }
}
function closeString(state) {
  const role = state.role,
    value = state.text;
  state.role = null;
  state.text = '';
  state.textBytes = 0;
  if (role === 'key') {
    const frame = state.stack.at(-1),
      keys = frame.kind === 'structured' ? structuredKeys : relationKeys,
      key = keys.indexOf(value);
    if (key < 0 || frame.mask & (1 << key)) bad();
    frame.mask |= 1 << key;
    frame.key = key;
    frame.phase = 'colon';
    state.mode = 'syntax';
  } else {
    if (role === 'category' && !['character', 'location', 'concept', 'other'].includes(value))
      bad();
    if (role === 'target') target(value);
    complete(state);
  }
}
function stringByte(state, byte) {
  if (state.mode === 'unicode') {
    const char = String.fromCharCode(byte);
    if (!/^[0-9a-f]$/.test(char)) bad();
    state.unicode += char;
    if (state.unicode.length === 4) {
      const code = parseInt(state.unicode, 16);
      if (code > 31 || [8, 9, 10, 12, 13].includes(code)) bad();
      collect(state, code);
      state.unicode = '';
      state.mode = 'string';
    }
    return;
  }
  if (state.mode === 'escape') {
    if (byte === 0x75) {
      state.mode = 'unicode';
      return;
    }
    const escapes = { 34: 34, 92: 92, 98: 8, 102: 12, 110: 10, 114: 13, 116: 9 };
    if (!Object.hasOwn(escapes, byte)) bad();
    collect(state, escapes[byte]);
    state.mode = 'string';
    return;
  }
  const u = state.utf8;
  if (u.remaining) {
    if (byte < u.min || byte > u.max) bad();
    u.code = (u.code << 6) | (byte & 63);
    u.remaining--;
    u.min = 0x80;
    u.max = 0xbf;
    if (!u.remaining) {
      collect(state, u.code);
      u.code = 0;
    }
    return;
  }
  if (byte === 34) {
    closeString(state);
    return;
  }
  if (byte === 92) {
    state.mode = 'escape';
    return;
  }
  if (byte < 32) bad();
  if (byte < 128) {
    collect(state, byte);
    return;
  }
  if (byte >= 0xc2 && byte <= 0xdf) {
    u.remaining = 1;
    u.code = byte & 31;
  } else if (byte >= 0xe0 && byte <= 0xef) {
    u.remaining = 2;
    u.code = byte & 15;
    u.min = byte === 0xe0 ? 0xa0 : 0x80;
    u.max = byte === 0xed ? 0x9f : 0xbf;
  } else if (byte >= 0xf0 && byte <= 0xf4) {
    u.remaining = 3;
    u.code = byte & 7;
    u.min = byte === 0xf0 ? 0x90 : 0x80;
    u.max = byte === 0xf4 ? 0x8f : 0xbf;
  } else bad();
}
function syntaxByte(state, byte) {
  const frame = state.stack.at(-1),
    object = frame && ['structured', 'relation'].includes(frame.kind);
  if (byte === 44) {
    if (!frame || frame.phase !== 'after') bad();
    frame.phase = object ? 'key' : 'value';
    return;
  }
  if (byte === 58) {
    if (!object || frame.phase !== 'colon') bad();
    frame.phase = 'value';
    return;
  }
  if (byte === 93 || byte === 125) {
    if (!frame || !['first', 'after'].includes(frame.phase) || (byte === 125) !== !!object) bad();
    if (frame.kind === 'relation' && (frame.mask & 3) !== 3) bad();
    if (frame.kind === 'relations' && frame.count !== state.relationCount) bad();
    state.stack.pop();
    complete(state);
    return;
  }
  if (byte === 34) {
    const role = object && ['first', 'key'].includes(frame.phase) ? 'key' : expected(state);
    if (!roles.includes(role)) bad();
    state.role = role;
    state.mode = 'string';
    return;
  }
  const kind = expected(state);
  if (
    (byte === 91 && ['aliases', 'relations'].includes(kind)) ||
    (byte === 123 && ['structured', 'relation'].includes(kind))
  ) {
    state.stack.push({ kind, phase: 'first', count: 0, mask: 0, key: null });
    return;
  }
  if ((byte === 116 || byte === 102) && kind === 'boolean') {
    state.literal = byte === 116 ? 'true' : 'false';
    state.literalIndex = 1;
    state.mode = 'literal';
    return;
  }
  bad();
}
/** Check one storage unit. Checkpoints contain syntax/IDs, never string prose. */
function advanceField(input, bytes, prefix) {
  checkpoint(input);
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length > partBytes ||
    !safe(input.byteLength + bytes.length)
  )
    bad();
  const state = structuredClone(input);
  let consumed = 0;
  for (const byte of bytes) {
    if (state.mode === 'done') {
      if (prefix) break;
      bad();
    }
    consumed++;
    if (state.mode === 'literal') {
      if (byte !== state.literal.charCodeAt(state.literalIndex++)) bad();
      if (state.literalIndex === state.literal.length) {
        state.literal = '';
        state.literalIndex = 0;
        complete(state);
      }
    } else if (state.mode === 'syntax') syntaxByte(state, byte);
    else stringByte(state, byte);
  }
  state.byteLength += consumed;
  return { state, consumed };
}
export const advanceBookLoreFieldValidation = (input, bytes) =>
  advanceField(input, bytes, false).state;
/** Parse exactly one value, leaving its root delimiter for the base indexer. */
export const advanceBookLoreFieldPrefixValidation = (input, bytes) =>
  advanceField(input, bytes, true);
/** Syntax/domain proof only. Native authorization, SHA, receipts and CAS are separate. */
export function finishBookLoreFieldValidation(state) {
  checkpoint(state);
  if (
    state.mode !== 'done' ||
    state.stack.length ||
    !state.byteLength ||
    state.utf8.remaining ||
    state.role !== null ||
    state.text ||
    state.unicode ||
    state.literal
  )
    bad();
  return {
    field: state.field,
    byteLength: state.byteLength,
    ...(state.field === 'relations' ? { count: state.relationCount } : {}),
  };
}
