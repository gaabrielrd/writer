import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { encodeBookBackup } from '../src/bookBackupContainer.mjs';
import {
  bookPackageHeader,
  bookPackageEnd,
  createBookPackageCounts,
  countBookPackageRecord,
  bookPackageSection,
  inspectBookBackupPackage,
} from '../src/bookBackupPackage.mjs';
import { validateBookBackupContent } from '../src/bookBackupContent.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';
import { BOOK_RESOURCE_KINDS } from '../src/bookBackupResources.mjs';
const utf8 = (s) => new TextEncoder().encode(s);
const hash = (s) => createHash('sha256').update(s).digest('hex');
const address = (v) => hash(JSON.stringify(v));
const record = (kind, id, value) => ({ kind, id, part: 0, payload: utf8(JSON.stringify(value)) });
const resource = (kind, id, data, parentId = null) =>
  record('book-' + kind, address([kind, parentId, id]), {
    schemaVersion: 1,
    kind,
    parentId,
    id,
    data,
  });
const ordered = {
  schemaVersion: 1,
  revision: 1,
  title: 'Title',
  rankA: 'V',
  rankB: 'V',
  createdAt: 1,
  updatedAt: 2,
};
const persona = { ...structuredClone(DEFAULT_PERSONAS[0]), id: 'custom-used' };
const hashPort = {
  create() {
    const state = createHash('sha256');
    return {
      update: (bytes) => {
        state.update(bytes);
      },
      digest: () => state.digest('hex'),
      destroy: () => state.destroy(),
    };
  },
};
function indexFixture() {
  const data = new Map();
  let largest = 0;
  return {
    data,
    get largest() {
      return largest;
    },
    async add(key, value) {
      const encoded = JSON.stringify(key);
      if (data.has(encoded)) throw new Error('duplicate identity');
      largest = Math.max(largest, Buffer.byteLength(JSON.stringify({ key, value })));
      data.set(encoded, structuredClone(value));
    },
    async get(key) {
      return structuredClone(data.get(JSON.stringify(key)));
    },
  };
}
function fixture() {
  const content = '\ufeffação 🌙',
    bodyHash = hash(content),
    bodyBytes = Buffer.byteLength(content);
  const original = {
    title: 'Source',
    order: 1,
    content: 'Original',
    personaComplement: { personaId: persona.id, overrides: [] },
  };
  const resources = [
    resource('lore', 'entity', {
      name: 'Ana',
      category: 'character',
      details: 'Own',
      relations: [{ targetEntityId: 'missing-lore', relationType: 'knows' }],
    }),
    resource('scene-control', 'unassigned', { rankSlot: 'B' }),
    resource('scene-source', 'chapter', { hash: hash(original.content), original, createdAt: 1 }),
    resource('scene', 'scene', {
      ...ordered,
      parentId: 'missing-chapter',
      stage: 'planned',
      archived: true,
      bodyHash,
      bodyBytes,
    }),
    resource('scene-body', 'current', { content, hash: bodyHash }, 'scene'),
    resource(
      'scene-planning',
      'current',
      { objective: '', conflict: '', pointOfView: '' },
      'scene',
    ),
    resource(
      'scene-reference',
      'ref',
      { kind: 'universe', scopeId: 'gone', entityId: 'secret' },
      'scene',
    ),
    resource('narrative-control', address({ kind: 'arc' }), {
      rankSlot: 'B',
      resource: { kind: 'arc' },
    }),
    resource('arc', 'arc', { ...ordered, initialState: '', objective: '', plannedOutcome: '' }),
    resource('milestone', 'milestone', { ...ordered, arcId: 'arc', notes: '' }, 'arc'),
    resource('event', 'event', { ...ordered, description: '', dateLabel: '3º dia do inverno' }),
    resource('narrative-link', 'link', {
      source: { kind: 'arc', id: 'arc' },
      reference: { kind: 'scene', sceneId: 'scene' },
    }),
  ];
  const profile = (scope, ownerId) =>
    record('book-persona', address([scope, ownerId]), {
      schemaVersion: 1,
      scope,
      ownerId,
      personaId: persona.id,
      profile: structuredClone(persona),
    });
  const version = {
    id: 'version',
    target: { kind: 'book', id: 'book' },
    resource: { kind: 'chapter', id: 'removed' },
    createdAt: 1,
    reason: 'before-restore',
    label: null,
    wordCount: 0,
    byteLength: 0,
    contentHash: hash(''),
    chunkCount: 1,
  };
  return [
    record('book-metadata', 'book', {
      book: { title: 'Livro', personaId: persona.id, universeId: null },
      progress: { wordGoal: null },
      cover: { kind: 'none' },
    }),
    record('act', 'act', { name: null, order: 1 }),
    record('chapter', 'chapter', {
      title: 'Chapter',
      order: 1,
      contentMode: 'scenes',
      rankSlot: 'A',
    }),
    ...resources,
    record('book-resources', 'book', {
      schemaVersion: 1,
      counts: Object.fromEntries(BOOK_RESOURCE_KINDS.map((k) => [k, 1])),
    }),
    profile('book', 'book'),
    profile('scene-source', 'chapter'),
    record('book-personas', 'book', {
      schemaVersion: 1,
      owners: { book: 1, chapter: 1, 'scene-source': 1 },
      bindings: { book: 1, chapter: 0, 'scene-source': 1 },
    }),
    record('book-universe', 'book', { schemaVersion: 1, origin: { kind: 'none' } }),
    record('work-version', 'version', version),
    { kind: 'work-version-text', id: 'version', part: 0, payload: new Uint8Array() },
    record('work-history', 'book', { schemaVersion: 1, versions: 1, byteLength: 0, chunkCount: 1 }),
    record('book-draft', 'book', {
      schemaVersion: 1,
      state: 'present',
      chapter: { id: 'removed-draft', title: 'Draft', order: 1, createdAt: 1, updatedAt: 2 },
      persona: null,
      byteLength: Buffer.byteLength(content),
      chunkCount: 1,
      contentHash: hash(content),
    }),
    { kind: 'book-draft-text', id: 'removed-draft', part: 0, payload: utf8(content) },
    record('book-cover', 'book', { schemaVersion: 1, cover: { kind: 'none' } }),
  ];
}
async function source(records) {
  const counts = createBookPackageCounts();
  for (const r of records) countBookPackageRecord(counts, bookPackageSection(r.kind), r);
  const chunks = [];
  for await (const chunk of encodeBookBackup([
    bookPackageHeader('book'),
    ...records,
    bookPackageEnd('book', counts),
  ]))
    chunks.push(chunk);
  const bytes = Buffer.concat(chunks);
  return {
    size: bytes.length,
    read: async (offset, length) => bytes.subarray(offset, offset + length),
  };
}
async function validate(records, extra = {}) {
  const index = indexFixture();
  const input = await source(records);
  const report = await validateBookBackupContent(input, { index, hash: hashPort, ...extra });
  return { report, index, input };
}
function patch(records, kind, change, occurrence = 0) {
  let found = 0;
  return records.map((r) =>
    r.kind === kind && found++ === occurrence
      ? {
          ...r,
          payload: utf8(JSON.stringify(change(JSON.parse(new TextDecoder().decode(r.payload))))),
        }
      : r,
  );
}
test('validates every resource, exact text hashes, removed versions, missing dates and neutral references without granting restoration', async () => {
  const { report, index } = await validate(fixture());
  assert.equal(report.validation, 'content-only');
  assert.equal(report.totals.versions, 1);
  assert.equal(report.totals.profiles, 1);
  assert.equal(report.totals.resources['scene-body'], 1);
  assert.equal(report.warnings.orphanGroups, 1);
  assert.equal(report.warnings.danglingLocalReferences, 1);
  assert.equal(report.warnings.externalReferences, 1);
  assert.ok(report.warnings.missingDates > 0);
  assert.ok(index.largest < 16384);
  assert.ok(!JSON.stringify([...index.data]).includes('Original'));
  assert.ok(!JSON.stringify([...index.data]).includes('Livro'));
});
test('rejects semantic corruption even with independently regenerated valid envelope, footer and seal', async () => {
  const records = fixture();
  const variants = [
    patch(records, 'book-metadata', (v) => ({ ...v, ownerId: 'forged' })),
    patch(records, 'chapter', (v) => ({ ...v, order: '1' })),
    patch(records, 'book-scene', (v) => ({ ...v, data: { ...v.data, bodyBytes: 1 } })),
    patch(records, 'book-scene-body', (v) => ({ ...v, data: { ...v.data, hash: 'f'.repeat(64) } })),
    patch(records, 'book-scene-source', (v) => ({
      ...v,
      data: { ...v.data, hash: 'f'.repeat(64) },
    })),
    patch(records, 'book-milestone', (v) => ({ ...v, parentId: 'other' })),
    patch(records, 'book-lore', (v) => ({ ...v, data: { ...v.data, ownerId: 'foreign' } })),
    patch(records, 'book-personas', (v) => ({ ...v, owners: { ...v.owners, chapter: 0 } })),
    patch(
      records,
      'book-persona',
      (v) => ({ ...v, profile: { ...v.profile, instructions: 'Different but valid' } }),
      1,
    ),
    patch(records, 'work-version', (v) => ({ ...v, contentHash: 'f'.repeat(64) })),
    patch(records, 'book-draft', (v) => ({ ...v, chunkCount: 2 })),
    patch(records, 'book-cover', (v) => ({ ...v, cover: { kind: 'legacy-unavailable' } })),
    patch(records, 'book-universe', (v) => ({
      ...v,
      origin: { kind: 'unavailable', id: 'other' },
    })),
  ];
  for (const malformed of variants) {
    const input = await source(malformed);
    await inspectBookBackupPackage(input);
    await assert.rejects(() => validate(malformed));
  }
});
test('rejects duplicate logical identities, wrong record addresses and missing structural parents/bodies', async () => {
  const records = fixture();
  const duplicate = [records[0], records[2], records[1], records[2], ...records.slice(3)];
  await assert.rejects(() => validate(duplicate), /duplicate identity/);
  await assert.rejects(() =>
    validate(records.map((r) => (r.kind === 'book-lore' ? { ...r, id: 'f'.repeat(64) } : r))),
  );
  const missing = records.filter((r) => r.kind !== 'book-scene-body');
  const corrected = patch(missing, 'book-resources', (v) => ({
    ...v,
    counts: { ...v.counts, 'scene-body': 0 },
  }));
  await assert.rejects(() => validate(corrected));
  await assert.rejects(() =>
    validate(patch(records, 'book-scene-planning', (v) => ({ ...v, parentId: 'missing' }))),
  );
});
test('rejects noncanonical JSON, duplicate keys, nonsequential parts, unpaired prose and oversized logical items', async () => {
  const good = fixture();
  for (const payload of [
    '{"name":null,"name":"dup","order":1}',
    ' {"name":null,"order":1}',
    JSON.stringify({ name: null, order: 1, extra: true }),
  ]) {
    await assert.rejects(() =>
      validate(good.map((r) => (r.kind === 'act' ? { ...r, payload: utf8(payload) } : r))),
    );
  }
  await assert.rejects(() => validate(good.map((r) => (r.kind === 'act' ? { ...r, part: 1 } : r))));
  await assert.rejects(() =>
    validate(
      patch(good, 'book-scene-body', (v) => ({ ...v, data: { ...v.data, content: '\ud800' } })),
    ),
  );
  const huge = utf8(JSON.stringify({ title: 'x'.repeat(8 * 1024 * 1024), order: 1 }));
  const parts = [];
  for (let i = 0; i < huge.length; i += 65536)
    parts.push({
      kind: 'chapter',
      id: 'chapter',
      part: i / 65536,
      payload: huge.slice(i, i + 65536),
    });
  await assert.rejects(() => validate(good.flatMap((r) => (r.kind === 'chapter' ? parts : [r]))));
});
test('does not accept extra empty text parts or truncated/invalid UTF-8 even when advertised counts match', async () => {
  const good = fixture();
  let extra = patch(good, 'work-version', (v) => ({ ...v, chunkCount: 2 }));
  extra = patch(extra, 'work-history', (v) => ({ ...v, chunkCount: 2 }));
  extra = extra.flatMap((r) => (r.kind === 'work-version-text' ? [r, { ...r, part: 1 }] : [r]));
  await assert.rejects(() => validate(extra));
  const invalid = good.map((r) =>
    r.kind === 'book-draft-text' ? { ...r, payload: new Uint8Array([0xff]) } : r,
  );
  await assert.rejects(() => validate(invalid));
});
test('abort and index I/O failure cannot produce a positive report', async () => {
  const input = await source(fixture()),
    controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      validateBookBackupContent(input, {
        index: indexFixture(),
        hash: hashPort,
        signal: controller.signal,
      }),
    { name: 'AbortError' },
  );
  const index = indexFixture(),
    error = new Error('quota');
  index.add = async () => {
    throw error;
  };
  await assert.rejects(() => validateBookBackupContent(input, { index, hash: hashPort }), error);
});

