import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readBookLegacyJSONStep } from '../src/bookLegacyJSON.mjs';
import {
  createBookLegacyCatalogState,
  acceptBookLegacyCatalogSpan,
  finishBookLegacyCatalog,
  readBookLegacyCatalogItem,
} from '../src/bookLegacyCatalog.mjs';
import {
  createBookLegacyNormalizationState,
  readBookLegacyNormalizationStep,
  readBookLegacyNormalizedItem,
} from '../src/bookLegacyNormalize.mjs';
import { createBookContentState, createBookContentMachine } from '../src/bookContentMachine.mjs';
import { bookLegacyFixture as fixture } from './helpers/bookLegacyFixture.mjs';
const clone = (v) => JSON.parse(JSON.stringify(v));
const sha = (v) => createHash('sha256').update(v).digest('hex');
const hash = {
  create() {
    const h = createHash('sha256');
    return {
      update: (v) => h.update(v),
      digest: () => h.digest('hex'),
      destroy: () => h.destroy(),
    };
  },
};
function source(value) {
  const bytes = Buffer.from(typeof value === 'string' ? value : JSON.stringify(value, null, 2));
  return {
    size: bytes.length,
    bytes,
    async read(o, n) {
      assert.ok(n <= 65536);
      return new Uint8Array(bytes.subarray(o, o + n));
    },
  };
}
function adapter(data = new Map()) {
  return {
    data,
    async add(k, v) {
      const key = JSON.stringify(k);
      if (data.has(key)) throw new Error('duplicate');
      data.set(key, structuredClone(v));
    },
    async get(k) {
      return structuredClone(data.get(JSON.stringify(k)));
    },
  };
}
async function catalog(src, { index = adapter(), onState, maxBytes = 65536, maxValues = 64 } = {}) {
  let cursor = null,
    state = createBookLegacyCatalogState();
  const h = createHash('sha256');
  do {
    const step = await readBookLegacyJSONStep(src, cursor, { maxBytes, maxValues });
    h.update(step.bytes);
    for (const span of step.values) {
      const before = clone(state);
      const updated = await acceptBookLegacyCatalogSpan(state, span, src, {
        index: adapter(index.data),
      });
      assert.deepEqual(state, before);
      state = clone(updated);
      onState?.(state);
    }
    cursor = clone(step.cursor);
  } while (!cursor.done);
  const descriptor = await finishBookLegacyCatalog(
    clone(state),
    src,
    { size: src.size, fingerprint: h.digest('hex') },
    { index: adapter(index.data) },
  );
  return { descriptor: clone(descriptor), index, state };
}
async function normalize(src, descriptor, index, { onStep, version = 2 } = {}) {
  let cursor = createBookLegacyNormalizationState(descriptor, { hash, version });
  let machineState = createBookContentState(descriptor.bookId, true);
  const records = [];
  let steps = 0,
    largest = 0;
  do {
    const before = clone(cursor),
      step = await readBookLegacyNormalizationStep(src, clone(descriptor), cursor, {
        index: adapter(index.data),
        hash,
      });
    assert.deepEqual(cursor, before);
    cursor = clone(step.cursor);
    largest = Math.max(largest, Buffer.byteLength(JSON.stringify(cursor)));
    for (const secret of [
      'Own title',
      'Own prose',
      'Original',
      'GLOBAL NAME',
      'PRIVATE_TOKEN',
      'PRIVATE RESOLVED NAME',
    ])
      assert.ok(!JSON.stringify({ cursor, descriptor }).includes(secret), secret);
    if (step.item) {
      const { record, value, bytes, valueHash, origin } = step.item;
      const readOnly = {
        get: adapter(index.data).get,
        add: async () => {
          throw new Error('Unexpected replay write');
        },
      };
      const replay = await readBookLegacyNormalizedItem(
        src,
        clone(descriptor),
        clone(before),
        { record, valueHash },
        { index: readOnly, hash },
      );
      assert.deepEqual(replay.value, value);
      assert.deepEqual(replay.bytes, bytes);
      assert.deepEqual(
        JSON.parse(new TextDecoder('utf-8', { ignoreBOM: true }).decode(bytes)),
        value,
      );
      assert.equal(sha(bytes), valueHash);
      assert.equal(origin.schemaVersion, 1);
      assert.ok(bytes.length <= 8 * 1024 * 1024);
      const machine = createBookContentMachine(clone(machineState), {
        index: adapter(index.data),
        hash,
      });
      await machine.acceptJSON(record, value);
      while (machine.checkpoint().relations) await machine.advanceRelations(record, value, 64);
      machineState = clone(machine.checkpoint());
      records.push({ record, value, origin, valueHash });
    }
    await onStep?.({ cursor, step, records });
    assert.ok(++steps < 5000);
  } while (cursor.phase !== 'done');
  const machine = createBookContentMachine(clone(machineState), {
    index: adapter(index.data),
    hash,
  });
  await machine.beginFinish();
  while (machine.checkpoint().phase !== 'done') await machine.advanceFinish(64);
  return { cursor, summary: machine.result(), records, steps, largest };
}
for (const version of [1, 2, 3, 4, 5, 6])
  test(
    'legacy v' +
      version +
      ' resumes catalog and normalization through fresh JSON cursors and semantic hosts',
    async () => {
      const src = source(fixture(version)),
        { descriptor, index, state } = await catalog(src, { maxBytes: 97, maxValues: 3 });
      assert.equal(descriptor.provenance.fingerprint, sha(src.bytes));
      assert.equal(descriptor.provenance.version, version);
      await assert.rejects(
        () =>
          finishBookLegacyCatalog(
            state,
            src,
            { size: src.size, fingerprint: sha(src.bytes), extra: 'forbidden' },
            { index },
          ),
        { name: 'BookBackupFormatError' },
      );
      assert.ok(Array.isArray(descriptor.present));
      assert.equal(descriptor.provenance.availability.history, 'not-recorded');
      const out = await normalize(src, descriptor, index);
      assert.equal(out.summary.legacy, true);
      assert.equal(out.summary.totals.chapters, 1);
      assert.equal(out.summary.totals.versions, 0);
      assert.equal(out.summary.totals.resources.lore, 1);
      assert.equal(out.cursor.emitted, out.records.length);
      assert.ok(out.largest < 16384);
      const meta = out.records[0];
      assert.equal(meta.record.kind, 'book-metadata');
      assert.equal(meta.value.book.title, 'Own title');
      assert.equal(meta.value.book.status, undefined);
      assert.equal(meta.value.book.coverUrl, undefined);
      if (version >= 5) {
        assert.equal(out.summary.totals.resources['scene-body'], 1);
        assert.equal(out.cursor.legacyWarnings.resolvedLabelsIgnored, 1);
        assert.equal(out.cursor.legacyWarnings.renderedAssemblies, 1);
        assert.equal(out.summary.warnings.missingPersonas, 1);
        const ch = out.records.find((r) => r.record.kind === 'chapter');
        assert.equal(ch.value.rankSlot, 'B');
        const srcRecord = out.records.find((r) => r.value.kind === 'scene-source');
        assert.equal(srcRecord.value.data.original.content, 'Original');
      }
      if (version === 6) {
        assert.equal(out.summary.totals.resources.milestone, 1);
        assert.equal(out.summary.totals.resources['narrative-link'], 1);
      }
      const replay = await readBookLegacyNormalizationStep(src, descriptor, clone(out.cursor), {
        index: adapter(index.data),
        hash,
      });
      assert.equal(replay.item, null);
      assert.deepEqual(replay.cursor, out.cursor);
    },
  );
