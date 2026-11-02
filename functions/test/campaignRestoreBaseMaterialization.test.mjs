import test from 'node:test';
import assert from 'node:assert/strict';
import {
  signedOriginCampaign,
  originRestoreFixture,
  uid,
  originMutation as mut,
  originRestoreId as rid,
} from './helpers/campaignOriginRestore.mjs';
import { finishOwnMaterialization } from './helpers/campaignOwnMaterialization.mjs';
import { createCampaignBaseReadService } from '../src/campaignBaseRead.mjs';
import { restoredBaseId } from '../src/campaignRestoreBaseFormat.mjs';
import { sha } from '../src/campaignRestoreContracts.mjs';
const root = 'users/' + uid + '/campaignRestores/' + rid;
let cached;
async function fixture(source) {
  cached ??= signedOriginCampaign({ long: true });
  const f = await originRestoreFixture(source ?? (await cached));
  f.p = await finishOwnMaterialization(f);
  return f;
}
const basePath = (f, p = f.p) =>
  'users/' + uid + '/campaignBases/' + restoredBaseId({ uid, rid, token: p.jobToken });
async function finish(f, p = f.p, limit = 25) {
  let n = 0;
  while (p.baseMaterialization?.phase !== 'ready' && n++ < 10000)
    p = (
      await f.api.advanceCampaignRestoreBase(
        uid,
        mut(p, 'base-copy-' + sha(JSON.stringify([rid, p.checkpoint])), { limit }),
      )
    ).progress;
  assert.equal(p.baseMaterialization.phase, 'ready');
  return p;
}
test('frozen base copies real long UTF8 and local/global lore into native schemas with original evidence', async () => {
  const f = await fixture(),
    p = await finish(f),
    result = await f.api.getCampaignRestoreBase(uid, { restoreId: rid, jobToken: p.jobToken }),
    path = basePath(f, p),
    base = f.records.get(path);
  assert.equal(result.availability, 'available');
  assert.equal(base.state, 'preparing');
  assert.equal(base.sourceMode, 'restored');
  assert.deepEqual(
    base.sourceEvidence.source,
    (await f.api.openCampaignRestoreDerivedIndex(uid, { restoreId: rid, jobToken: p.jobToken }))
      .context.active,
  );
  const items = [...f.records].filter(([k]) => k.startsWith(path + '/items/')).map(([, v]) => v);
  assert.ok(items.some((i) => i.kind === 'scene'));
  assert.ok(items.some((i) => i.origin.kind === 'adventure-lore'));
  assert.ok(items.some((i) => i.origin.kind === 'lore'));
  for (const item of items) {
    const old = f.original.items().find((i) => i.sourceKey === item.sourceKey);
    assert.equal(item.title, old.title);
    assert.deepEqual(item.origin, old.origin);
    assert.deepEqual(item.fields, old.fields);
  }
  for (const [key, body] of f.records) {
    if (!key.startsWith(path + '/bodies/')) continue;
    assert.deepEqual(body, f.original.records.get(f.original.basePath + key.slice(path.length)));
  }
  assert.equal(f.records.get('campaigns/' + p.campaignId).ownerId, undefined);
  assert.doesNotMatch(JSON.stringify(p), /payload|snapshot|title|hashState/);
  const draft = await f.api.getCampaignRestoreOwnProject(uid, {
    restoreId: rid,
    jobToken: p.jobToken,
  });
  // Only the fixture releases pending roots to exercise existing ordinary readers.
  f.records.set('campaigns/' + p.campaignId, {
    ...draft.project,
    ownerId: uid,
    schemaVersion: 1,
    revision: 1,
    activeBaseId: result.baseId,
    provenance: { kind: 'original', adventureId: base.adventureId, baseId: result.baseId },
  });
  f.records.set(path, { ...base, state: 'ready' });
  const api = createCampaignBaseReadService({ db: f.db, assets: f.original.storage });
  const header = await api.getCampaignBase(uid, { campaignId: p.campaignId });
  assert.equal(header.source.title, base.snapshot.title);
  for (const item of items) {
    const read = await api.readCampaignBaseItem(uid, {
      campaignId: p.campaignId,
      sourceKey: item.sourceKey,
      limit: 8,
    });
    assert.equal(read.item.title, item.title);
  }
});
test('a missing source materializes no base prose while keeping own project ready', async () => {
  const f = await fixture();
  for (const path of [...f.records.keys()])
    if (path.startsWith('adventures/')) f.records.delete(path);
  const p = await finish(f),
    result = await f.api.getCampaignRestoreBase(uid, { restoreId: rid, jobToken: p.jobToken });
  assert.equal(result.availability, 'unavailable');
  assert.equal(result.baseId, null);
  assert.equal(f.records.has(basePath(f, p)), false);
  assert.ok(![...f.records.keys()].some((k) => k.startsWith(basePath(f, p) + '/')));
  assert.equal(p.ownMaterialization.phase, 'ready');
});

