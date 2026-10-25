import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { studioDb } from './helpers/studioDb.mjs';
import { createBookBackupReadService } from '../src/bookBackupRead.mjs';
import { createBookBackupResourceService } from '../src/bookBackupResourceRead.mjs';
import { BOOK_RESOURCE_KINDS } from '../src/bookBackupResources.mjs';
import { sceneRankBetween } from '../src/sceneRanks.mjs';
import { digest } from '../src/workProgressContracts.mjs';
const text = '\ufeffação 🌙\u0000'.repeat(12000),
  rankA = sceneRankBetween(),
  rankB = sceneRankBetween(rankA);
function fixture() {
  const f = studioDb();
  f.records.set('books/book', { authorId: 'author', title: 'Livro', createdAt: 1, updatedAt: 2 });
  const scene = {
    id: 'scene',
    ownerId: 'author',
    schemaVersion: 1,
    revision: 3,
    title: 'Cena',
    parentId: 'removed-chapter',
    formerParentId: 'older',
    stage: 'review',
    archived: true,
    rankA,
    rankB,
    bodyHash: digest(text),
    bodyBytes: Buffer.byteLength(text),
    createdAt: 3,
    updatedAt: 4,
  };
  f.records.set('books/book/lore/entity', {
    bookId: 'book',
    name: 'Ana',
    aliases: ['Aninha'],
    category: 'character',
    summary: 'Own',
    details: text,
    structuredDetails: {
      appearance: 'Own appearance',
      personality: '',
      history: '',
      notes: '',
      name: 'MUST NOT COPY',
    },
    relations: [
      {
        targetEntityId: 'universe:gone:missing',
        relationType: 'knows',
        description: 'Own relation',
        available: true,
        name: 'MUST NOT COPY',
      },
    ],
    isPublic: true,
    createdAt: 3,
    updatedAt: 4,
    secret: 'secret',
  });
  f.records.set('books/book/scenes/scene', scene);
  f.records.set('books/book/scenes/scene/body/current', {
    content: text,
    hash: digest(text),
    privateReceipt: 'secret',
  });
  f.records.set('books/book/scenes/scene/planning/current', {
    objective: 'Objetivo',
    conflict: 'Conflito',
    pointOfView: 'Ana',
    key: 'secret',
  });
  f.records.set('books/book/scenes/scene/references/ref', {
    kind: 'universe',
    scopeId: 'gone',
    entityId: 'missing',
    name: 'MUST NOT COPY',
    available: true,
  });
  f.records.set('books/book/sceneControls/unassigned', {
    rankSlot: 'B',
    rebalanceOperation: 'secret',
  });
  f.records.set('books/book/sceneSources/source', {
    id: 'source',
    original: {
      title: 'Original',
      content: '<p>Antes</p>',
      order: 1,
      createdAt: 5,
      personaComplement: { personaId: 'p', overrides: [], apiKey: 'secret' },
      operationId: 'secret',
    },
    hash: digest('<p>Antes</p>'),
    createdAt: 6,
    sourceVersion: 'secret',
  });
  const base = {
    ownerId: 'author',
    schemaVersion: 1,
    revision: 2,
    rankA,
    rankB,
    createdAt: 1,
    updatedAt: 2,
  };
  f.records.set('books/book/arcs/arc', {
    ...base,
    id: 'arc',
    kind: 'arc',
    title: 'Arco',
    initialState: 'Início',
    objective: 'Meta',
    plannedOutcome: 'Fim',
    referenceCount: 1,
  });
  f.records.set('books/book/arcs/arc/milestones/m', {
    ...base,
    id: 'm',
    arcId: 'arc',
    kind: 'milestone',
    title: 'Marco',
    notes: 'Notas',
  });
  f.records.set('books/book/timelineEvents/e', {
    ...base,
    id: 'e',
    kind: 'event',
    title: 'Evento',
    description: 'Descrição',
    dateLabel: '3º dia do inverno',
  });
  f.records.set('books/book/narrativeControls/' + digest({ kind: 'arc' }), {
    resource: { kind: 'arc' },
    rankSlot: 'B',
    rebalanceOperationId: 'secret',
  });
  f.records.set('books/book/narrativeLinks/link', {
    source: { kind: 'arc', id: 'arc', extra: 'secret' },
    reference: {
      kind: 'lore',
      reference: { kind: 'universe', scopeId: 'gone', entityId: 'missing', name: 'MUST NOT COPY' },
    },
    label: 'MUST NOT COPY',
    sourceKey: 'secret',
  });
  return {
    ...f,
    api: createBookBackupResourceService({ db: f.db }),
    root: createBookBackupReadService({ db: f.db }),
  };
}
const source = (f) => f.root.getBookBackupSource('author', { bookId: 'book' });
const list = (f, pin, kind, parentId = null, extra = {}, uid = 'author') =>
  f.api.listBookBackupResources(uid, {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    kind,
    parentId,
    limit: 50,
    ...extra,
  });
