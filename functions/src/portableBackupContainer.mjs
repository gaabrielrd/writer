// Pure framing/integrity contract. Domain validation and authorization are separate.
export const PORTABLE_BACKUP_LIMITS = Object.freeze({
  maxMetadataBytes: 16 * 1024,
  maxPayloadBytes: 256 * 1024,
  maxRecords: 0xffffffff,
});
const VERSION = 1;
const HEADER_BYTES = 16;
const PREFIX_BYTES = 12;
const DIGEST_BYTES = 32;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

/** Internal pure factory; domains provide fixed signatures and distinct errors. */
export function createPortableBackupContainer(magic, FormatError) {
  if (
    typeof magic !== 'string' ||
    !/^[A-Z-]+\n$/.test(magic) ||
    encoder.encode(magic).length !== 12 ||
    typeof FormatError !== 'function'
  )
    throw new TypeError('Invalid container configuration.');
  const MAGIC = magic;

  function fail(code, message) {
    throw new FormatError(code, message);
  }
  function isBytes(value) {
    return (
      ArrayBuffer.isView(value) && Object.prototype.toString.call(value) === '[object Uint8Array]'
    );
  }
  function uint32(value) {
    return Number.isInteger(value) && value >= 0 && value <= 0xffffffff;
  }
  function safeSum(left, right) {
    const total = left + right;
    if (!Number.isSafeInteger(total)) fail('limit-exceeded', 'Byte count exceeds safe range.');
    return total;
  }
  function equal(left, right) {
    return left.length === right.length && left.every((byte, index) => byte === right[index]);
  }
  function hex(bytes) {
    return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
  }
  function concat(parts) {
    const bytes = new Uint8Array(parts.reduce((total, part) => total + part.length, 0));
    let offset = 0;
    for (const part of parts) {
      bytes.set(part, offset);
      offset += part.length;
    }
    return bytes;
  }
  async function digest(bytes, signal) {
    signal?.throwIfAborted();
    const hash = new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256', bytes));
    signal?.throwIfAborted();
    return hash;
  }
  function header() {
    const bytes = new Uint8Array(HEADER_BYTES);
    bytes.set(encoder.encode(MAGIC));
    new DataView(bytes.buffer).setUint32(12, VERSION);
    return bytes;
  }
  function recordMetadata(value) {
    if (!value || typeof value !== 'object') fail('invalid-record', 'Invalid record identity.');
    const { kind, id, part } = value;
    if (
      typeof kind !== 'string' ||
      !/^[a-z][a-z0-9-]{0,47}$/.test(kind) ||
      typeof id !== 'string' ||
      id.length === 0 ||
      id.length > 1500 ||
      id === '.' ||
      id === '..' ||
      id.includes('/') ||
      id.includes('\\') ||
      [...id].some((char) => char.charCodeAt(0) < 32 || char.charCodeAt(0) === 127) ||
      !uint32(part)
    )
      fail('invalid-record', 'Invalid record identity.');
    const idBytes = encoder.encode(id);
    if (idBytes.length > 1500 || decoder.decode(idBytes) !== id) {
      fail('invalid-record', 'Invalid UTF-8 record identity.');
    }
    return { type: 'record', kind, id, part };
  }
  function canonicalMetadata(bytes) {
    let value;
    try {
      value = JSON.parse(decoder.decode(bytes));
    } catch {
      fail('invalid-format', 'Metadata is not valid UTF-8 JSON.');
    }
    let canonical;
    if (value?.type === 'record') {
      canonical = recordMetadata(value);
    } else if (
      value?.type === 'end' &&
      uint32(value.records) &&
      Number.isSafeInteger(value.payloadBytes) &&
      value.payloadBytes >= 0 &&
      typeof value.chain === 'string' &&
      /^[a-f0-9]{64}$/.test(value.chain)
    ) {
      canonical = {
        type: 'end',
        records: value.records,
        payloadBytes: value.payloadBytes,
        chain: value.chain,
      };
    } else {
      fail('invalid-format', 'Unknown or invalid frame metadata.');
    }
    if (!equal(bytes, encoder.encode(JSON.stringify(canonical)))) {
      fail('invalid-format', 'Metadata must use the canonical representation.');
    }
    return canonical;
  }
  async function frame(sequence, metadata, payload, previous, signal) {
    const metadataBytes = encoder.encode(JSON.stringify(metadata));
    if (metadataBytes.length > PORTABLE_BACKUP_LIMITS.maxMetadataBytes) {
      fail('limit-exceeded', 'Metadata is too large.');
    }
    const prefix = new Uint8Array(PREFIX_BYTES);
    const view = new DataView(prefix.buffer);
    view.setUint32(0, sequence);
    view.setUint32(4, metadataBytes.length);
    view.setUint32(8, payload.length);
    const body = concat([prefix, metadataBytes, payload]);
    const hash = await digest(concat([previous, body]), signal);
    return { bytes: concat([body, hash]), hash };
  }

  /** Pull one bounded frame at a time. Consumers must not accumulate the full stream. */
  async function* encodeBackup(records, { signal } = {}) {
    signal?.throwIfAborted();
    const fileHeader = header();
    let previous = await digest(fileHeader, signal);
    yield fileHeader;
    let count = 0;
    let payloadBytes = 0;
    const iterator = records[Symbol.asyncIterator]?.() ?? records[Symbol.iterator]();
    let finished = false;
    try {
      while (true) {
        signal?.throwIfAborted();
        const next = await iterator.next();
        signal?.throwIfAborted();
        if (next.done) {
          finished = true;
          break;
        }
        const record = next.value;
        if (count === PORTABLE_BACKUP_LIMITS.maxRecords) {
          fail('limit-exceeded', 'Too many records.');
        }
        const metadata = recordMetadata(record);
        const inputPayload = record.payload;
        if (!isBytes(inputPayload)) fail('invalid-record', 'Payload must be bytes.');
        if (inputPayload.length > PORTABLE_BACKUP_LIMITS.maxPayloadBytes) {
          fail('limit-exceeded', 'Split payload into bounded records.');
        }
        // Copy before the first await: the caller may reuse/mutate its source buffer.
        const payload = new Uint8Array(inputPayload);
        payloadBytes = safeSum(payloadBytes, payload.length);
        const output = await frame(count, metadata, payload, previous, signal);
        previous = output.hash;
        count += 1;
        signal?.throwIfAborted();
        yield output.bytes;
      }
    } finally {
      if (!finished) await iterator.return?.();
    }
    signal?.throwIfAborted();
    const output = await frame(
      count,
      {
        type: 'end',
        records: count,
        payloadBytes,
        chain: hex(previous),
      },
      new Uint8Array(),
      previous,
      signal,
    );
    signal?.throwIfAborted();
    yield output.bytes;
    return {
      records: count,
      payloadBytes,
      chainHash: hex(output.hash),
    };
  }

  function cursorValues(cursor, size) {
    const keys = ['schemaVersion', 'size', 'offset', 'records', 'payloadBytes', 'previous', 'done'];
    if (
      !cursor ||
      typeof cursor !== 'object' ||
      Array.isArray(cursor) ||
      Object.keys(cursor).length !== keys.length ||
      keys.some((k) => !Object.hasOwn(cursor, k)) ||
      cursor.schemaVersion !== 1 ||
      cursor.size !== size ||
      !Number.isSafeInteger(cursor.offset) ||
      cursor.offset < HEADER_BYTES ||
      cursor.offset > size ||
      !uint32(cursor.records) ||
      !Number.isSafeInteger(cursor.payloadBytes) ||
      cursor.payloadBytes < 0 ||
      typeof cursor.previous !== 'string' ||
      !/^[a-f0-9]{64}$/.test(cursor.previous) ||
      cursor.done !== false
    )
      fail('invalid-format', 'Invalid archive cursor.');
    return {
      offset: cursor.offset,
      count: cursor.records,
      payloadBytes: cursor.payloadBytes,
      previous: Uint8Array.from(cursor.previous.match(/../g), (v) => parseInt(v, 16)),
    };
  }
  /** Host-trusted cursor; it is not a file signature or authorization proof. */
  async function readBackupFrame(source, cursor = null, { signal } = {}) {
    signal?.throwIfAborted();
    if (
      !source ||
      !Number.isSafeInteger(source.size) ||
      source.size < HEADER_BYTES ||
      typeof source.read !== 'function'
    )
      fail('invalid-format', 'Invalid archive source.');
    const size = source.size,
      read = source.read.bind(source);
    let offset = 0,
      count = 0,
      payloadBytes = 0,
      previous;
    if (cursor !== null) {
      const saved = cursorValues(cursor, size);
      offset = saved.offset;
      count = saved.count;
      payloadBytes = saved.payloadBytes;
      previous = saved.previous;
    }
    async function take(length) {
      signal?.throwIfAborted();
      const next = safeSum(offset, length);
      if (next > size) fail('incomplete-archive', 'Archive is truncated.');
      const result = await read(offset, length);
      signal?.throwIfAborted();
      if (source.size !== size || !isBytes(result) || result.length !== length)
        fail('incomplete-archive', 'Archive read did not return the requested bytes.');
      offset = next;
      return new Uint8Array(result);
    }
    if (cursor === null) {
      const fileHeader = await take(HEADER_BYTES);
      if (!equal(fileHeader.subarray(0, 12), encoder.encode(MAGIC)))
        fail('invalid-format', 'Unknown archive signature.');
      if (new DataView(fileHeader.buffer).getUint32(12) !== VERSION)
        fail('unsupported-version', 'Unknown archive version.');
      previous = await digest(fileHeader, signal);
    }
    if (offset >= size) fail('incomplete-archive', 'Archive has no final seal.');
    const output = (done, hash) => ({
      schemaVersion: 1,
      size,
      offset,
      records: count,
      payloadBytes,
      previous: hex(hash),
      done,
    });
    const prefix = await take(PREFIX_BYTES);
    const view = new DataView(prefix.buffer);
    const sequence = view.getUint32(0);
    const metadataLength = view.getUint32(4);
    const payloadLength = view.getUint32(8);
    if (sequence !== count) fail('invalid-format', 'Frame sequence is out of order.');
    if (
      metadataLength === 0 ||
      metadataLength > PORTABLE_BACKUP_LIMITS.maxMetadataBytes ||
      payloadLength > PORTABLE_BACKUP_LIMITS.maxPayloadBytes
    )
      fail('limit-exceeded', 'Frame length is out of bounds.');
    const payloadOffset = offset + metadataLength;
    const body = await take(metadataLength + payloadLength);
    const trailer = await take(DIGEST_BYTES);
    const hash = await digest(concat([previous, prefix, body]), signal);
    if (!equal(hash, trailer)) fail('integrity-mismatch', 'Frame digest does not match.');
    const metadata = canonicalMetadata(body.subarray(0, metadataLength));
    if (metadata.type === 'end') {
      if (
        payloadLength !== 0 ||
        metadata.records !== count ||
        metadata.payloadBytes !== payloadBytes ||
        metadata.chain !== hex(previous)
      )
        fail('invalid-format', 'Archive seal does not match the records.');
      if (offset !== size) fail('invalid-format', 'Unexpected bytes after the seal.');
      signal?.throwIfAborted();
      return {
        cursor: output(true, hash),
        seal: { records: count, payloadBytes, archiveBytes: size, chainHash: hex(hash) },
      };
    }

    if (count === PORTABLE_BACKUP_LIMITS.maxRecords) fail('limit-exceeded', 'Too many records.');
    payloadBytes = safeSum(payloadBytes, payloadLength);
    count++;
    signal?.throwIfAborted();
    return {
      cursor: output(false, hash),
      record: {
        kind: metadata.kind,
        id: metadata.id,
        part: metadata.part,
        payload: body.slice(metadataLength),
      },
      span: { offset: payloadOffset, length: payloadLength },
    };
  }
  /** Records remain provisional until the shared cursor decoder verifies seal/EOF. */
  async function* decodeBackup(source, options = {}) {
    let cursor = null;
    for (;;) {
      const step = await readBackupFrame(source, cursor, options);
      cursor = step.cursor;
      if (step.seal) return step.seal;
      yield step.record;
    }
  }

  /** Fixed 64 KiB item layout. Cursor/index must come from a validated, authenticated host. */
  async function readBackupIndexedPart(source, start, item, index, { signal } = {}) {
    signal?.throwIfAborted();
    if (
      !source ||
      !Number.isSafeInteger(source.size) ||
      source.size < HEADER_BYTES ||
      typeof source.read !== 'function'
    )
      fail('invalid-format', 'Invalid archive source.');
    const size = source.size,
      anchor = cursorValues(start, size),
      record = recordMetadata(item?.record),
      byteLength = item?.byteLength,
      chunkCount = item?.chunkCount;
    if (
      record.part !== 0 ||
      !Number.isSafeInteger(byteLength) ||
      byteLength < 1 ||
      !uint32(chunkCount) ||
      chunkCount !== Math.ceil(byteLength / 65536) ||
      !uint32(index) ||
      index >= chunkCount ||
      chunkCount > PORTABLE_BACKUP_LIMITS.maxRecords - anchor.count
    )
      fail('invalid-record', 'Invalid indexed item.');
    const metadataBytes = encoder.encode(JSON.stringify(record)).length;
    let digits = 0;
    for (let lower = 0, upper = 10, width = 1; lower < index; lower = upper, upper *= 10, width++)
      digits = safeSum(digits, (Math.min(index, upper) - lower) * width);
    const offset = safeSum(
        anchor.offset,
        index * (PREFIX_BYTES + DIGEST_BYTES + metadataBytes - 1 + 65536) + digits,
      ),
      payloadBytes = safeSum(anchor.payloadBytes, index * 65536),
      payloadLength = Math.min(65536, byteLength - index * 65536);
    if (
      offset +
        PREFIX_BYTES +
        DIGEST_BYTES +
        metadataBytes +
        String(index).length -
        1 +
        payloadLength >
      size
    )
      fail('incomplete-archive', 'Indexed item exceeds archive.');
    let previous = hex(anchor.previous);
    if (index > 0) {
      const bytes = await source.read(offset - DIGEST_BYTES, DIGEST_BYTES);
      signal?.throwIfAborted();
      if (source.size !== size || !isBytes(bytes) || bytes.length !== DIGEST_BYTES)
        fail('incomplete-archive', 'Archive read did not return the requested bytes.');
      previous = hex(bytes);
    }
    const step = await readBackupFrame(
      source,
      {
        schemaVersion: 1,
        size,
        offset,
        records: anchor.count + index,
        payloadBytes,
        previous,
        done: false,
      },
      { signal },
    );
    if (
      !step.record ||
      step.record.kind !== record.kind ||
      step.record.id !== record.id ||
      step.record.part !== index ||
      step.record.payload.length !== payloadLength
    )
      fail('invalid-record', 'Indexed part does not match its item.');
    return { bytes: step.record.payload, cursor: step.cursor };
  }

  return Object.freeze({ encodeBackup, readBackupFrame, decodeBackup, readBackupIndexedPart });
}
