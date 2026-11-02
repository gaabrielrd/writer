import test from 'node:test';
import assert from 'node:assert/strict';
import { createStudioService } from '../src/studio.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { createNarrativePlanningService } from '../src/narrativePlanning.mjs';
import { sequenceKey } from '../src/narrativeContracts.mjs';
import { createAdventureBackupSourceService } from '../src/adventureBackupSource.mjs';
import { createAdventureBackupResourceService } from '../src/adventureBackupResourceRead.mjs';
import { serializeAdventureBackupResource } from '../src/adventureBackupResources.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { digest } from '../src/workProgressContracts.mjs';

const uid = 'author',
  id = 'adventure-narrative-backup-0001',
  path = 'adventures/' + id,
  target = { kind: 'adventure', id },
  arcId = 'narrative-arc-backup-0001',
  eventId = 'narrative-event-backup-0001',
  milestoneId = 'narrative-milestone-backup-0001',
  sceneId = 'narrative-scene-backup-0001',
  arcPath = path + '/arcs/' + arcId,
  eventPath = path + '/timelineEvents/' + eventId,
  milestonePath = arcPath + '/milestones/' + milestoneId;
const source = (kind) => ({
  kind,
  id: { arc: arcId, event: eventId, milestone: milestoneId }[kind],
  ...(kind === 'milestone' ? { arcId } : {}),
});
async function fixture(count = 1) {
  const f = adventureImportDb({ nativeUpdates: true });
  await createStudioService({ db: f.db, now: () => 1000 }).createAdventure(uid, {
    operationId: id,
    title: 'PRIVATE_ROOT',
    synopsis: 'Own',
  });
  await createScenesService({ db: f.db, now: () => 1100 }).createScene(uid, {
    target,
    operationId: sceneId,
    title: 'PRIVATE_SCENE',
    content: 'PRIVATE_PROSE',
  });
  const narrative = createNarrativePlanningService({ db: f.db, now: () => 1200 });
  await narrative.createNarrativeItem(uid, {
    target,
    resource: { kind: 'arc' },
    operationId: arcId,
    title: 'PRIVATE_ARC',
    initialState: 'PRIVATE_INITIAL 🌙',
    objective: 'PRIVATE_OBJECTIVE',
    plannedOutcome: '',
  });
  for (let n = 1; n <= count; n++)
    await narrative.createNarrativeItem(uid, {
      target,
      resource: { kind: 'event' },
      operationId: n === 1 ? eventId : 'narrative-event-backup-' + String(n).padStart(4, '0'),
      title: 'PRIVATE_EVENT_' + n,
      dateLabel: '3º dia do inverno',
      description: 'PRIVATE_DESCRIPTION',
    });
  await narrative.createNarrativeItem(uid, {
    target,
    resource: { kind: 'milestone', arcId },
    operationId: milestoneId,
    title: 'PRIVATE_MILESTONE',
    notes: 'PRIVATE_NOTES',
  });
  await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { universeId: 'world' }));
  f.records.set('universes/world', { authorId: uid, loreVersion: 1 });
  f.records.set('universes/world/lore/person', {
    name: 'FORBIDDEN_GLOBAL_LABEL',
    details: 'FORBIDDEN_BODY',
  });
  const refs = [
    ['arc', { kind: 'scene', sceneId }],
    ['event', { kind: 'event', eventId }],
    [
      'milestone',
      { kind: 'lore', reference: { kind: 'universe', scopeId: 'world', entityId: 'person' } },
    ],
  ];
  for (const [kind, reference] of refs) {
    const itemPath = { arc: arcPath, event: eventPath, milestone: milestonePath }[kind];
    await narrative.setNarrativeReference(uid, {
      target,
      source: source(kind),
      reference,
      operationId: 'narrative-link-backup-' + kind,
      expectedRevision: f.records.get(itemPath).revision,
    });
  }
  f.records.delete('universes/world');
  f.records.delete('universes/world/lore/person');
  const pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  return { ...f, narrative, pin, api: createAdventureBackupResourceService(f) };
}
const list = (f, kind, parentId = null, extra = {}) =>
  f.api.listAdventureBackupResources(uid, {
    adventureId: id,
    sourceToken: f.pin.sourceToken,
    kind,
    parentId,
    ...extra,
  });
