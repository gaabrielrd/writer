import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { createBookRestoreUploadService } from '../src/bookRestoreUpload.mjs';
import { validateBookBackupContent } from '../src/bookBackupContent.mjs';
import { digest } from '../src/sceneContracts.mjs';
import { sequenceKey } from '../src/narrativeContracts.mjs';
import { DEFAULT_PERSONAS, validatePersona } from '../src/personaProfile.mjs';
import {
  fixture,
  record,
  resource,
  source,
  indexFixture,
  hashPort,
  hash,
} from './helpers/bookContentFixture.mjs';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { uploadArchiveRestore } from './helpers/bookRestoreContentFixture.mjs';
import { bookLegacyFixture } from './helpers/bookLegacyFixture.mjs';
import {
  uploadLegacyRestore,
  finishLegacyRestore,
  legacyMutation as mutation,
} from './helpers/bookLegacyRestoreFixture.mjs';
import { collectMappedRestore } from './helpers/bookRestoreRemapFixture.mjs';
const context = {
  schemaVersion: 1,
  jobToken: 'a'.repeat(64),
  sourceBookId: 'book',
  bookId: 'restore-destination-0001',
};
const mapper = () => createBookRestoreRemapper(context);
const json = (r) => JSON.parse(new TextDecoder().decode(r.payload));
const map = (r, m = mapper()) => m.mapJSON({ kind: r.kind, id: r.id, part: r.part }, json(r));
const uid = 'author',
  id = 'remap-reader-0001',
  root = 'users/' + uid + '/bookRestores/' + id;
