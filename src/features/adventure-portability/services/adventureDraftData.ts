import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { asyncRecordStream } from '@/shared/streams';
import type { AdventureBackupRecord } from '../../../../functions/src/adventureBackupContainer.mjs';
import { adventureCoreRecordIdentity } from '../../../../functions/src/adventureArchiveCore.mjs';
import {
  ADVENTURE_DRAFTS_SEED,
  adventureDraftsManifest,
} from '../../../../functions/src/adventureArchiveDrafts.mjs';
import {
  source,
  closed,
  validId,
  validHash,
  validCount,
  type AdventureInventorySource,
} from './adventureInventoryContracts';
import { readAdventureBackupUnit } from './adventureUnit';
import { captureUnit, type AdventureUnitProof } from './adventureUnitContracts';
export interface AdventureDraftInput {
  adventureId: string;
  resource: { kind: 'scene' | 'block'; id: string };
  content: string;
  baseRevision: number;
  savedAt: number;
}
export interface AdventureDraftOrigin {
  readonly head: AdventureUnitProof;
  readonly body: AdventureUnitProof;
}
export interface AdventureDraftApi {
  call(
    method: 'getAdventureBackupSource' | 'readAdventureBackupResource',
    input: Readonly<Record<string, unknown>>,
  ): Promise<unknown>;
}
export interface AdventureDraftOptions {
  guard: () => void;
  signal?: AbortSignal;
  source: AdventureInventorySource;
  origin: AdventureDraftOrigin | null;
}
export interface AdventureDraftProof {
  readonly validation: 'draft-data-only';
  readonly source: AdventureInventorySource;
  readonly origin: AdventureDraftOrigin | null;
  readonly count: number;
  readonly bytes: number;
  readonly digest: string;
}
export class AdventureDraftError extends Error {
  readonly code = 'adventure-backup-invalid-draft';
  constructor() {
    super('Não foi possível conferir o rascunho explícito da aventura. Faça um novo backup.');
    this.name = 'AdventureDraftError';
  }
}
function invalid(): never {
  throw new AdventureDraftError();
}
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
function freezeOrigin(anchor: AdventureInventorySource, value: AdventureDraftOrigin | null) {
  if (value === null) return null;
  if (!closed(value, ['head', 'body'])) invalid();
  function unit(raw: AdventureUnitProof) {
    if (
      !closed(raw, [
        'validation',
        'source',
        'scope',
        'item',
        'byteLength',
        'chunkCount',
        'contentHash',
      ]) ||
      raw.validation !== 'unit-bytes-only' ||
      !validCount(raw.byteLength) ||
      raw.byteLength < 1 ||
      raw.chunkCount !== Math.ceil(raw.byteLength / 65536) ||
      !validHash(raw.contentHash) ||
      source(raw.source, anchor.adventureId).sourceToken !== anchor.sourceToken
    )
      invalid();
    const ref = captureUnit(anchor, raw.scope, raw.item);
    if (ref.scope.family !== 'resources' || ref.item.present !== true) invalid();
    return Object.freeze({
      validation: 'unit-bytes-only' as const,
      source: ref.anchor,
      scope: ref.scope,
      item: ref.item,
      byteLength: raw.byteLength,
      chunkCount: raw.chunkCount,
      contentHash: raw.contentHash,
    });
  }
  const head = unit(value.head),
    body = unit(value.body);
  if (
    !['scene', 'block'].includes(head.scope.kind ?? '') ||
    head.scope.parentId !== null ||
    body.scope.kind !== head.scope.kind + '-body' ||
    body.scope.parentId !== head.item.id ||
    body.item.id !== 'current'
  )
    invalid();
  return Object.freeze({ head, body });
}
function intent(adventureId: string, api: AdventureDraftApi, options: AdventureDraftOptions) {
  if (
    !validId(adventureId) ||
    typeof api?.call !== 'function' ||
    typeof options?.guard !== 'function'
  )
    invalid();
  const anchor = source(options.source, adventureId);
  return {
    anchor,
    origin: freezeOrigin(anchor, options.origin),
    call: api.call.bind(api),
    guard: options.guard,
    signal: options.signal,
  };
}
type Intent = ReturnType<typeof intent>;
function* parts(text: string): Generator<Uint8Array> {
  let offset = 0;
  if (!text.length) {
    yield new Uint8Array();
    return;
  }
  while (offset < text.length) {
    const segment = text.slice(offset, offset + 65536),
      buffer = new Uint8Array(65536);
    const { read, written } = encoder.encodeInto(segment, buffer);
    if (!read || !written) invalid();
    const payload = buffer.slice(0, written);
    if (decoder.decode(payload) !== segment.slice(0, read)) invalid();
    offset += read;
    yield payload;
  }
}
async function revalidate(settings: Intent, check: () => void, signal?: AbortSignal) {
  check();
  source(
    await settings.call('getAdventureBackupSource', {
      adventureId: settings.anchor.adventureId,
      expectedSourceToken: settings.anchor.sourceToken,
    }),
    settings.anchor.adventureId,
    settings.anchor.sourceToken,
  );
  check();
  if (settings.origin)
    for (const expected of [settings.origin.head, settings.origin.body]) {
      const stream = readAdventureBackupUnit(
        settings.anchor,
        expected.scope,
        expected.item,
        {
          call: (method, input) => {
            if (method !== 'readAdventureBackupResource') invalid();
            return settings.call(method, input);
          },
        },
        { guard: check, signal },
      );
      let done = false,
        proof: AdventureUnitProof | undefined;
      try {
        for (;;) {
          const next = await stream.next();
          check();
          if (next.done) {
            done = true;
            proof = next.value;
            break;
          }
        }
      } finally {
        if (!done) await stream.return(undefined);
      }
      if (
        !proof ||
        proof.contentHash !== expected.contentHash ||
        proof.byteLength !== expected.byteLength ||
        proof.chunkCount !== expected.chunkCount
      )
        invalid();
    }
  check();
  source(
    await settings.call('getAdventureBackupSource', {
      adventureId: settings.anchor.adventureId,
      expectedSourceToken: settings.anchor.sourceToken,
    }),
    settings.anchor.adventureId,
    settings.anchor.sourceToken,
  );
  check();
}
/** Captures only the explicitly selected local text. No browser storage enumeration or autosave. */
export function streamAdventureDraftData(
  adventureId: string,
  input: AdventureDraftInput | null,
  api: AdventureDraftApi,
  options: AdventureDraftOptions,
): AsyncGenerator<AdventureBackupRecord, AdventureDraftProof | undefined, void> {
  const settings = intent(adventureId, api, options);
  let frozen: AdventureDraftInput | null = null;
  if (input !== null) {
    if (
      !closed(input, ['adventureId', 'resource', 'content', 'baseRevision', 'savedAt']) ||
      input.adventureId !== adventureId ||
      !closed(input.resource, ['kind', 'id']) ||
      !['scene', 'block'].includes(input.resource.kind) ||
      !validId(input.resource.id) ||
      typeof input.content !== 'string' ||
      !Number.isSafeInteger(input.baseRevision) ||
      input.baseRevision < 1 ||
      !Number.isFinite(input.savedAt) ||
      input.savedAt < 0 ||
      input.savedAt > 8640000000000000 ||
      !settings.origin ||
      input.resource.kind !== settings.origin.head.scope.kind ||
      input.resource.id !== settings.origin.head.item.id
    )
      invalid();
    frozen = Object.freeze({ ...input, resource: Object.freeze({ ...input.resource }) });
  } else if (settings.origin !== null) invalid();
  return asyncRecordStream(
    async (write, signal) => {
      function check() {
        settings.guard();
        settings.signal?.throwIfAborted();
        signal.throwIfAborted();
      }
      await revalidate(settings, check, signal);
      const digest = sha256.create().update(encoder.encode(ADVENTURE_DRAFTS_SEED));
      let bytes = 0,
        chunkCount = 0;
      async function emit(record: AdventureBackupRecord) {
        check();
        await write(Object.freeze(record));
        check();
      }
      try {
        if (frozen && settings.origin) {
          const contentHash = sha256.create();
          let yieldedAt = 0,
            checksum: string;
          try {
            for (const payload of parts(frozen.content)) {
              check();
              contentHash.update(payload);
              bytes += payload.length;
              chunkCount++;
              if (!validCount(bytes) || !validCount(chunkCount)) invalid();
              if (bytes - yieldedAt >= 1024 * 1024) {
                yieldedAt = bytes;
                await new Promise<void>((resolve) => setTimeout(resolve, 0));
                check();
              }
            }
            checksum = bytesToHex(contentHash.digest());
          } finally {
            contentHash.destroy();
          }
          const identity = await adventureCoreRecordIdentity(
            { family: 'resources', kind: frozen.resource.kind, parentId: null },
            frozen.resource.id,
          );
          check();
          const header = encoder.encode(
            JSON.stringify({
              schemaVersion: 1,
              resource: frozen.resource,
              baseRevision: frozen.baseRevision,
              savedAt: frozen.savedAt,
              layout: 'utf8-parts',
              byteLength: bytes,
              chunkCount,
              contentHash: checksum,
              current: {
                headHash: settings.origin.head.contentHash,
                bodyHash: settings.origin.body.contentHash,
              },
            }),
          );
          await emit({ kind: 'adventure-draft', id: identity.id, part: 0, payload: header });
          let part = 0;
          for (const payload of parts(frozen.content))
            await emit({ kind: 'adventure-draft-text', id: identity.id, part: part++, payload });
          if (part !== chunkCount) invalid();
          digest.update(
            encoder.encode(
              JSON.stringify([
                'draft',
                identity.id,
                bytesToHex(sha256(header)),
                bytes,
                chunkCount,
                checksum,
              ]) + '\n',
            ),
          );
        }
        await revalidate(settings, check, signal);
        const checksum = bytesToHex(digest.digest()),
          count = frozen ? 1 : 0;
        await emit({
          kind: 'adventure-drafts',
          id: adventureId,
          part: 0,
          payload: encoder.encode(JSON.stringify(adventureDraftsManifest(count, bytes, checksum))),
        });
        return Object.freeze({
          validation: 'draft-data-only' as const,
          source: settings.anchor,
          origin: settings.origin,
          count,
          bytes,
          digest: checksum,
        });
      } finally {
        digest.destroy();
      }
    },
    { check: settings.guard, signal: settings.signal },
  );
}
/** Revalidates the saved resource/ancestry without modifying the selected local draft. */
export function verifyAdventureDraftData(
  proof: AdventureDraftProof,
  api: AdventureDraftApi,
  options: Omit<AdventureDraftOptions, 'source' | 'origin'>,
): Promise<void> {
  if (
    !closed(proof, ['validation', 'source', 'origin', 'count', 'bytes', 'digest']) ||
    proof.validation !== 'draft-data-only' ||
    ![0, 1].includes(proof.count) ||
    !validCount(proof.bytes) ||
    !validHash(proof.digest) ||
    (proof.count === 0 ? proof.bytes !== 0 || proof.origin !== null : proof.origin === null)
  )
    invalid();
  const settings = intent(proof.source.adventureId, api, {
    ...options,
    source: proof.source,
    origin: proof.origin,
  });
  const check = () => {
    settings.guard();
    settings.signal?.throwIfAborted();
  };
  return revalidate(settings, check, settings.signal);
}