import { createCampaignRestoreTransferService } from '../src/campaignRestoreTransfer.mjs';
import { rewriteCampaignBackupTestFile } from './helpers/campaignBackupRewrite.mjs';
async function beforeField(f) {
  const port = await f.api.openCampaignRestoreDerivedIndex(uid, {
      restoreId: rid,
      jobToken: f.p.jobToken,
    }),
    rows = [];
  for (let n = 0; n < port.certificate.rows; n += 25)
    rows.push(...(await port.read(n, Math.min(25, port.certificate.rows - n))));
  const first = rows.find(
    (r) =>
      r.section === 'base:field' &&
      rows
        .find((i) => i.section === 'base:item' && i.value.unit.id === r.value.unit.id)
        .value.meta.fields.find((x) => x.field === r.value.unit.field).bodySourceKey ===
        r.value.unit.id,
  );
  let p = f.p;
  while ((p.baseMaterialization?.processedRows ?? 0) < first.index)
    p = (
      await f.api.advanceCampaignRestoreBase(
        uid,
        mut(p, 'base-before-field-' + p.checkpoint, { limit: 1 }),
      )
    ).progress;
  return { p, row: first, port };
}
test('legacy fixed-byte UTF8 fields are repacked into native complete chunks without changing text or hashes', async () => {
  const original = await signedOriginCampaign({ long: true });
  await rewriteCampaignBackupTestFile(original, (groups) => {
    groups[0].value.contentVersion = 1;
    for (const g of groups)
      if (g.kind === 'unit' && ['base:field', 'anchor:field'].includes(g.unit.section)) {
        const bytes = Buffer.concat(g.chunks);
        g.chunks = [];
        for (let n = 0; n < Math.ceil(bytes.length / 65536); n++)
          g.chunks.push(bytes.subarray(n * 65536, (n + 1) * 65536));
        if (!bytes.length) g.chunks.push(Buffer.alloc(0));
      }
  });
  const f = await fixture(original),
    p = await finish(f, undefined, 1),
    path = basePath(f, p);
  for (const [key, value] of f.records) {
    if (!key.startsWith(path + '/items/')) continue;
    for (const field of value.fields) {
      const chunks = [...f.records]
          .filter(
            ([k, b]) =>
              k.startsWith(path + '/bodies/') &&
              b.sourceKey === field.bodySourceKey &&
              b.field === field.field,
          )
          .map(([, b]) => b)
          .sort((a, b) => a.index - b.index),
        joined = chunks.map((c) => c.content).join('');
      assert.equal(sha(joined), field.sha256);
      assert.equal(Buffer.byteLength(joined), field.bytes);
      assert.equal(chunks.length, field.chunkCount);
    }
  }
});
test('global world loss omits global lore but preserves authorized local lore and adventure text', async () => {
  const f = await fixture();
  f.records.delete('universes/world');
  const p = await finish(f),
    items = [...f.records]
      .filter(([k]) => k.startsWith(basePath(f, p) + '/items/'))
      .map(([, v]) => v);
  assert.ok(!items.some((i) => i.origin.kind === 'lore'));
  assert.ok(items.some((i) => i.origin.kind === 'adventure-lore'));
  assert.ok(items.some((i) => i.kind === 'scene'));
});
for (const point of [0, 1, 2, 3, 4])
  test(
    'base native write rollback ' + point + ' preserves checkpoint, body and journal',
    async () => {
      const f = await fixture(),
        { p } = await beforeField(f),
        before = structuredClone([...f.records]),
        run = f.db.runTransaction.bind(f.db),
        request = mut(p, 'base-native-rollback-operation', { limit: 1 });
      f.db.runTransaction = (fn) =>
        run((tx) => {
          const wrapped = { ...tx };
          let n = 0;
          for (const method of ['create', 'set'])
            wrapped[method] = (ref, ...args) => {
              const result = tx[method](ref, ...args);
              if (n++ === point) throw Error('base-rollback');
              return result;
            };
          return fn(wrapped);
        });
      await assert.rejects(f.api.advanceCampaignRestoreBase(uid, request), /base-rollback/);
      assert.deepEqual([...f.records], before);
      f.db.runTransaction = run;
      const result = await f.api.advanceCampaignRestoreBase(uid, request);
      assert.equal(result.progress.baseMaterialization.written, p.baseMaterialization.written + 1);
    },
  );
