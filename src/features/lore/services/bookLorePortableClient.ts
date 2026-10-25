import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  createBookLoreBaseIndex,
  advanceBookLoreBaseIndex,
  finishBookLoreBaseIndex,
  type BookLoreBaseField,
} from '../../../../functions/src/bookLoreBaseIndex.mjs';
import {
  createBookPortableLoreIndex,
  advanceBookPortableLoreIndex,
  finishBookPortableLoreIndex,
  type BookPortableLoreMetadata,
} from '../../../../functions/src/bookPortableLoreIndex.mjs';
import {
  createBookLoreFieldValidation,
  advanceBookLoreFieldValidation,
  finishBookLoreFieldValidation,
} from '../../../../functions/src/bookLoreFieldValidation.mjs';
import { createBookLoreUnitReader } from './bookLoreReadUnits';
import {
  invalidLoreRead,
  readId,
  readHeader,
  readHash,
  readCount,
  readObject,
  loreReadFields,
  type LoreReadCall,
  type LoreReadGuard,
  type LoreReadHeader,
  type LoreReadField,
  type LoreReadManifest,
} from './bookLoreReadContracts';
export interface BookLorePortableProof {
  readonly schemaVersion: 1;
  readonly source: LoreReadHeader;
  readonly byteLength: number;
  readonly chunkCount: number;
  readonly contentHash: string;
  readonly dataOffset: number;
  readonly dataByteLength: number;
  readonly dataHash: string;
  readonly index: BookPortableLoreMetadata;
}
export type BookLorePortableWrite = (part: number, payload: Uint8Array) => Promise<void>;
const encoder = new TextEncoder(),
  equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);
