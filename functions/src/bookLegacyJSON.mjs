import { bookContentInvalid as bad } from './bookBackupSchema.mjs';
const CHUNK = 65536,
  MAX_ITEM = 8 * 1024 * 1024;
export const BOOK_LEGACY_JSON_CURSOR_BYTES = 512 * 1024;
const object = (v) => v && typeof v === 'object' && !Array.isArray(v);
function closed(v, keys) {
  if (
    !object(v) ||
    Object.keys(v).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(v, key))
  )
    bad();
}
const integer = (v, min, max) => Number.isSafeInteger(v) && v >= min && v <= max;
const digit = (v) => v >= 48 && v <= 57;
const hex = (v) => digit(v) || (v >= 65 && v <= 70) || (v >= 97 && v <= 102);
const whitespace = (v) => v === 32 || v === 9 || v === 10 || v === 13;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const numberEnd = (mode) => ['zero', 'integer', 'fraction', 'expdigits'].includes(mode);
function childPath(frames) {
  const parent = frames.at(-1);
  return !parent ? [] : [...parent.path, parent.type === 'object' ? parent.key : parent.index];
}
function initial(size) {
  return {
    schemaVersion: 1,
    size,
    offset: 0,
    prefix: 'start',
    utf8: { need: 0, lower: 128, upper: 191 },
    root: 'value',
    frames: [],
    token: null,
    done: false,
  };
}
function cursorFor(value, size) {
  if (value === null) return initial(size);
  closed(value, [
    'schemaVersion',
    'size',
    'offset',
    'prefix',
    'utf8',
    'root',
    'frames',
    'token',
    'done',
  ]);
  if (
    value.schemaVersion !== 1 ||
    value.size !== size ||
    !integer(value.offset, 0, size) ||
    !['start', 'bom1', 'bom2', 'body'].includes(value.prefix) ||
    !['value', 'end'].includes(value.root) ||
    typeof value.done !== 'boolean' ||
    !Array.isArray(value.frames) ||
    value.frames.length > 25 ||
    new TextEncoder().encode(JSON.stringify(value)).length > BOOK_LEGACY_JSON_CURSOR_BYTES
  )
    bad();
  closed(value.utf8, ['need', 'lower', 'upper']);
  const { need, lower, upper } = value.utf8;
  if (
    !integer(need, 0, 3) ||
    !([128, 144, 160].includes(lower) && [143, 159, 191].includes(upper)) ||
    lower > upper ||
    (need < 2 && (lower !== 128 || upper !== 191)) ||
    (need === 2 &&
      !((lower === 128 && [159, 191].includes(upper)) || (lower === 160 && upper === 191))) ||
    (need === 3 &&
      !((lower === 128 && [143, 191].includes(upper)) || (lower === 144 && upper === 191)))
  )
    bad();
  if (
    (value.prefix === 'start' && value.offset !== 0) ||
    (value.prefix === 'bom1' && value.offset !== 1) ||
    (value.prefix === 'bom2' && value.offset !== 2)
  )
    bad();
  const ancestors = [];
  for (const frame of value.frames) {
    if (!object(frame) || !['object', 'array'].includes(frame.type)) bad();
    closed(
      frame,
      frame.type === 'object'
        ? ['type', 'start', 'path', 'stage', 'keys', 'key']
        : ['type', 'start', 'path', 'stage', 'index'],
    );
    if (
      !integer(frame.start, 0, value.offset - 1) ||
      !same(frame.path, childPath(ancestors)) ||
      frame.path.length > 24 ||
      (ancestors.length && ancestors.at(-1).stage !== 'value')
    )
      bad();
    if (frame.type === 'object') {
      if (
        !['first', 'key', 'colon', 'value', 'comma'].includes(frame.stage) ||
        !Array.isArray(frame.keys) ||
        frame.keys.length > 64 ||
        new Set(frame.keys).size !== frame.keys.length ||
        frame.keys.some(
          (k) =>
            typeof k !== 'string' ||
            k === '__proto__' ||
            new TextEncoder().encode(JSON.stringify(k)).length > 258,
        ) ||
        (['colon', 'value'].includes(frame.stage)
          ? typeof frame.key !== 'string' || frame.key !== frame.keys.at(-1)
          : frame.key !== null) ||
        (frame.stage === 'first' && frame.keys.length !== 0)
      )
        bad();
    } else if (
      !['first', 'value', 'comma'].includes(frame.stage) ||
      !integer(frame.index, 0, Number.MAX_SAFE_INTEGER) ||
      (frame.stage === 'first' && frame.index !== 0)
    )
      bad();
    ancestors.push(frame);
  }
  const token = value.token;
  if (token !== null) {
    if (!object(token) || !['key', 'string', 'number', 'literal'].includes(token.type)) bad();
    const keys = ['type', 'start', 'path'];
    if (token.type === 'key' || token.type === 'string') keys.push('mode', 'remaining', 'bytes');
    else if (token.type === 'number') keys.push('mode');
    else keys.push('text', 'at');
    closed(token, keys);
    if (
      !integer(token.start, 0, value.offset - 1) ||
      !same(
        token.path,
        token.type === 'key' ? value.frames.at(-1)?.path : childPath(value.frames),
      ) ||
      !Array.isArray(token.path) ||
      token.path.length > 24
    )
      bad();
    if (token.type === 'key' || token.type === 'string') {
      if (
        !['body', 'escape', 'hex'].includes(token.mode) ||
        !integer(token.remaining, 0, 4) ||
        (token.mode === 'hex' ? token.remaining < 1 : token.remaining !== 0)
      )
        bad();
      if (token.type === 'key') {
        const frame = value.frames.at(-1);
        if (
          frame?.type !== 'object' ||
          !['first', 'key'].includes(frame.stage) ||
          !Array.isArray(token.bytes) ||
          token.bytes.length < 1 ||
          token.bytes.length > 258 ||
          token.bytes[0] !== 34 ||
          token.bytes.some((b) => !integer(b, 0, 255))
        )
          bad();
      } else if (token.bytes !== null) bad();
    } else if (token.type === 'number') {
      if (
        !['minus', 'zero', 'integer', 'dot', 'fraction', 'exponent', 'sign', 'expdigits'].includes(
          token.mode,
        )
      )
        bad();
    } else if (
      !['true', 'false', 'null'].includes(token.text) ||
      !integer(token.at, 1, token.text.length - 1)
    )
      bad();
    if (token.type !== 'key' && value.frames.length && value.frames.at(-1).stage !== 'value') bad();
  }
  if (
    (value.root === 'end' && (value.frames.length || token)) ||
    (value.done &&
      (value.root !== 'end' || value.offset !== size || need !== 0 || value.prefix !== 'body')) ||
    (value.prefix !== 'body' && (value.frames.length || token || value.root !== 'value'))
  )
    bad();
  return structuredClone(value);
}
function feedUTF8(state, byte) {
  if (state.need) {
    if (byte < state.lower || byte > state.upper) bad();
    state.need--;
    state.lower = 128;
    state.upper = 191;
    return;
  }
  if (byte < 128) return;
  if (byte >= 194 && byte <= 223) state.need = 1;
  else if (byte >= 224 && byte <= 239) {
    state.need = 2;
    if (byte === 224) state.lower = 160;
    if (byte === 237) state.upper = 159;
  } else if (byte >= 240 && byte <= 244) {
    state.need = 3;
    if (byte === 240) state.lower = 144;
    if (byte === 244) state.upper = 143;
  } else bad();
}
/** Pure, bounded lexical continuation. Cursor and spans are not authorization. */
export async function readBookLegacyJSONStep(
  source,
  cursor = null,
  { signal, maxBytes = CHUNK, maxValues = 64 } = {},
) {
  const size = source?.size;
  if (
    !integer(size, 1, Number.MAX_SAFE_INTEGER) ||
    typeof source.read !== 'function' ||
    !integer(maxBytes, 1, CHUNK) ||
    !integer(maxValues, 1, 64)
  )
    bad();
  const state = cursorFor(cursor, size);
  const check = () => {
    signal?.throwIfAborted();
    if (source.size !== size) bad();
  };
  check();
  if (state.done) return { cursor: state, values: [], bytes: new Uint8Array() };
  const length = Math.min(maxBytes, size - state.offset),
    input = length ? await source.read(state.offset, length) : new Uint8Array();
  check();
  if (!(input instanceof Uint8Array) || input.length !== length) bad();
  const buffer = new Uint8Array(input),
    values = [];
  let position = 0;
  const consume = () => {
    const byte = buffer[position++];
    feedUTF8(state.utf8, byte);
    state.offset++;
    if (state.token?.type === 'key') {
      state.token.bytes.push(byte);
      if (state.token.bytes.length > 258) bad();
    }
    return byte;
  };
  function complete(type, start, path) {
    values.push({ path, start, end: state.offset, type });
    const parent = state.frames.at(-1);
    if (!parent) state.root = 'end';
    else {
      if (parent.stage !== 'value') bad();
      parent.stage = 'comma';
      if (parent.type === 'object') parent.key = null;
      else if (!Number.isSafeInteger(++parent.index)) bad();
    }
    state.token = null;
  }
  function startValue(byte) {
    const path = childPath(state.frames),
      start = state.offset;
    if (path.length > 24) bad();
    if (byte === 123 || byte === 91) {
      consume();
      state.frames.push(
        byte === 123
          ? { type: 'object', start, path, stage: 'first', keys: [], key: null }
          : { type: 'array', start, path, stage: 'first', index: 0 },
      );
    } else if (byte === 34) {
      consume();
      state.token = { type: 'string', start, path, mode: 'body', remaining: 0, bytes: null };
    } else if (byte === 45 || digit(byte)) {
      consume();
      state.token = {
        type: 'number',
        start,
        path,
        mode: byte === 45 ? 'minus' : byte === 48 ? 'zero' : 'integer',
      };
    } else {
      const text = byte === 116 ? 'true' : byte === 102 ? 'false' : byte === 110 ? 'null' : null;
      if (!text) bad();
      consume();
      state.token = { type: 'literal', start, path, text, at: 1 };
    }
  }
  while (values.length < maxValues) {
    if (position === buffer.length) {
      if (state.offset === size) {
        const token = state.token;
        if (token?.type === 'number' && numberEnd(token.mode))
          complete('number', token.start, token.path);
        if (
          state.token ||
          state.frames.length ||
          state.root !== 'end' ||
          state.prefix !== 'body' ||
          state.utf8.need
        )
          bad();
        state.done = true;
      }
      break;
    }
    const byte = buffer[position],
      token = state.token;
    if (state.prefix !== 'body') {
      if (state.prefix === 'start') {
        if (byte === 239) {
          consume();
          state.prefix = 'bom1';
        } else state.prefix = 'body';
      } else {
        if (byte !== (state.prefix === 'bom1' ? 187 : 191)) bad();
        consume();
        state.prefix = state.prefix === 'bom1' ? 'bom2' : 'body';
      }
      continue;
    }
    if (token) {
      if (token.type === 'string' || token.type === 'key') {
        if (token.mode === 'hex') {
          if (!hex(byte)) bad();
          consume();
          if (--token.remaining === 0) token.mode = 'body';
        } else if (token.mode === 'escape') {
          if (byte === 117) {
            consume();
            token.mode = 'hex';
            token.remaining = 4;
          } else {
            if (![34, 92, 47, 98, 102, 110, 114, 116].includes(byte)) bad();
            consume();
            token.mode = 'body';
          }
        } else {
          if (byte < 32) bad();
          consume();
          if (byte === 92) token.mode = 'escape';
          else if (byte === 34) {
            if (token.type === 'key') {
              let key;
              try {
                key = JSON.parse(
                  new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(
                    new Uint8Array(token.bytes),
                  ),
                );
              } catch {
                bad();
              }
              const frame = state.frames.at(-1);
              if (key === '__proto__' || frame.keys.includes(key) || frame.keys.length >= 64) bad();
              frame.keys.push(key);
              frame.key = key;
              frame.stage = 'colon';
              state.token = null;
            } else complete('string', token.start, token.path);
          }
        }
      } else if (token.type === 'literal') {
        if (byte !== token.text.charCodeAt(token.at)) bad();
        consume();
        if (++token.at === token.text.length)
          complete(token.text === 'null' ? 'null' : 'boolean', token.start, token.path);
      } else {
        const mode = token.mode;
        if (['minus', 'dot', 'sign'].includes(mode)) {
          if (!digit(byte)) bad();
          consume();
          token.mode =
            mode === 'minus'
              ? byte === 48
                ? 'zero'
                : 'integer'
              : mode === 'dot'
                ? 'fraction'
                : 'expdigits';
        } else if (mode === 'exponent') {
          if (byte === 43 || byte === 45) {
            consume();
            token.mode = 'sign';
          } else {
            if (!digit(byte)) bad();
            consume();
            token.mode = 'expdigits';
          }
        } else if (mode !== 'zero' && digit(byte)) consume();
        else if (['zero', 'integer'].includes(mode) && byte === 46) {
          consume();
          token.mode = 'dot';
        } else if (
          ['zero', 'integer', 'fraction'].includes(mode) &&
          (byte === 69 || byte === 101)
        ) {
          consume();
          token.mode = 'exponent';
        } else complete('number', token.start, token.path);
      }
      continue;
    }
    if (whitespace(byte)) {
      consume();
      continue;
    }
    const frame = state.frames.at(-1);
    if (!frame) {
      if (state.root === 'end') bad();
      startValue(byte);
      continue;
    }
    const closing = frame.type === 'object' ? 125 : 93;
    if (['first', 'comma'].includes(frame.stage) && byte === closing) {
      consume();
      state.frames.pop();
      complete(frame.type, frame.start, frame.path);
      continue;
    }
    if (frame.stage === 'comma') {
      if (byte !== 44) bad();
      consume();
      frame.stage = frame.type === 'object' ? 'key' : 'value';
      continue;
    }
    if (frame.type === 'object') {
      if (['first', 'key'].includes(frame.stage)) {
        if (byte !== 34) bad();
        const start = state.offset;
        consume();
        state.token = {
          type: 'key',
          start,
          path: frame.path,
          mode: 'body',
          remaining: 0,
          bytes: [34],
        };
      } else if (frame.stage === 'colon') {
        if (byte !== 58) bad();
        consume();
        frame.stage = 'value';
      } else startValue(byte);
    } else {
      frame.stage = 'value';
      startValue(byte);
    }
  }
  check();
  // Check outgoing schema/bound as well; callers persist only this snapshot.
  const next = cursorFor(state, size);
  return { cursor: next, values, bytes: buffer.slice(0, position) };
}
/** Strict scanner shares the resumable grammar; only consumed bytes feed the fingerprint. */
export async function scanBookLegacyJSON(source, { onValue, hash, signal } = {}) {
  if (typeof onValue !== 'function' || !hash || typeof hash.create !== 'function') bad();
  const hasher = hash.create();
  let cursor = null;
  const size = source?.size;
  try {
    do {
      const step = await readBookLegacyJSONStep(source, cursor, { signal });
      hasher.update(step.bytes);
      for (const span of step.values) {
        signal?.throwIfAborted();
        if (source.size !== size) bad();
        await onValue(span);
        signal?.throwIfAborted();
        if (source.size !== size) bad();
      }
      cursor = step.cursor;
    } while (!cursor.done);
    return { size, fingerprint: hasher.digest() };
  } finally {
    hasher.destroy();
  }
}
export async function readBookLegacyJSONSpan(source, span, { signal } = {}) {
  const { start, end } = span ?? {};
  if (
    !Number.isSafeInteger(start) ||
    !Number.isSafeInteger(end) ||
    start < 0 ||
    end <= start ||
    end > source.size ||
    end - start > MAX_ITEM
  )
    bad();
  const bytes = new Uint8Array(end - start);
  for (let at = start; at < end; at += CHUNK) {
    signal?.throwIfAborted();
    const length = Math.min(CHUNK, end - at),
      part = await source.read(at, length);
    signal?.throwIfAborted();
    if (!(part instanceof Uint8Array) || part.length !== length) bad();
    bytes.set(part, at - start);
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes));
  } catch {
    return bad();
  }
}