const read = (f, pin, kind, parentId, item, extra = {}, uid = 'author') =>
  f.api.readBookBackupResource(uid, {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    kind,
    parentId,
    ...item,
    index: 0,
    ...extra,
  });
async function value(f, pin, kind, parentId = null) {
  const item = (await list(f, pin, kind, parentId)).items[0],
    parts = [];
  let first;
  for (let index = 0; !first || index < first.chunkCount; index++) {
    const part = await read(f, pin, kind, parentId, item, { index });
    first ??= part;
    const bytes = Buffer.from(part.chunkBase64, 'base64');
    assert.ok(bytes.length <= 65536);
    parts.push(bytes);
  }
  const bytes = Buffer.concat(parts);
  assert.equal(createHash('sha256').update(bytes).digest('hex'), first.contentHash);
  assert.equal(bytes.length, first.byteLength);
  return JSON.parse(bytes.toString('utf8'));
}
test('all twelve types project author data only, preserve archived/orphaned scenes/ranks and never resolve global labels', async () => {
  const f = fixture(),
    pin = await source(f),
    before = structuredClone(f.records);
  const rows = new Map();
  for (const kind of BOOK_RESOURCE_KINDS) {
    const parent =
      kind.startsWith('scene-') &&
      ['scene-body', 'scene-planning', 'scene-reference'].includes(kind)
        ? 'scene'
        : kind === 'milestone'
          ? 'arc'
          : null;
    const row = await value(f, pin, kind, parent);
    assert.deepEqual(Object.keys(row), ['schemaVersion', 'kind', 'parentId', 'id', 'data']);
    assert.equal(row.kind, kind);
    assert.equal(row.parentId, parent);
    assert.equal(JSON.stringify(row).includes('secret'), false);
    assert.equal(JSON.stringify(row).includes('MUST NOT COPY'), false);
    rows.set(kind, row.data);
  }
  assert.equal(rows.get('lore').details, text);
  assert.equal(rows.get('lore').createdAt, 3);
  assert.deepEqual(rows.get('lore').relations, [
    { targetEntityId: 'universe:gone:missing', relationType: 'knows', description: 'Own relation' },
  ]);
  assert.equal('bookId' in rows.get('lore'), false);
  assert.equal(rows.get('scene').archived, true);
  assert.equal(rows.get('scene').parentId, 'removed-chapter');
  assert.equal(rows.get('scene').rankB, rankB);
  assert.equal(rows.get('scene-body').content, text);
  assert.deepEqual(rows.get('scene-planning'), {
    objective: 'Objetivo',
    conflict: 'Conflito',
    pointOfView: 'Ana',
  });
  assert.deepEqual(rows.get('scene-reference'), {
    kind: 'universe',
    scopeId: 'gone',
    entityId: 'missing',
  });
  assert.equal(rows.get('scene-control').rankSlot, 'B');
  assert.equal(rows.get('scene-source').original.content, '<p>Antes</p>');
  assert.equal(rows.get('scene-source').original.createdAt, 5);
  assert.equal(rows.get('event').dateLabel, '3º dia do inverno');
  assert.deepEqual(rows.get('narrative-link').source, { kind: 'arc', id: 'arc' });
  assert.equal('ownerId' in rows.get('arc'), false);
  assert.equal('referenceCount' in rows.get('arc'), false);
  assert.deepEqual(f.records, before);
});
test('list pages use metadata masks, include more than 50 references and bind cursor to kind/parent/source', async () => {
  const f = fixture();
  for (let i = 0; i < 101; i++)
    f.records.set('books/book/scenes/scene/references/r' + String(i).padStart(3, '0'), {
      kind: 'universe',
      scopeId: 'gone',
      entityId: String(i),
    });
  const pin = await source(f),
    ids = [];
  let cursor = null,
    first;
  do {
    const page = await list(f, pin, 'scene-reference', 'scene', { cursor });
    first ??= page;
    ids.push(...page.items.map((item) => item.id));
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 102);
  assert.equal(new Set(ids).size, 102);
  assert.ok(f.reads.every((entry) => entry.maximum === 51 && entry.fields.length === 0));
  assert.ok(f.metadataReads.every((entry) => !entry.fields.includes('content')));
  await assert.rejects(list(f, pin, 'scene-planning', 'scene', { cursor: first.nextCursor }), {
    code: 'invalid-argument',
  });
  await assert.rejects(list(f, pin, 'scene-reference', 'other', { cursor: first.nextCursor }), {
    code: 'invalid-argument',
  });
});
test('body and planning native changes invalidate old tokens while root token stays the same', async () => {
  for (const [kind, field] of [
    ['scene-body', 'content'],
    ['scene-planning', 'objective'],
  ]) {
    const f = fixture(),
      pin = await source(f),
      item = (await list(f, pin, kind, 'scene')).items[0];
    const path =
      'books/book/scenes/scene/' + (kind === 'scene-body' ? 'body' : 'planning') + '/current';
    await f.db.runTransaction((tx) => tx.update(f.db.doc(path), { [field]: 'changed' }));
    assert.equal((await source(f)).sourceToken, pin.sourceToken);
    await assert.rejects(read(f, pin, kind, 'scene', item), {
      details: { reason: 'book-backup-item-changed' },
    });
  }
});
test('body/source corruption of same native snapshot is rejected before returning a chunk', async () => {
  for (const kind of ['scene-body', 'scene-source']) {
    const f = fixture(),
      pin = await source(f),
      parent = kind === 'scene-body' ? 'scene' : null;
    const item = (await list(f, pin, kind, parent)).items[0];
    if (kind === 'scene-body')
      f.records.get('books/book/scenes/scene/body/current').content = 'corrupt';
    else f.records.get('books/book/sceneSources/source').original.content = 'corrupt';
    await assert.rejects(read(f, pin, kind, parent, item), { code: 'failed-precondition' });
  }
});
test('missing planning is explicit absence; missing canonical scene body cannot silently become an empty list', async () => {
  const f = fixture(),
    pin = await source(f);
  f.records.delete('books/book/scenes/scene/planning/current');
  assert.deepEqual((await list(f, pin, 'scene-planning', 'scene')).items, []);
  f.records.delete('books/book/scenes/scene/body/current');
  await assert.rejects(list(f, pin, 'scene-body', 'scene'), { code: 'failed-precondition' });
});
test('parent identity and ownership/deleting state are rechecked for each nested call', async () => {
  const f = fixture(),
    pin = await source(f),
    item = (await list(f, pin, 'scene-body', 'scene')).items[0];
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc('books/book/scenes/scene'), { title: 'Changed' }),
  );
  await assert.rejects(read(f, pin, 'scene-body', 'scene', item), {
    details: { reason: 'book-backup-item-changed' },
  });
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc('books/book/scenes/scene'), { ownerId: 'other' }),
  );
  await assert.rejects(list(f, pin, 'scene-reference', 'scene'), { code: 'not-found' });
  await f.db.runTransaction((tx) =>
    tx.update(f.db.doc('books/book/scenes/scene'), { ownerId: 'author', deleting: true }),
  );
  await assert.rejects(list(f, pin, 'scene-body', 'scene'), { code: 'failed-precondition' });
});
test('root isolation/deletion, invalid scopes/parts and busy ordering fail explicitly', async () => {
  const f = fixture(),
    pin = await source(f),
    item = (await list(f, pin, 'arc')).items[0];
  for (const uid of [null, 'other'])
    await assert.rejects(list(f, pin, 'arc', null, {}, uid), {
      code: uid ? 'not-found' : 'unauthenticated',
    });
  for (const args of [
    ['campaign-lore', null, {}],
    ['scene-body', null, {}],
    ['arc', 'scene', {}],
    ['arc', null, { path: 'users/other' }],
    ['scene-reference', '../scene', {}],
    ['arc', null, { limit: 51 }],
  ])
    await assert.rejects(list(f, pin, ...args), { code: 'invalid-argument' });
  await assert.rejects(read(f, pin, 'arc', null, item, { index: -1 }), {
    code: 'invalid-argument',
  });
  f.records.get('books/book/arcs/arc').rebalancing = true;
  await assert.rejects(read(f, pin, 'arc', null, item), { code: 'failed-precondition' });
  await f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { deleting: true }));
  await assert.rejects(list(f, pin, 'arc'), { code: 'not-found' });
});
test('metadata-only chapter remains compatible and now includes active rank slot', async () => {
  const f = fixture();
  f.records.set('books/book/chapters/c', {
    title: 'Scenes',
    content: '',
    contentMode: 'scenes',
    rankSlot: 'B',
  });
  const pin = await source(f);
  const item = (
    await f.root.listBookBackupStructure('author', {
      bookId: 'book',
      sourceToken: pin.sourceToken,
      kind: 'chapter',
    })
  ).items[0];
  const chunk = await f.root.readBookBackupStructure('author', {
    bookId: 'book',
    sourceToken: pin.sourceToken,
    kind: 'chapter',
    ...item,
    index: 0,
  });
  assert.equal(JSON.parse(Buffer.from(chunk.chunkBase64, 'base64').toString()).rankSlot, 'B');
});