function freeze<T>(value: T): T {
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function generationField(key: BookLoreBaseField): key is LoreReadField {
  return loreReadFields.includes(key as LoreReadField);
}
export function createBookLorePortableClient(call: LoreReadCall, guard: LoreReadGuard) {
  const rpc: LoreReadCall = async (method, input) => {
    guard();
    const result = await call(method, input);
    guard();
    return result;
  };
  async function header(bookId: string, id: string, readToken?: string) {
    return readHeader(
      await rpc('getBookLoreRead', {
        bookId,
        id,
        ...(readToken === undefined ? { tokenVersion: 1 } : { readToken }),
      }),
      bookId,
      id,
      readToken,
    );
  }
  async function verifyPortable(proof: BookLorePortableProof, signal?: AbortSignal) {
    guard();
    signal?.throwIfAborted();
    const p = readObject(proof, [
        'schemaVersion',
        'source',
        'byteLength',
        'chunkCount',
        'contentHash',
        'dataOffset',
        'dataByteLength',
        'dataHash',
        'index',
      ]),
      origin = readObject(
        p.source,
        [],
        [
          'schemaVersion',
          'bookId',
          'id',
          'readToken',
          'mode',
          'base',
          'relations',
          'fields',
          'dates',
        ],
      ),
      bookId = readId(origin.bookId),
      id = readId(origin.id),
      token = readHash(origin.readToken),
      saved = readHeader(p.source, bookId, id, token);
    if (
      p.schemaVersion !== 1 ||
      readCount(p.byteLength) < 1 ||
      readCount(p.chunkCount) !== Math.ceil(Number(p.byteLength) / 65536) ||
      readCount(p.dataOffset) >= Number(p.byteLength) ||
      readCount(p.dataByteLength) < 2 ||
      Number(p.dataOffset) + Number(p.dataByteLength) + 1 !== p.byteLength
    )
      throw invalidLoreRead();
    readHash(p.contentHash);
    readHash(p.dataHash);
    const current = await header(bookId, id, token);
    signal?.throwIfAborted();
    guard();
    if (!equal(current, saved)) throw invalidLoreRead();
  }
  async function writePortable(
    bookId: string,
    id: string,
    write: BookLorePortableWrite,
    signal?: AbortSignal,
  ): Promise<BookLorePortableProof> {
    readId(bookId);
    readId(id);
    const check = () => {
      guard();
      signal?.throwIfAborted();
    };
    check();
    // v1 pins the complete local collection clock, independently of the host's editor-token mode.
    const view = await header(bookId, id);
    check();
    const outputHash = sha256.create(),
      dataHash = sha256.create();
    let dataState = createBookPortableLoreIndex(),
      byteLength = 0,
      part = 0,
      used = 0;
    const buffer = new Uint8Array(65536);
    async function flush() {
      if (!used) return;
      if (part > 0xffffffff) throw invalidLoreRead();
      check();
      await write(part++, buffer.slice(0, used));
      check();
      used = 0;
    }
    async function emit(bytes: Uint8Array) {
      check();
      byteLength += bytes.length;
      if (!Number.isSafeInteger(byteLength)) throw invalidLoreRead();
      outputHash.update(bytes);
      for (let at = 0; at < bytes.length;) {
        const size = Math.min(buffer.length - used, bytes.length - at);
        buffer.set(bytes.subarray(at, at + size), used);
        used += size;
        at += size;
        if (used === buffer.length) await flush();
      }
    }
    async function data(bytes: Uint8Array) {
      check();
      dataState = advanceBookPortableLoreIndex(dataState, bytes).state;
      dataHash.update(bytes);
      await emit(bytes);
    }
    async function* body(
      kind: 'base' | 'field' | 'relations',
      page: number,
      field?: LoreReadField,
    ) {
      const unit = createBookLoreUnitReader(rpc, check, view, kind, page, field),
        hasher = sha256.create();
      let manifest: LoreReadManifest | undefined,
        length = 0;
      try {
        for (let index = 0; !manifest || index < manifest.chunkCount; index++) {
          check();
          const current = await unit(index);
          check();
          manifest = current.manifest;
          hasher.update(current.bytes);
          length += current.bytes.length;
          yield { ...current, offset: index * 65536 };
          check();
        }
        if (
          !manifest ||
          length !== manifest.byteLength ||
          bytesToHex(hasher.digest()) !== manifest.contentHash
        )
          throw invalidLoreRead();
      } finally {
        hasher.destroy();
      }
    }
    let members = 0;
    const key = async (name: string) =>
      data(encoder.encode((members++ ? ',' : '') + JSON.stringify(name) + ':'));
    try {
      const prefix = encoder.encode(
        JSON.stringify({ schemaVersion: 1, kind: 'lore', parentId: null, id }).slice(0, -1) +
          ',"data":',
      );
      await emit(prefix);
      if (view.mode === 'inline') {
        for await (const unit of body('base', 0)) await data(unit.bytes);
      } else {
        await data(encoder.encode('{'));
        let base = null;
        if (view.base) {
          let state = createBookLoreBaseIndex(bookId);
          const started = new Set<LoreReadField>();
          for await (const unit of body('base', 0)) {
            const pieces: { field: LoreReadField; bytes: Uint8Array; first: boolean }[] = [];
            state = advanceBookLoreBaseIndex(state, unit.bytes, undefined, (field, bytes) => {
              if (
                !generationField(field) ||
                (view.schemaVersion === 2 && Object.hasOwn(view.fields, field))
              )
                return;
              const first = !started.has(field);
              started.add(field);
              pieces.push({ field, bytes, first });
            });
            for (const piece of pieces) {
              if (piece.first) await key(piece.field);
              await data(piece.bytes);
            }
          }
          base = finishBookLoreBaseIndex(state);
        }
        if (view.schemaVersion === 2) {
          for (const field of loreReadFields) {
            if (!Object.hasOwn(view.fields, field) || view.fields[field] === null) continue;
            await key(field);
            let validation = createBookLoreFieldValidation({ field });
            for await (const unit of body('field', 0, field)) {
              validation = advanceBookLoreFieldValidation(validation, unit.bytes);
              await data(unit.bytes);
            }
            finishBookLoreFieldValidation(validation);
          }
        }
        const dates = view.schemaVersion === 2 ? view.dates : base?.dates;
        for (const name of ['createdAt', 'updatedAt'] as const) {
          if (!dates || !Object.hasOwn(dates, name)) continue;
          await key(name);
          await data(encoder.encode(JSON.stringify(dates[name])));
        }
        const rel = view.relations!;
        if (rel.present) {
          await key('relations');
          await data(encoder.encode('['));
          for (let page = 0; page < rel.pages; page++) {
            if (page) await data(encoder.encode(','));
            let validation = createBookLoreFieldValidation({
              field: 'relations',
              count: Math.min(64, rel.count - page * 64),
            });
            for await (const unit of body('relations', page)) {
              validation = advanceBookLoreFieldValidation(validation, unit.bytes);
              const start = unit.offset === 0 ? 1 : 0,
                end = Math.min(unit.bytes.length, unit.manifest.byteLength - 1 - unit.offset);
              if (end > start) await data(unit.bytes.subarray(start, end));
            }
            finishBookLoreFieldValidation(validation);
          }
          await data(encoder.encode(']'));
        }
        await data(encoder.encode('}'));
      }
      const index = finishBookPortableLoreIndex(dataState);
      await emit(encoder.encode('}'));
      await flush();
      check();
      const current = await header(bookId, id, view.readToken);
      check();
      if (!equal(view, current)) throw invalidLoreRead();
      return freeze({
        schemaVersion: 1,
        source: view,
        byteLength,
        chunkCount: part,
        contentHash: bytesToHex(outputHash.digest()),
        dataOffset: prefix.length,
        dataByteLength: dataState.byteLength,
        dataHash: bytesToHex(dataHash.digest()),
        index,
      });
    } finally {
      outputHash.destroy();
      dataHash.destroy();
    }
  }
  return { writePortable, verifyPortable };
}