function setup() {
  const f = adventureImportDb({ nativeUpdates: true }),
    factory = () => createBookRestoreUploadService({ db: f.db, now: () => 1000 });
  return { ...f, factory, api: factory() };
}
async function ready(f, records = fixture()) {
  const { progress } = await uploadArchiveRestore(f.api, uid, id, records),
    done = await finishLegacyRestore(f.factory, uid, id, progress);
  assert.equal(done.state, 'content-verified');
  return {
    done,
    reader: await f.api.openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: done.jobToken,
    }),
  };
}
test('identity is typed, deterministic, job-bound and safe for Unicode/hostile original IDs', () => {
  const m = mapper(),
    second = mapper(),
    ids = new Set();
  // Independent SHA-256 vector from Python canonical JSON, not this implementation.
  assert.equal(
    m.identity('chapter', 'chapter'),
    'restore-a4d50461b0f492d2dcb202254a2d54fab6f35ee9fb78e98176ba1e6194d38647',
  );
  for (const kind of [
    'act',
    'chapter',
    'scene',
    'lore',
    'arc',
    'event',
    'version',
    'persona',
    'image',
  ])
    for (const old of [
      'same',
      '__proto__',
      'universe:other:local',
      '🌙 nome',
      'current',
      'unassigned',
    ]) {
      const value = m.identity(kind, old);
      assert.equal(value, second.identity(kind, old));
      assert.match(value, /^(restore|custom)-[a-f0-9]{64}$/);
      assert.ok(!ids.has(value));
      ids.add(value);
      assert.notEqual(
        value,
        createBookRestoreRemapper({ ...context, jobToken: 'b'.repeat(64) }).identity(kind, old),
      );
      assert.notEqual(
        value,
        createBookRestoreRemapper({ ...context, bookId: 'other-restored-book' }).identity(
          kind,
          old,
        ),
      );
    }
  assert.notEqual(
    m.identity('milestone', 'same', 'arc-a'),
    m.identity('milestone', 'same', 'arc-b'),
  );
  assert.throws(() => m.identity('milestone', 'same'));
  assert.throws(() => m.identity('scene', 'same', 'arc-a'));
  assert.throws(() => m.identity('unknown', 'same'));
  assert.throws(() => createBookRestoreRemapper({ ...context, bookId: 'book' }));
  assert.throws(() => createBookRestoreRemapper({ ...context, extra: true }));
});
test('all JSON kinds remap fields rather than prose and preserve removed historical resources', () => {
  const original = fixture(),
    before = structuredClone(original),
    m = mapper();
  const mapped = original.filter((r) => !r.kind.endsWith('-text')).map((r) => map(r, m));
  const pick = (k) => mapped.find((r) => r.record.kind === k);
  assert.equal(pick('book-metadata').record.id, context.bookId);
  assert.equal(pick('chapter').record.id, m.identity('chapter', 'chapter'));
  assert.equal(pick('book-scene').value.id, m.identity('scene', 'scene'));
  assert.equal(pick('book-scene').value.data.parentId, m.identity('chapter', 'missing-chapter'));
  assert.equal(pick('book-scene').value.data.archived, true);
  assert.equal(pick('book-scene-source').value.id, m.identity('chapter', 'chapter'));
  assert.equal(pick('book-scene-source').value.data.original.content, 'Original');
  assert.equal(pick('book-scene-body').value.parentId, m.identity('scene', 'scene'));
  assert.equal(pick('book-scene-body').value.id, 'current');
  assert.equal(pick('book-scene-planning').value.id, 'current');
  assert.equal(pick('book-scene-control').value.id, 'unassigned');
  assert.equal(pick('book-milestone').value.parentId, m.identity('arc', 'arc'));
  assert.equal(pick('book-milestone').value.data.arcId, m.identity('arc', 'arc'));
  assert.equal(pick('book-milestone').value.id, m.identity('milestone', 'milestone', 'arc'));
  const version = pick('work-version').value;
  assert.equal(version.id, m.identity('version', 'version'));
  assert.deepEqual(version.target, { kind: 'book', id: context.bookId });
  assert.deepEqual(version.resource, { kind: 'chapter', id: m.identity('chapter', 'removed') });
  assert.equal(pick('book-draft').value.chapter.id, m.identity('chapter', 'removed-draft'));
  assert.equal(
    mapped.some((r) => r.record.kind === 'chapter' && r.record.id === version.resource.id),
    false,
  );
  assert.deepEqual(original, before);
});
test('book/chapter/source/draft personas share a copied snapshot while traits remain unchanged', () => {
  const m = mapper(),
    profile = structuredClone(DEFAULT_PERSONAS[0]),
    originalId = profile.id,
    newId = m.identity('persona', originalId),
    complement = { personaId: originalId, overrides: [{ traitId: 'sensory', value: 0 }] };
  for (const scope of ['book', 'chapter', 'scene-source']) {
    const ownerId = scope === 'book' ? 'book' : 'chapter',
      r = record('book-persona', digest([scope, ownerId]), {
        schemaVersion: 1,
        scope,
        ownerId,
        personaId: originalId,
        profile,
      }),
      value = map(r, m).value;
    assert.equal(value.personaId, newId);
    assert.equal(value.profile.id, newId);
    assert.equal(
      value.ownerId,
      scope === 'book' ? context.bookId : m.identity('chapter', 'chapter'),
    );
    assert.deepEqual(value.profile.traits, profile.traits);
    validatePersona(value.profile);
  }
  const chapter = map(
    record('chapter', 'chapter', {
      title: 'book chapter ' + originalId,
      order: 1,
      content: '\ufeffbook chapter ' + originalId,
      actId: 'act',
      personaComplement: complement,
    }),
    m,
  );
  assert.equal(chapter.value.personaComplement.personaId, newId);
  assert.equal(chapter.value.personaComplement.overrides[0].traitId, 'sensory');
  assert.equal(chapter.value.content, '\ufeffbook chapter ' + originalId);
  assert.equal(chapter.value.title, 'book chapter ' + originalId);
  assert.equal(chapter.value.actId, m.identity('act', 'act'));
  const draft = map(
    record('book-draft', 'book', {
      schemaVersion: 1,
      state: 'present',
      chapter: {
        id: 'chapter',
        title: 'Draft',
        order: 1,
        createdAt: 1,
        updatedAt: 2,
        personaComplement: complement,
      },
      persona: profile,
      byteLength: 0,
      chunkCount: 1,
      contentHash: hash(''),
    }),
    m,
  );
  assert.equal(draft.value.chapter.id, chapter.record.id);
  assert.equal(draft.value.persona.id, newId);
});
test('external references/universe provenance stay external; local references and native derived keys are rebuilt', async () => {
  const m = mapper(),
    local = { kind: 'book', scopeId: 'book', entityId: 'entity' },
    foreign = { kind: 'book', scopeId: 'other', entityId: 'entity' },
    universe = { kind: 'universe', scopeId: 'book', entityId: 'entity' };
  for (const ref of [local, foreign, universe]) {
    const value = map(resource('scene-reference', 'old', ref, 'scene'), m).value;
    const expected =
      ref === local
        ? { kind: 'book', scopeId: context.bookId, entityId: m.identity('lore', 'entity') }
        : ref;
    assert.deepEqual(value.data, expected);
    assert.equal(value.id, digest(expected));
  }
  const provenance = {
      kind: 'reference',
      id: 'universe-original',
      created: { seconds: 1, nanoseconds: 2 },
    },
    value = map(record('book-universe', 'book', { schemaVersion: 1, origin: provenance }), m).value;
  assert.deepEqual(value.origin, provenance);
  const control = map(
    resource('narrative-control', 'source-control', {
      rankSlot: 'B',
      resource: { kind: 'milestone', arcId: 'arc' },
    }),
    m,
  ).value;
  assert.deepEqual(control.data.resource, { kind: 'milestone', arcId: m.identity('arc', 'arc') });
  assert.equal(control.id, sequenceKey(control.data.resource));
  assert.equal(control.data.rankSlot, 'B');
  for (const reference of [
    { kind: 'event', eventId: 'event' },
    { kind: 'scene', sceneId: 'scene' },
    { kind: 'lore', reference: local },
  ]) {
    const source = { kind: 'milestone', arcId: 'arc', id: 'milestone' },
      result = map(resource('narrative-link', 'old-link', { source, reference }), m).value;
    assert.equal(result.data.source.id, m.identity('milestone', 'milestone', 'arc'));
    assert.equal(result.data.source.arcId, m.identity('arc', 'arc'));
    assert.equal(result.id, digest(result.data));
  }
  const r = {
    targetEntityId: 'universe:shared:local',
    relationType: 'knows',
    description: 'literal book entity',
  };
  assert.equal(
    (await m.mapLoreRelation(r, async () => true)).targetEntityId,
    m.identity('lore', r.targetEntityId),
  );
  assert.deepEqual(await m.mapLoreRelation(r, async () => false), r);
  assert.equal(
    (await m.mapLoreRelation({ targetEntityId: 'gone', relationType: 'x' })).targetEntityId,
    m.identity('lore', 'gone'),
  );
  await assert.rejects(() => m.mapLoreRelation(r, async () => ({})));
  await assert.rejects(() => m.mapLoreRelation(r));
});
test('cover and each raw identity change without touching bytes/hash/date metadata', () => {
  const m = mapper(),
    imageId = 'cover-image-0001',
    cover = {
      kind: 'library',
      imageId,
      contentType: 'image/png',
      byteLength: 8,
      chunkCount: 1,
      contentHash: 'a'.repeat(64),
      name: 'Literal ' + imageId,
    };
  const mapped = map(record('book-cover', 'book', { schemaVersion: 1, cover }), m);
  assert.deepEqual(mapped.value.cover, { ...cover, imageId: m.identity('image', imageId) });
  for (const [kind, type, old] of [
    ['book-cover-bytes', 'image', imageId],
    ['work-version-text', 'version', 'version'],
    ['book-draft-text', 'chapter', 'chapter'],
  ]) {
    const result = m.rawIdentity({ kind, id: old, part: 17 });
    assert.deepEqual(result, { kind, id: m.identity(type, old), part: 17 });
  }
  assert.throws(() => m.rawIdentity({ kind: 'chapter', id: 'chapter', part: 0 }));
  assert.throws(() => m.rawIdentity({ kind: 'book-draft-text', id: 'chapter', part: -1 }));
});
test('mapped archive validates as a new package with identical content totals, warnings and raw bytes', async () => {
  const f = setup(),
    { done, reader } = await ready(f),
    before = structuredClone([...f.records]),
    original = await validateBookBackupContent(await source(fixture()), {
      index: indexFixture(),
      hash: hashPort,
    }),
    records = await collectMappedRestore(reader, (item) => f.db.runTransaction(item.verify)),
    report = await validateBookBackupContent(await source(records, done.bookId), {
      index: indexFixture(),
      hash: hashPort,
    });
  assert.deepEqual(report.totals, original.totals);
  assert.deepEqual(report.warnings, original.warnings);
  const raw = (r) => r.filter((x) => x.kind.endsWith('-text')).map((x) => Buffer.from(x.payload));
  assert.deepEqual(raw(records), raw(fixture()));
  assert.deepEqual([...f.records], before);
  assert.equal(f.records.has('books/' + done.bookId), false);
});
for (const version of [1, 2, 3, 4, 5, 6])
  test(
    'legacy v' +
      version +
      ' maps into a fully validated new package without borrowing current profiles',
    async () => {
      const legacy = bookLegacyFixture(version);
      // This roundtrip case has complete profiles. Missing source styles are covered separately.
      if (version >= 5)
        legacy.scenes.sources[0].original.personaComplement.personaId = legacy.personas[0].id;
      const f = setup(),
        { progress } = await uploadLegacyRestore(f.api, uid, id, legacy),
        done = await finishLegacyRestore(f.factory, uid, id, progress),
        reader = await f.api.openVerifiedBookRestoreContent(uid, {
          restoreId: id,
          jobToken: done.jobToken,
        }),
        records = await collectMappedRestore(reader, (item) => f.db.runTransaction(item.verify)),
        report = await validateBookBackupContent(await source(records, done.bookId), {
          index: indexFixture(),
          hash: hashPort,
        });
      assert.equal(report.totals.chapters, done.validation.summary.totals.chapters);
      assert.ok(
        records.some((r) => r.kind === 'book-lore' && json(r).data.details === 'Own prose'),
      );
      for (const r of records.filter((r) => r.kind === 'book-persona'))
        assert.match(json(r).personaId, /^custom-[a-f0-9]{64}$/);
    },
  );