test('narrative kind and active slot corruption fail before projecting another type', async () => {
  const f = fixture(),
    pin = await source(f);
  const event = (await list(f, pin, 'event')).items[0];
  f.records.get('books/book/timelineEvents/e').kind = 'arc';
  await assert.rejects(read(f, pin, 'event', null, event), { code: 'failed-precondition' });
  const control = (await list(f, pin, 'scene-control')).items[0];
  f.records.get('books/book/sceneControls/unassigned').rankSlot = 'C';
  await assert.rejects(read(f, pin, 'scene-control', null, control), {
    code: 'failed-precondition',
  });
});

test('own lore keeps legacy absences and rejects explicit external/wrong-book scope', async () => {
  const f = fixture(),
    pin = await source(f);
  f.records.set('books/book/lore/entity', { name: 'Legacy', details: '' });
  const data = (await value(f, pin, 'lore')).data;
  assert.deepEqual(data, { name: 'Legacy', details: '' });
  for (const extra of [
    { bookId: 'other' },
    { universeId: 'world' },
    { adventureId: 'adventure' },
  ]) {
    f.records.set('books/book/lore/entity', { name: 'Legacy', ...extra });
    await assert.rejects(value(f, pin, 'lore'), { code: 'failed-precondition' });
  }
});
test('native own-lore edit invalidates an item even when an Admin bypasses the root clock', async () => {
  const f = fixture(),
    pin = await source(f),
    row = (await list(f, pin, 'lore')).items[0];
  await f.db.runTransaction(async (tx) =>
    tx.update(f.db.doc('books/book/lore/entity'), { details: 'Changed' }),
  );
  assert.deepEqual(await source(f), pin);
  await assert.rejects(read(f, pin, 'lore', null, row), { code: 'failed-precondition' });
});

test('physical lore reads refuse every payloadStorage stub while metadata listing remains available', async () => {
  const f = fixture();
  f.records.get('books/book/lore/entity').payloadStorage = {};
  const pin = await source(f),
    page = await list(f, pin, 'lore');
  assert.equal(page.items.length, 1);
  await assert.rejects(read(f, pin, 'lore', null, page.items[0]), { code: 'failed-precondition' });
});
