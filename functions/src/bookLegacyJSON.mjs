import { bookContentInvalid as bad } from './bookBackupSchema.mjs';
const CHUNK = 65536,
  MAX_ITEM = 8 * 1024 * 1024;
/** Strict JSON scanner for legacy books. Values are addressed by byte spans, not collected. */
export async function scanBookLegacyJSON(source, { onValue, hash, signal } = {}) {
  const size = source?.size;
  if (!Number.isSafeInteger(size) || size < 1 || !onValue || !hash) bad();
  const hasher = hash.create(),
    decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let buffer = new Uint8Array(),
    position = 0,
    offset = 0;
  const check = () => {
    signal?.throwIfAborted();
    if (source.size !== size) bad();
  };
  async function peek() {
    check();
    if (position === buffer.length) {
      if (offset === size) return -1;
      const length = Math.min(CHUNK, size - offset);
      const bytes = await source.read(offset, length);
      check();
      if (!(bytes instanceof Uint8Array) || bytes.length !== length) bad();
      buffer = bytes;
      position = 0;
      try {
        decoder.decode(bytes, { stream: true });
      } catch {
        bad();
      }
      hasher.update(bytes);
    }
    return buffer[position];
  }
  async function take() {
    const value = await peek();
    if (value < 0) bad();
    position++;
    offset++;
    return value;
  }
  async function expect(value) {
    if ((await take()) !== value) bad();
  }
  async function whitespace() {
    for (;;) {
      if ((await peek()) < 0) return;
      while (position < buffer.length) {
        if (![32, 9, 10, 13].includes(buffer[position])) return;
        position++;
        offset++;
      }
    }
  }
  const digit = (c) => c >= 48 && c <= 57,
    hex = (c) => digit(c) || (c >= 65 && c <= 70) || (c >= 97 && c <= 102);
  async function string(key = false) {
    const bytes = key ? [34] : null;
    await expect(34);
    if (!key) {
      for (;;) {
        if ((await peek()) < 0) bad();
        while (position < buffer.length) {
          const c = buffer[position++];
          offset++;
          if (c === 34) return undefined;
          if (c < 32) bad();
          if (c === 92) {
            const escaped = await take();
            if (escaped === 117) {
              for (let i = 0; i < 4; i++) if (!hex(await take())) bad();
            } else if (![34, 92, 47, 98, 102, 110, 114, 116].includes(escaped)) bad();
          }
        }
      }
    }
    for (;;) {
      const c = await take();
      if (bytes) {
        bytes.push(c);
        if (bytes.length > 258) bad();
      }
      if (c === 34) break;
      if (c < 32) bad();
      if (c === 92) {
        const escaped = await take();
        bytes?.push(escaped);
        if (escaped === 117) {
          for (let i = 0; i < 4; i++) {
            const c = await take();
            if (!hex(c)) bad();
            bytes?.push(c);
          }
        } else if (![34, 92, 47, 98, 102, 110, 114, 116].includes(escaped)) bad();
      }
    }
    if (!bytes) return undefined;
    try {
      return JSON.parse(
        new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(new Uint8Array(bytes)),
      );
    } catch {
      return bad();
    }
  }
  async function number() {
    if ((await peek()) === 45) await take();
    const c = await take();
    if (!digit(c)) bad();
    if (c !== 48) while (digit(await peek())) await take();
    if ((await peek()) === 46) {
      await take();
      if (!digit(await peek())) bad();
      while (digit(await peek())) await take();
    }
    if ([69, 101].includes(await peek())) {
      await take();
      if ([43, 45].includes(await peek())) await take();
      if (!digit(await peek())) bad();
      while (digit(await peek())) await take();
    }
  }
  async function value(path, depth = 0) {
    if (depth > 24) bad();
    await whitespace();
    const start = offset,
      c = await peek();
    let type;
    if (c === 123) {
      type = 'object';
      await take();
      await whitespace();
      const keys = new Set();
      if ((await peek()) !== 125)
        for (;;) {
          if ((await peek()) !== 34) bad();
          const key = await string(true);
          if (key === '__proto__' || keys.has(key) || keys.size >= 64) bad();
          keys.add(key);
          await whitespace();
          await expect(58);
          await value([...path, key], depth + 1);
          await whitespace();
          if ((await peek()) === 125) break;
          await expect(44);
          await whitespace();
        }
      await expect(125);
    } else if (c === 91) {
      type = 'array';
      await take();
      await whitespace();
      let index = 0;
      if ((await peek()) !== 93)
        for (;;) {
          await value([...path, index++], depth + 1);
          if (!Number.isSafeInteger(index)) bad();
          await whitespace();
          if ((await peek()) === 93) break;
          await expect(44);
          await whitespace();
        }
      await expect(93);
    } else if (c === 34) {
      type = 'string';
      await string();
    } else if (c === 45 || digit(c)) {
      type = 'number';
      await number();
    } else {
      const literal = c === 116 ? 'true' : c === 102 ? 'false' : c === 110 ? 'null' : null;
      if (!literal) bad();
      type = literal === 'null' ? 'null' : 'boolean';
      for (const c of literal) await expect(c.charCodeAt(0));
    }
    check();
    await onValue({ path, start, end: offset, type });
    check();
  }
  try {
    if ((await peek()) === 239) {
      await expect(239);
      await expect(187);
      await expect(191);
    }
    await value([]);
    await whitespace();
    if ((await peek()) !== -1) bad();
    try {
      decoder.decode();
    } catch {
      bad();
    }
    check();
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