test('paged relations distinguish absent/empty, cap observations and reject changed present or absent local identities', async () => {
  const records = fixture(),
    position = records.findIndex((r) => r.kind === 'book-lore'),
    lore = json(records[position]);
  lore.data.relations = Array.from({ length: 130 }, (_, i) => ({
    targetEntityId: 'universe:external:' + i,
    relationType: 'knows',
  }));
  records[position] = record('book-lore', records[position].id, lore);
  const f = setup(),
    { done, reader } = await ready(f, records),
    idx = records.slice(0, position).filter((r) => !r.kind.endsWith('-text')).length,
    item = await reader.readMappedItem(idx);
  assert.equal(Object.hasOwn(item.value.data, 'relations'), false);
  assert.equal(item.loreRelations.count, 130);
  const page = await item.loreRelations.read(0);
  assert.equal(page.values.length, 64);
  assert.equal(page.done, false);
  assert.equal((await item.loreRelations.read(128)).values.length, 2);
  for (const [o, n] of [
    [-1, 1],
    [131, 1],
    [0, 65],
    [0, 0],
  ])
    await assert.rejects(() => item.loreRelations.read(o, n));
  const path = root + '/validationIndex/' + digest(['node', 'lore', '', 'universe:external:0']);
  await f.db.runTransaction((tx) => {
    tx.create(f.db.doc(path), { unexpected: true });
  });
  await assert.rejects(() => f.db.runTransaction(page.verify));
  await assert.rejects(() => item.loreRelations.read(0));
  await f.api.cancelBookRestore(uid, mutation(id, done, 'remap-cancel-0001'));
  await assert.rejects(() => reader.readMappedItem(0));
});

