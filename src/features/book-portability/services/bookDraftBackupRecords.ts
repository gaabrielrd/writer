import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type { Chapter } from '@/features/books';
import { validateComplement } from '../../../../functions/src/personaProfile.mjs';
import {
  encodeBookBackupJSON,
  serializeBookBackupStructure,
  type BookStructureSource,
} from '../../../../functions/src/bookBackupStructure.mjs';
import {
  encodeBookBackupDraftPersona,
  type BookDraftApi,
  type BookDraftPersonaCapture,
} from '../../../../functions/src/bookBackupDraft.mjs';
import { BookBackupFormatError, type BookBackupRecord } from '../model/backupContainer';
import { bookDraftApi } from './bookDraftCallables';
import { closed, validId, validHash, validCount, source, matches } from './bookSnapshotCapture';

export interface BookDraftInput {
  chapter: Pick<
    Chapter,
    | 'id'
    | 'bookId'
    | 'title'
    | 'order'
    | 'actId'
    | 'personaComplement'
    | 'contentMode'
    | 'createdAt'
    | 'updatedAt'
  >;
  content: string;
}
export interface BookDraftProof {
  source: BookStructureSource;
  state: 'none' | 'present';
  chapterId: string | null;
  byteLength: number;
  chunkCount: number;
  contentHash: string | null;
  persona: { id: string; token: string; hash: string } | null;
}
export interface BookDraftOptions {
  source?: BookStructureSource;
  api?: BookDraftApi;
  signal?: AbortSignal;
  isCurrent?: () => boolean;
}
function invalid(): never {
  throw new BookBackupFormatError(
    'invalid-record',
    'Não foi possível conferir o rascunho explícito deste livro.',
  );
}
function check(options: BookDraftOptions) {
  options.signal?.throwIfAborted();
  if (options.isCurrent && !options.isCurrent())
    throw new DOMException('O rascunho não pertence mais à sessão atual.', 'AbortError');
}
function snapshot(bookId: string, input: BookDraftInput | null) {
  if (input === null) return null;
  const chapter = input?.chapter;
  if (
    !chapter ||
    chapter.bookId !== bookId ||
    !validId(chapter.id) ||
    typeof input.content !== 'string' ||
    typeof chapter.title !== 'string' ||
    !Number.isFinite(chapter.order) ||
    !Number.isSafeInteger(chapter.createdAt) ||
    !Number.isSafeInteger(chapter.updatedAt) ||
    (chapter.contentMode !== undefined && chapter.contentMode !== 'legacy') ||
    (chapter.actId != null && !validId(chapter.actId))
  )
    invalid();
  let complement;
  try {
    complement = validateComplement(chapter.personaComplement);
  } catch {
    invalid();
  }
  const metadata = {
    id: chapter.id,
    ...(JSON.parse(
      serializeBookBackupStructure('chapter', {
        title: chapter.title,
        order: chapter.order,
        createdAt: chapter.createdAt,
        updatedAt: chapter.updatedAt,
        ...(chapter.actId !== undefined ? { actId: chapter.actId } : {}),
        ...(chapter.contentMode !== undefined ? { contentMode: chapter.contentMode } : {}),
        ...(chapter.personaComplement !== undefined ? { personaComplement: complement } : {}),
      }).json,
    ) as Record<string, unknown>),
  };
  return {
    chapterId: chapter.id,
    metadata,
    personaId: complement?.personaId ?? null,
    content: input.content,
  };
}
function* parts(text: string): Generator<Uint8Array> {
  const encoder = new TextEncoder(),
    decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  let offset = 0;
  if (!text.length) {
    yield new Uint8Array(0);
    return;
  }
  while (offset < text.length) {
    const segment = text.slice(offset, offset + 65536),
      buffer = new Uint8Array(65536);
    const result = encoder.encodeInto(segment, buffer);
    if (!result.read || !result.written) invalid();
    const payload = buffer.slice(0, result.written);
    if (decoder.decode(payload) !== segment.slice(0, result.read)) invalid();
    offset += result.read;
    yield payload;
  }
}
const hash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
async function textManifest(text: string, options: BookDraftOptions) {
  const hasher = sha256.create();
  let byteLength = 0,
    chunkCount = 0,
    yieldedAt = 0;
  try {
    for (const payload of parts(text)) {
      check(options);
      hasher.update(payload);
      byteLength += payload.byteLength;
      chunkCount++;
      if (!validCount(byteLength) || !validCount(chunkCount)) invalid();
      if (byteLength - yieldedAt >= 1024 * 1024) {
        yieldedAt = byteLength;
        await new Promise<void>((resolve) => setTimeout(resolve, 0));
        check(options);
      }
    }
    return { byteLength, chunkCount, contentHash: bytesToHex(hasher.digest()) };
  } finally {
    hasher.destroy();
  }
}
function persona(value: BookDraftPersonaCapture, anchor: BookStructureSource, id: string) {
  if (
    !closed(value, [
      'schemaVersion',
      'bookId',
      'sourceToken',
      'personaId',
      'personaToken',
      'profileHash',
      'profile',
    ]) ||
    !matches(value, anchor) ||
    value.personaId !== id ||
    !validHash(value.personaToken) ||
    !validHash(value.profileHash) ||
    !closed(value.profile, [
      'id',
      'schemaVersion',
      'name',
      'description',
      'instructions',
      'traits',
      'revision',
      'archived',
      'createdAt',
      'updatedAt',
    ]) ||
    value.profile.id !== id ||
    !Array.isArray(value.profile.traits) ||
    !value.profile.traits.every((trait) =>
      closed(trait, ['id', 'name', 'description', 'low', 'high', 'value']),
    )
  )
    invalid();
  try {
    const encoded = encodeBookBackupDraftPersona(value.profile);
    if (hash(encoded.bytes) !== value.profileHash) invalid();
    return {
      profile: encoded.profile,
      proof: Object.freeze({ id, token: value.personaToken, hash: value.profileHash }),
    };
  } catch {
    return invalid();
  }
}
/** Freezes the explicit local contribution now, before the first next()/await. No autosave. */
export function bookDraftBackupRecords(
  bookId: string,
  input: BookDraftInput | null = null,
  options: BookDraftOptions = {},
): AsyncGenerator<BookBackupRecord, BookDraftProof | undefined, void> {
  check(options);
  if (!validId(bookId)) invalid();
  const frozen = snapshot(bookId, input),
    expected =
      options.source === undefined ? undefined : source(options.source, bookId).sourceToken,
    settings = { ...options };
  return stream();
  async function* stream(): AsyncGenerator<BookBackupRecord, BookDraftProof | undefined, void> {
    check(settings);
    const api = settings.api ?? bookDraftApi;
    const anchor = source(
      await api.getSource({
        bookId,
        ...(expected === undefined ? {} : { expectedSourceToken: expected }),
      }),
      bookId,
      expected,
    );
    check(settings);
    let captured: ReturnType<typeof persona> | null = null;
    if (frozen?.personaId) {
      captured = persona(
        await api.persona({ bookId, sourceToken: anchor.sourceToken, personaId: frozen.personaId }),
        anchor,
        frozen.personaId,
      );
      check(settings);
    }
    const totals = frozen
      ? await textManifest(frozen.content, settings)
      : { byteLength: 0, chunkCount: 0, contentHash: null };
    check(settings);
    const header = encodeBookBackupJSON(
      frozen
        ? {
            schemaVersion: 1,
            state: 'present',
            chapter: frozen.metadata,
            persona: captured?.profile ?? null,
            ...totals,
          }
        : { schemaVersion: 1, state: 'none' },
    );
    for (let offset = 0, part = 0; offset < header.bytes.length; offset += 65536, part++) {
      check(settings);
      yield {
        kind: 'book-draft',
        id: bookId,
        part,
        payload: header.bytes.slice(offset, offset + 65536),
      };
      check(settings);
    }
    if (frozen) {
      let part = 0;
      for (const payload of parts(frozen.content)) {
        check(settings);
        yield { kind: 'book-draft-text', id: frozen.chapterId, part: part++, payload };
        check(settings);
      }
    }
    check(settings);
    return Object.freeze({
      source: anchor,
      state: frozen ? 'present' : 'none',
      chapterId: frozen?.chapterId ?? null,
      ...totals,
      persona: captured?.proof ?? null,
    });
  }
}
export async function verifyBookBackupDraft(
  proof: BookDraftProof,
  options: BookDraftOptions = {},
): Promise<void> {
  if (
    !closed(proof, [
      'source',
      'state',
      'chapterId',
      'byteLength',
      'chunkCount',
      'contentHash',
      'persona',
    ]) ||
    !proof.source ||
    !validId(proof.source.bookId) ||
    !validCount(proof.byteLength) ||
    !validCount(proof.chunkCount) ||
    !['none', 'present'].includes(proof.state)
  )
    invalid();
  if (
    proof.state === 'none'
      ? proof.chapterId !== null ||
        proof.byteLength !== 0 ||
        proof.chunkCount !== 0 ||
        proof.contentHash !== null ||
        proof.persona !== null
      : !validId(proof.chapterId) ||
        !validHash(proof.contentHash) ||
        proof.chunkCount < Math.max(1, Math.ceil(proof.byteLength / 65536)) ||
        proof.chunkCount > Math.max(1, Math.ceil(proof.byteLength / 65533))
  )
    invalid();
  if (
    proof.persona !== null &&
    (!closed(proof.persona, ['id', 'token', 'hash']) ||
      typeof proof.persona.id !== 'string' ||
      !/^[a-zA-Z0-9-]{1,100}$/.test(proof.persona.id) ||
      !validHash(proof.persona.token) ||
      !validHash(proof.persona.hash))
  )
    invalid();
  const anchor = source(proof.source, proof.source.bookId),
    captured = proof.persona ? { ...proof.persona } : null,
    api = options.api ?? bookDraftApi;
  check(options);
  source(
    await api.getSource({ bookId: anchor.bookId, expectedSourceToken: anchor.sourceToken }),
    anchor.bookId,
    anchor.sourceToken,
  );
  check(options);
  if (captured) {
    const current = persona(
      await api.persona({
        bookId: anchor.bookId,
        sourceToken: anchor.sourceToken,
        personaId: captured.id,
        expectedPersonaToken: captured.token,
      }),
      anchor,
      captured.id,
    );
    check(options);
    if (current.proof.token !== captured.token || current.proof.hash !== captured.hash) invalid();
  }
}
