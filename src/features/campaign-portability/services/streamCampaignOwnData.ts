import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { asyncRecordStream } from '@/shared/streams';
import {
  CAMPAIGN_OWN_FAMILIES,
  CAMPAIGN_OWN_PAGE_ITEMS,
  type CampaignOwnFamily,
} from '../../../../functions/src/campaignBackupOwnDefinitions.mjs';
import {
  CampaignOwnCaptureError,
  invalid,
  validId,
  validCount,
  compareIds,
  source,
  page,
  cursor,
  part,
  type CampaignOwnApi,
  type CampaignOwnCaptureOptions,
  type CampaignOwnCaptureProof,
  type CampaignOwnChunk,
  type CampaignOwnItem,
  type CampaignOwnKind,
  type CampaignOwnManifest,
  type CampaignOwnInventoryProof,
  type CampaignOwnMethod,
} from './campaignOwnContracts';
const encoder = new TextEncoder();
const add = (count: number, amount = 1) => {
  const next = count + amount;
  if (!validCount(next)) invalid();
  return next;
};
/** Provisional own-content chunks. Natural completion verifies the full second inventory pass; this is not a campaign archive seal. */
export function streamCampaignOwnData(
  campaignId: string,
  api: CampaignOwnApi,
  options: CampaignOwnCaptureOptions,
): AsyncGenerator<CampaignOwnChunk, CampaignOwnCaptureProof | undefined, void> {
  if (
    !validId(campaignId) ||
    typeof api?.call !== 'function' ||
    typeof options?.guard !== 'function'
  )
    invalid();
  const invoke = api.call.bind(api),
    guard = options.guard,
    signal = options.signal,
    expected =
      options.source === undefined ? undefined : source(options.source, campaignId).sourceToken;
  return asyncRecordStream(
    async (write, activeSignal) => {
      const check = () => {
        guard();
        signal?.throwIfAborted();
        activeSignal.throwIfAborted();
      };
      const call = async (method: CampaignOwnMethod, input: Readonly<Record<string, unknown>>) => {
        check();
        const result = await invoke(method, Object.freeze({ ...input }));
        check();
        return result;
      };
      check();
      const anchor = source(
        await call('getCampaignBackupSource', {
          campaignId,
          ...(expected === undefined ? {} : { expectedSourceToken: expected }),
        }),
        campaignId,
        expected,
      );
      const contentHash = sha256.create(),
        inventoryHashes: ReturnType<typeof sha256.create>[] = [];
      let units = 0,
        chunks = 0,
        payloadBytes = 0;
      const omitted = { control: 0, deleted: 0, 'inactive-parent': 0 };
      const foldContent = (value: unknown) =>
        contentHash.update(encoder.encode(JSON.stringify(value) + '\n'));
      foldContent(['writer-campaign-own-content-v1', anchor.campaignId]);
      async function unit(kind: CampaignOwnKind, ref: CampaignOwnItem) {
        const hash = sha256.create();
        let first: CampaignOwnManifest | undefined;
        try {
          for (let index = 0; !first || index < first.chunkCount; index++) {
            const raw = await call('readCampaignBackupOwnContent', {
                campaignId,
                sourceToken: anchor.sourceToken,
                kind,
                id: ref.id,
                itemToken: ref.itemToken,
                index,
              }),
              response = part(raw, anchor, kind, ref, index, first);
            if (response.outcome === 'omitted') {
              omitted[response.reason] = add(omitted[response.reason]);
              units = add(units);
              foldContent(['omitted', kind, ref.id, response.reason]);
              return;
            }
            if (kind === 'session-reference-state' || kind === 'session-preparation-state')
              invalid();
            first ??= response.manifest;
            hash.update(response.bytes);
            if (index === first.chunkCount - 1 && bytesToHex(hash.digest()) !== first.contentHash)
              invalid();
            chunks = add(chunks);
            payloadBytes = add(payloadBytes, response.bytes.length);
            check();
            await write(Object.freeze({ kind, id: ref.id, index, payload: response.bytes }));
            check();
          }
          if (!first) invalid();
          units = add(units);
          foldContent(['unit', kind, ref.id, first]);
        } finally {
          hash.destroy();
        }
      }
      async function scan(
        visit?: (family: CampaignOwnFamily, ref: CampaignOwnItem) => Promise<void>,
      ): Promise<CampaignOwnInventoryProof> {
        const hash = sha256.create();
        inventoryHashes.push(hash);
        const counts = Object.fromEntries(
          CAMPAIGN_OWN_FAMILIES.map((family) => [family, 0]),
        ) as Record<CampaignOwnFamily, number>;
        let pages = 0,
          items = 0;
        const fold = (value: unknown) => hash.update(encoder.encode(JSON.stringify(value) + '\n'));
        fold(['writer-campaign-own-inventory-v1', anchor]);
        for (const family of CAMPAIGN_OWN_FAMILIES) {
          let after: string | null = null,
            last: string | null = null;
          do {
            const result = page(
              await call('listCampaignBackupOwnInventory', {
                campaignId,
                sourceToken: anchor.sourceToken,
                family,
                limit: CAMPAIGN_OWN_PAGE_ITEMS,
                cursor: after,
              }),
              anchor,
              family,
            );
            for (const ref of result.items) {
              if (last !== null && compareIds(last, ref.id) >= 0) invalid();
              last = ref.id;
            }
            if (result.nextCursor !== null) {
              if (!last || result.nextCursor === after) invalid();
              cursor(result.nextCursor, anchor, family, last);
            }
            pages = add(pages);
            items = add(items, result.items.length);
            counts[family] = add(counts[family], result.items.length);
            fold(['page', family, after, result.items, result.pageToken, result.nextCursor]);
            if (visit)
              for (const ref of result.items) {
                check();
                await visit(family, ref);
                check();
              }
            after = result.nextCursor;
          } while (after !== null);
        }
        return Object.freeze({
          pages,
          items,
          digest: bytesToHex(hash.digest()),
          counts: Object.freeze(counts),
        });
      }
      try {
        await unit('campaign', Object.freeze({ id: campaignId, itemToken: anchor.sourceToken }));
        await unit('progress', Object.freeze({ id: 'current', itemToken: anchor.sourceToken }));
        const inventory = await scan(unit),
          verified = await scan();
        if (JSON.stringify(inventory) !== JSON.stringify(verified))
          throw new CampaignOwnCaptureError('campaign-backup-inventory-changed');
        source(
          await call('getCampaignBackupSource', {
            campaignId,
            expectedSourceToken: anchor.sourceToken,
          }),
          campaignId,
          anchor.sourceToken,
        );
        check();
        return Object.freeze({
          validation: 'own-data-only',
          source: anchor,
          inventory,
          content: Object.freeze({
            units,
            chunks,
            payloadBytes,
            digest: bytesToHex(contentHash.digest()),
          }),
          omitted: Object.freeze({ ...omitted }),
        });
      } finally {
        contentHash.destroy();
        for (const hash of inventoryHashes) hash.destroy();
      }
    },
    {
      signal,
      check: () => {
        guard();
        signal?.throwIfAborted();
      },
    },
  );
}
