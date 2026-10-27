import test from 'node:test';
import assert from 'node:assert/strict';
import { createAdventureRestoreRemapper } from '../src/adventureRestoreRemap.mjs';
import { adventureCoreRecordIdentity } from '../src/adventureArchiveCore.mjs';
import { ADVENTURE_RESOURCE_KINDS } from '../src/adventureBackupResourceDefinitions.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { sequenceKey } from '../src/narrativeContracts.mjs';
const context = {
  schemaVersion: 1,
  jobToken: 'a'.repeat(64),
  sourceAdventureId: 'source-adventure-0001',
  adventureId: 'target-adventure-0001',
};
const record = async (family, kind, native, parentId = null) => ({
  ...(await adventureCoreRecordIdentity({ family, kind, parentId }, native)),
  part: 0,
});
async function resource(mapper, kind, id, data, parentId = null, present = true) {
  return mapper.mapJSON(await record('resources', kind, id, parentId), {
    schemaVersion: 1,
    kind,
    id,
    parentId,
    present,
    data,
  });
}
test('maps every native resource family and recalculates controls, references and narrative link keys', async () => {
  const m = createAdventureRestoreRemapper(context),
    scene = 'source-scene-0001',
    arc = 'source-arc-0001',
    part = 'source-part-0001',
    block = 'source-block-0001',
    ref = { kind: 'adventure', scopeId: context.sourceAdventureId, entityId: 'source-lore-0001' },
    source = { kind: 'milestone', arcId: arc, id: 'source-milestone-0001' },
    reference = { kind: 'scene', sceneId: scene },
    h = 'b'.repeat(64),
    cases = [
      ['progress', 'current', { wordGoal: 1200 }],
      ['checklist', 'source-checklist-0001', { title: 'Prepare', completed: false }],
      ['arc', arc, { kind: 'arc', rankA: 'A', rankB: 'B' }],
      ['event', 'source-event-0001', { kind: 'event', dateLabel: '3º dia' }],
      ['milestone', source.id, { kind: 'milestone', arcId: arc }, arc],
      ['arc-order', sequenceKey({ kind: 'arc' }), { rankSlot: 'B' }],
      ['event-order', sequenceKey({ kind: 'event' }), {}, null, false],
      ['milestone-order', sequenceKey({ kind: 'milestone', arcId: arc }), { rankSlot: 'A' }, arc],
      ['narrative-link', digest({ source, reference }), { source, reference }],
      ['part-control', part, { rankSlot: 'A' }],
      ['scene-control', 'unassigned', {}, null, false],
      [
        'scene',
        scene,
        {
          parentId: part,
          formerParentId: part,
          bodyHash: h,
          mainBlockImage: null,
          personaComplement: null,
        },
      ],
      ['scene-body', 'current', { content: 'Text', hash: h }, scene],
      ['scene-planning', 'current', { objective: 'Goal' }, scene],
      ['scene-reference', digest(ref), ref, scene],
      [
        'block',
        block,
        { sceneId: scene, narrativeType: 'clue', audience: 'gm', bodyHash: h, image: null },
      ],
      ['block-body', 'current', { content: 'Block', hash: h }, block],
    ];
  assert.deepEqual(new Set(cases.map((v) => v[0])), new Set(ADVENTURE_RESOURCE_KINDS));
  const out = new Map();
  for (const [kind, id, data, parentId = null, present = true] of cases) {
    const value = await resource(m, kind, id, data, parentId, present);
    assert.equal(value.validation, 'identity-projection-only');
    out.set(kind, value.value);
  }
  assert.equal(out.get('scene').data.parentId, out.get('part-control').id);
  assert.equal(out.get('scene').data.formerParentId, out.get('part-control').id);
  assert.equal(out.get('scene-body').parentId, out.get('scene').id);
  assert.equal(out.get('scene-reference').parentId, out.get('scene').id);
  assert.equal(out.get('block-body').parentId, out.get('block').id);
  assert.equal(out.get('block').data.sceneId, out.get('scene').id);
  assert.equal(out.get('milestone').parentId, out.get('arc').id);
  assert.equal(out.get('milestone').data.arcId, out.get('arc').id);
  assert.equal(
    out.get('milestone-order').id,
    sequenceKey({ kind: 'milestone', arcId: out.get('arc').id }),
  );
  assert.equal(out.get('narrative-link').data.source.id, out.get('milestone').id);
  assert.equal(out.get('narrative-link').id, digest(out.get('narrative-link').data));
  assert.equal(out.get('scene-reference').id, digest(out.get('scene-reference').data));
  assert.equal(out.get('scene-reference').data.scopeId, context.adventureId);
});
test('own lore relations change destination while foreign adventure and universe references remain unchanged', async () => {
  const m = createAdventureRestoreRemapper(context),
    old = 'source-lore-0001',
    foreign = 'adventure:other-adventure-0001:foreign-lore-0001',
    universe = 'universe:universe-original-0001:global-lore-0001',
    data = {
      details: 'Details',
      structuredDetails: { appearance: '', personality: '', history: '', notes: '' },
      relations: ['adventure:' + context.sourceAdventureId + ':' + old, foreign, universe].map(
        (targetEntityId) => ({ targetEntityId, relationType: 'knows', description: '' }),
      ),
    },
    value = { schemaVersion: 1, kind: 'lore-body', id: old, data },
    before = JSON.stringify(value),
    mapped = await m.mapJSON(await record('lore', 'lore-body', old), value);
  assert.equal(
    mapped.value.data.relations[0].targetEntityId,
    'adventure:' + context.adventureId + ':' + m.identity('lore', old),
  );
  assert.equal(mapped.value.data.relations[1].targetEntityId, foreign);
  assert.equal(mapped.value.data.relations[2].targetEntityId, universe);
  assert.equal(JSON.stringify(value), before);
  const external = {
    kind: 'universe',
    scopeId: 'universe-original-0001',
    entityId: 'global-lore-0001',
  };
  assert.deepEqual(
    (await resource(m, 'scene-reference', digest(external), external, 'scene-source-0001')).value
      .data,
    external,
  );
});
test('universe origin and source manifests remain source-only and never become a new grant or backup certificate', async () => {
  const m = createAdventureRestoreRemapper(context),
    origin = {
      kind: 'reference',
      id: 'universe-original-0001',
      created: { seconds: 100, nanoseconds: 123 },
    },
    value = { schemaVersion: 1, origin },
    mapped = await m.mapJSON(
      { kind: 'adventure-universe', id: context.sourceAdventureId, part: 0 },
      value,
    );
  assert.equal(mapped.sourceOnly, true);
  assert.deepEqual(mapped.value, value);
  const root = await m.mapJSON(
    { kind: 'adventure-metadata', id: context.sourceAdventureId, part: 0 },
    {
      schemaVersion: 1,
      kind: 'adventure',
      data: { title: 'Work', status: 'draft', universeId: origin.id, personaId: null },
    },
  );
  assert.equal(root.value.data.universeId, origin.id);
  assert.equal(root.record.id, context.adventureId);
  assert.equal(Object.hasOwn(root.value.data, 'ownerId'), false);
});
test('identity namespace separates target, job, kind and milestone parent while fitting native limits', () => {
  const m = createAdventureRestoreRemapper(context),
    old = 'same-source-0001',
    different = createAdventureRestoreRemapper({
      ...context,
      adventureId: 'target-adventure-0002',
    }),
    job = createAdventureRestoreRemapper({ ...context, jobToken: 'b'.repeat(64) });
  const values = [
    m.identity('scene', old),
    m.identity('block', old),
    different.identity('scene', old),
    job.identity('scene', old),
    m.identity('milestone', old, 'source-arc-0001'),
    m.identity('milestone', old, 'source-arc-0002'),
  ];
  assert.equal(new Set(values).size, values.length);
  for (const value of values) assert.match(value, /^[a-zA-Z0-9-]{16,80}$/);
  assert.match(m.identity('persona', old), /^custom-/);
  assert.throws(() => m.identity('scene', old, 'parent'));
  assert.throws(() => m.identity('milestone', old));
  assert.throws(() =>
    createAdventureRestoreRemapper({ ...context, adventureId: context.sourceAdventureId }),
  );
});
test('closed schemas, record address mismatch and unknown record kinds are rejected without mutating inputs', async () => {
  const m = createAdventureRestoreRemapper(context),
    v = { schemaVersion: 1, kind: 'part', data: { title: 'Part' } },
    good = { kind: 'adventure-part', id: 'part-source-0001', part: 0 };
  await assert.rejects(() => m.mapJSON({ ...good, kind: 'unrecognized-record' }, v));
  await assert.rejects(() => m.mapJSON({ ...good, part: 1 }, v));
  await assert.rejects(() => m.mapJSON(good, { ...v, ownerId: 'fake' }));
  await assert.rejects(() =>
    m.mapJSON(
      { kind: 'adventure-resource', id: 'a'.repeat(64), part: 0 },
      {
        schemaVersion: 1,
        kind: 'scene-control',
        id: 'unassigned',
        parentId: null,
        present: false,
        data: {},
      },
    ),
  );
  assert.deepEqual(v, { schemaVersion: 1, kind: 'part', data: { title: 'Part' } });
});
test('captures mapper inputs and context before awaiting native address hashing', async () => {
  const supplied = { ...context },
    m = createAdventureRestoreRemapper(supplied),
    id = 'scene-original-0001',
    sourceRecord = await record('resources', 'scene', id),
    value = {
      schemaVersion: 1,
      kind: 'scene',
      id,
      parentId: null,
      present: true,
      data: { bodyHash: 'c'.repeat(64), parentId: 'part-original-0001' },
    },
    result = m.mapJSON(sourceRecord, value);
  supplied.adventureId = 'other-target-0001';
  value.data.parentId = 'tampered-parent-0001';
  sourceRecord.id = 'd'.repeat(64);
  const mapped = await result;
  assert.equal(mapped.value.id, m.identity('scene', id));
  assert.equal(mapped.value.data.parentId, m.identity('part', 'part-original-0001'));
});