const request = (f, kind, row, parentId = null) => ({
  adventureId: id,
  sourceToken: f.pin.sourceToken,
  kind,
  parentId,
  id: row.id,
  itemToken: row.itemToken,
  index: 0,
});
async function readAll(f, input) {
  const parts = [];
  let header;
  for (let index = 0; ; index++) {
    const r = await f.api.readAdventureBackupResource(uid, { ...input, index });
    header ??= r;
    assert.equal(r.contentHash, header.contentHash);
    const bytes = Buffer.from(r.chunkBase64, 'base64');
    assert.ok(bytes.length <= 65536 && bytes.length > 0);
    parts.push(bytes);
    if (index + 1 === r.chunkCount) break;
  }
  const bytes = Buffer.concat(parts);
  assert.equal(bytes.length, header.byteLength);
  assert.equal(digest(bytes.toString('utf8')), header.contentHash);
  return { dto: JSON.parse(bytes.toString('utf8')), header };
}
const update = (f, p, patch) => f.db.runTransaction((tx) => tx.update(f.db.doc(p), patch));
const remove = (f, p) => f.db.runTransaction((tx) => tx.delete(f.db.doc(p)));
const controlPath = (kind, parentId = null) =>
  path +
  '/narrativeControls/' +
  sequenceKey({ kind, ...(kind === 'milestone' ? { arcId: parentId } : {}) });

test('real narrative producers export all seven families as own text and neutral links without world lookups or writes', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    start = f.commits.length;
  f.reads.length = 0;
  f.metadataReads.length = 0;
  for (const [kind, parentId] of [
    ['arc', null],
    ['event', null],
    ['milestone', arcId],
    ['arc-order', null],
    ['event-order', null],
    ['milestone-order', arcId],
    ['narrative-link', null],
  ]) {
    const page = await list(f, kind, parentId);
    assert.ok(page.items.length);
    assert.equal(JSON.stringify(page).includes('PRIVATE_'), false);
  }
  assert.ok(
    f.reads.every(
      (r) => r.fields && !r.fields.includes('title') && !r.fields.includes('description'),
    ),
  );
  assert.ok(
    f.metadataReads.every(
      (r) =>
        !r.path.startsWith('universes/') &&
        !r.fields.includes('initialState') &&
        !r.fields.includes('notes') &&
        !r.fields.includes('reference'),
    ),
  );
  const arcRow = (await list(f, 'arc')).items[0],
    arc = (await readAll(f, request(f, 'arc', arcRow))).dto.data;
  assert.equal(arc.initialState, 'PRIVATE_INITIAL 🌙');
  assert.equal(arc.plannedOutcome, '');
  assert.equal(arc.kind, 'arc');
  assert.ok(arc.rankA && arc.rankB);
  const event = (await readAll(f, request(f, 'event', (await list(f, 'event')).items[0]))).dto.data;
  assert.equal(event.dateLabel, '3º dia do inverno');
  assert.equal(event.description, 'PRIVATE_DESCRIPTION');
  const milestone = (
    await readAll(f, request(f, 'milestone', (await list(f, 'milestone', arcId)).items[0], arcId))
  ).dto.data;
  assert.equal(milestone.arcId, arcId);
  assert.equal(milestone.notes, 'PRIVATE_NOTES');
  for (const row of (await list(f, 'narrative-link')).items) {
    const value = (await readAll(f, request(f, 'narrative-link', row))).dto.data;
    assert.deepEqual(Object.keys(value).sort(), ['reference', 'source']);
    assert.equal(JSON.stringify(value).includes('FORBIDDEN'), false);
    if (value.source.kind === 'milestone')
      assert.deepEqual(value.reference, {
        kind: 'lore',
        reference: { kind: 'universe', scopeId: 'world', entityId: 'person' },
      });
  }
  for (const key of ['referenceCount', 'ownerId', 'revision', 'sourceKey'])
    assert.equal(Object.hasOwn(arc, key), false);
  assert.deepEqual([...f.records], before);
  assert.ok(f.commits.slice(start).every((w) => w.length === 0));
});

test('fifty-three events paginate and actual rebalance order B remains interpretable', async () => {
  const f = await fixture(53);
  for (let n = 0; n < 60; n++)
    if (
      (
        await f.narrative.rebalanceNarrativeRanks(uid, {
          target,
          resource: { kind: 'event' },
          operationId: 'narrative-rebalance-backup-0001',
          limit: 7,
        })
      ).complete
    )
      break;
  f.pin = await createAdventureBackupSourceService(f).getAdventureBackupSource(uid, {
    adventureId: id,
  });
  const a = await list(f, 'event', null, { limit: 50 }),
    b = await list(f, 'event', null, { limit: 50, cursor: a.nextCursor });
  assert.equal(a.items.length, 50);
  assert.equal(b.items.length, 3);
  assert.equal(b.nextCursor, null);
  const orderRow = (await list(f, 'event-order')).items[0];
  assert.equal(orderRow.id, sequenceKey({ kind: 'event' }));
  const order = (await readAll(f, request(f, 'event-order', orderRow))).dto.data;
  assert.deepEqual(order, { rankSlot: 'B' });
  const values = [];
  for (const row of [...a.items, ...b.items])
    values.push((await readAll(f, request(f, 'event', row))).dto.data);
  const sorted = values.sort((left, right) =>
    left.rankB < right.rankB ? -1 : left.rankB > right.rankB ? 1 : 0,
  );
  assert.deepEqual(
    sorted.map((v) => v.title),
    Array.from({ length: 53 }, (_, n) => 'PRIVATE_EVENT_' + (n + 1)),
  );
  assert.ok(values.every((v) => v.dateLabel === '3º dia do inverno'));
});

