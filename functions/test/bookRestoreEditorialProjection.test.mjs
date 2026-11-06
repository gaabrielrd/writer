import { LITERARY_PLAN_SCHEMA } from '../src/literaryPlanFields.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { createBookEditorialRemapper } from '../src/bookEditorialRemap.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
const a = 'a'.repeat(64),
  b = 'b'.repeat(64),
  c = 'c'.repeat(64);
const context = { schemaVersion: 1, jobToken: c, sourceBookId: 'source', bookId: 'copy' };
const reference = (kind, id, extra = {}) => ({
  kind,
  id,
  parentId: null,
  scope: { kind: 'book', id: 'source' },
  revision: 3,
  contentHash: b,
  state: 'recorded',
  purpose: 'source',
  ...extra,
});
const artifact = (kind, content, id = a) => ({
  schemaVersion: 1,
  id,
  kind,
  revision: 3,
  createdAt: 1,
  updatedAt: 2,
  provenance: 'author',
  availability: { state: 'included' },
  content,
});
const record = (kind, value) => ({
  kind,
  id: kind === 'book-editorial' ? 'source' : value.id,
  part: 0,
});
const map = (mapper, value) => mapper.mapJSON(record('book-editorial-artifact', value), value);
test('archived plan references use the same native IDs as the restored manuscript and narrative units', () => {
  const m = createBookRestoreRemapper(context),
    input = artifact('plan', {
      kind: 'chapterBrief',
      title: 'Old plan',
      status: 'approved',
      fields: Object.fromEntries(
        Object.keys(LITERARY_PLAN_SCHEMA.chapterBrief.fields).map((key) => [key, '']),
      ),
      references: [
        reference('chapter', 'chapter'),
        reference('scene', 'scene'),
        reference('arcMilestone', 'milestone', { parentId: 'arc' }),
      ],
    });
  const mapped = map(m, input);
  assert.notEqual(mapped.record.id, input.id);
  assert.equal(mapped.value.content.references[0].id, m.identity('chapter', 'chapter'));
  assert.equal(mapped.value.content.references[1].id, m.identity('scene', 'scene'));
  assert.equal(mapped.value.content.references[2].id, m.identity('milestone', 'milestone', 'arc'));
  assert.equal(mapped.value.content.references[2].parentId, m.identity('arc', 'arc'));
  assert.deepEqual(mapped.restoration, {
    execution: 'disabled',
    publication: 'private',
    review: 'required',
    historical: true,
  });
  assert.equal(input.content.references[0].id, 'chapter');
});
test('evidence and manuscript history remain associated without manufacturing current source authorization', () => {
  const m = createBookRestoreRemapper(context),
    value = artifact('evidence', {
      source: reference('historyVersion', 'removed-version'),
      quote: 'Original',
      start: null,
      end: null,
      offsetUnit: 'not-recorded',
      classification: 'unclassified',
      rationale: 'Historical',
    });
  const mapped = map(m, value);
  assert.equal(mapped.value.content.source.id, m.identity('version', 'removed-version'));
  assert.equal(mapped.value.content.classification, 'unclassified');
  assert.equal(mapped.restoration.review, 'required');
});
test('contract decisions, lineage and links share new archive identities while retaining historical acceptance', () => {
  const m = createBookRestoreRemapper(context),
    first = artifact('contract', emptyEditorialContract());
  first.lineage = { id: b, role: 'current' };
  first.content.decisions = [
    {
      id: 'choice',
      text: 'Own decision',
      category: 'requirement',
      status: 'approved',
      source: 'author',
      supersedes: null,
    },
  ];
  const older = structuredClone(first);
  older.id = b;
  older.lineage.role = 'version';
  const one = map(m, first),
    two = map(m, older);
  assert.equal(one.value.lineage.id, two.value.lineage.id);
  assert.equal(one.value.content.decisions[0].status, 'approved');
  assert.equal(one.value.content.decisions[0].text, 'Own decision');
  assert.notEqual(one.value.content.decisions[0].id, 'choice');
  const link = {
    schemaVersion: 1,
    id: c,
    from: reference('artifact', a),
    to: reference('artifact', b),
    relation: 'references',
  };
  const mapped = m.mapJSON(record('book-editorial-link', link), link);
  assert.equal(mapped.value.from.id, one.value.id);
  assert.equal(mapped.value.to.id, two.value.id);
  assert.equal(mapped.restoration.publication, 'private');
});
test('new archive identities are job-bound and never serialize the native token', () => {
  const first = createBookRestoreRemapper(context),
    second = createBookRestoreRemapper({ ...context, jobToken: b });
  const value = artifact('document', {
    role: 'progress',
    title: 'Note',
    sections: [],
    references: [],
  });
  assert.notEqual(map(first, value).record.id, map(second, value).record.id);
  assert.equal(JSON.stringify(map(first, value)).includes(c), false);
  assert.equal(
    map(first, value).record.id,
    map(createBookRestoreRemapper(context), value).record.id,
  );
});
test('unavailable and external origins stay unavailable instead of adopting current library or universe IDs', () => {
  const m = createBookRestoreRemapper(context),
    refs = [
      reference('chapter', 'missing', { state: 'unavailable' }),
      reference('lore', 'global', { scope: { kind: 'universe', id: 'world' } }),
      reference('persona', 'custom-own', { scope: { kind: 'library', id: 'author' } }),
    ];
  const mapped = map(
    m,
    artifact('document', {
      role: 'progress',
      title: 'Old sources',
      sections: [],
      references: refs,
    }),
  );
  for (let i = 0; i < refs.length; i++) {
    assert.equal(mapped.value.content.references[i].state, 'unavailable');
    assert.equal(mapped.value.content.references[i].id, refs[i].id);
  }
});
test('editorial summary remaps only its book identity and never becomes an execution checkpoint', () => {
  const m = createBookRestoreRemapper(context),
    value = { schemaVersion: 1, bookId: 'source', presence: 'captured', artifacts: 8, links: 2 };
  const mapped = m.mapJSON(record('book-editorial', value), value);
  assert.equal(mapped.record.id, 'copy');
  assert.equal(mapped.value.bookId, 'copy');
  assert.equal(mapped.value.artifacts, 8);
  assert.equal(mapped.restoration.execution, 'disabled');
  assert.throws(() => m.mapJSON({ ...record('book-editorial', value), id: 'other' }, value));
});
test('record/DTO identity mismatch, fragmented input and operational fields cannot enter the mapped archive', () => {
  const m = createBookRestoreRemapper(context),
    value = artifact('contract', emptyEditorialContract());
  assert.throws(() => m.mapJSON({ ...record('book-editorial-artifact', value), id: b }, value));
  assert.throws(() => m.mapJSON({ ...record('book-editorial-artifact', value), part: 1 }, value));
  assert.throws(() => map(m, { ...value, sourceToken: c }));
});
test('the pure portable mapper still refuses a native job token as archive-supplied configuration', () => {
  assert.throws(() =>
    createBookEditorialRemapper({
      sourceBookId: 'source',
      bookId: 'copy',
      hashBytes: () => a,
      mapResource: () => null,
      jobToken: c,
    }),
  );
});
