import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createStudioService } from '../src/studio.mjs';
import { createCampaignsService } from '../src/campaigns.mjs';
import { createUniverseService } from '../src/universes.mjs';

const campaignId = 'campaign-current-0001',
  path = 'campaigns/' + campaignId,
  op = (name) => 'campaign-operation-' + name,
  conflict = (error) => error.details?.reason === 'revision-conflict';
async function fixture() {
  const f = studioDb(),
    studio = createStudioService({ db: f.db, now: () => 100 });
  const campaign = await studio.createCampaign('author', {
    operationId: campaignId,
    title: 'Mesa original',
    description: 'Descrição privada',
  });
  f.records.set(path + '/workChecklist/task', {
    id: 'task',
    title: 'Preparação privada',
    completed: true,
    revision: 5,
  });
  f.records.set(path + '/workProgress/current', {
    revision: 4,
    checklistTotal: 1,
    checklistCompleted: 1,
  });
  f.records.set('users/author', { credits: 7 });
  for (const id of ['first', 'second'])
    f.records.set('universes/' + id, {
      authorId: 'author',
      name: 'Universo',
      campaignCount: 0,
      bookCount: 4,
      adventureCount: 2,
      privacyVersion: 3,
      loreVersion: 5,
      createdAt: 1,
      updatedAt: 1000,
    });
  return { ...f, campaign, studio, api: createCampaignsService({ db: f.db, now: () => 50 }) };
}
const update = (f, name, expectedRevision, patch, uid = 'author') =>
  f.api.updateCampaign(uid, { campaignId, operationId: op(name), expectedRevision, patch });

test('campaign edits preserve private checklist, source, original dates and credits; lifecycle restores only explicit status', async () => {
  const f = await fixture(),
    protectedBefore = structuredClone([...f.records].filter(([key]) => key.startsWith(path + '/')));
  const first = await update(f, 'first', 1, {
    title: ' Nova mesa ',
    description: ' Nova descrição ',
    status: 'active',
  });
  assert.equal(first.title, 'Nova mesa');
  assert.equal(first.description, 'Nova descrição');
  assert.equal(first.status, 'active');
  assert.equal(first.revision, 2);
  assert.equal(first.updatedAt, 101);
  assert.equal(first.createdAt, 100);
  assert.equal(first.ownerId, 'author');
  assert.deepEqual(first.provenance, { kind: 'independent' });
  const archived = await update(f, 'archive', 2, { status: 'archived' });
  assert.equal(archived.status, 'archived');
  const restored = await update(f, 'restore', 3, { status: 'completed' });
  assert.equal(restored.status, 'completed');
  assert.equal(restored.description, 'Nova descrição');
  assert.deepEqual(
    [...f.records].filter(([key]) => key.startsWith(path + '/')),
    protectedBefore,
  );
  assert.equal(f.records.get('users/author').credits, 7);
  const receipt = f.records.get('users/author/campaignOperations/' + op('first'));
  assert.equal(JSON.stringify(receipt).includes('descrição'), false);
  assert.equal('description' in receipt, false);
});

test('stable operation replays once; stale, reused and simultaneous mutations cannot silently adopt a later base', async () => {
  const f = await fixture();
  const result = await update(f, 'same', 1, { title: ' Novo ' });
  assert.deepEqual(await update(f, 'same', 1, { title: 'Novo' }), result);
  await assert.rejects(update(f, 'same', 1, { title: 'Outro' }), { code: 'invalid-argument' });
  const race = await Promise.allSettled([
    update(f, 'race-a', 2, { status: 'active' }),
    update(f, 'race-b', 2, { status: 'completed' }),
  ]);
  assert.equal(race.filter((entry) => entry.status === 'fulfilled').length, 1);
  assert.ok(conflict(race.find((entry) => entry.status === 'rejected').reason));
  await assert.rejects(update(f, 'same', 1, { title: 'Novo' }), conflict);
  await assert.rejects(update(f, 'stale', 2, { title: 'Sobrescrever' }), conflict);
  f.records.delete(path);
  await assert.rejects(update(f, 'same', 1, { title: 'Novo' }), { code: 'not-found' });
  assert.equal(f.records.has(path), false);
});

test('campaign rejects forged fields, invalid patch values, unavailable ownership, future origins and invalid clocks before writing', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  for (const patch of [
    {},
    { title: ' ' },
    { title: 'a'.repeat(301) },
    { description: 'a'.repeat(4001) },
    { description: null },
    { status: 'ready' },
    { universeId: undefined },
    { universeId: 12 },
    { ownerId: 'other' },
    { revision: 8 },
    { provenance: { kind: 'independent' } },
  ])
    await assert.rejects(update(f, 'invalid', 1, patch), { code: 'invalid-argument' });
  await assert.rejects(update(f, 'anonymous', 1, { title: 'x' }, null), {
    code: 'unauthenticated',
  });
  await assert.rejects(update(f, 'foreign', 1, { title: 'x' }, 'other'), { code: 'not-found' });
  await assert.rejects(
    f.api.updateCampaign('author', {
      campaignId,
      operationId: op('top'),
      expectedRevision: 1,
      patch: { title: 'x' },
      ownerId: 'author',
    }),
    { code: 'invalid-argument' },
  );
  assert.deepEqual([...f.records], before);
  for (const changes of [
    { deleting: true },
    { provenance: { kind: 'original', adventureId: 'x' } },
    { activeBaseId: 'future' },
    { revision: 0 },
    { revision: Number.MAX_SAFE_INTEGER },
    { updatedAt: NaN },
  ]) {
    f.records.set(path, { ...f.campaign, ...changes });
    await assert.rejects(update(f, 'blocked', f.records.get(path).revision, { title: 'x' }));
    assert.equal(f.records.has('users/author/campaignOperations/' + op('blocked')), false);
  }
});

