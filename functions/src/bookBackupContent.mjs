import { readBookBackupPackage } from './bookBackupPackage.mjs';
import {
  createBookContentState,
  createBookContentMachine,
  BOOK_CONTENT_ITEM_BYTES,
  BOOK_CONTENT_STEP_ITEMS,
} from './bookContentMachine.mjs';
import { bookContentInvalid as bad } from './bookBackupSchema.mjs';
/** Content validation is not authorization. The caller owns the temporary, trusted index. */
export function validateBookBackupContent(source, options = {}) {
  return validateRecordContent(
    readBookBackupPackage(source, { signal: options.signal }),
    options,
    false,
  );
}
export async function validateBookLegacyRecordContent(stream, options) {
  const report = await validateRecordContent(stream, options, true);
  if (
    report.envelope?.format !== 'writer-book-backup' ||
    ![1, 2, 3, 4, 5, 6].includes(report.envelope.version)
  )
    bad();
  return {
    validation: 'legacy-content-only',
    source: report.envelope,
    totals: report.totals,
    warnings: report.warnings,
  };
}

async function validateRecordContent(stream, { index, hash, signal } = {}, legacy) {
  if (!index || !hash) bad();
  const check = () => signal?.throwIfAborted();
  let complete = false,
    current,
    envelope,
    bookId;
  async function next() {
    check();
    const result = await stream.next();
    check();
    if (result.done) {
      envelope = result.value;
      return null;
    }
    if (result.value.type !== 'record') bad();
    return result.value.record;
  }
  async function json() {
    const first = current,
      parts = [];
    let length = 0,
      part = 0,
      previous;
    do {
      if (
        current.part !== part++ ||
        current.payload.length === 0 ||
        (previous !== undefined && previous !== 65536)
      )
        bad();
      length += current.payload.length;
      if (length > BOOK_CONTENT_ITEM_BYTES) bad();
      parts.push(current.payload);
      previous = current.payload.length;
      current = await next();
    } while (current && current.kind === first.kind && current.id === first.id);
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const payload of parts) {
      bytes.set(payload, offset);
      offset += payload.length;
    }
    let text, value;
    try {
      text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
      value = JSON.parse(text);
    } catch {
      bad();
    }
    if (JSON.stringify(value) !== text) bad();
    return { record: first, value };
  }
  async function raw(kind, id, manifest, binary = false) {
    const hasher = hash.create(),
      decoder = binary ? null : new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
    let bytes = 0;
    try {
      for (let part = 0; part < manifest.chunkCount; part++) {
        check();
        if (!current || current.kind !== kind || current.id !== id || current.part !== part) bad();
        const payload = current.payload;
        if (
          !binary &&
          (manifest.byteLength === 0
            ? manifest.chunkCount !== 1 || payload.length !== 0
            : payload.length === 0 || (part < manifest.chunkCount - 1 && payload.length < 65533))
        )
          bad();
        if (
          binary &&
          (payload.length !== Math.min(65536, manifest.byteLength - part * 65536) ||
            (part === 0 &&
              Array.from(payload.subarray(0, 8), (v) => v.toString(16).padStart(2, '0')).join(
                '',
              ) !== '89504e470d0a1a0a'))
        )
          bad();
        bytes += payload.length;
        if (bytes > manifest.byteLength) bad();
        hasher.update(payload);
        try {
          decoder?.decode(payload);
        } catch {
          bad();
        }
        current = await next();
      }
      try {
        decoder?.decode();
      } catch {
        bad();
      }
      const contentHash = hasher.digest();
      if (bytes !== manifest.byteLength || contentHash !== manifest.contentHash) bad();
      return { byteLength: bytes, chunkCount: manifest.chunkCount, contentHash };
    } finally {
      hasher.destroy();
    }
  }

  try {
    check();
    const first = await stream.next();
    check();
    if (first.done || first.value.type !== 'manifest') bad();
    bookId = first.value.manifest.bookId;
    const machine = createBookContentMachine(createBookContentState(bookId, legacy), {
      index,
      hash,
      signal,
    });
    current = await next();
    while (current) {
      const { record, value } = await json();
      await machine.acceptJSON({ kind: record.kind, id: record.id, part: record.part }, value);
      while (machine.checkpoint().relations)
        await machine.advanceRelations(
          { kind: record.kind, id: record.id, part: record.part },
          value,
          BOOK_CONTENT_STEP_ITEMS,
        );
      const pending = machine.checkpoint().raw;
      if (pending)
        await machine.acceptRawProof(await raw(pending.kind, pending.id, pending, pending.binary));
    }
    if (!envelope || (legacy ? envelope.bookId : envelope.manifest?.bookId) !== bookId) bad();
    await machine.beginFinish();
    while (machine.checkpoint().phase !== 'done')
      await machine.advanceFinish(BOOK_CONTENT_STEP_ITEMS);
    check();
    const { totals, warnings } = machine.result();
    complete = true;
    return { validation: 'content-only', version: 1, envelope, totals, warnings };
  } finally {
    if (!complete) await stream.return(undefined);
  }
}
