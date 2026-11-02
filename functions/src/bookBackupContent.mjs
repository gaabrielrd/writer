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
    return { record: first, value: decodeBookContentJSON(bytes) };
  }
  async function raw(kind, id, manifest, binary = false) {
    const hasher = hash.create();
    let bytes = 0;
    try {
      for (let part = 0; part < manifest.chunkCount; part++) {
        check();
        const payload = validateBookContentRawPart(
          { kind, id, ...manifest, binary },
          current,
          part,
        );
        bytes += payload.length;
        if (bytes > manifest.byteLength) bad();
        hasher.update(payload);
        current = await next();
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
      if (current.kind === 'book-lore') {
        const first = current;
        await machine.beginLore({ kind: first.kind, id: first.id, part: first.part });
        let part = 0,
          previous;
        do {
          if (
            current.part !== part++ ||
            current.payload.length === 0 ||
            current.payload.length > 65536 ||
            (previous !== undefined && previous !== 65536)
          )
            bad();
          for (let at = 0; at < current.payload.length;) {
            const result = await machine.advanceLore(
              current.payload.subarray(at),
              BOOK_CONTENT_STEP_ITEMS,
            );
            at += result.consumed;
          }
          previous = current.payload.length;
          current = await next();
        } while (current && current.kind === first.kind && current.id === first.id);
        await machine.finishLore();
        continue;
      }
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

/** Shared canonical item decoder; semantic DTO checks remain in the machine. */
export function decodeBookContentJSON(bytes) {
  if (
    !(bytes instanceof Uint8Array) ||
    bytes.length === 0 ||
    bytes.length > BOOK_CONTENT_ITEM_BYTES
  )
    bad();
  let text, value;
  try {
    text = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes);
    value = JSON.parse(text);
  } catch {
    bad();
  }
  if (JSON.stringify(value) !== text) bad();
  return value;
}
/** Each raw part is UTF-8 complete (or one PNG segment), including literal BOMs. */
export function validateBookContentRawPart(manifest, record, part) {
  const { kind, id, byteLength, chunkCount, binary } = manifest;
  if (!record || record.kind !== kind || record.id !== id || record.part !== part) bad();
  const payload = record.payload;
  if (!(payload instanceof Uint8Array)) bad();
  if (
    !binary &&
    (byteLength === 0
      ? chunkCount !== 1 || payload.length !== 0
      : payload.length === 0 || (part < chunkCount - 1 && payload.length < 65533))
  )
    bad();
  if (
    binary &&
    (payload.length !== Math.min(65536, byteLength - part * 65536) ||
      (part === 0 &&
        Array.from(payload.subarray(0, 8), (v) => v.toString(16).padStart(2, '0')).join('') !==
          '89504e470d0a1a0a'))
  )
    bad();
  if (!binary) {
    try {
      new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(payload);
    } catch {
      bad();
    }
  }
  return payload;
}
