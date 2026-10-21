// Pure framing/integrity contract. Domain validation and authorization are separate.
export const BOOK_BACKUP_LIMITS = Object.freeze({
  maxMetadataBytes: 16 * 1024,
  maxPayloadBytes: 256 * 1024,
  maxRecords: 0xffffffff,
});
const MAGIC = 'WRITER-BOOK\n';
const VERSION = 1;
const HEADER_BYTES = 16;
const PREFIX_BYTES = 12;
const DIGEST_BYTES = 32;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });

export class BookBackupFormatError extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'BookBackupFormatError';
    this.code = code;
  }
}

function fail(code, message) {
  throw new BookBackupFormatError(code, message);
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
  if (metadataBytes.length > BOOK_BACKUP_LIMITS.maxMetadataBytes) {
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
export async function* encodeBookBackup(records, { signal } = {}) {
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
      if (count === BOOK_BACKUP_LIMITS.maxRecords) {
        fail('limit-exceeded', 'Too many records.');
      }
      const metadata = recordMetadata(record);
      const inputPayload = record.payload;
      if (!isBytes(inputPayload)) fail('invalid-record', 'Payload must be bytes.');
      if (inputPayload.length > BOOK_BACKUP_LIMITS.maxPayloadBytes) {
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

/** Records are provisional until the consumer reaches the verified end/EOF. */
export async function* decodeBookBackup(source, { signal } = {}) {
  signal?.throwIfAborted();
  if (
    !source ||
    !Number.isSafeInteger(source.size) ||
    source.size < HEADER_BYTES ||
    typeof source.read !== 'function'
  )
    fail('invalid-format', 'Invalid archive source.');
  const size = source.size;
  const read = source.read.bind(source);
  let offset = 0;
  async function take(length) {
    signal?.throwIfAborted();
    const next = safeSum(offset, length);
    if (next > size) fail('incomplete-archive', 'Archive is truncated.');
    const result = await read(offset, length);
    signal?.throwIfAborted();
    if (!isBytes(result) || result.length !== length) {
      fail('incomplete-archive', 'Archive read did not return the requested bytes.');
    }
    offset = next;
    return new Uint8Array(result);
  }
  const fileHeader = await take(HEADER_BYTES);
  if (!equal(fileHeader.subarray(0, 12), encoder.encode(MAGIC))) {
    fail('invalid-format', 'Unknown archive signature.');
  }
  if (new DataView(fileHeader.buffer).getUint32(12) !== VERSION) {
    fail('unsupported-version', 'Unknown archive version.');
  }
  let previous = await digest(fileHeader, signal);
  let count = 0;
  let payloadBytes = 0;
  while (offset < size) {
    const prefix = await take(PREFIX_BYTES);
    const view = new DataView(prefix.buffer);
    const sequence = view.getUint32(0);
    const metadataLength = view.getUint32(4);
    const payloadLength = view.getUint32(8);
    if (sequence !== count) fail('invalid-format', 'Frame sequence is out of order.');
    if (
      metadataLength === 0 ||
      metadataLength > BOOK_BACKUP_LIMITS.maxMetadataBytes ||
      payloadLength > BOOK_BACKUP_LIMITS.maxPayloadBytes
    )
      fail('limit-exceeded', 'Frame length is out of bounds.');
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
      return { records: count, payloadBytes, archiveBytes: size, chainHash: hex(hash) };
    }
    if (count === BOOK_BACKUP_LIMITS.maxRecords) {
      fail('limit-exceeded', 'Too many records.');
    }
    payloadBytes = safeSum(payloadBytes, payloadLength);
    previous = hash;
    count += 1;
    signal?.throwIfAborted();
    yield {
      kind: metadata.kind,
      id: metadata.id,
      part: metadata.part,
      payload: body.slice(metadataLength),
    };
  }
  fail('incomplete-archive', 'Archive has no final seal.');
}