test('source revocation during payload I/O prevents the body write and permits retry only after current access returns', async () => {
  const f = await fixture(),
    { p, port } = await beforeField(f),
    adventure = 'adventures/' + port.context.active.adventure.id,
    open = f.api.openCampaignRestoreSource.bind(f.api),
    beforeJob = structuredClone(f.records.get(root));
  f.api.openCampaignRestoreSource = async (...args) => {
    const source = await open(...args);
    return {
      ...source,
      read: async (...readArgs) => {
        const bytes = await source.read(...readArgs);
        f.records.get(adventure).ownerId = 'other';
        return bytes;
      },
    };
  };
  const request = mut(p, 'base-late-revocation-operation', { limit: 1 });
  await assert.rejects(
    f.api.advanceCampaignRestoreBase(uid, request),
    (e) => e.details?.reason === 'campaign-backup-origin-changed',
  );
  assert.deepEqual(f.records.get(root), beforeJob);
  f.records.get(adventure).ownerId = uid;
  f.api.openCampaignRestoreSource = open;
  assert.equal(
    (await f.api.advanceCampaignRestoreBase(uid, request)).progress.checkpoint,
    p.checkpoint + 1,
  );
});
test('source denial before field I/O never reads its bytes or advances a partial permitted item', async () => {
  const f = await fixture(),
    { p, port } = await beforeField(f),
    open = f.api.openCampaignRestoreSource.bind(f.api);
  f.records.get('adventures/' + port.context.active.adventure.id).ownerId = 'other';
  let reads = 0;
  f.api.openCampaignRestoreSource = async (...args) => {
    const source = await open(...args);
    return {
      ...source,
      read: async (...readArgs) => {
        reads++;
        return source.read(...readArgs);
      },
    };
  };
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreBase(
      uid,
      mut(p, 'base-before-read-denied-operation', { limit: 1 }),
    ),
  );
  assert.equal(reads, 0);
  assert.deepEqual([...f.records], before);
});
test('two base workers commit one body and old exact receipts survive service recreation and cancellation', async () => {
  const f = await fixture(),
    { p } = await beforeField(f),
    requests = [
      mut(p, 'base-native-race-first', { limit: 1 }),
      mut(p, 'base-native-race-second', { limit: 1 }),
    ],
    results = await Promise.allSettled(
      requests.map((r) => f.api.advanceCampaignRestoreBase(uid, r)),
    );
  assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1);
  assert.equal(
    results.find((r) => r.status === 'rejected').reason.details.reason,
    'checkpoint-conflict',
  );
  const winner = results.findIndex((r) => r.status === 'fulfilled'),
    first = results[winner].value;
  f.api = createCampaignRestoreTransferService({ db: f.db, keys: f.keys, now: () => 7000 });
  const done = await finish(f, first.progress);
  await f.api.cancelCampaignRestore(uid, mut(done, 'base-native-race-cancel'));
  assert.deepEqual(
    (await f.api.advanceCampaignRestoreBase(uid, requests[winner])).receipt,
    first.receipt,
  );
});
test('cancel while source payload is held prevents a late derived write', async () => {
  const f = await fixture(),
    { p } = await beforeField(f),
    open = f.api.openCampaignRestoreSource.bind(f.api);
  let entered,
    release,
    blocked = false;
  const arrival = new Promise((r) => (entered = r)),
    gate = new Promise((r) => (release = r));
  f.api.openCampaignRestoreSource = async (...args) => {
    const source = await open(...args);
    return {
      ...source,
      read: async (...readArgs) => {
        const bytes = await source.read(...readArgs);
        if (!blocked) {
          blocked = true;
          entered();
          await gate;
        }
        return bytes;
      },
    };
  };
  const pending = f.api
    .advanceCampaignRestoreBase(uid, mut(p, 'base-held-copy-operation', { limit: 1 }))
    .then(
      (value) => ({ value }),
      (error) => ({ error }),
    );
  await arrival;
  const c = await f.api.cancelCampaignRestore(uid, mut(p, 'base-held-cancel-operation'));
  release();
  assert.ok((await pending).error);
  assert.equal(c.progress.baseMaterialization.written, p.baseMaterialization.written);
  assert.equal(f.records.get(root).baseMaterialization.payload, null);
});
test('cleanup preserves the base parent when an unregistered body exists, then collects all known resources without source access', async () => {
  const f = await fixture(),
    p = await finish(f),
    path = basePath(f, p),
    foreign = path + '/bodies/foreign';
  f.records.set(foreign, {
    sourceKey: 'FOREIGN',
    field: 'secret',
    index: 0,
    content: 'FOREIGN PROSE',
  });
  for (const k of [...f.records.keys()]) if (k.startsWith('adventures/')) f.records.delete(k);
  let next = (await f.api.cancelCampaignRestore(uid, mut(p, 'base-cleanup-parent-cancel')))
      .progress,
    failed = false;
  for (let n = 0; n < 1000; n++) {
    const before = structuredClone([...f.records]);
    try {
      next = (
        await f.api.advanceCampaignRestoreCleanup(
          uid,
          mut(next, 'base-cleanup-parent-' + next.checkpoint, { limit: 3 }),
        )
      ).progress;
    } catch {
      assert.deepEqual([...f.records], before);
      failed = true;
      break;
    }
  }
  assert.ok(failed);
  assert.ok(f.records.has(path));
  assert.ok(f.records.has(foreign));
  f.records.delete(foreign);
  const run = f.db.runTransaction.bind(f.db);
  let proseReads = 0;
  f.db.runTransaction = (fn) =>
    run((tx) =>
      fn({
        ...tx,
        getAll: async (ref, options) => {
          if (ref.path.startsWith(path)) {
            if (
              options.fieldMask.some((k) =>
                ['content', 'title', 'snapshot', 'structured'].includes(k),
              )
            )
              proseReads++;
          }
          return tx.getAll(ref, options);
        },
      }),
    );
  for (let n = 0; next.state !== 'cancelled' && n < 1000; n++)
    next = (
      await f.api.advanceCampaignRestoreCleanup(
        uid,
        mut(next, 'base-cleanup-final-' + next.checkpoint, { limit: 3 }),
      )
    ).progress;
  assert.equal(next.state, 'cancelled');
  assert.equal(proseReads, 0);
  assert.ok(![...f.records.keys()].some((k) => k === path || k.startsWith(path + '/')));
  assert.ok(![...f.records.keys()].some((k) => k.startsWith(root + '/baseWrites/')));
});
test('recreated body and signing-key revocation withhold a base certificate and preserve storage', async () => {
  const f = await fixture();
  let p = f.p;
  while (p.baseMaterialization?.phase !== 'audit')
    p = (
      await f.api.advanceCampaignRestoreBase(
        uid,
        mut(p, 'base-before-audit-' + p.checkpoint, { limit: 25 }),
      )
    ).progress;
  const body = [...f.records.keys()].find((k) => k.startsWith(basePath(f, p) + '/bodies/')),
    m = f.metadata.get(body);
  f.metadata.set(body, {
    ...m,
    createdAtNanoseconds: m.createdAtNanoseconds + 50000,
    updatedAtNanoseconds: m.createdAtNanoseconds + 50000,
  });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreBase(uid, mut(p, 'base-invalid-audit-operation', { limit: 25 })),
  );
  assert.deepEqual([...f.records], before);
  f.keys[0].state = 'revoked';
  await assert.rejects(
    f.api.advanceCampaignRestoreBase(uid, mut(p, 'base-revoked-audit-operation', { limit: 25 })),
    (e) => e.details?.reason === 'campaign-backup-invalid-attestation',
  );
});
test('locators are private additive metadata and signed legacy indexes without them refuse materialization without resetting', async () => {
  const f = await fixture(),
    { p, row, port } = await beforeField(f);
  assert.equal(Object.hasOwn(row, 'location'), false);
  const location = await port.locate(row.section, row.key);
  assert.ok(location.start);
  assert.match(location.id, /^[0-9]+$/);
  const original = f.api.openCampaignRestoreDerivedIndex.bind(f.api);
  f.api.openCampaignRestoreDerivedIndex = async (...args) => ({
    ...(await original(...args)),
    locate: async () => null,
  });
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreBase(
      uid,
      mut(p, 'base-old-index-location-operation', { limit: 1 }),
    ),
    (e) => e.details?.reason === 'derived-index-location-missing',
  );
  assert.deepEqual([...f.records], before);
});