test('scene reference fanout emits one item per step without growing checkpoint or copying resolved labels', async () => {
  const value = fixture(6);
  value.scenes.scenes[0].references = Array.from({ length: 205 }, (_, i) => ({
    id: 'ref-' + i,
    reference: { kind: 'universe', scopeId: 'world', entityId: 'global-' + i },
    available: true,
    name: 'PRIVATE RESOLVED NAME',
  }));
  value.scenes.groups.push({
    id: null,
    title: 'Unassigned',
    kind: 'unassigned',
    contentMode: 'scenes',
    assemblyRevision: 0,
    structureRevision: 0,
    wordCount: 0,
    sceneCount: 0,
    rankSlot: 'A',
    order: 0,
    updatedAt: 2,
  });
  const src = source(value),
    { descriptor, index } = await catalog(src);
  const out = await normalize(src, descriptor, index);
  assert.equal(out.summary.totals.resources['scene-reference'], 205);
  assert.equal(out.summary.totals.resources['scene-control'], 1);
  assert.equal(out.cursor.legacyWarnings.resolvedLabelsIgnored, 205);
  assert.ok(out.largest < 2048, String(out.largest));
  const refs = out.records.filter((r) => r.value.kind === 'scene-reference');
  assert.equal(refs.length, 205);
  assert.equal(new Set(refs.map((r) => r.value.id)).size, 205);
  assert.ok(!JSON.stringify(refs).includes('PRIVATE RESOLVED NAME'));
  assert.deepEqual(
    refs.map((r) => r.origin.reference),
    Array.from({ length: 205 }, (_, i) => i),
  );
});
test('changing a pending scene item is rejected without changing its input cursor', async () => {
  const src = source(fixture(5)),
    { descriptor, index } = await catalog(src);
  let cursor = createBookLegacyNormalizationState(descriptor, { hash });
  while (cursor.phase !== 'scenes' || cursor.part !== 1)
    cursor = clone(
      (
        await readBookLegacyNormalizationStep(src, descriptor, cursor, {
          index: adapter(index.data),
          hash,
        })
      ).cursor,
    );
  const saved = clone(cursor),
    at = src.bytes.indexOf('Canonical');
  assert.ok(at > 0);
  const byte = src.bytes[at];
  src.bytes[at] = 88;
  await assert.rejects(() =>
    readBookLegacyNormalizationStep(src, descriptor, cursor, { index: adapter(index.data), hash }),
  );
  assert.deepEqual(cursor, saved);
  src.bytes[at] = byte;
  const resumed = await readBookLegacyNormalizationStep(src, descriptor, clone(cursor), {
    index: adapter(index.data),
    hash,
  });
  assert.equal(resumed.item.value.kind, 'scene-body');
});
test('catalog state rejects unknown schema/spans, early completion and out-of-range items', async () => {
  const src = source('{}'),
    index = adapter(),
    state = createBookLegacyCatalogState();
  for (const invalid of [
    [],
    { ...state, extra: 1 },
    { ...state, schemaVersion: 2 },
    { ...state, counts: { ...state.counts, lore: -1 } },
  ])
    await assert.rejects(() =>
      acceptBookLegacyCatalogSpan(invalid, { path: [], start: 0, end: 2, type: 'object' }, src, {
        index,
      }),
    );
  for (const span of [
    { path: [], start: 0, end: 3, type: 'object' },
    { path: [], start: 0, end: 2, type: 'array' },
    { path: ['other'], start: 0, end: 2, type: 'object' },
  ])
    await assert.rejects(() => acceptBookLegacyCatalogSpan(state, span, src, { index }));
  await assert.rejects(() =>
    finishBookLegacyCatalog(state, src, { size: 2, fingerprint: sha(src.bytes) }, { index }),
  );
  await assert.rejects(() =>
    readBookLegacyCatalogItem(src, { counts: state.counts }, 'lore', 0, { index }),
  );
  await assert.rejects(() =>
    readBookLegacyCatalogItem(src, { counts: state.counts }, 'book', 1, { index }),
  );
  assert.deepEqual(state, createBookLegacyCatalogState());
  assert.equal(index.data.size, 0);
});
test('normalizer rejects closed/version/context and phase cursor mismatches before reads', async () => {
  const src = source(fixture(1)),
    { descriptor, index } = await catalog(src);
  const cursor = createBookLegacyNormalizationState(descriptor, { hash });
  let reads = 0;
  const guarded = {
    ...index,
    get: async (k) => {
      reads++;
      return index.get(k);
    },
  };
  const variants = [
    [],
    { ...cursor, extra: 1 },
    { ...cursor, schemaVersion: 3 },
    { ...cursor, contextHash: 'f'.repeat(64) },
    { ...cursor, phase: 'future' },
    { ...cursor, position: -1 },
    { ...cursor, sourceHash: 'f'.repeat(64) },
    { ...cursor, part: 1 },
    { ...cursor, reference: 1 },
    { ...cursor, resources: { ...cursor.resources, lore: -1 } },
  ];
  for (const invalid of variants)
    await assert.rejects(
      () => readBookLegacyNormalizationStep(src, descriptor, invalid, { index: guarded, hash }),
      { name: 'BookBackupFormatError' },
    );
  const other = clone(descriptor);
  other.provenance.fingerprint = 'f'.repeat(64);
  await assert.rejects(
    () => readBookLegacyNormalizationStep(src, other, cursor, { index: guarded, hash }),
    { name: 'BookBackupFormatError' },
  );
  assert.equal(reads, 0);
  assert.equal(cursor.phase, 'profiles');
});
test('index I/O errors and abort leave cursors unchanged; the host can discard uncommitted effects', async () => {
  const src = source(fixture(3)),
    { descriptor, index } = await catalog(src);
  const cursor = createBookLegacyNormalizationState(descriptor, { hash }),
    before = clone(cursor),
    quota = new Error('quota');
  const failing = adapter(new Map(index.data));
  failing.add = async () => {
    throw quota;
  };
  await assert.rejects(
    () => readBookLegacyNormalizationStep(src, descriptor, cursor, { index: failing, hash }),
    quota,
  );
  assert.deepEqual(cursor, before);
  const ctrl = new AbortController();
  ctrl.abort();
  await assert.rejects(
    () =>
      readBookLegacyNormalizationStep(src, descriptor, cursor, {
        index,
        hash,
        signal: ctrl.signal,
      }),
    { name: 'AbortError' },
  );
  assert.deepEqual(cursor, before);
  const fresh = createBookLegacyCatalogState(),
    span = { path: ['book'], start: 0, end: 2, type: 'object' };
  const badIndex = adapter();
  badIndex.add = async () => {
    throw quota;
  };
  await assert.rejects(
    () => acceptBookLegacyCatalogSpan(fresh, span, source('{}'), { index: badIndex }),
    quota,
  );
  assert.deepEqual(fresh, createBookLegacyCatalogState());
  const io = adapter();
  io.get = async () => {
    throw quota;
  };
  await assert.rejects(
    () => readBookLegacyNormalizationStep(src, descriptor, cursor, { index: io, hash }),
    quota,
  );
});
test('global content larger than a logical item is skipped and metadata checkpoints remain bounded', async () => {
  const value = fixture(2);
  value.universe.lore[0].details = 'GLOBAL_PRIVATE_BODY_' + 'x'.repeat(9 * 1024 * 1024);
  const src = source(value);
  let largest = 0;
  const { descriptor, index } = await catalog(src, {
    onState(state) {
      const text = JSON.stringify(state);
      largest = Math.max(largest, Buffer.byteLength(text));
      assert.ok(!text.includes('GLOBAL_PRIVATE_BODY_'));
    },
  });
  assert.equal(descriptor.provenance.ignoredGlobalEntries, 1);
  assert.ok(largest < 2048);
  const out = await normalize(src, descriptor, index);
  assert.equal(out.summary.totals.resources.lore, 1);
  assert.ok(!JSON.stringify(out.records).includes('GLOBAL_PRIVATE_BODY_'));
});

