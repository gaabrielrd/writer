import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import {
  comparisonFixture,
  startComparison,
  finishComparison,
  comparisonRows,
  uid,
  adventureId,
  op,
} from './helpers/campaignComparison.mjs';
import { basePath, baseSourceKey, baseTextFields, digest } from '../src/campaignBaseContracts.mjs';
import { comparisonPath } from '../src/campaignComparisonContracts.mjs';

async function fixture() {
  const f = studioDb();
  return { ...f, ...(await comparisonFixture(f.db)) };
}
const revisionConflict = (error) => error.details?.reason === 'revision-conflict';
test('complete candidate captures seven families, references and root metadata without changing the campaign/base/notes/variants', async () => {
  const f = await fixture(),
    root = structuredClone(f.records.get('campaigns/' + f.campaign.id));
  f.records.get('adventures/' + adventureId).synopsis = 'Outra sinopse';
  f.records.set('campaigns/' + f.campaign.id + '/notes/own', { content: 'Nota própria' });
  const { result } = await startComparison(f),
    p = await finishComparison(f, result);
  assert.deepEqual(f.records.get('campaigns/' + f.campaign.id), root);
  assert.equal(f.records.get('campaigns/' + f.campaign.id + '/notes/own').content, 'Nota própria');
  assert.equal([...f.records.keys()].filter((k) => /^campaigns\/[^/]+$/.test(k)).length, 1);
  const source = (await comparisonRows(f, p, 'source'))[0];
  assert.equal(source.change, 'changed');
  assert.equal(source.candidateSummary.synopsis, 'Outra sinopse');
  const rows = await comparisonRows(f, p, 'items');
  assert.deepEqual(
    [...new Set(rows.map((row) => row.candidateSummary.kind))].sort(),
    ['part', 'scene', 'block', 'arc', 'milestone', 'event', 'lore'].sort(),
  );
  assert.equal(
    rows.every((row) => row.change === 'unchanged'),
    true,
  );
  assert.equal((await comparisonRows(f, p, 'references')).length, 2);
  assert.equal((await comparisonRows(f, p, 'images'))[0].change, 'unchanged');
  assert.equal(p.counts.loreReference, 1);
  const key = baseSourceKey({ adventureId, kind: 'scene', id: f.scene.id });
  const current = await f.reader.readCampaignComparisonItem(uid, {
    comparisonId: p.comparisonId,
    sourceKey: key,
    side: 'current',
  });
  assert.equal(current.side, 'current');
  assert.equal(current.key, key);
  assert.equal(current.chunks[0].content, '<p>Original 🐉</p>');
  assert.equal(current.currentCapturedAt, source.currentCapturedAt ?? current.currentCapturedAt);
  assert.equal(
    current.comparisonToken,
    (
      await f.reader.listCampaignComparisonChanges(uid, {
        comparisonId: p.comparisonId,
        group: 'source',
      })
    ).comparisonToken,
  );
});
test('exact receipts survive later progress; CAS, changed payload, UID and nanosecond changes reject or abort durably', async () => {
  const f = await fixture(),
    { input, result } = await startComparison(f);
  let p = result.progress;
  const step = {
    comparisonId: p.comparisonId,
    operationId: op('step'),
    expectedCheckpoint: p.checkpoint,
  };
  const first = await f.api.advanceCampaignComparison(uid, step);
  p = first.progress;
  await assert.rejects(
    f.api.advanceCampaignComparison(uid, { ...step, operationId: op('race') }),
    revisionConflict,
  );
  const second = await f.api.advanceCampaignComparison(uid, {
    comparisonId: p.comparisonId,
    operationId: op('step2'),
    expectedCheckpoint: p.checkpoint,
  });
  const replay = await f.api.advanceCampaignComparison(uid, step);
  assert.deepEqual(replay.receipt, first.receipt);
  assert.equal(replay.progress.checkpoint, second.progress.checkpoint);
  assert.equal(
    (await f.api.startCampaignComparison(uid, input)).progress.checkpoint,
    second.progress.checkpoint,
  );
  await assert.rejects(
    f.api.startCampaignComparison(uid, { ...input, expectedSourceToken: 'f'.repeat(64) }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(f.api.getCampaignComparison('other', { comparisonId: p.comparisonId }), {
    code: 'not-found',
  });
  f.metadata.set('adventures/' + adventureId, { updatedAtNanoseconds: 888 });
  const aborted = await f.api.advanceCampaignComparison(uid, {
    comparisonId: p.comparisonId,
    operationId: op('aborted'),
    expectedCheckpoint: second.progress.checkpoint,
  });
  assert.equal(aborted.progress.state, 'aborted');
  assert.equal(aborted.progress.reason, 'source-changed');
  assert.equal(f.records.get(basePath(uid, p.candidateBaseId)).state, 'aborted');
});
test('never received start can be fenced without root, delayed start stays canceled; known resolve never cancels the job', async () => {
  const f = await fixture(),
    { input, result } = await startComparison(f);
  const known = await f.api.resolveCampaignComparisonStart(uid, { ...input, intent: 'cancel' });
  assert.equal(known.kind, 'confirmed');
  assert.equal(known.progress.state, 'preparing');
  f.records.delete('campaigns/' + f.campaign.id);
  const unseen = { ...input, operationId: op('unseen') };
  const cancel = await f.api.resolveCampaignComparisonStart(uid, { ...unseen, intent: 'cancel' });
  assert.deepEqual(cancel, { kind: 'canceled', schemaVersion: 1, ownerId: uid, request: unseen });
  assert.deepEqual(await f.api.startCampaignComparison(uid, unseen), cancel);
  assert.equal(f.records.has(comparisonPath(uid, unseen.operationId)), false);
  const p = await f.api.getCampaignComparison(uid, { comparisonId: result.progress.comparisonId });
  assert.equal(p.sourceAvailable, false);
  assert.equal(p.processed, null);
  assert.equal(p.counts, null);
  let state = p;
  for (let n = 0; n < 20 && state.state !== 'deleted'; n++)
    state = (
      await f.api.cancelCampaignComparison(uid, {
        comparisonId: state.comparisonId,
        operationId: op('clean-' + state.checkpoint),
        expectedCheckpoint: state.checkpoint,
      })
    ).progress;
  assert.equal(state.cleanupComplete, true);
  assert.equal(f.records.has(basePath(uid, p.candidateBaseId)), false);
});
test('ready comparison distinguishes changes and real removals from authorization loss; empty filtered windows progress and tokens isolate filters', async () => {
  const f = await fixture(),
    { result } = await startComparison(f),
    p = await finishComparison(f, result);
  const path = basePath(uid, p.candidateBaseId),
    items = [...f.records].filter(([key]) => key.startsWith(path + '/items/'));
  const scene = items.find(([, v]) => v.kind === 'scene');
  f.records.get(scene[0]).title = 'Título modificado';
  const rows = await comparisonRows(f, p, 'items', { change: 'changed', limit: 1 });
  assert.equal(rows.length, 1);
  const first = await f.reader.listCampaignComparisonChanges(uid, {
    comparisonId: p.comparisonId,
    group: 'items',
    change: 'added',
    limit: 1,
  });
  assert.equal(first.items.length, 0);
  assert.ok(first.nextCursor);
  await assert.rejects(
    f.reader.listCampaignComparisonChanges(uid, {
      comparisonId: p.comparisonId,
      group: 'items',
      change: 'removed',
      cursor: first.nextCursor,
    }),
    (error) => error.details?.reason === 'cursor-invalidated',
  );
  const loreKey = baseSourceKey({ kind: 'lore', scopeId: 'world', id: 'hero' });
  f.records.delete(path + '/items/' + loreKey);
  assert.equal((await comparisonRows(f, p, 'items', { kind: 'lore' }))[0].change, 'removed');
  f.records.delete('universes/world/lore/hero');
  assert.deepEqual(await comparisonRows(f, p, 'items', { kind: 'lore' }), []);
  const refs = await comparisonRows(f, p, 'references');
  assert.equal(
    refs.every(
      (row) =>
        row.currentSummary.targetKey === null &&
        row.candidateSummary.targetKey === null &&
        row.change === 'unchanged',
    ),
    true,
  );
});
test('rank rebalance preserves author order; adjacent insertion marks context without exposing technical ranks', async () => {
  const f = await fixture(),
    { result } = await startComparison(f),
    p = await finishComparison(f, result);
  const current = basePath(uid, p.currentBaseId),
    candidate = basePath(uid, p.candidateBaseId);
  for (const [path, value] of [...f.records])
    if (path.startsWith(candidate + '/items/') && value.kind !== 'lore')
      f.records.get(path).orderKey = 'rebalance-' + value.orderKey;
  assert.equal(
    (await comparisonRows(f, p, 'items')).every((row) => row.change === 'unchanged'),
    true,
  );
  const key = digest({ extra: 'order' }),
    origin = { adventureId, kind: 'part', id: 'extra' },
    text = baseTextFields(key, { legacyContent: '' });
  const a = [...f.records.values()].find((v) => v.kind === 'part' && v.sourceKey);
  f.records.set(candidate + '/items/' + key, {
    ...a,
    sourceKey: key,
    origin,
    title: 'Parte inserida',
    orderKey: 'zzzz',
    fields: text.fields,
  });
  const rows = await comparisonRows(f, p, 'items', { kind: 'part' });
  assert.equal(
    rows.some((row) => row.change === 'added'),
    true,
  );
  assert.equal(
    rows.some((row) => row.orderContextChanged),
    true,
  );
  assert.equal(JSON.stringify(rows).includes('orderKey'), false);
  assert.ok([...f.records.keys()].some((key) => key.startsWith(current + '/items/')));
});

test('lazy image authorizes both sides around I/O and candidate cleanup releases only its pin after a failed retry', async () => {
  const f = await fixture(),
    { result } = await startComparison(f),
    p = await finishComparison(f, result);
  const library = f.records.get('users/' + uid + '/imageLibrary/' + f.imageId),
    key = digest({ imageId: f.imageId });
  assert.equal(library.useCount, 3);
  const media = await f.reader.readCampaignComparisonImage(uid, {
    comparisonId: p.comparisonId,
    imageKey: key,
    side: 'candidate',
  });
  assert.equal(media.key, key);
  assert.equal(media.side, 'candidate');
  assert.ok(media.dataUrl.startsWith('data:image/webp;base64,'));
  const originalRead = f.assets.readGeneration;
  f.assets.readGeneration = async () => {
    f.records.delete('adventures/' + adventureId);
    return Buffer.from('webp');
  };
  await assert.rejects(
    f.reader.readCampaignComparisonImage(uid, {
      comparisonId: p.comparisonId,
      imageKey: key,
      side: 'current',
    }),
    { code: 'not-found' },
  );
  f.assets.readGeneration = originalRead;
  let state = (
    await f.api.cancelCampaignComparison(uid, {
      comparisonId: p.comparisonId,
      operationId: op('cleanup-start'),
      expectedCheckpoint: p.checkpoint,
    })
  ).progress;
  const before = structuredClone(state);
  library.useCount = 0;
  await assert.rejects(
    f.api.cancelCampaignComparison(uid, {
      comparisonId: p.comparisonId,
      operationId: op('cleanup-fail'),
      expectedCheckpoint: state.checkpoint,
    }),
  );
  assert.equal(
    (await f.api.getCampaignComparison(uid, { comparisonId: p.comparisonId })).checkpoint,
    before.checkpoint,
  );
  library.useCount = 3;
  for (let n = 0; n < 30 && state.state !== 'deleted'; n++)
    state = (
      await f.api.cancelCampaignComparison(uid, {
        comparisonId: state.comparisonId,
        operationId: op('cleanup-rest-' + state.checkpoint),
        expectedCheckpoint: state.checkpoint,
      })
    ).progress;
  assert.equal(state.state, 'deleted');
  assert.equal(f.records.get('users/' + uid + '/imageLibrary/' + f.imageId).useCount, 2);
  assert.ok(f.records.has(basePath(uid, p.currentBaseId)));
});

test('body windows verify large UTF8 completely and collection changes invalidate every comparison cursor', async () => {
  const f = await fixture(),
    { result } = await startComparison(f),
    p = await finishComparison(f, result);
  const path = basePath(uid, p.candidateBaseId),
    key = baseSourceKey({ adventureId, kind: 'scene', id: f.scene.id }),
    item = f.records.get(path + '/items/' + key);
  const content = '🐉 "texto"\n'.repeat(15000),
    text = baseTextFields(key, { content });
  item.fields = text.fields;
  for (const chunk of text.bodies)
    f.records.set(
      path + '/bodies/' + digest({ sourceKey: key, field: chunk.field, index: chunk.index }),
      chunk,
    );
  const page = await f.reader.readCampaignComparisonItem(uid, {
    comparisonId: p.comparisonId,
    sourceKey: key,
    side: 'candidate',
    limit: 1,
  });
  assert.ok(page.nextCursor);
  assert.equal(page.item.fields[0].bytes, Buffer.byteLength(content));
  await assert.rejects(
    f.reader.readCampaignComparisonItem(uid, {
      comparisonId: p.comparisonId,
      sourceKey: key,
      side: 'current',
      cursor: page.nextCursor,
    }),
    (error) => error.details?.reason === 'cursor-invalidated',
  );
  f.records.set('campaigns/' + p.campaignId + '/loreVariantState/current', {
    schemaVersion: 1,
    ownerId: uid,
    campaignId: p.campaignId,
    campaignToken: p.campaignToken,
    baseId: p.currentBaseId,
    revision: 1,
  });
  await assert.rejects(
    f.reader.readCampaignComparisonItem(uid, {
      comparisonId: p.comparisonId,
      sourceKey: key,
      side: 'candidate',
      cursor: page.nextCursor,
    }),
    (error) => error.details?.reason === 'cursor-invalidated',
  );
  f.records.get(
    path + '/bodies/' + digest({ sourceKey: key, field: 'content', index: text.bodies.length - 1 }),
  ).content = 'corrompido';
  await assert.rejects(
    f.reader.readCampaignComparisonItem(uid, {
      comparisonId: p.comparisonId,
      sourceKey: key,
      side: 'candidate',
      limit: 1,
    }),
    { code: 'failed-precondition' },
  );
});

test('hundred relation targets use metadata masks; paginated union retains every identity and hides live text', async () => {
  const f = await fixture(),
    { result } = await startComparison(f),
    p = await finishComparison(f, result),
    hero = baseSourceKey({ kind: 'lore', scopeId: 'world', id: 'hero' });
  const template = f.records.get(basePath(uid, p.currentBaseId) + '/items/' + hero);
  for (let n = 0; n < 100; n++) {
    const entityId = 'target-' + n,
      key = baseSourceKey({ kind: 'lore', scopeId: 'world', id: entityId }),
      side = n < 50 ? p.currentBaseId : p.candidateBaseId;
    f.records.set('universes/world/lore/' + entityId, {
      name: 'Alvo',
      details: 'PRIVATE LIVE'.repeat(30000),
    });
    f.records.set(basePath(uid, side) + '/items/' + key, {
      ...structuredClone(template),
      sourceKey: key,
      title: 'Alvo ' + n,
      origin: { kind: 'lore', scopeId: 'world', id: entityId },
      structured: { ...template.structured, relations: [] },
    });
  }
  for (const [side, start] of [
    [p.currentBaseId, 0],
    [p.candidateBaseId, 50],
  ])
    f.records.get(basePath(uid, side) + '/items/' + hero).structured.relations = Array.from(
      { length: 50 },
      (_, n) => ({
        targetEntityId: 'universe:world:target-' + (start + n),
        relationType: 'Conhece',
        description: 'Relação',
      }),
    );
  f.metadataReads.length = 0;
  const rows = await comparisonRows(f, p, 'items', { kind: 'lore', limit: 1 });
  assert.equal(rows.length, 101);
  assert.equal(new Set(rows.map((row) => row.key)).size, 101);
  assert.equal(rows.find((row) => row.key === hero).change, 'changed');
  const live = f.metadataReads.filter((read) => read.path.startsWith('universes/world/lore/'));
  assert.ok(live.length >= 100);
  assert.equal(
    live.every((read) => read.fields.length === 1 && read.fields[0] === 'deleting'),
    true,
  );
  assert.equal(JSON.stringify(rows).includes('PRIVATE LIVE'), false);
});

test('invalid scopes and closed filters reject without writes; changed active base aborts and active candidate cannot be deleted', async () => {
  const f = await fixture(),
    { input, result } = await startComparison(f),
    p = result.progress,
    before = f.records.size;
  await assert.rejects(f.api.startCampaignComparison(uid, { ...input, unexpected: true }), {
    code: 'invalid-argument',
  });
  await assert.rejects(
    f.reader.listCampaignComparisonChanges(uid, {
      comparisonId: p.comparisonId,
      group: 'images',
      kind: 'lore',
    }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.reader.readCampaignComparisonItem(uid, {
      comparisonId: p.comparisonId,
      sourceKey: 'bad',
      side: 'candidate',
    }),
    { code: 'invalid-argument' },
  );
  await assert.rejects(
    f.reader.readCampaignComparisonImage(uid, {
      comparisonId: p.comparisonId,
      imageKey: 'a'.repeat(64),
      side: 'wrong',
    }),
    { code: 'invalid-argument' },
  );
  assert.equal(f.records.size, before);
  const campaign = f.records.get('campaigns/' + p.campaignId);
  campaign.activeBaseId = p.candidateBaseId;
  campaign.provenance.baseId = p.candidateBaseId;
  const aborted = await f.api.advanceCampaignComparison(uid, {
    comparisonId: p.comparisonId,
    operationId: op('base-switched'),
    expectedCheckpoint: p.checkpoint,
  });
  assert.equal(aborted.progress.reason, 'base-changed');
  assert.equal(aborted.progress.state, 'aborted');
  await assert.rejects(
    f.api.cancelCampaignComparison(uid, {
      comparisonId: p.comparisonId,
      operationId: op('protect-active'),
      expectedCheckpoint: aborted.progress.checkpoint,
    }),
    { code: 'failed-precondition' },
  );
});

test('absent item still validates its cursor instead of silently accepting malformed or foreign windows', async () => {
  const f = await fixture(),
    { result } = await startComparison(f),
    p = await finishComparison(f, result);
  const input = { comparisonId: p.comparisonId, sourceKey: 'f'.repeat(64), side: 'candidate' };
  const missing = await f.reader.readCampaignComparisonItem(uid, input);
  assert.equal(missing.item, null);
  assert.deepEqual(missing.chunks, []);
  await assert.rejects(f.reader.readCampaignComparisonItem(uid, { ...input, cursor: 'bad!' }), {
    code: 'invalid-argument',
  });
  const foreign = Buffer.from(
    JSON.stringify({ version: 1, scope: { uid: 'other' }, index: 0 }),
  ).toString('base64url');
  await assert.rejects(
    f.reader.readCampaignComparisonItem(uid, { ...input, cursor: foreign }),
    (error) => error.details?.reason === 'cursor-invalidated',
  );
});

test('internal image fields absent from the public item DTO cannot classify an authorized item as changed', async () => {
  const f = await fixture(),
    { result } = await startComparison(f),
    p = await finishComparison(f, result);
  const key = baseSourceKey({ adventureId, kind: 'block', id: f.scene.id, role: 'main' });
  f.records.get(basePath(uid, p.candidateBaseId) + '/items/' + key).image.internalStorageHint =
    'Invisible internal field';
  const detail = await f.reader.readCampaignComparisonItem(uid, {
    comparisonId: p.comparisonId,
    sourceKey: key,
    side: 'candidate',
  });
  assert.equal('internalStorageHint' in detail.item.image, false);
  const row = (await comparisonRows(f, p, 'items', { kind: 'block' })).find(
    (row) => row.key === key,
  );
  assert.equal(row.change, 'unchanged');
  assert.ok(
    f.metadataReads.some(
      (read) =>
        read.path.endsWith('/items/' + key) &&
        read.fields.includes('image.imageKey') &&
        read.fields.includes('image.alt') &&
        read.fields.includes('image.caption') &&
        !read.fields.includes('image'),
    ),
  );
});

test('authored image captions remain explainable in item DTOs after pin loss while image rows and lazy bytes stay gated', async () => {
  const f = await fixture(),
    { result } = await startComparison(f),
    p = await finishComparison(f, result);
  const key = baseSourceKey({ adventureId, kind: 'block', id: f.scene.id, role: 'main' }),
    imageKey = digest({ imageId: f.imageId });
  f.records.get(basePath(uid, p.candidateBaseId) + '/items/' + key).image.caption =
    'Nova legenda autoral';
  const image = f.records.get(basePath(uid, p.candidateBaseId) + '/images/' + imageKey);
  f.records.delete('users/' + uid + '/imageLibrary/' + f.imageId + '/uses/' + image.useKey);
  const row = (await comparisonRows(f, p, 'items', { kind: 'block' })).find(
    (row) => row.key === key,
  );
  assert.equal(row.change, 'changed');
  const current = await f.reader.readCampaignComparisonItem(uid, {
    comparisonId: p.comparisonId,
    sourceKey: key,
    side: 'current',
  });
  const candidate = await f.reader.readCampaignComparisonItem(uid, {
    comparisonId: p.comparisonId,
    sourceKey: key,
    side: 'candidate',
  });
  assert.equal(current.item.image.caption, 'Legenda');
  assert.equal(candidate.item.image.caption, 'Nova legenda autoral');
  assert.deepEqual(await comparisonRows(f, p, 'images'), []);
  await assert.rejects(
    f.reader.readCampaignComparisonImage(uid, {
      comparisonId: p.comparisonId,
      imageKey,
      side: 'candidate',
    }),
    { code: 'not-found' },
  );
});