test('inline narrative prose preserves literal large Unicode, absent fields and zero dates', async () => {
  const f = await fixture(),
    value = structuredClone(f.records.get(arcPath)),
    initialState = '\ufeff🌙\n'.repeat(19000);
  delete value.plannedOutcome;
  await f.db.runTransaction((tx) =>
    tx.set(f.db.doc(arcPath), { ...value, initialState, createdAt: 0 }),
  );
  const row = (await list(f, 'arc')).items[0];
  f.api = createAdventureBackupResourceService(f);
  const result = await readAll(f, request(f, 'arc', row));
  assert.equal(result.dto.data.initialState, initialState);
  assert.equal(result.dto.data.createdAt, 0);
  assert.equal(Object.hasOwn(result.dto.data, 'plannedOutcome'), false);
  assert.ok(result.header.chunkCount > 1);
});

for (const [kind, native, parentId] of [
  ['arc-order', 'arc', null],
  ['event-order', 'event', null],
  ['milestone-order', 'milestone', arcId],
])
  test(kind + ' addresses only its deterministic optional control and pins absence', async () => {
    const f = await fixture(),
      p = controlPath(native, parentId);
    await remove(f, p);
    const row = (await list(f, kind, parentId)).items[0],
      input = request(f, kind, row, parentId);
    assert.equal(row.id, p.split('/').at(-1));
    assert.equal(row.present, false);
    assert.equal((await readAll(f, input)).dto.present, false);
    await f.db.runTransaction((tx) => tx.create(f.db.doc(p), { rankSlot: 'A' }));
    await assert.rejects(f.api.readAdventureBackupResource(uid, input), {
      code: 'failed-precondition',
    });
  });

for (const [kind, parentId, dependency] of [
  ['arc', null, arcPath],
  ['event', null, eventPath],
  ['milestone', arcId, milestonePath],
  ['milestone', arcId, arcPath],
  ['arc-order', null, controlPath('arc')],
  ['milestone-order', arcId, arcPath],
  ['milestone-order', arcId, controlPath('milestone', arcId)],
])
  for (const mode of ['change', 'recreate'])
    test(
      kind + ' native dependency ' + dependency.split('/').slice(2).join('/') + ' rejects ' + mode,
      async () => {
        const f = await fixture(),
          row = (await list(f, kind, parentId)).items[0],
          input = request(f, kind, row, parentId),
          value = structuredClone(f.records.get(dependency));
        if (mode === 'change') await update(f, dependency, { ignoredControl: true });
        else {
          await remove(f, dependency);
          await f.db.runTransaction((tx) => tx.create(f.db.doc(dependency), value));
        }
        await assert.rejects(f.api.readAdventureBackupResource(uid, input), {
          code: 'failed-precondition',
        });
      },
    );

test('link identities depend on their real source and milestone arc without needing the target', async () => {
  const f = await fixture(),
    links = (await list(f, 'narrative-link')).items;
  let selected;
  for (const row of links)
    if ((await readAll(f, request(f, 'narrative-link', row))).dto.data.source.kind === 'milestone')
      selected = row;
  assert.ok(selected);
  for (const dependency of [path + '/narrativeLinks/' + selected.id, milestonePath, arcPath]) {
    const row = (await list(f, 'narrative-link')).items.find((r) => r.id === selected.id),
      value = structuredClone(f.records.get(dependency));
    await remove(f, dependency);
    await f.db.runTransaction((tx) => tx.create(f.db.doc(dependency), value));
    await assert.rejects(
      f.api.readAdventureBackupResource(uid, request(f, 'narrative-link', row)),
      { code: 'failed-precondition' },
    );
  }
  await update(f, milestonePath, { ownerId: 'other' });
  await assert.rejects(list(f, 'narrative-link'), { code: 'failed-precondition' });
});