test('readback refuses changed hashes/records and a missing chapter index without recreating it', async () => {
  const src = source(fixture(1)),
    { descriptor, index } = await catalog(src);
  let cursor = createBookLegacyNormalizationState(descriptor, { hash }),
    before,
    step;
  do {
    before = clone(cursor);
    step = await readBookLegacyNormalizationStep(src, descriptor, cursor, { index, hash });
    cursor = step.cursor;
  } while (step.item?.record.kind !== 'chapter');
  const { record, valueHash } = step.item,
    expected = { record, valueHash };
  const saved = new Map(index.data),
    readonly = {
      get: index.get,
      add: async () => {
        throw new Error('Unexpected replay write');
      },
    };
  await assert.rejects(() =>
    readBookLegacyNormalizedItem(
      src,
      descriptor,
      before,
      { record, valueHash: '0'.repeat(64) },
      { index: readonly, hash },
    ),
  );
  await assert.rejects(() =>
    readBookLegacyNormalizedItem(
      src,
      descriptor,
      before,
      { record: { ...record, id: 'other' }, valueHash },
      { index: readonly, hash },
    ),
  );
  assert.deepEqual(index.data, saved);
  const key = JSON.stringify(['legacy-chapter', 'chapter']);
  index.data.delete(key);
  await assert.rejects(() =>
    readBookLegacyNormalizedItem(src, descriptor, before, expected, { index: readonly, hash }),
  );
  assert.equal(index.data.has(key), false);
});