test('switch and unlink validate typed uses and counts atomically, never changing lore or other project counts', async () => {
  const f = await fixture();
  const linked = await update(f, 'link', 1, { universeId: 'first' });
  assert.equal(linked.universeId, 'first');
  assert.equal(f.records.get('universes/first').campaignCount, 1);
  assert.equal(f.records.get('universes/first').updatedAt, 1001);
  assert.deepEqual(await update(f, 'link', 1, { universeId: 'first' }), linked);
  const same = await update(f, 'same-link', 2, { universeId: 'first' });
  assert.equal(same.revision, 3);
  assert.equal(f.records.get('universes/first').campaignCount, 1);
  await update(f, 'switch', 3, { universeId: 'second' });
  assert.equal(f.records.get('universes/first').campaignCount, 0);
  assert.equal(f.records.get('universes/second').campaignCount, 1);
  assert.equal(f.records.has('universes/first/campaigns/' + campaignId), false);
  assert.deepEqual(f.records.get('universes/second/campaigns/' + campaignId), { campaignId });
  await update(f, 'unlink', 4, { universeId: null });
  assert.equal(f.records.get('universes/second').campaignCount, 0);
  for (const id of ['first', 'second']) {
    const universe = f.records.get('universes/' + id);
    assert.equal(universe.bookCount, 4);
    assert.equal(universe.adventureCount, 2);
    assert.equal(universe.loreVersion, 5);
    assert.equal(universe.privacyVersion, 3);
  }
});

test('unavailable or inconsistent universe counts/uses never modify campaign or receipt', async () => {
  const f = await fixture();
  for (const [id, value] of [
    ['foreign', { authorId: 'other', campaignCount: 0 }],
    ['deleting', { authorId: 'author', deleting: true, campaignCount: 0 }],
  ])
    f.records.set('universes/' + id, value);
  for (const id of ['missing', 'foreign', 'deleting'])
    await assert.rejects(update(f, 'bad-world-' + id, 1, { universeId: id }));
  for (const value of [null, -1, 1.5, '0', Number.MAX_SAFE_INTEGER]) {
    f.records.get('universes/first').campaignCount = value;
    await assert.rejects(update(f, 'invalid-count', 1, { universeId: 'first' }), {
      code: 'failed-precondition',
    });
    assert.equal(f.records.get(path).revision, 1);
  }
  f.records.get('universes/first').campaignCount = 0;
  f.records.set('universes/first/campaigns/' + campaignId, { campaignId });
  await assert.rejects(update(f, 'orphan-new-use', 1, { universeId: 'first' }), {
    code: 'failed-precondition',
  });
  f.records.delete('universes/first/campaigns/' + campaignId);
  await update(f, 'valid-link', 1, { universeId: 'first' });
  f.records.get('universes/first').campaignCount = 0;
  await assert.rejects(update(f, 'zero-old-count', 2, { universeId: null }), {
    code: 'failed-precondition',
  });
  f.records.get('universes/first').campaignCount = 1;
  f.records.delete('universes/first/campaigns/' + campaignId);
  await assert.rejects(update(f, 'missing-old-use', 2, { universeId: null }), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.get(path).universeId, 'first');
});

test('legacy universe initializes missing count only after a bounded proof of no uses; removed universe can detach without recreation', async () => {
  const f = await fixture();
  f.records.set('universes/legacy', { authorId: 'author', name: 'Antigo' });
  await update(f, 'legacy-link', 1, { universeId: 'legacy' });
  assert.equal(f.records.get('universes/legacy').campaignCount, 1);
  assert.ok(
    f.reads.some(
      (read) =>
        read.collectionPath === 'universes/legacy/campaigns' &&
        read.maximum === 1 &&
        read.count === 0,
    ),
  );
  f.records.delete('universes/legacy');
  const detached = await update(f, 'detach-orphan', 2, { universeId: null });
  assert.equal(detached.universeId, null);
  assert.equal(f.records.has('universes/legacy'), false);
  assert.equal(f.records.has('universes/legacy/campaigns/' + campaignId), false);
  f.records.set('universes/legacy-used', { authorId: 'author', name: 'Antigo' });
  f.records.set('universes/legacy-used/campaigns/other', { campaignId: 'other' });
  await assert.rejects(update(f, 'legacy-used', 3, { universeId: 'legacy-used' }), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.get('universes/legacy-used').campaignCount, undefined);
});

test('link replay reauthorizes current universe; fresh creation initializes counters explicitly', async () => {
  const f = await fixture();
  const universe = await createUniverseService({ db: f.db, now: () => 100 }).createUniverse(
    'author',
    { creationId: 'current', name: 'Novo' },
  );
  assert.equal(universe.campaignCount, 0);
  await update(f, 'link', 1, { universeId: 'current' });
  f.records.get('universes/current').deleting = true;
  await assert.rejects(update(f, 'link', 1, { universeId: 'current' }), {
    code: 'failed-precondition',
  });
  assert.equal(f.records.get('universes/current').campaignCount, 1);
  assert.equal(f.records.get(path).revision, 2);
});