for (const [kind, parentId, dependency, patch] of [
  ['arc', null, arcPath, { ownerId: 'other' }],
  ['arc', null, arcPath, { schemaVersion: 2 }],
  ['event', null, eventPath, { kind: 'arc' }],
  ['milestone', arcId, milestonePath, { arcId: 'another-arc' }],
  ['milestone', arcId, arcPath, { kind: 'event' }],
  ['milestone', arcId, arcPath, { deleting: true }],
  ['milestone-order', arcId, arcPath, { ownerId: 'other' }],
  ['event-order', null, controlPath('event'), { rebalancing: true }],
  ['arc', null, arcPath, { contentStorage: null }],
  ['event', null, eventPath, { payloadStorage: null }],
])
  test(
    'invalid narrative dependency cannot list or read: ' + kind + JSON.stringify(patch),
    async () => {
      const f = await fixture(),
        row = (await list(f, kind, parentId)).items[0];
      await update(f, dependency, patch);
      await assert.rejects(list(f, kind, parentId));
      await assert.rejects(f.api.readAdventureBackupResource(uid, request(f, kind, row, parentId)));
    },
  );

test('derived scene index and stray controls cannot appear as narrative order records', async () => {
  const f = await fixture();
  await f.db.runTransaction((tx) => {
    tx.create(f.db.doc(path + '/narrativeControls/entity-scenes'), {
      rankSlot: 'B',
      content: 'DERIVED_SECRET',
    });
    tx.create(f.db.doc(path + '/narrativeControls/stray'), {
      rankSlot: 'B',
      content: 'STRAY_SECRET',
    });
  });
  for (const kind of ['arc-order', 'event-order']) {
    const page = await list(f, kind);
    assert.equal(page.items.length, 1);
    assert.equal((await readAll(f, request(f, kind, page.items[0]))).dto.data.rankSlot, 'A');
    await assert.rejects(
      f.api.readAdventureBackupResource(uid, {
        ...request(f, kind, page.items[0]),
        id: 'entity-scenes',
      }),
      { code: 'invalid-argument' },
    );
  }
});

test('milestone cursor cannot switch arc, account, type, or mutate an awaited request', async () => {
  const f = await fixture(),
    row = (await list(f, 'milestone', arcId)).items[0],
    input = request(f, 'milestone', row, arcId);
  for (const actor of [null, 'other'])
    await assert.rejects(f.api.readAdventureBackupResource(actor, input), {
      code: actor ? 'not-found' : 'unauthenticated',
    });
  await assert.rejects(list(f, 'milestone'), { code: 'invalid-argument' });
  await assert.rejects(list(f, 'arc', arcId), { code: 'invalid-argument' });
  const port = {
    ...f.db,
    runTransaction: (op) =>
      f.db.runTransaction((tx) => {
        Object.assign(input, { kind: 'event', parentId: null, id: eventId, index: 99 });
        return op(tx);
      }),
  };
  const result = await createAdventureBackupResourceService({
    db: port,
  }).readAdventureBackupResource(uid, input);
  assert.equal(result.kind, 'milestone');
  assert.equal(result.parentId, arcId);
  assert.equal(result.index, 0);
});

test('narrative read failure is read-only and exact retry succeeds', async () => {
  const f = await fixture(),
    row = (await list(f, 'milestone', arcId)).items[0],
    before = structuredClone([...f.records]),
    input = request(f, 'milestone', row, arcId),
    port = {
      ...f.db,
      runTransaction: (op) =>
        f.db.runTransaction((tx) =>
          op({
            ...tx,
            getAll(ref, options) {
              if (ref.path === milestonePath) throw Error('narrative read failed');
              return tx.getAll(ref, options);
            },
          }),
        ),
    };
  await assert.rejects(
    createAdventureBackupResourceService({ db: port }).readAdventureBackupResource(uid, input),
    /narrative read failed/,
  );
  assert.equal((await readAll(f, input)).dto.data.notes, 'PRIVATE_NOTES');
  assert.deepEqual([...f.records], before);
});

for (const [kind, parentId, value] of [
  ['arc', null, { kind: 'event' }],
  ['arc', null, { kind: 'arc', objective: '\ud800' }],
  ['event', null, { kind: 'event', dateLabel: 3 }],
  ['milestone', arcId, { kind: 'milestone', arcId: 'other' }],
  ['narrative-link', null, { source: { kind: 'arc', id: arcId }, reference: { kind: 'public' } }],
])
  test('narrative codec rejects nonrepresentable ' + JSON.stringify(value), () => {
    assert.throws(() => serializeAdventureBackupResource(kind, parentId, 'item', value), TypeError);
  });

test('link codec keeps only structural source and reference, no index or resolved label', () => {
  const { json } = serializeAdventureBackupResource('narrative-link', null, 'link', {
    source: { kind: 'arc', id: arcId, label: 'DO_NOT_COPY' },
    reference: {
      kind: 'lore',
      reference: { kind: 'universe', scopeId: 'world', entityId: 'person', name: 'DO_NOT_COPY' },
      label: 'DO_NOT_COPY',
    },
    sourceKey: 'DO_NOT_COPY',
    sourceArcId: 'DO_NOT_COPY',
    loreKey: 'DO_NOT_COPY',
  });
  assert.equal(json.includes('DO_NOT_COPY'), false);
});