test('missing legacy persona stays unavailable under its new identity and cannot borrow a current profile', async () => {
  const f = setup(),
    { progress } = await uploadLegacyRestore(f.api, uid, id, bookLegacyFixture(5)),
    done = await finishLegacyRestore(f.factory, uid, id, progress),
    reader = await f.api.openVerifiedBookRestoreContent(uid, {
      restoreId: id,
      jobToken: done.jobToken,
    }),
    m = createBookRestoreRemapper({
      ...context,
      sourceBookId: done.validation.summary.sourceBookId,
      bookId: done.bookId,
      jobToken: done.jobToken,
    });
  f.records.set('users/' + uid + '/aiPersonas/missing-source-style', {
    ...DEFAULT_PERSONAS[0],
    id: 'missing-source-style',
    instructions: 'CURRENT PROFILE MUST NOT BE BORROWED',
  });
  let source;
  const bindings = [];
  for (let i = 0; i < reader.itemCount; i++) {
    const item = await reader.readMappedItem(i);
    if (item.record.kind === 'book-scene-source') source = item;
    if (item.record.kind === 'book-persona') bindings.push(item.value);
  }
  const missing = m.identity('persona', 'missing-source-style');
  assert.equal(source.value.data.original.personaComplement.personaId, missing);
  assert.equal(
    bindings.some((b) => b.personaId === missing),
    false,
  );
  assert.equal(JSON.stringify(source.value).includes('CURRENT PROFILE'), false);
  assert.equal(done.validation.summary.warnings.missingPersonas, 1);
});
test('absent and explicitly empty lore relation arrays remain distinguishable', () => {
  const m = mapper(),
    value = { name: 'Own', category: 'other' };
  const absent = map(resource('lore', 'entity', value), m),
    empty = map(resource('lore', 'entity', { ...value, relations: [] }), m);
  assert.equal(absent.relations, null);
  assert.deepEqual(empty.relations, []);
  assert.equal(Object.hasOwn(absent.value.data, 'relations'), false);
  assert.equal(Object.hasOwn(empty.value.data, 'relations'), false);
});
