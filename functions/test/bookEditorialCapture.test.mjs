import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { studioDb } from './helpers/studioDb.mjs';
import { createBookEditorialCaptureService } from '../src/bookEditorialCapture.mjs';
import { createLiteraryProductionService } from '../src/literaryProduction.mjs';
import { createLiteraryPlanningService } from '../src/literaryPlanning.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import { LITERARY_PLAN_SCHEMA } from '../src/literaryPlanFields.mjs';
import { workScope, workProject } from '../src/workProgressContracts.mjs';
import { touchLiteraryBackupWrite } from '../src/literaryBackupFence.mjs';
const target = { kind: 'book', id: 'book' },
  hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
async function fixture({ empty = false } = {}) {
  const f = studioDb();
  f.records.set('books/book', {
    authorId: 'author',
    title: 'Livro',
    status: 'draft',
    createdAt: 1,
    updatedAt: 10,
    wordCount: 0,
  });
  f.records.set('users/author', { credits: 9 });
  const production = createLiteraryProductionService({ db: f.db, now: () => 100 }),
    planning = createLiteraryPlanningService({ db: f.db, now: () => 200 }),
    api = createBookEditorialCaptureService({ db: f.db });
  let n = 0;
  const save = (
    id = 'plan',
    plan = {
      kind: 'chapterBrief',
      title: 'PRIVATE_PLAN_TITLE',
      status: 'working',
      fields: { function: 'Texto próprio.' },
      references: [],
    },
    expectedRevision = 0,
  ) =>
    planning.saveLiteraryPlan('author', {
      target,
      id,
      operationId: 'capture-plan-' + String(++n).padStart(5, '0'),
      expectedRevision,
      plan,
    });
  if (!empty) {
    await production.saveLiteraryContract('author', {
      target,
      operationId: 'capture-contract-0001',
      expectedRevision: 0,
      contract: emptyEditorialContract(),
    });
    await save();
  }
  return { ...f, api, planning, production, save };
}
async function source(f) {
  const got = await f.api.getBookEditorialCaptureSource('author', { bookId: 'book' });
  return {
    bookId: 'book',
    bookSourceToken: got.bookSourceToken,
    editorialSourceToken: got.editorialSourceToken,
  };
}
const list = (f, wire, family, extra = {}) =>
  f.api.listBookEditorialCaptureRecords('author', { ...wire, family, limit: 1, ...extra });
