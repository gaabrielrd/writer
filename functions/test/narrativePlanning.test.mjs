import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { createNarrativePlanningService } from '../src/narrativePlanning.mjs';
import { createScenesService } from '../src/scenes.mjs';
import { digest } from '../src/narrativeContracts.mjs';
const target = { kind: 'book', id: 'book' },
  op = (n) => `narrative-operation-${String(n).padStart(4, '0')}`;
function fixture() {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    wordCount: 2,
    updatedAt: 100,
    createdAt: 1,
  });
  f.records.set('books/book/chapters/legacy', {
    title: 'Original',
    content: 'Texto original',
    wordCount: 2,
    order: 1,
    updatedAt: 100,
  });
  return {
    ...f,
    api: createNarrativePlanningService({ db: f.db, now: () => 200 }),
    scenes: createScenesService({ db: f.db, now: () => 200 }),
  };
}
const create = (api, n, kind = 'arc', extra = {}) =>
  api.createNarrativeItem('author', {
    target,
    resource: { kind },
    operationId: op(n),
    title: `Item ${n}`,
    ...extra,
  });
const source = (item) => ({
  kind: item.kind,
  id: item.id,
  ...(item.kind === 'milestone' ? { arcId: item.arcId } : {}),
});
async function finish(call) {
  for (let n = 0; n < 500; n++) {
    const result = await call();
    if (result.complete) return result;
  }
  assert.fail('Job did not finish');
}
test('typed creation preserves legacy manuscript, dates and private prose; receipts cannot duplicate or change payload', async () => {
  const f = fixture(),
    legacy = structuredClone(f.records.get('books/book/chapters/legacy'));
  const request = {
    target,
    resource: { kind: 'arc' },
    operationId: op(1),
    title: 'Arco',
    initialState: 'Segredo',
    objective: 'Objetivo',
    plannedOutcome: 'Desfecho',
  };
  const result = await f.api.createNarrativeItem('author', request);
  assert.deepEqual(await f.api.createNarrativeItem('author', request), result);
  assert.equal(f.records.get('books/book').hasNarrativeResources, true);
  assert.equal(f.records.get('books/book').hasSceneResources, undefined);
  assert.equal(f.records.get('books/book').wordCount, 2);
  assert.deepEqual(f.records.get('books/book/chapters/legacy'), legacy);
  assert.equal('initialState' in result.item, false);
  assert.equal(
    JSON.stringify(f.records.get(`users/author/narrativeOperations/${op(1)}`)).includes('Segredo'),
    false,
  );
  assert.equal(
    (await f.api.getNarrativeItem('author', { target, source: source(result.item) })).initialState,
    'Segredo',
  );
  await assert.rejects(f.api.createNarrativeItem('author', { ...request, title: 'Outro' }), {
    code: 'invalid-argument',
  });
  await assert.rejects(create(f.api, 2, 'event', { initialState: 'Campo de arco' }), {
    code: 'invalid-argument',
  });
  await assert.rejects(create(f.api, 2, 'arc', { title: 'x'.repeat(301) }), {
    code: 'invalid-argument',
  });
  await assert.rejects(create(f.api, 2, 'arc', { objective: 'x'.repeat(4001) }), {
    code: 'invalid-argument',
  });
});
test('events have optional free narrative dates and independent ordering; milestones are real children', async () => {
  const { api } = fixture(),
    arc = await create(api, 1);
  const event = await create(api, 2, 'event', {
    dateLabel: '3º dia do inverno',
    description: 'Privado',
  });
  assert.equal(
    (await api.getNarrativeItem('author', { target, source: source(event.item) })).dateLabel,
    '3º dia do inverno',
  );
  const empty = await create(api, 3, 'event');
  assert.equal(empty.item.dateLabel, '');
  const milestone = await api.createNarrativeItem('author', {
    target,
    resource: { kind: 'milestone', arcId: arc.item.id },
    operationId: op(4),
    title: 'Marco',
    notes: 'Notas',
  });
  assert.equal(milestone.item.arcId, arc.item.id);
  await assert.rejects(
    api.createNarrativeItem('author', {
      target,
      resource: { kind: 'milestone', arcId: 'absent' },
      operationId: op(5),
      title: 'Inválido',
    }),
    { code: 'not-found' },
  );
  assert.equal(
    (await api.listNarrativeItems('author', { target, resource: { kind: 'event' } })).items.length,
    2,
  );
  assert.equal(
    (await api.listNarrativeItems('author', { target, resource: { kind: 'arc' } })).items.length,
    1,
  );
});
test('ownership and deleting parent hide details uniformly; writes never invent or resurrect projects', async () => {
  const f = fixture(),
    created = await create(f.api, 1);
  assert.equal(await f.api.getNarrativeContext('intruder', { target }), null);
  assert.equal(
    await f.api.getNarrativeItem('intruder', { target, source: source(created.item) }),
    null,
  );
  assert.equal(
    await f.api.getNarrativeItem('author', { target, source: { kind: 'arc', id: 'absent' } }),
    null,
  );
  await assert.rejects(
    f.api.listNarrativeItems('intruder', { target, resource: { kind: 'arc' } }),
    { code: 'not-found' },
  );
  await assert.rejects(
    f.api.getNarrativeItem('author', { target, source: { kind: 'arc', id: '../x' } }),
    { code: 'invalid-argument' },
  );
  f.records.set('books/book', { ...f.records.get('books/book'), deleting: true });
  assert.equal(await f.api.getNarrativeContext('author', { target }), null);
  const before = structuredClone([...f.records]);
  await assert.rejects(create(f.api, 2), { code: 'not-found' });
  assert.deepEqual([...f.records], before);
});
test('edits are CAS and old receipts never pretend their text is current', async () => {
  const f = fixture(),
    created = await create(f.api, 1),
    request = {
      target,
      source: source(created.item),
      operationId: op(2),
      expectedRevision: 1,
      patch: { objective: 'Primeira' },
    };
  const first = await f.api.updateNarrativeItem('author', request);
  assert.deepEqual(await f.api.updateNarrativeItem('author', request), first);
  const second = await f.api.updateNarrativeItem('author', {
    ...request,
    operationId: op(3),
    expectedRevision: 2,
    patch: { objective: 'Segunda' },
  });
  const before = structuredClone([...f.records]);
  await assert.rejects(f.api.updateNarrativeItem('author', request), {
    code: 'failed-precondition',
    details: { reason: 'revision-conflict' },
  });
  await assert.rejects(f.api.updateNarrativeItem('author', { ...request, operationId: op(4) }), {
    code: 'failed-precondition',
  });
  assert.deepEqual([...f.records], before);
  assert.equal(second.item.revision, 3);
  assert.equal(
    (await f.api.getNarrativeItem('author', { target, source: request.source })).objective,
    'Segunda',
  );
});
test('manual movement compares structural versions and actual neighbors without touching chapters, scene ranks or counts', async () => {
  const f = fixture();
  for (let n = 1; n <= 4; n++) await create(f.api, n, 'event', { dateLabel: String(5 - n) });
  const original = structuredClone(f.records.get('books/book/chapters/legacy'));
  const page = await f.api.listNarrativeItems('author', {
    target,
    resource: { kind: 'event' },
    limit: 2,
  });
  const request = {
    target,
    source: { kind: 'event', id: op(4) },
    expectedRevision: 1,
    expectedStructureRevision: page.sequence.structureRevision,
    operationId: op(5),
    beforeId: op(1),
  };
  await f.api.moveNarrativeItem('author', request);
  assert.deepEqual(
    (await f.api.listNarrativeItems('author', { target, resource: { kind: 'event' } })).items.map(
      (item) => item.id,
    ),
    [op(4), op(1), op(2), op(3)],
  );
  assert.deepEqual(f.records.get('books/book/chapters/legacy'), original);
  assert.equal(f.records.get('books/book').wordCount, 2);
  await assert.rejects(
    f.api.moveNarrativeItem('author', { ...request, operationId: op(6), expectedRevision: 2 }),
    { code: 'failed-precondition' },
  );
  const current = await f.api.listNarrativeItems('author', { target, resource: { kind: 'event' } });
  await assert.rejects(
    f.api.moveNarrativeItem('author', {
      ...request,
      operationId: op(6),
      expectedRevision: 2,
      expectedStructureRevision: current.sequence.structureRevision,
      afterId: op(1),
      beforeId: op(3),
    }),
    { code: 'failed-precondition' },
  );
});
test('pages are bounded summaries and reject revision, legacy metadata, UID, resource and filter changes', async () => {
  const f = fixture();
  for (let n = 1; n <= 4; n++) await create(f.api, n);
  const request = { target, resource: { kind: 'arc' }, limit: 2 },
    first = await f.api.listNarrativeItems('author', request);
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  assert.equal('objective' in first.items[0], false);
  assert.equal(
    (await f.api.listNarrativeItems('author', { ...request, cursor: first.nextCursor })).items
      .length,
    2,
  );
  await assert.rejects(
    f.api.listNarrativeItems('author', {
      target,
      resource: { kind: 'event' },
      cursor: first.nextCursor,
    }),
    { code: 'invalid-argument' },
  );
  f.records.set('books/book', { ...f.records.get('books/book'), updatedAt: 900 });
  await assert.rejects(
    f.api.listNarrativeItems('author', { ...request, cursor: first.nextCursor }),
    { code: 'failed-precondition', details: { reason: 'revision-conflict' } },
  );
  await assert.rejects(f.api.listNarrativeItems('author', { ...request, limit: 51 }), {
    code: 'invalid-argument',
  });
  assert.ok(f.reads.every((read) => read.maximum <= 51));
});
test('multiple typed links preserve counts and identities; removals and universe changes do not leak old labels', async () => {
  const f = fixture(),
    arc = await create(f.api, 1),
    event = await create(f.api, 2, 'event');
  f.records.set('books/book/lore/entity', { name: 'Aurora', category: 'character' });
  f.records.set('universes/world', { authorId: 'author', updatedAt: 1 });
  f.records.set('universes/world/lore/global', { name: 'Nome privado', category: 'concept' });
  f.records.set('books/book', { ...f.records.get('books/book'), universeId: 'world' });
  const refs = [
    { kind: 'event', eventId: event.item.id },
    { kind: 'lore', reference: { kind: 'book', scopeId: 'book', entityId: 'entity' } },
    { kind: 'lore', reference: { kind: 'universe', scopeId: 'world', entityId: 'global' } },
  ];
  let revision = 1;
  for (let n = 0; n < refs.length; n++)
    revision = (
      await f.api.setNarrativeReference('author', {
        target,
        source: source(arc.item),
        expectedRevision: revision,
        operationId: op(10 + n),
        reference: refs[n],
      })
    ).item.revision;
  const linked = await f.api.listNarrativeReferences('author', {
    target,
    source: source(arc.item),
    limit: 2,
  });
  assert.equal(linked.items.length, 2);
  assert.ok(linked.nextCursor);
  assert.equal(
    (await f.api.getNarrativeItem('author', { target, source: source(arc.item) })).referenceCount,
    3,
  );
  const entityItems = await f.api.listEntityNarrativeItems('author', {
    target,
    reference: refs[1].reference,
  });
  assert.equal(entityItems.items[0].id, arc.item.id);
  f.records.set('books/book', { ...f.records.get('books/book'), universeId: null });
  const unavailable = (
    await f.api.listNarrativeReferences('author', { target, source: source(arc.item) })
  ).items.find(
    (view) => view.reference.kind === 'lore' && view.reference.reference.kind === 'universe',
  );
  assert.deepEqual(unavailable, { id: unavailable.id, reference: refs[2], available: false });
  await f.api.setNarrativeReference('author', {
    target,
    source: source(arc.item),
    expectedRevision: revision,
    operationId: op(15),
    reference: refs[2],
    remove: true,
  });
  await assert.rejects(
    f.api.setNarrativeReference('author', {
      target,
      source: source(arc.item),
      expectedRevision: revision + 1,
      operationId: op(16),
      reference: refs[2],
    }),
    { code: 'permission-denied' },
  );
});
test('entity item queries hide removed or foreign origins and invalidate cursors on world-only changes', async () => {
  const f = fixture(),
    ref = { kind: 'universe', scopeId: 'world', entityId: 'entity' };
  f.records.set('universes/world', { authorId: 'author', updatedAt: 1, loreVersion: 1 });
  f.records.set('universes/world/lore/entity', { name: 'Origem atual', updatedAt: 1 });
  f.records.set('books/book', { ...f.records.get('books/book'), universeId: 'world' });
  for (let n = 1; n <= 3; n++) {
    const arc = await create(f.api, n);
    await f.api.setNarrativeReference('author', {
      target,
      source: source(arc.item),
      operationId: op(10 + n),
      expectedRevision: 1,
      reference: { kind: 'lore', reference: ref },
    });
  }
  const first = await f.api.listEntityNarrativeItems('author', {
    target,
    reference: ref,
    limit: 1,
  });
  assert.ok(first.nextCursor);
  f.records.set('universes/world', { authorId: 'author', updatedAt: 2, loreVersion: 2 });
  await assert.rejects(
    f.api.listEntityNarrativeItems('author', { target, reference: ref, cursor: first.nextCursor }),
    { code: 'failed-precondition', details: { reason: 'revision-conflict' } },
  );
  f.records.set('books/book', { ...f.records.get('books/book'), universeId: null });
  assert.equal(
    (await f.api.listEntityNarrativeItems('author', { target, reference: ref })).items.length,
    0,
  );
  f.records.set('books/book', { ...f.records.get('books/book'), universeId: 'world' });
  f.records.delete('universes/world/lore/entity');
  assert.equal(
    (await f.api.listEntityNarrativeItems('author', { target, reference: ref })).items.length,
    0,
  );
  f.records.set('universes/world/lore/entity', { name: 'Restaurada' });
  f.records.set('universes/world', { authorId: 'intruder' });
  assert.equal(
    (await f.api.listEntityNarrativeItems('author', { target, reference: ref })).items.length,
    0,
  );
  assert.equal(
    (
      await f.api.listEntityNarrativeItems('author', {
        target,
        reference: { kind: 'book', scopeId: 'another-book', entityId: 'entity' },
      })
    ).items.length,
    0,
  );
});

