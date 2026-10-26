import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { asyncRecordStream } from '@/shared/streams';
import type { AdventureBackupRecord } from '../../../../functions/src/adventureBackupContainer.mjs';
import {
  ADVENTURE_HISTORY_SEED,
  adventureHistoryBodyManifest,
  adventureHistoryDigestLine,
  adventureHistoryManifest,
  type AdventureHistoryTextManifest,
} from '../../../../functions/src/adventureArchiveHistory.mjs';
import {
  source,
  validId,
  validHash,
  validCount,
  closed,
  matches,
  compareIds,
  type AdventureInventoryItem,
} from './adventureInventoryContracts';
import { readAdventureBackupUnit } from './adventureUnit';
import type { AdventureUnitProof } from './adventureUnitContracts';
import {
  historyInvalid,
  historyTextPart,
  type AdventureHistoryApi,
  type AdventureHistoryOptions,
  type AdventureHistoryProof,
} from './adventureHistoryContracts';
const encoder = new TextEncoder();
/** Preserves native headers, streams ordered text into fixed byte parts and returns a partial history proof only. */
export function streamAdventureHistoryData(
  adventureId: string,
  api: AdventureHistoryApi,
  options: AdventureHistoryOptions,
): AsyncGenerator<AdventureBackupRecord, AdventureHistoryProof | undefined, void> {
  if (
    !validId(adventureId) ||
    typeof api?.call !== 'function' ||
    typeof options?.guard !== 'function'
  )
    historyInvalid();
  const invoke = api.call.bind(api),
    guard = options.guard,
    signal = options.signal;
  const expected =
    options.source === undefined ? undefined : source(options.source, adventureId).sourceToken;
  return asyncRecordStream<AdventureBackupRecord, AdventureHistoryProof>(
    async (write, activeSignal) => {
      function check() {
        guard();
        signal?.throwIfAborted();
        activeSignal.throwIfAborted();
      }
      const call = async (
        method: Parameters<AdventureHistoryApi['call']>[0],
        input: Readonly<Record<string, unknown>>,
      ) => {
        check();
        const result = await invoke(method, Object.freeze({ ...input }));
        check();
        return result;
      };
      const anchor = source(
        await call('getAdventureBackupSource', {
          adventureId,
          ...(expected === undefined ? {} : { expectedSourceToken: expected }),
        }),
        adventureId,
        expected,
      );
      const scope = { kind: 'version', parentId: null, parentToken: null } as const;
      const unitApi = {
        call: (method: string, input: Readonly<Record<string, unknown>>) => {
          if (method !== 'readAdventureBackupHistory') historyInvalid();
          return call(method, input);
        },
      };
      const digest = sha256.create().update(encoder.encode(ADVENTURE_HISTORY_SEED));
      let versions = 0,
        nativeRecords = 0,
        textBytes = 0,
        cursor: string | null = null,
        last: string | null = null;
      async function emit(record: AdventureBackupRecord) {
        check();
        if (record.payload.length > 65536) historyInvalid();
        await write(Object.freeze({ ...record }));
        check();
      }
      async function header(item: AdventureInventoryItem) {
        const stream = readAdventureBackupUnit(
          anchor,
          { family: 'history', ...scope },
          item,
          unitApi,
          { guard: check, signal: activeSignal },
        );
        let complete = false,
          part = 0,
          proof: AdventureUnitProof | undefined;
        try {
          for (;;) {
            check();
            const next = await stream.next();
            check();
            if (next.done) {
              complete = true;
              proof = next.value;
              break;
            }
            await emit({
              kind: 'adventure-version',
              id: item.id,
              part: part++,
              payload: next.value,
            });
          }
        } finally {
          if (!complete) await stream.return(undefined);
        }
        if (!proof || proof.chunkCount !== part) historyInvalid();
        return proof;
      }
      async function version(item: AdventureInventoryItem) {
        const metadata = await header(item),
          hash = sha256.create(),
          decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
        const buffer = new Uint8Array(65536);
        let used = 0,
          filePart = 0,
          bytes = 0,
          first: AdventureHistoryTextManifest | undefined,
          body;
        try {
          for (let ordinal = 0; !first || ordinal < first.chunkCount; ordinal++) {
            const raw = await call('readAdventureBackupHistoryText', {
              adventureId,
              sourceToken: anchor.sourceToken,
              kind: 'version-chunk',
              parentId: item.id,
              parentToken: item.itemToken,
              ordinal,
            });
            const current = historyTextPart(raw, anchor, item, ordinal, first);
            check();
            if (!first) {
              first = current.manifest;
              body = adventureHistoryBodyManifest(item.id, metadata.contentHash, first);
              await emit({
                kind: 'adventure-version-body',
                id: item.id,
                part: 0,
                payload: encoder.encode(JSON.stringify(body)),
              });
            }
            bytes += current.bytes.length;
            if (!validCount(bytes) || bytes > first.byteLength) historyInvalid();
            try {
              decoder.decode(current.bytes, { stream: true });
            } catch {
              historyInvalid();
            }
            hash.update(current.bytes);
            if (ordinal === first.chunkCount - 1) {
              try {
                decoder.decode();
              } catch {
                historyInvalid();
              }
              if (bytes !== first.byteLength || bytesToHex(hash.digest()) !== first.contentHash)
                historyInvalid();
            }
            let offset = 0;
            while (offset < current.bytes.length) {
              const take = Math.min(65536 - used, current.bytes.length - offset);
              buffer.set(current.bytes.subarray(offset, offset + take), used);
              used += take;
              offset += take;
              if (used === 65536) {
                await emit({
                  kind: 'adventure-version-text',
                  id: item.id,
                  part: filePart++,
                  payload: buffer.slice(),
                });
                used = 0;
              }
            }
          }
          if (!first || !body) historyInvalid();
          if (used || filePart === 0)
            await emit({
              kind: 'adventure-version-text',
              id: item.id,
              part: filePart++,
              payload: buffer.slice(0, used),
            });
          if (filePart !== body.chunkCount) historyInvalid();
          versions++;
          nativeRecords += 1 + first.chunkCount;
          textBytes += first.byteLength;
          if (![versions, nativeRecords, textBytes].every(validCount)) historyInvalid();
          digest.update(encoder.encode(adventureHistoryDigestLine(item.id, metadata, body)));
        } finally {
          hash.destroy();
          buffer.fill(0);
        }
      }
      try {
        do {
          const raw = await call('listAdventureBackupHistory', {
            adventureId,
            sourceToken: anchor.sourceToken,
            ...scope,
            cursor,
            limit: 50,
          });
          if (
            !closed(raw, [
              'schemaVersion',
              'adventureId',
              'sourceToken',
              'kind',
              'parentId',
              'parentToken',
              'items',
              'nextCursor',
            ]) ||
            !matches(raw, anchor) ||
            raw.kind !== 'version' ||
            raw.parentId !== null ||
            raw.parentToken !== null ||
            !Array.isArray(raw.items) ||
            raw.items.length > 50 ||
            (raw.nextCursor !== null &&
              (typeof raw.nextCursor !== 'string' ||
                !raw.nextCursor ||
                raw.nextCursor.length > 16000 ||
                raw.nextCursor === cursor ||
                raw.items.length !== 50))
          )
            historyInvalid();
          const next: string | null = raw.nextCursor;
          const rows = raw.items.map((value) => {
            if (
              !closed(value, ['id', 'itemToken']) ||
              !validId(value.id) ||
              !validHash(value.itemToken)
            )
              historyInvalid();
            return Object.freeze({ id: value.id, itemToken: value.itemToken });
          });
          for (const item of rows) {
            check();
            if (last !== null && compareIds(last, item.id) >= 0) historyInvalid();
            last = item.id;
            await version(item);
          }
          cursor = next;
        } while (cursor !== null);
        source(
          await call('getAdventureBackupSource', {
            adventureId,
            expectedSourceToken: anchor.sourceToken,
          }),
          adventureId,
          anchor.sourceToken,
        );
        const checksum = bytesToHex(digest.digest()),
          manifest = adventureHistoryManifest(versions, nativeRecords, textBytes, checksum);
        await emit({
          kind: 'adventure-history',
          id: adventureId,
          part: 0,
          payload: encoder.encode(JSON.stringify(manifest)),
        });
        return Object.freeze({
          validation: 'history-data-only',
          source: anchor,
          versions,
          nativeRecords,
          textBytes,
          digest: checksum,
        });
      } finally {
        digest.destroy();
      }
    },
    { signal, check: guard },
  );
}