const first = async (f, wire, family) => ({
  ...wire,
  family,
  ...(await list(f, wire, family)).items[0],
});
async function read(f, wire) {
  const first = await f.api.readBookEditorialCaptureRecord('author', { ...wire, index: 0 });
  if (first.state === 'current-alias') return { first, artifact: null };
  const chunks = [Buffer.from(first.chunkBase64, 'base64')];
  for (let index = 1; index < first.chunkCount; index++) {
    const part = await f.api.readBookEditorialCaptureRecord('author', {
      ...wire,
      index,
      projectionToken: first.projectionToken,
    });
    const bytes = Buffer.from(part.chunkBase64, 'base64');
    assert.equal(hash(bytes), part.chunkHash);
    chunks.push(bytes);
  }
  const bytes = Buffer.concat(chunks);
  assert.equal(hash(bytes), first.contentHash);
  assert.equal(bytes.length, first.byteLength);
  return { first, artifact: JSON.parse(bytes.toString('utf8')) };
}
test('an empty book stays explicitly empty without fabricating a contract or writing a capture session', async () => {
  const f = await fixture({ empty: true }),
    before = structuredClone([...f.records]),
    wire = await source(f);
  for (const family of ['contract-current', 'contract-version', 'plan-current', 'plan-version'])
    assert.deepEqual((await list(f, wire, family)).items, []);
  assert.deepEqual([...f.records], before);
});
test('listing exposes native metadata only and capture reads leave manuscript, credits and stored sources unchanged', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]),
    wire = await source(f),
    page = await list(f, wire, 'plan-current');
  assert.equal(JSON.stringify(page).includes('PRIVATE_PLAN_TITLE'), false);
  const value = await read(f, { ...wire, family: 'plan-current', ...page.items[0] });
  assert.equal(value.artifact.content.title, 'PRIVATE_PLAN_TITLE');
  assert.equal(value.artifact.lineage.role, 'current');
  assert.equal(value.artifact.provenance, 'unknown');
  assert.equal(JSON.stringify(value.artifact).includes('sourceToken'), false);
  assert.deepEqual([...f.records], before);
});
test('current snapshots are emitted once and their identical immutable versions return an explicit alias', async () => {
  const f = await fixture(),
    wire = await source(f);
  for (const prefix of ['contract', 'plan']) {
    const current = await read(f, await first(f, wire, prefix + '-current')),
      version = await read(f, await first(f, wire, prefix + '-version'));
    assert.equal(version.first.state, 'current-alias');
    assert.equal(version.artifact, null);
    assert.equal(version.first.artifactId, current.artifact.id);
    assert.equal(version.first.contentHash, current.first.contentHash);
  }
});
test('earlier plan versions stay distinct under the same logical lineage', async () => {
  const f = await fixture();
  await f.save(
    'plan',
    {
      kind: 'chapterBrief',
      title: 'Revisada',
      status: 'working',
      fields: { function: 'Outra decisão.' },
      references: [],
    },
    1,
  );
  const wire = await source(f),
    current = await read(f, await first(f, wire, 'plan-current'));
  let cursor = null,
    old = null,
    aliases = 0;
  do {
    const page = await list(f, wire, 'plan-version', { cursor });
    for (const item of page.items) {
      const value = await read(f, { ...wire, family: 'plan-version', ...item });
      if (value.artifact) old = value.artifact;
      else aliases++;
    }
    cursor = page.nextCursor;
  } while (cursor);
  assert.equal(aliases, 1);
  assert.equal(old.revision, 1);
  assert.equal(old.lineage.role, 'version');
  assert.equal(old.lineage.id, current.artifact.lineage.id);
  assert.notEqual(old.id, current.artifact.id);
});
test('metadata cursors advance without duplicates and cannot move into a different family or book', async () => {
  const f = await fixture();
  await f.save('a');
  await f.save('z');
  const wire = await source(f),
    page = await list(f, wire, 'plan-current');
  assert.ok(page.nextCursor);
  const next = await list(f, wire, 'plan-current', { cursor: page.nextCursor });
  assert.notEqual(next.items[0].id, page.items[0].id);
  await assert.rejects(list(f, wire, 'plan-version', { cursor: page.nextCursor }));
  await assert.rejects(
    list(f, { ...wire, bookId: 'other' }, 'plan-current', { cursor: page.nextCursor }),
  );
});
test('bounded parts preserve literal Unicode/BOM/CRLF and require the original projection after the first part', async () => {
  const f = await fixture(),
    fields = Object.fromEntries(
      Object.keys(LITERARY_PLAN_SCHEMA.chapterBrief.fields).map((key) => [
        key,
        'x'.repeat(3000) + '🕯️\r\n',
      ]),
    );
  fields.function = '\ufeff' + fields.function;
  await f.save('large', {
    kind: 'chapterBrief',
    title: 'Longa',
    status: 'working',
    fields,
    references: [],
  });
  const wire = await source(f),
    page = await list(f, wire, 'plan-current'),
    item =
      page.items[0].id === 'large'
        ? page.items[0]
        : (await list(f, wire, 'plan-current', { cursor: page.nextCursor })).items.find(
            (item) => item.id === 'large',
          );
  const record = { ...wire, family: 'plan-current', ...item },
    value = await read(f, record);
  assert.ok(value.first.chunkCount > 1);
  assert.equal(value.artifact.content.fields.function, fields.function);
  await assert.rejects(f.api.readBookEditorialCaptureRecord('author', { ...record, index: 1 }));
  await assert.rejects(
    f.api.readBookEditorialCaptureRecord('author', {
      ...record,
      index: 1,
      projectionToken: 'a'.repeat(64),
    }),
  );
});
test('each part reauthorizes the root and rejects a source version changed after listing', async () => {
  const f = await fixture(),
    wire = await source(f),
    record = await first(f, wire, 'plan-current');
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'other' });
  await assert.rejects(read(f, record));
  f.records.set('books/book', { ...f.records.get('books/book'), authorId: 'author' });
  await f.save(
    'plan',
    { kind: 'chapterBrief', title: 'Alterada', status: 'working', fields: {}, references: [] },
    1,
  );
  await assert.rejects(read(f, record));
});
test('native item identity prevents accepting a changed row even if an out-of-protocol writer skipped the root clock', async () => {
  const f = await fixture(),
    wire = await source(f),
    record = await first(f, wire, 'plan-current');
  await f.db.runTransaction(async (tx) => {
    const ref = f.db.doc('books/book/literaryPlans/plan');
    await tx.get(ref);
    tx.update(ref, { updatedAt: 999 });
  });
  await assert.rejects(
    read(f, record),
    (error) => error.details?.reason === 'book-backup-item-changed',
  );
});
test('process-only commits invalidate the private capture fence independently of the unchanged root', async () => {
  const f = await fixture(),
    wire = await source(f),
    c = workScope(f.db, 'author', { target }, []),
    root = structuredClone(f.records.get('books/book'));
  await f.db.runTransaction(async (tx) => {
    await workProject(tx, c);
    touchLiteraryBackupWrite(tx, c);
  });
  assert.deepEqual(f.records.get('books/book'), root);
  await assert.rejects(f.api.verifyBookEditorialCaptureSource('author', wire));
});
test('a current/version payload mismatch is rejected rather than hidden as a duplicate alias', async () => {
  const f = await fixture(),
    path = [...f.records.keys()].find((path) =>
      path.startsWith('books/book/literaryPlanVersions/'),
    ),
    value = structuredClone(f.records.get(path));
  value.plan.title = 'Divergente';
  f.records.set(path, value);
  const wire = await source(f);
  await assert.rejects(read(f, await first(f, wire, 'plan-version')));
});
test('global revocation invalidates a pinned projection without exporting the foreign body or losing saved own text', async () => {
  const f = await fixture();
  f.records.set('books/book', { ...f.records.get('books/book'), universeId: 'world' });
  f.records.set('universes/world', { authorId: 'author' });
  f.records.set('universes/world/lore/entity', {
    name: 'PRIVATE_EXTERNAL_LABEL',
    details: 'PRIVATE_EXTERNAL_BODY',
    revision: 1,
  });
  const options = await f.planning.listLiteraryReferences('author', { target, kind: 'globalLore' });
  await f.save('linked', {
    kind: 'chapterBrief',
    title: 'Minha ficha',
    status: 'working',
    fields: { function: 'Texto próprio.' },
    references: [options.items[0].reference],
  });
  const wire = await source(f),
    page = await list(f, wire, 'plan-current'),
    record = {
      ...wire,
      family: 'plan-current',
      ...page.items.find((item) => item.id === 'linked'),
    },
    before = await read(f, record);
  assert.equal(before.artifact.content.references[0].state, 'recorded');
  f.records.set('universes/world', { authorId: 'other' });
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...record,
      projectionToken: before.first.projectionToken,
    }),
  );
  const after = await read(f, record);
  assert.equal(after.artifact.content.fields.function, 'Texto próprio.');
  assert.equal(after.artifact.content.references[0].state, 'unavailable');
  assert.equal(JSON.stringify(after.artifact).includes('PRIVATE_EXTERNAL'), false);
  assert.ok(
    f.metadataReads
      .filter((item) => item.path === 'universes/world/lore/entity')
      .every((item) => !item.fields.includes('details')),
  );
});
test('a final record recheck stays bound to the native item and projection and never returns prose', async () => {
  const f = await fixture(),
    wire = await source(f),
    record = await first(f, wire, 'plan-current'),
    value = await read(f, record),
    verified = await f.api.verifyBookEditorialCaptureRecord('author', {
      ...record,
      projectionToken: value.first.projectionToken,
    });
  assert.equal(verified.contentHash, value.first.contentHash);
  assert.equal(JSON.stringify(verified).includes('PRIVATE_PLAN_TITLE'), false);
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...record,
      projectionToken: 'a'.repeat(64),
    }),
  );
  await assert.rejects(
    f.api.verifyBookEditorialCaptureRecord('author', {
      ...record,
      itemToken: 'a'.repeat(64),
      projectionToken: value.first.projectionToken,
    }),
  );
});

test('a native plan with legitimate scope aliases preserves both source and subject roles in its portable content', async () => {
  const f = await fixture();
  f.records.set('books/book/chapters/chapter', {
    bookId: 'book',
    ownerId: 'author',
    title: 'Capítulo',
    updatedAt: 100,
  });
  const { items } = await f.planning.listLiteraryReferences('author', { target, kind: 'chapter' }),
    ref = items[0].reference;
  await f.save('aliases', {
    kind: 'chapterBrief',
    title: 'Aliases',
    status: 'working',
    fields: { function: 'Texto próprio.' },
    references: [
      { ...ref, scopeId: null },
      { ...ref, purpose: 'subject' },
    ],
  });
  const wire = await source(f),
    record = await first(f, wire, 'plan-current'),
    value = await read(f, record);
  assert.equal(record.id, 'aliases');
  assert.deepEqual(
    value.artifact.content.references.map((ref) => ref.purpose),
    ['source', 'subject'],
  );
});
