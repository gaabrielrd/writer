import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { asyncRecordStream } from '@/shared/streams';
import type { AdventureBackupRecord } from '../../../../functions/src/adventureBackupContainer.mjs';
import {
  adventureImageAddressLine,
  adventureImagesManifest,
  ADVENTURE_IMAGES_SEED,
  ADVENTURE_IMAGE_SOURCES_SEED,
} from '../../../../functions/src/adventureArchiveImages.mjs';
import {
  source,
  validId,
  validCount,
  validHash,
  matches,
  closed,
  compareIds,
} from './adventureInventoryContracts';
import {
  imageInvalid,
  imageMetadata,
  imagePart,
  type AdventureImageApi,
  type AdventureImageOptions,
  type AdventureImageProof,
  type AdventureImageMethod,
} from './adventureImageContracts';
const encoder = new TextEncoder();
const hash = (bytes: Uint8Array) => bytesToHex(sha256(bytes));
function capture(adventureId: string, api: AdventureImageApi, options: AdventureImageOptions) {
  if (
    !validId(adventureId) ||
    typeof api?.call !== 'function' ||
    typeof options?.guard !== 'function'
  )
    imageInvalid();
  return {
    invoke: api.call.bind(api),
    guard: options.guard,
    signal: options.signal,
    expected:
      options.source === undefined ? undefined : source(options.source, adventureId).sourceToken,
  };
}
async function walk(
  adventureId: string,
  intent: ReturnType<typeof capture>,
  write: (record: AdventureBackupRecord) => Promise<void>,
  signal: AbortSignal | undefined,
  readBytes: boolean,
): Promise<AdventureImageProof> {
  function check() {
    intent.guard();
    intent.signal?.throwIfAborted();
    signal?.throwIfAborted();
  }
  const call = async (method: AdventureImageMethod, input: Readonly<Record<string, unknown>>) => {
    check();
    const result = await intent.invoke(method, Object.freeze({ ...input }));
    check();
    return result;
  };
  const anchor = source(
    await call('getAdventureBackupSource', {
      adventureId,
      ...(intent.expected === undefined ? {} : { expectedSourceToken: intent.expected }),
    }),
    adventureId,
    intent.expected,
  );
  const digest = sha256.create().update(encoder.encode(ADVENTURE_IMAGES_SEED));
  const operational = sha256.create().update(encoder.encode(ADVENTURE_IMAGE_SOURCES_SEED));
  let bindings = 0,
    assets = 0,
    bytes = 0;
  const emit = async (kind: string, id: string, payload: Uint8Array, part = 0) => {
    check();
    if (payload.length > 65536) imageInvalid();
    await write(Object.freeze({ kind, id, part, payload }));
    check();
  };
  try {
    for (const kind of ['scene', 'block'] as const) {
      let cursor: string | null = null,
        last: string | null = null;
      do {
        const raw = await call('listAdventureBackupImageBindings', {
          adventureId,
          sourceToken: anchor.sourceToken,
          kind,
          cursor,
          limit: 50,
        });
        if (
          !closed(raw, [
            'schemaVersion',
            'adventureId',
            'sourceToken',
            'kind',
            'items',
            'nextCursor',
          ]) ||
          !matches(raw, anchor) ||
          raw.kind !== kind ||
          !Array.isArray(raw.items) ||
          raw.items.length > 50 ||
          (raw.nextCursor !== null &&
            (typeof raw.nextCursor !== 'string' ||
              !raw.nextCursor ||
              raw.nextCursor.length > 16000 ||
              raw.nextCursor === cursor ||
              raw.items.length !== 50))
        )
          imageInvalid();
        const next: string | null = raw.nextCursor;
        const rows = raw.items.map((value) => {
          if (
            !closed(value, ['id', 'imageId', 'bindingToken']) ||
            !validId(value.id) ||
            (value.imageId !== null && !validId(value.imageId)) ||
            !validHash(value.bindingToken)
          )
            imageInvalid();
          return Object.freeze({
            id: value.id,
            imageId: value.imageId,
            bindingToken: value.bindingToken,
          });
        });
        for (const row of rows) {
          check();
          if (last !== null && compareIds(last, row.id) >= 0) imageInvalid();
          last = row.id;
          const request = {
            adventureId,
            sourceToken: anchor.sourceToken,
            kind,
            id: row.id,
            bindingToken: row.bindingToken,
          };
          const current = imageMetadata(
            await call('getAdventureBackupImage', request),
            anchor,
            row.imageId,
          );
          const assetId = hash(encoder.encode(adventureImageAddressLine(kind, row.id)));
          const binding = encoder.encode(
            JSON.stringify({
              schemaVersion: 1,
              resource: { kind, id: row.id },
              image:
                current.image === null
                  ? null
                  : {
                      assetId,
                      imageId: current.image.imageId,
                      alt: current.image.alt,
                      caption: current.image.caption,
                    },
            }),
          );
          await emit('adventure-image-binding', assetId, binding);
          let metadataHash: string | null = null;
          if (current.image !== null) {
            const { kind: imageKind, alt, caption, ...metadata } = current.image;
            // Binding owns descriptive text; the asset keeps library metadata and bytes.
            void imageKind;
            void alt;
            void caption;
            const body = encoder.encode(JSON.stringify({ schemaVersion: 1, assetId, ...metadata }));
            metadataHash = hash(body);
            await emit('adventure-image', assetId, body);
            if (readBytes) {
              const content = sha256.create();
              try {
                for (let index = 0; index < current.image.chunkCount; index++) {
                  const part = imagePart(
                    await call('readAdventureBackupImageChunk', {
                      ...request,
                      imageToken: current.imageToken,
                      index,
                    }),
                    anchor,
                    current.imageToken,
                    index,
                    current.image,
                  );
                  content.update(part);
                  if (
                    index === current.image.chunkCount - 1 &&
                    bytesToHex(content.digest()) !== current.image.contentHash
                  )
                    imageInvalid();
                  await emit('adventure-image-bytes', assetId, part, index);
                }
              } finally {
                content.destroy();
              }
            }
            assets++;
            bytes += current.image.byteLength;
          }
          const checked = await call('verifyAdventureBackupImage', {
            ...request,
            imageToken: current.imageToken,
          });
          if (
            !closed(checked, ['schemaVersion', 'adventureId', 'sourceToken', 'imageToken']) ||
            !matches(checked, anchor) ||
            checked.imageToken !== current.imageToken
          )
            imageInvalid();
          digest.update(
            encoder.encode(
              JSON.stringify([
                'binding',
                kind,
                row.id,
                hash(binding),
                metadataHash,
                current.image?.contentHash ?? null,
              ]) + '\n',
            ),
          );
          operational.update(
            encoder.encode(
              JSON.stringify([kind, row.id, row.bindingToken, current.imageToken]) + '\n',
            ),
          );
          bindings++;
          if (![bindings, assets, bytes].every(validCount)) imageInvalid();
        }
        cursor = next;
      } while (cursor !== null);
    }
    source(
      await call('getAdventureBackupSource', {
        adventureId,
        expectedSourceToken: anchor.sourceToken,
      }),
      adventureId,
      anchor.sourceToken,
    );
    const checksum = bytesToHex(digest.digest());
    if (readBytes)
      await emit(
        'adventure-images',
        adventureId,
        encoder.encode(JSON.stringify(adventureImagesManifest(bindings, assets, bytes, checksum))),
      );
    return Object.freeze({
      validation: 'images-data-only',
      source: anchor,
      bindings,
      assets,
      bytes,
      digest: checksum,
      sourceDigest: bytesToHex(operational.digest()),
    });
  } finally {
    digest.destroy();
    operational.destroy();
  }
}
/** Partial section only: provisional records require final image and global inventory verification before an archive seal. */
export function streamAdventureImageData(
  adventureId: string,
  api: AdventureImageApi,
  options: AdventureImageOptions,
): AsyncGenerator<AdventureBackupRecord, AdventureImageProof | undefined, void> {
  const intent = capture(adventureId, api, options);
  return asyncRecordStream((write, signal) => walk(adventureId, intent, write, signal, true), {
    signal: intent.signal,
    check: intent.guard,
  });
}
/** Rechecks every binding/Storage generation and complete SHA without retaining an unbounded token list. */
export function verifyAdventureImageData(
  proof: AdventureImageProof,
  api: AdventureImageApi,
  options: AdventureImageOptions,
): Promise<void> {
  if (
    !closed(proof, [
      'validation',
      'source',
      'bindings',
      'assets',
      'bytes',
      'digest',
      'sourceDigest',
    ]) ||
    proof.validation !== 'images-data-only' ||
    ![proof.bindings, proof.assets, proof.bytes].every(validCount) ||
    !validHash(proof.digest) ||
    !validHash(proof.sourceDigest)
  )
    imageInvalid();
  const anchor = source(proof.source, proof.source.adventureId);
  const expected = Object.freeze({ ...proof, source: anchor });
  const intent = capture(anchor.adventureId, api, { ...options, source: anchor });
  if (
    options.source !== undefined &&
    source(options.source, anchor.adventureId).sourceToken !== anchor.sourceToken
  )
    imageInvalid();
  return walk(anchor.adventureId, intent, async () => {}, intent.signal, false).then((current) => {
    intent.guard();
    intent.signal?.throwIfAborted();
    if (
      current.bindings !== expected.bindings ||
      current.assets !== expected.assets ||
      current.bytes !== expected.bytes ||
      current.digest !== expected.digest ||
      current.sourceDigest !== expected.sourceDigest
    )
      imageInvalid();
  });
}