test('a temporary adventure denial while selecting an item cannot silently omit it after the base was permitted', async () => {
  const f = await fixture(),
    port = await f.api.openCampaignRestoreDerivedIndex(uid, {
      restoreId: rid,
      jobToken: f.p.jobToken,
    }),
    rows = [];
  for (let n = 0; n < port.certificate.rows; n += 25)
    rows.push(...(await port.read(n, Math.min(25, port.certificate.rows - n))));
  const item = rows.find((r) => r.section === 'base:item' && r.value.unit.outcome === 'available');
  let p = f.p;
  while ((p.baseMaterialization?.processedRows ?? 0) < item.index)
    p = (
      await f.api.advanceCampaignRestoreBase(
        uid,
        mut(p, 'base-before-selection-' + p.checkpoint, { limit: 1 }),
      )
    ).progress;
  const source = f.records.get('adventures/' + port.context.active.adventure.id);
  source.ownerId = 'other';
  const before = structuredClone([...f.records]);
  await assert.rejects(
    f.api.advanceCampaignRestoreBase(uid, mut(p, 'base-denied-selection-operation', { limit: 1 })),
    (e) => e.details?.reason === 'campaign-backup-origin-changed',
  );
  assert.deepEqual([...f.records], before);
  source.ownerId = uid;
  p = await finish(f, p);
  assert.equal(
    (await f.api.getCampaignRestoreBase(uid, { restoreId: rid, jobToken: p.jobToken })).omitted,
    0,
  );
});