test('scene archive/movement keeps reference identity; scene foreign to project cannot be linked', async () => {
  const f = fixture(),
    arc = await create(f.api, 1),
    scene = await f.scenes.createScene('author', { target, operationId: op(20), title: 'Cena' });
  const ref = { kind: 'scene', sceneId: scene.scene.id };
  await f.api.setNarrativeReference('author', {
    target,
    source: source(arc.item),
    expectedRevision: 1,
    operationId: op(2),
    reference: ref,
  });
  await f.scenes.archiveScene('author', {
    target,
    sceneId: scene.scene.id,
    operationId: op(21),
    expectedRevision: 1,
    archived: true,
  });
  const view = (await f.api.listNarrativeReferences('author', { target, source: source(arc.item) }))
    .items[0];
  assert.equal(view.archived, true);
  assert.equal(view.available, true);
  f.records.delete(`books/book/scenes/${scene.scene.id}`);
  assert.deepEqual(
    (await f.api.listNarrativeReferences('author', { target, source: source(arc.item) })).items[0],
    { id: view.id, reference: ref, available: false },
  );
  await assert.rejects(
    f.api.setNarrativeReference('author', {
      target,
      source: source(arc.item),
      expectedRevision: 2,
      operationId: op(3),
      reference: { kind: 'scene', sceneId: 'outside' },
    }),
    { code: 'permission-denied' },
  );
});
test('rebalance checkpoints preserve visible order, permit text edits and block structure until atomic switch', async () => {
  const f = fixture();
  for (let n = 1; n <= 3; n++) await create(f.api, n);
  const request = { target, resource: { kind: 'arc' }, operationId: op(10), limit: 1 };
  assert.equal((await f.api.rebalanceNarrativeRanks('author', request)).complete, false);
  const before = await f.api.listNarrativeItems('author', { target, resource: { kind: 'arc' } });
  assert.equal(before.sequence.rankSlot, 'A');
  assert.equal(before.sequence.rebalanceOperationId, op(10));
  assert.equal(
    (await f.api.getNarrativeJob('author', { target, operationId: op(10) })).kind,
    'rebalance',
  );
  await assert.rejects(create(f.api, 4), { code: 'failed-precondition' });
  await f.api.updateNarrativeItem('author', {
    target,
    source: { kind: 'arc', id: op(1) },
    operationId: op(11),
    expectedRevision: 1,
    patch: { objective: 'Pode editar' },
  });
  await finish(() => f.api.rebalanceNarrativeRanks('author', request));
  const after = await f.api.listNarrativeItems('author', { target, resource: { kind: 'arc' } });
  assert.equal(after.sequence.rankSlot, 'B');
  assert.deepEqual(
    after.items.map((i) => i.id),
    before.items.map((i) => i.id),
  );
  assert.equal(
    (await f.api.getNarrativeItem('author', { target, source: { kind: 'arc', id: op(1) } }))
      .objective,
    'Pode editar',
  );
});
test('deletion revokes source first, resumes cleanup and preserves independent events and incoming identities', async () => {
  const f = fixture(),
    arc = await create(f.api, 1),
    event = await create(f.api, 2, 'event');
  const milestone = await f.api.createNarrativeItem('author', {
    target,
    resource: { kind: 'milestone', arcId: arc.item.id },
    operationId: op(3),
    title: 'Marco',
  });
  await f.api.setNarrativeReference('author', {
    target,
    source: source(milestone.item),
    operationId: op(4),
    expectedRevision: 1,
    reference: { kind: 'event', eventId: event.item.id },
  });
  const deleteEvent = {
    target,
    source: source(event.item),
    expectedRevision: 1,
    operationId: op(5),
    limit: 1,
  };
  assert.equal((await f.api.deleteNarrativeItem('author', deleteEvent)).complete, false);
  assert.equal(
    await f.api.getNarrativeItem('author', { target, source: source(event.item) }),
    null,
  );
  const deleting = (
    await f.api.listNarrativeItems('author', { target, resource: { kind: 'event' } })
  ).items[0];
  assert.equal(deleting.deletionOperationId, op(5));
  await finish(() => f.api.deleteNarrativeItem('author', deleteEvent));
  assert.equal(
    (await f.api.listNarrativeReferences('author', { target, source: source(milestone.item) }))
      .items[0].available,
    false,
  );
  const deleteArc = {
    target,
    source: source(arc.item),
    expectedRevision: 1,
    operationId: op(6),
    limit: 1,
  };
  await f.api.deleteNarrativeItem('author', deleteArc);
  await assert.rejects(
    f.api.updateNarrativeItem('author', {
      target,
      source: source(milestone.item),
      operationId: op(7),
      expectedRevision: 2,
      patch: { notes: 'Bloqueado' },
    }),
    { code: 'not-found' },
  );
  await finish(() => f.api.deleteNarrativeItem('author', deleteArc));
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith(`books/book/arcs/${arc.item.id}/`)),
    false,
  );
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith('books/book/narrativeLinks/')),
    false,
  );
  assert.deepEqual(await f.api.deleteNarrativeItem('author', deleteArc), {
    complete: true,
    processed: 4,
  });
});
test('entity index explicitly prepares legacy references, handles concurrent changes and new UUID adoption without false empty results', async () => {
  const f = fixture();
  f.records.set('books/book/lore/entity', { name: 'Aurora', category: 'character' });
  const ref = { kind: 'book', scopeId: 'book', entityId: 'entity' };
  const scene = await f.scenes.createScene('author', { target, operationId: op(1), title: 'Cena' });
  // Existing F2-02 reference, before index feature deployment.
  f.records.set(`books/book/scenes/${scene.scene.id}/references/${digest(ref)}`, ref);
  await assert.rejects(f.api.listEntityScenes('author', { target, reference: ref }), {
    code: 'failed-precondition',
    details: { reason: 'entity-index-not-ready' },
  });
  const request = { target, operationId: op(10), limit: 1 };
  assert.equal((await f.api.prepareEntitySceneIndex('author', request)).complete, false);
  const context = await f.api.getNarrativeContext('author', { target });
  assert.equal(context.entityIndexOperationId, op(10));
  await f.scenes.setSceneReference('author', {
    target,
    sceneId: scene.scene.id,
    expectedRevision: 1,
    operationId: op(2),
    reference: ref,
    remove: true,
  });
  assert.equal(
    [...f.records.keys()].some((path) => path.startsWith('books/book/sceneLoreLinks/')),
    false,
  );
  await finish(() => f.api.prepareEntitySceneIndex('author', { ...request, operationId: op(11) }));
  assert.equal((await f.api.getNarrativeContext('author', { target })).entityIndexReady, true);
  assert.equal(
    (await f.api.listEntityScenes('author', { target, reference: ref })).items.length,
    0,
  );
  await f.scenes.setSceneReference('author', {
    target,
    sceneId: scene.scene.id,
    expectedRevision: 2,
    operationId: op(3),
    reference: ref,
  });
  assert.equal(
    (await f.api.listEntityScenes('author', { target, reference: ref })).items[0].title,
    'Cena',
  );
  f.records.delete('books/book/lore/entity');
  const unavailable = (await f.api.listEntityScenes('author', { target, reference: ref })).items[0];
  assert.deepEqual(unavailable, { id: unavailable.id, sceneId: scene.scene.id, available: false });
});
test('lore options are paginated and current-scope-only; adventure without universe works without a fake book', async () => {
  const f = fixture();
  for (let n = 0; n < 3; n++)
    f.records.set(`books/book/lore/entity${n}`, {
      name: `Nome ${n}`,
      category: 'character',
      details: 'Segredo',
    });
  const first = await f.api.listNarrativeLoreOptions('author', { target, scope: 'book', limit: 2 });
  assert.equal(first.items.length, 2);
  assert.ok(first.nextCursor);
  assert.equal(JSON.stringify(first).includes('Segredo'), false);
  assert.equal(
    (
      await f.api.listNarrativeLoreOptions('author', {
        target,
        scope: 'book',
        cursor: first.nextCursor,
      })
    ).items.length,
    1,
  );
  f.records.set('adventures/adventure', { ownerId: 'author', title: 'Aventura', updatedAt: 1 });
  const adventure = { kind: 'adventure', id: 'adventure' };
  const event = await f.api.createNarrativeItem('author', {
    target: adventure,
    resource: { kind: 'event' },
    title: 'Evento',
    operationId: op(10),
  });
  assert.equal(event.item.kind, 'event');
  assert.equal(
    (await f.api.listNarrativeLoreOptions('author', { target: adventure, scope: 'universe' })).items
      .length,
    0,
  );
  await assert.rejects(
    f.api.listNarrativeLoreOptions('author', { target: adventure, scope: 'book' }),
    { code: 'invalid-argument' },
  );
  assert.equal([...f.records.keys()].filter((path) => /^books\/[^/]+$/.test(path)).length, 1);
});
test('book cleanup includes narrative-only resources and children, leaving private receipts of unrelated projects intact', async () => {
  const f = fixture(),
    arc = await create(f.api, 1);
  await create(f.api, 2, 'event');
  await f.api.createNarrativeItem('author', {
    target,
    resource: { kind: 'milestone', arcId: arc.item.id },
    operationId: op(3),
    title: 'Marco',
  });
  f.records.set('users/author/narrativeOperations/unrelated', { other: 'preserve' });
  f.records.set('books/book', { ...f.records.get('books/book'), deleting: true });
  await finish(() => f.scenes.deleteSceneBook('author', { target, operationId: op(20), limit: 1 }));
  assert.equal(
    [...f.records.keys()].some((path) => path === 'books/book' || path.startsWith('books/book/')),
    false,
  );
  assert.equal(f.records.has('deletedBooks/book'), true);
  assert.deepEqual(f.records.get('users/author/narrativeOperations/unrelated'), {
    other: 'preserve',
  });
});