test('v1 normalization replay preserves old literal output while v2 records missing profile explicitly', async () => {
  const src = source(fixture(5)),
    oldCatalog = await catalog(src),
    newCatalog = await catalog(src),
    old = await normalize(src, oldCatalog.descriptor, oldCatalog.index, { version: 1 }),
    next = await normalize(src, newCatalog.descriptor, newCatalog.index);
  assert.equal(old.cursor.schemaVersion, 1);
  assert.equal(next.cursor.schemaVersion, 2);
  const a = old.records.find((r) => r.record.kind === 'book-scene-source'),
    b = next.records.find((r) => r.record.kind === 'book-scene-source');
  assert.equal(a.value.data.original.personaAvailability, undefined);
  assert.deepEqual(b.value.data.original.personaAvailability, {
    schemaVersion: 1,
    personaId: 'missing-source-style',
    reason: 'profile-not-recorded',
  });
  const expected = structuredClone(b.value);
  delete expected.data.original.personaAvailability;
  assert.deepEqual(expected, a.value);
  assert.notEqual(a.valueHash, b.valueHash);
  assert.deepEqual(next.summary.warnings, old.summary.warnings);
});
test('available legacy profile retains snapshot and unknown override values with explicit provenance', async () => {
  const input = fixture(5);
  input.scenes.sources[0].original.personaComplement = {
    personaId: input.personas[0].id,
    overrides: [{ traitId: 'old-unrecognized', value: 77 }],
  };
  const src = source(input),
    c = await catalog(src),
    out = await normalize(src, c.descriptor, c.index),
    sourceRecord = out.records.find((r) => r.record.kind === 'book-scene-source');
  assert.equal(sourceRecord.value.data.original.personaAvailability.reason, 'legacy-overrides');
  assert.deepEqual(sourceRecord.value.data.original.personaComplement.overrides, [
    { traitId: 'old-unrecognized', value: 77 },
  ]);
  assert.equal(out.summary.warnings.unknownOverrides, 1);
  assert.ok(
    out.records.some((r) => r.record.kind === 'book-persona' && r.value.scope === 'scene-source'),
  );
});