function addResource(records, item) {
  const type = JSON.parse(new TextDecoder().decode(item.payload)).kind;
  const added = records.flatMap((r) => (r.kind === 'book-resources' ? [item, r] : [r]));
  return patch(added, 'book-resources', (v) => ({
    ...v,
    counts: { ...v.counts, [type]: v.counts[type] + 1 },
  }));
}
test('selects active rank slots and rejects duplicate positions only within the same sequence', async () => {
  const different = resource('arc', 'another', {
    ...ordered,
    rankB: 'W',
    initialState: '',
    objective: '',
    plannedOutcome: '',
  });
  await validate(addResource(fixture(), different));
  const duplicate = resource('arc', 'another', {
    ...ordered,
    initialState: '',
    objective: '',
    plannedOutcome: '',
  });
  await assert.rejects(() => validate(addResource(fixture(), duplicate)), /duplicate identity/);
  const attached = patch(fixture(), 'book-scene', (v) => ({
    ...v,
    data: { ...v.data, parentId: 'chapter' },
  }));
  await validate(attached);
  await assert.rejects(() =>
    validate(patch(attached, 'chapter', (v) => ({ ...v, contentMode: 'legacy' }))),
  );
  const absent = fixture().map((r) => {
    if (r.kind !== 'book-scene-planning') return r;
    const v = JSON.parse(new TextDecoder().decode(r.payload));
    v.parentId = 'absent';
    return record(r.kind, address([v.kind, v.parentId, v.id]), v);
  });
  await assert.rejects(() => validate(absent));
});
test('checks profile identity and declared override traits, including draft-only contributions', async () => {
  const invalid = patch(fixture(), 'book-scene-source', (v) => ({
    ...v,
    data: {
      ...v.data,
      original: {
        ...v.data.original,
        personaComplement: { personaId: persona.id, overrides: [{ traitId: 'absent', value: 20 }] },
      },
    },
  }));
  await assert.rejects(() => validate(invalid));
  const draft = patch(fixture(), 'book-draft', (v) => ({
    ...v,
    chapter: { ...v.chapter, personaComplement: { personaId: persona.id, overrides: [] } },
    persona: { ...structuredClone(persona), instructions: 'Conflicting profile' },
  }));
  await assert.rejects(() => validate(draft));
});
test('validates managed cover bytes against root identity, signature, exact size and SHA-256', async () => {
  const bytes = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+a6xkAAAAASUVORK5CYII=',
    'base64',
  );
  const imageId = 'cover-image-0001';
  let records = patch(fixture(), 'book-metadata', (v) => ({
    ...v,
    book: { ...v.book, coverImageId: imageId },
    cover: { kind: 'library', imageId },
  }));
  records = patch(records, 'book-cover', (v) => ({
    ...v,
    cover: {
      kind: 'library',
      imageId,
      contentType: 'image/png',
      byteLength: bytes.length,
      chunkCount: 1,
      contentHash: hash(bytes),
    },
  }));
  records.push({ kind: 'book-cover-bytes', id: imageId, part: 0, payload: bytes });
  const valid = await validate(records);
  assert.equal(valid.report.totals.coverBytes, bytes.length);
  const broken = Buffer.from(bytes);
  broken[broken.length - 1] ^= 1;
  await assert.rejects(() =>
    validate(records.map((r) => (r.kind === 'book-cover-bytes' ? { ...r, payload: broken } : r))),
  );
  const wrong = Buffer.from(bytes);
  wrong[0] = 0;
  const signature = patch(
    records.map((r) => (r.kind === 'book-cover-bytes' ? { ...r, payload: wrong } : r)),
    'book-cover',
    (v) => ({ ...v, cover: { ...v.cover, contentHash: hash(wrong) } }),
  );
  await assert.rejects(() => validate(signature));
});
test('reads multipart JSON and multi-megabyte text within frame bounds without truncating Unicode', async () => {
  const bytes = Buffer.from('\ufeff' + 'ação 🌙'.repeat(300000));
  const textParts = [];
  let at = 0;
  while (at < bytes.length) {
    let end = Math.min(bytes.length, at + 65536);
    while (end < bytes.length && (bytes[end] & 0xc0) === 0x80) end--;
    textParts.push(bytes.subarray(at, end));
    at = end;
  }
  let records = patch(fixture(), 'book-draft', (v) => ({
    ...v,
    byteLength: bytes.length,
    chunkCount: textParts.length,
    contentHash: hash(bytes),
  }));
  records = records.flatMap((r) =>
    r.kind === 'book-draft-text'
      ? textParts.map((payload, part) => ({ ...r, payload, part }))
      : [r],
  );
  records = patch(records, 'chapter', (v) => ({ ...v, title: '🌙'.repeat(40000) }));
  records = records.flatMap((r) => {
    if (r.payload.length <= 65536) return [r];
    const parts = [];
    for (let i = 0; i < r.payload.length; i += 65536)
      parts.push({ ...r, part: i / 65536, payload: r.payload.slice(i, i + 65536) });
    return parts;
  });
  const input = await source(records),
    requests = [];
  const report = await validateBookBackupContent(
    {
      ...input,
      read: async (offset, length) => {
        requests.push(length);
        return input.read(offset, length);
      },
    },
    { index: indexFixture(), hash: hashPort },
  );
  assert.equal(report.totals.draftBytes, bytes.length);
  assert.ok(Math.max(...requests) < 70000);
});

test('resolves literal local lore IDs before external-looking prefixes, preserving book-prefixed IDs as local', async () => {
  let records = patch(fixture(), 'book-lore', (v) => ({
    ...v,
    data: {
      ...v.data,
      relations: [
        { targetEntityId: 'universe:gone:literal', relationType: 'knows' },
        { targetEntityId: 'book:book:literal', relationType: 'knows' },
        { targetEntityId: 'universe:gone:external', relationType: 'knows' },
      ],
    },
  }));
  records = addResource(
    records,
    resource('lore', 'universe:gone:literal', { name: 'Local prefix', category: 'other' }),
  );
  records = addResource(
    records,
    resource('lore', 'book:book:literal', { name: 'Local book prefix', category: 'other' }),
  );
  const { report } = await validate(records);
  assert.equal(report.warnings.danglingLocalReferences, 0);
  assert.equal(report.warnings.externalReferences, 2);
});
