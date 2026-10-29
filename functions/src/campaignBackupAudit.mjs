import { createHash } from 'node:crypto';
import { campaignBackupScope, createCampaignBackupSourceService } from './campaignBackupSource.mjs';
import { createCampaignBackupDerivedSourceService } from './campaignBackupDerivedSource.mjs';
import { createCampaignBackupInventoryService } from './campaignBackupInventory.mjs';
import { createCampaignBackupOwnReadService } from './campaignBackupOwnRead.mjs';
import { createCampaignBackupBaseReadService } from './campaignBackupBaseRead.mjs';
import { createCampaignBackupBaseInventoryService } from './campaignBackupBaseInventory.mjs';
import { createCampaignBackupLoreService } from './campaignBackupLore.mjs';
import { createCampaignBackupLoreInventoryService } from './campaignBackupLoreInventory.mjs';
import { createCampaignBackupImageService } from './campaignBackupImage.mjs';
import { createCampaignBackupWitnessService } from './campaignBackupWitness.mjs';
import {
  CAMPAIGN_OWN_FAMILIES,
  CAMPAIGN_OWN_CHUNK_BYTES as CHUNK,
} from './campaignBackupOwnDefinitions.mjs';
import { workFail } from './workProgressContracts.mjs';
const fail = () =>
  workFail(
    'failed-precondition',
    'A captura da campanha mudou ou está inconsistente. Reinicie o backup.',
    'campaign-backup-audit-changed',
  );
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function counter(value, amount = 1) {
  const n = value + amount;
  if (!Number.isSafeInteger(n) || n < 0) fail();
  return n;
}
/** Native readers only: no caller manifest, persistent resource, signature or access grant. */
export function createCampaignBackupAuditService({ db, storage }) {
  const api = Object.assign(
    {},
    createCampaignBackupSourceService({ db }),
    createCampaignBackupDerivedSourceService({ db }),
    createCampaignBackupInventoryService({ db }),
    createCampaignBackupOwnReadService({ db }),
    createCampaignBackupBaseReadService({ db }),
    createCampaignBackupBaseInventoryService({ db }),
    createCampaignBackupLoreService({ db }),
    createCampaignBackupLoreInventoryService({ db }),
    createCampaignBackupImageService({ db, storage }),
    createCampaignBackupWitnessService({ db }),
  );
  return {
    auditCampaignBackup(uid, data, options = {}) {
      const intent = campaignBackupScope(db, uid, data),
        campaignId = intent.campaignId,
        expected = intent.expected,
        signal = options.signal,
        onRecord = options.onRecord,
        controller = new AbortController(),
        check = () => {
          signal?.throwIfAborted();
          controller.signal.throwIfAborted();
        },
        call = async (method, input) => {
          check();
          const value = await api[method](uid, input);
          check();
          return value;
        };
      if (onRecord !== undefined && typeof onRecord !== 'function')
        workFail('invalid-argument', 'Destino de captura inválido.');
      async function publish(record) {
        if (!onRecord) return;
        check();
        await onRecord(Object.freeze({ ...record, payload: Buffer.from(record.payload) }));
        check();
      }
      function partBytes(raw) {
        if (typeof raw !== 'string' || raw.length > 87384) fail();
        const bytes = Buffer.from(raw, 'base64');
        if (bytes.length > CHUNK || bytes.toString('base64') !== raw) fail();
        return bytes;
      }
      async function* run() {
        check();
        const own = await call('getCampaignBackupSource', {
            campaignId,
            ...(expected === undefined ? {} : { expectedSourceToken: expected }),
          }),
          derived = await call('getCampaignBackupDerivedSource', {
            campaignId,
            sourceToken: own.sourceToken,
          }),
          request = {
            campaignId,
            sourceToken: own.sourceToken,
            derivedToken: derived.derivedToken,
          };
        await publish({
          kind: 'campaign',
          id: 'header',
          part: 0,
          payload: Buffer.from(
            JSON.stringify({
              schemaVersion: 1,
              kind: 'writer-campaign',
              contentVersion: 1,
              provenanceVersion: 1,
              originCampaignId: campaignId,
              availability: derived.availability,
            }),
          ),
        });
        async function* scan(pass) {
          const content = createHash('sha256'),
            inventory = createHash('sha256'),
            native = createHash('sha256'),
            provenance = createHash('sha256');
          let units = 0,
            bytes = 0,
            chunks = 0,
            pages = 0,
            resources = 0,
            omitted = 0,
            unavailable = 0,
            pagesLegacy = false,
            witnesses = 0,
            witnessBytes = 0;
          const fold = (hasher, v) => hasher.update(JSON.stringify(v) + '\n'),
            observe = (v) => fold(native, v),
            unit = async (section, id, field, result, read) => {
              const descriptor = { section, id, ...(field === null ? {} : { field }), ...result };
              units = counter(units);
              bytes = counter(bytes, result.byteLength ?? 0);
              chunks = counter(chunks, result.chunkCount ?? 0);
              if (result.outcome === 'omitted') omitted = counter(omitted);
              if (result.outcome === 'unavailable') unavailable = counter(unavailable);
              fold(content, descriptor);
              if (pass !== 'capture' || !onRecord) return;
              const ordinal = String(units - 1);
              await publish({
                kind: 'unit',
                id: ordinal,
                part: 0,
                payload: Buffer.from(JSON.stringify(descriptor)),
              });
              if (result.outcome !== 'available') return;
              if (typeof read !== 'function') fail();
              const hash = createHash('sha256');
              let size = 0;
              try {
                for (let index = 0; index < result.chunkCount; index++) {
                  const value = await read(index);
                  check();
                  if (
                    !Buffer.isBuffer(value) ||
                    value.length !== Math.min(CHUNK, result.byteLength - index * CHUNK)
                  )
                    fail();
                  if (
                    section === 'image' &&
                    index === 0 &&
                    value.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
                  )
                    fail();
                  size = counter(size, value.length);
                  hash.update(value);
                  await publish({ kind: 'data', id: ordinal, part: index, payload: value });
                }
                if (size !== result.byteLength || hash.digest('hex') !== result.contentHash) fail();
              } finally {
                hash.destroy();
              }
            },
            progress = (stage) => {
              check();
              return Object.freeze({ pass, stage, units, pages, resources });
            };
          fold(content, ['writer-campaign-logical-units-v1', campaignId, derived.availability]);
          fold(inventory, ['writer-campaign-native-inventory-v1', own, derived]);
          fold(native, ['writer-campaign-native-content-v1', own, derived]);
          fold(provenance, ['writer-campaign-witnesses-v1', campaignId]);
          async function witness(method, input, section, id) {
            const result = await call(method, input);
            if (result.outcome === 'available') {
              const encoded = Buffer.from(JSON.stringify(result.content));
              if (encoded.length !== result.byteLength || sha(encoded) !== result.contentHash)
                fail();
              witnessBytes = counter(witnessBytes, encoded.length);
            }
            witnesses = counter(witnesses);
            const record = [section, id, result.outcome, result.content ?? null];
            fold(provenance, record);
            if (pass === 'capture')
              await publish({
                kind: 'witness',
                id: String(witnesses - 1),
                part: 0,
                payload: Buffer.from(JSON.stringify(record)),
              });
            observe(['witness', method, result.witnessToken ?? result]);
          }
          async function* list(method, input, key = 'id') {
            let cursor = null,
              last = null;
            do {
              const page = await call(method, { ...input, limit: 25, cursor });
              if (!Array.isArray(page.items) || page.items.length > 25 || !hash(page.pageToken))
                fail();
              if (
                page.nextCursor !== null &&
                (typeof page.nextCursor !== 'string' ||
                  page.nextCursor === cursor ||
                  page.items.length === 0)
              )
                fail();
              for (const item of page.items) {
                if (
                  typeof item[key] !== 'string' ||
                  (last !== null && Buffer.compare(Buffer.from(item[key]), Buffer.from(last)) <= 0)
                )
                  fail();
                last = item[key];
              }
              pages = counter(pages);
              resources = counter(resources, page.items.length);
              fold(inventory, [method, input, cursor, page]);
              yield page;
              check();
              cursor = page.nextCursor;
            } while (cursor !== null);
          }
          async function readChunked(method, input, section, id) {
            const hasher = createHash('sha256');
            let manifest = null,
              total = 0;
            try {
              for (let index = 0; manifest === null || index < manifest.chunkCount; index++) {
                const r = await call(method, { ...input, index });
                if (r.outcome === 'omitted' || r.outcome === 'unavailable') {
                  if (index !== 0) fail();
                  observe([method, input, r]);
                  await unit(section, id, null, {
                    outcome: r.outcome,
                    ...(r.reason ? { reason: r.reason } : {}),
                  });
                  return;
                }
                if (
                  r.outcome !== 'chunk' ||
                  !Number.isSafeInteger(r.byteLength) ||
                  r.byteLength < 1 ||
                  !Number.isSafeInteger(r.chunkCount) ||
                  r.chunkCount < 1 ||
                  r.chunkCount !== Math.ceil(r.byteLength / CHUNK) ||
                  !hash(r.contentHash) ||
                  r.index !== index ||
                  typeof r.chunkBase64 !== 'string'
                )
                  fail();
                const m = {
                  byteLength: r.byteLength,
                  chunkCount: r.chunkCount,
                  contentHash: r.contentHash,
                };
                manifest ??= m;
                if (JSON.stringify(manifest) !== JSON.stringify(m)) fail();
                const part = Buffer.from(r.chunkBase64, 'base64');
                if (
                  part.toString('base64') !== r.chunkBase64 ||
                  part.length !== Math.min(CHUNK, manifest.byteLength - index * CHUNK)
                )
                  fail();
                total = counter(total, part.length);
                hasher.update(part);
              }
              if (total !== manifest.byteLength || hasher.digest('hex') !== manifest.contentHash)
                fail();
              await unit(
                section,
                id,
                null,
                { outcome: 'available', ...manifest },
                async (index) => {
                  const r = await call(method, { ...input, index });
                  if (
                    r.outcome !== 'chunk' ||
                    r.index !== index ||
                    r.byteLength !== manifest.byteLength ||
                    r.chunkCount !== manifest.chunkCount ||
                    r.contentHash !== manifest.contentHash
                  )
                    fail();
                  return partBytes(r.chunkBase64);
                },
              );
              observe([method, input, manifest]);
            } finally {
              hasher.destroy();
            }
          }
          try {
            const ownRequest = { campaignId, sourceToken: own.sourceToken };
            for (const [kind, id] of [
              ['campaign', campaignId],
              ['progress', 'current'],
            ]) {
              await readChunked(
                'readCampaignBackupOwnContent',
                { ...ownRequest, kind, id, itemToken: own.sourceToken },
                'own:' + kind,
                id,
              );
              yield progress('own:' + kind);
              check();
            }
            for (const family of CAMPAIGN_OWN_FAMILIES)
              for await (const page of list('listCampaignBackupOwnInventory', {
                ...ownRequest,
                family,
              })) {
                for (const ref of page.items)
                  await readChunked(
                    'readCampaignBackupOwnContent',
                    { ...ownRequest, kind: family, id: ref.id, itemToken: ref.itemToken },
                    'own:' + family,
                    ref.id,
                  );
                yield progress('own:' + family);
                check();
              }
            if (derived.availability === 'available') {
              await readChunked(
                'readCampaignBackupBaseResource',
                {
                  ...request,
                  family: 'base',
                  id: derived.base.id,
                  resourceToken: derived.derivedToken,
                },
                'base',
                derived.base.id,
              );
              await witness('getCampaignBackupBaseWitness', request, 'base', derived.base.id);
              yield progress('base:snapshot');
              check();
              for await (const page of list('listCampaignBackupBaseItems', request)) {
                for (const ref of page.items) {
                  const input = { ...request, id: ref.id, itemToken: ref.itemToken };
                  await readChunked('readCampaignBackupBaseItem', input, 'base:item', ref.id);
                  const audit = await call('auditCampaignBackupBaseItem', input);
                  observe(['base:item', audit]);
                  await witness('getCampaignBackupItemWitness', input, 'item', ref.id);
                  if (audit.availability === 'available')
                    for (const field of audit.fields)
                      await unit(
                        'base:field',
                        ref.id,
                        field.field,
                        {
                          outcome: 'available',
                          byteLength: field.bytes,
                          chunkCount: field.chunkCount,
                          contentHash: field.sha256,
                        },
                        async (index) => {
                          const r = await call('readCampaignBackupBaseText', {
                            ...input,
                            field: field.field,
                            index,
                          });
                          if (
                            r.index !== index ||
                            r.fieldHash !== field.sha256 ||
                            r.fieldBytes !== field.bytes ||
                            r.fieldChunkCount !== field.chunkCount
                          )
                            fail();
                          return partBytes(r.chunkBase64);
                        },
                      );
                }
                yield progress('base:items');
                check();
              }
              for (const family of ['bodies', 'links', 'loreReferences', 'images'])
                for await (const page of list('listCampaignBackupBaseResources', {
                  ...request,
                  family,
                })) {
                  for (const ref of page.items) {
                    const input = { ...request, id: ref.id, resourceToken: ref.resourceToken };
                    if (family === 'images') {
                      const image = await call('getCampaignBackupImage', input);
                      observe(['base:image', image]);
                      await unit(
                        'image',
                        ref.id,
                        null,
                        image.outcome === 'unavailable'
                          ? { outcome: 'unavailable' }
                          : {
                              outcome: 'available',
                              contentType: image.contentType,
                              byteLength: image.byteLength,
                              chunkCount: image.chunkCount,
                              contentHash: image.contentHash,
                            },
                        async (index) => {
                          const r = await call('readCampaignBackupImageChunk', {
                            ...input,
                            imageToken: image.imageToken,
                            index,
                          });
                          if (
                            r.index !== index ||
                            r.byteLength !== image.byteLength ||
                            r.chunkCount !== image.chunkCount ||
                            r.imageToken !== image.imageToken
                          )
                            fail();
                          const bytes = partBytes(r.chunkBase64);
                          if (sha(bytes) !== r.chunkHash) fail();
                          return bytes;
                        },
                      );
                    } else
                      await readChunked(
                        'readCampaignBackupBaseResource',
                        { ...input, family },
                        'base:' + family,
                        ref.id,
                      );
                  }
                  yield progress('base:' + family);
                  check();
                }
            } else {
              await unit('base', null, null, { outcome: derived.availability });
              witnesses = counter(witnesses);
              fold(provenance, ['base', null, derived.availability, null]);
              if (pass === 'capture')
                await publish({
                  kind: 'witness',
                  id: String(witnesses - 1),
                  part: 0,
                  payload: Buffer.from(JSON.stringify(['base', null, derived.availability, null])),
                });
            }
            for await (const page of list('listCampaignBackupLoreVariants', request)) {
              for (const ref of page.items) {
                const input = { ...request, id: ref.id, variantToken: ref.variantToken },
                  variant = await call('readCampaignBackupLoreVariant', input),
                  coverage = await call('getCampaignBackupLoreBodyCoverage', input),
                  anchor = await call('readCampaignBackupLoreAnchor', input);
                observe(['lore:variant', variant.contentToken ?? variant, coverage]);
                if (variant.outcome === 'unavailable')
                  await unit('variant', ref.id, null, { outcome: 'unavailable' });
                else {
                  const encoded = Buffer.from(JSON.stringify(variant.content));
                  if (encoded.length !== variant.byteLength || sha(encoded) !== variant.contentHash)
                    fail();
                  await unit(
                    'variant',
                    ref.id,
                    null,
                    {
                      outcome: 'available',
                      byteLength: variant.byteLength,
                      chunkCount: Math.ceil(variant.byteLength / CHUNK),
                      contentHash: variant.contentHash,
                    },
                    (index) => encoded.subarray(index * CHUNK, (index + 1) * CHUNK),
                  );
                }
                observe(['lore:anchor', anchor.anchorToken ?? anchor]);
                await witness('getCampaignBackupLoreWitness', input, 'anchor', ref.id);
                if (anchor.outcome === 'unavailable')
                  await unit('anchor', ref.id, null, { outcome: 'unavailable' });
                else {
                  const encoded = Buffer.from(JSON.stringify(anchor.content));
                  if (encoded.length !== anchor.byteLength || sha(encoded) !== anchor.contentHash)
                    fail();
                  await unit(
                    'anchor',
                    anchor.content.anchorKey,
                    null,
                    {
                      outcome: 'available',
                      byteLength: anchor.byteLength,
                      chunkCount: Math.ceil(anchor.byteLength / CHUNK),
                      contentHash: anchor.contentHash,
                    },
                    (index) => encoded.subarray(index * CHUNK, (index + 1) * CHUNK),
                  );
                  for (const field of anchor.fields)
                    await unit(
                      'anchor:field',
                      anchor.content.anchorKey,
                      field.field,
                      {
                        outcome: 'available',
                        byteLength: field.bytes,
                        chunkCount: field.chunkCount,
                        contentHash: field.sha256,
                      },
                      async (index) => {
                        const r = await call('readCampaignBackupLoreAnchorText', {
                          ...input,
                          field: field.field,
                          index,
                        });
                        if (
                          r.outcome !== 'chunk' ||
                          r.index !== index ||
                          r.fieldHash !== field.sha256 ||
                          r.fieldBytes !== field.bytes ||
                          r.fieldChunkCount !== field.chunkCount
                        )
                          fail();
                        return partBytes(r.chunkBase64);
                      },
                    );
                }
              }
              yield progress('lore:variants');
              check();
            }
            for await (const page of list('listCampaignBackupLoreStores', request, 'scope')) {
              const stores = [page.legacy, ...page.items];
              // The legacy singleton is present on every store page; visit it only on the first.
              for (const store of stores) {
                if (store.scope === 'legacy' && pagesLegacy) continue;
                if (store.scope === 'legacy') pagesLegacy = true;
                for await (const bodies of list('listCampaignBackupLoreBodies', {
                  ...request,
                  scope: store.scope,
                  storeToken: store.storeToken,
                })) {
                  observe(['lore:bodies', store.scope, bodies.items]);
                  yield progress('lore:bodies');
                  check();
                }
              }
              yield progress('lore:stores');
              check();
            }
            for await (const page of list('probeCampaignBackupLoreBodies', request, 'path')) {
              observe(['lore:probe', page.items]);
              yield progress('lore:probe');
              check();
            }
            const finalOwn = await call('getCampaignBackupSource', {
                campaignId,
                expectedSourceToken: own.sourceToken,
              }),
              finalDerived = await call('getCampaignBackupDerivedSource', {
                campaignId,
                sourceToken: own.sourceToken,
                expectedDerivedToken: derived.derivedToken,
              });
            observe(['final-source', finalOwn, finalDerived]);
            return {
              inventory: Object.freeze({ pages, resources, digest: inventory.digest('hex') }),
              content: Object.freeze({
                units,
                bytes,
                chunks,
                omitted,
                unavailable,
                digest: content.digest('hex'),
              }),
              nativeDigest: native.digest('hex'),
              provenance: Object.freeze({
                units: witnesses,
                bytes: witnessBytes,
                digest: provenance.digest('hex'),
              }),
            };
          } finally {
            content.destroy();
            inventory.destroy();
            native.destroy();
            provenance.destroy();
          }
        }
        // Each pass retains only hashes, counters and its current bounded pages.
        const first = yield* scan('capture');
        const second = yield* scan('recheck');
        if (JSON.stringify(first) !== JSON.stringify(second)) fail();
        check();
        return Object.freeze({
          schemaVersion: 1,
          validation: 'campaign-native-audit',
          campaignId,
          sourceToken: own.sourceToken,
          derivedToken: derived.derivedToken,
          availability: derived.availability,
          ...first,
        });
      }
      const iterator = run(),
        pull = iterator.next.bind(iterator),
        finish = iterator.return.bind(iterator),
        raise = iterator.throw.bind(iterator);
      iterator.next = () => {
        const pending = pull();
        void pending.catch(() => {});
        return pending;
      };
      iterator.return = () => {
        controller.abort();
        void finish().catch(() => {});
        return Promise.resolve({ done: true, value: undefined });
      };
      iterator.throw = (error) => {
        controller.abort(error);
        void raise(error).catch(() => {});
        return Promise.reject(error);
      };
      return iterator;
    },
  };
}