import { advanceRestoredBaseField } from '../src/campaignRestoreBaseField.mjs';
import { campaignFieldChunk } from '../src/campaignBackupTextChunks.mjs';
test('a 2 MiB legacy field changes native chunk count while preserving BOM, exact text and bounded recovery state', async () => {
  const size = 2 * 1024 * 1024,
    text = '\ufeff' + '龍'.repeat(Math.floor((size - 3) / 3)) + 'A'.repeat((size - 3) % 3),
    bytes = Buffer.from(text),
    chunks = Math.ceil(bytes.length / 65536),
    unit = { byteLength: bytes.length, chunkCount: chunks, contentHash: sha(bytes) },
    state = {
      id: '123',
      part: 0,
      written: 0,
      bytes: 0,
      pending: '',
      hashState: null,
      previousLength: null,
    },
    output = [];
  for (let n = 0; n < chunks; n++) {
    const result = await advanceRestoredBaseField(
      state,
      unit,
      { kind: 'data', id: '123', part: n, payload: bytes.subarray(n * 65536, (n + 1) * 65536) },
      1,
    );
    output.push(...result.chunks.map((c) => c.content));
    assert.ok(Buffer.from(state.pending, 'base64').length <= 128);
    assert.ok(Buffer.byteLength(JSON.stringify(state)) < 8192);
    Object.assign(state, JSON.parse(JSON.stringify(state)));
  }
  assert.ok(output.length > chunks);
  assert.equal(output.join(''), text);
  let previous;
  for (let n = 0; n < output.length; n++) {
    const value = Buffer.from(output[n]);
    assert.equal(campaignFieldChunk(value, n, output.length, bytes.length, previous), true);
    previous = value.length;
  }
});
