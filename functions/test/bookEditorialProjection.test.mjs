import test from 'node:test';
import assert from 'node:assert/strict';
import {
  projectBookEditorialContract,
  projectBookEditorialPlan,
  projectBookEditorialPlanReference,
} from '../src/bookEditorialProjection.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import { literaryPlan } from '../src/literaryPlanningSchema.mjs';
import { LITERARY_PLAN_SCHEMA } from '../src/literaryPlanFields.mjs';
import { literaryVolumeUnitId } from '../src/literaryVolumeProtocol.mjs';
const birth = { seconds: 10, nanoseconds: 2 },
  base = { bookId: 'book', bookBirth: birth, role: 'current' };
const saved = (kind = 'chapterBrief') => ({
  schemaVersion: 1,
  id: 'plan',
  revision: 2,
  createdAt: 10,
  updatedAt: 20,
  plan: literaryPlan({ kind, title: 'Ficha', status: 'working', fields: {}, references: [] }),
});
const rawReference = (kind = 'chapter', id = 'chapter', scopeId = 'book') => ({
  kind,
  id,
  scopeId,
  sourceToken: 'a'.repeat(64),
  revision: 7,
  purpose: 'source',
});
test('contract projection picks saved content, preserves literal text and omits private native execution data', () => {
  const contract = emptyEditorialContract();
  contract.fields[Object.keys(contract.fields)[0]] = '\ufeffTexto 🕯️\r\n$()';
  contract.executionGrant = 'SECRET_TICKET';
  const value = projectBookEditorialContract({
    ...base,
    value: { revision: 2, updatedAt: 20, contract, jobToken: 'SECRET_JOB' },
  });
  assert.equal(
    value.content.fields[Object.keys(contract.fields)[0]],
    contract.fields[Object.keys(contract.fields)[0]],
  );
  assert.equal(value.createdAt, null);
  assert.equal(value.updatedAt, 20);
  assert.equal(value.provenance, 'unknown');
  assert.equal(JSON.stringify(value).includes('SECRET'), false);
  assert.equal(value.lineage.role, 'current');
});
test('all native plan kinds have portable fields while operational snapshots remain excluded', () => {
  for (const kind of Object.keys(LITERARY_PLAN_SCHEMA)) {
    const value = saved(kind);
    value.frozenSnapshot = { key: 'SECRET' };
    const projected = projectBookEditorialPlan({ ...base, id: 'plan', value, referenceStates: [] });
    assert.deepEqual(projected.content, value.plan);
    assert.equal(JSON.stringify(projected).includes('SECRET'), false);
  }
});
test('current and immutable versions share a logical identity without conflating different revisions or book births', () => {
  const value = saved(),
    current = projectBookEditorialPlan({ ...base, id: 'plan', value, referenceStates: [] }),
    version = projectBookEditorialPlan({
      ...base,
      role: 'version',
      id: 'plan',
      value,
      referenceStates: [],
    }),
    old = projectBookEditorialPlan({
      ...base,
      role: 'version',
      id: 'plan',
      value: { ...value, revision: 1 },
      referenceStates: [],
    });
  assert.equal(current.id, version.id);
  assert.equal(current.lineage.id, old.lineage.id);
  assert.notEqual(current.id, old.id);
  assert.notEqual(
    projectBookEditorialPlan({
      ...base,
      bookBirth: { seconds: 10, nanoseconds: 3 },
      id: 'plan',
      value,
      referenceStates: [],
    }).lineage.id,
    current.lineage.id,
  );
});
test('observed native source tokens never become portable content hashes and stale source descriptors keep their old revision', () => {
  const ref = rawReference(),
    value = projectBookEditorialPlanReference('book', null, ref, 'unavailable');
  assert.equal(value.contentHash, null);
  assert.equal(value.revision, 7);
  assert.equal(value.state, 'unavailable');
  assert.equal(JSON.stringify(value).includes('sourceToken'), false);
});
test('volume descriptors retain explicit book/unit identity and unknown global origins remain null/unavailable', () => {
  const native = rawReference(
      'volumeUnit',
      literaryVolumeUnitId({ bookId: 'other', kind: 'scene', id: 'scene' }),
      'other',
    ),
    value = projectBookEditorialPlanReference('book', null, native, 'recorded');
  assert.equal(value.kind, 'scene');
  assert.equal(value.id, 'scene');
  assert.deepEqual(value.scope, { kind: 'book', id: 'other' });
  const missing = projectBookEditorialPlanReference(
    'book',
    null,
    rawReference('globalLore', 'entity', null),
    'recorded',
  );
  assert.equal(missing.scope.id, null);
  assert.equal(missing.state, 'unavailable');
});
test('a projection cannot silently omit reference checks, invent fields/dates or accept a zero revision', () => {
  const value = saved();
  value.plan.references = [rawReference()];
  assert.throws(() =>
    projectBookEditorialPlan({ ...base, id: 'plan', value, referenceStates: [] }),
  );
  assert.throws(() =>
    projectBookEditorialPlan({ ...base, id: 'other', value, referenceStates: ['recorded'] }),
  );
  assert.throws(() =>
    projectBookEditorialPlan({
      ...base,
      id: 'plan',
      value: { ...saved(), revision: 0 },
      referenceStates: [],
    }),
  );
  const absent = saved();
  delete absent.plan.fields.function;
  assert.throws(() =>
    projectBookEditorialPlan({ ...base, id: 'plan', value: absent, referenceStates: [] }),
  );
});

test('native scope aliases collapse only when logically identical, preserving different roles and observations', () => {
  const value = saved(),
    ref = rawReference();
  value.plan.references = [{ ...ref, scopeId: null }, ref];
  assert.equal(
    projectBookEditorialPlan({
      ...base,
      id: 'plan',
      value,
      referenceStates: ['recorded', 'recorded'],
    }).content.references.length,
    1,
  );
  value.plan.references = [
    { ...ref, scopeId: null },
    { ...ref, purpose: 'subject' },
  ];
  const projected = projectBookEditorialPlan({
    ...base,
    id: 'plan',
    value,
    referenceStates: ['recorded', 'recorded'],
  });
  assert.equal(projected.content.references.length, 2);
  assert.deepEqual(
    projected.content.references.map((ref) => ref.purpose),
    ['source', 'subject'],
  );
});
