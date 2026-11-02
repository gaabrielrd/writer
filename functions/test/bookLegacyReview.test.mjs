import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { inspectBookLegacyContent } from '../src/bookLegacyReview.mjs';
import { DEFAULT_PERSONAS } from '../src/personaProfile.mjs';
import { bookLegacyFixture as fixture } from './helpers/bookLegacyFixture.mjs';
const hash = {
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
  return {
    data,
    async add(key, value) {
      const k = JSON.stringify(key);
      if (data.has(k)) throw new Error('duplicate');
      assert.ok(Buffer.byteLength(JSON.stringify({ key, value })) <= 16384);
      data.set(k, structuredClone(value));
    },
    async get(key) {
      return structuredClone(data.get(JSON.stringify(key)));
    },
  };
}
function source(value) {
  const bytes = new TextEncoder().encode(
    typeof value === 'string' ? value : JSON.stringify(value, null, 2),
  );
  return {
    size: bytes.length,
    async read(offset, length) {
      assert.ok(length <= 65536);
      return bytes.slice(offset, offset + length);
    },
  };
}
async function inspect(value) {
  const index = indexFixture(),
    report = await inspectBookLegacyContent(source(value), { index, hash });
  return { report, index };
}
for (const version of [1, 2, 3, 4, 5, 6])
  test(
    'reads legacy v' + version + ' with explicit provenance/absence and no fabricated archive seal',
    async () => {
      const { report, index } = await inspect(fixture(version));
      assert.equal(report.validation, 'legacy-content-only');
      assert.equal(report.source.version, version);
      assert.equal(report.source.availability.history, 'not-recorded');
      assert.equal(report.source.availability.draft, 'not-separable');
      assert.equal(report.source.availability.cover, 'url-only');
      assert.equal(report.source.publicationDiscarded, true);
      assert.equal(report.totals.chapters, 1);
      assert.equal(report.totals.versions, 0);
      assert.ok(report.warnings.missingDates > 0);
      if (version >= 2) {
        assert.deepEqual(report.source.universeCandidate, {
          id: 'world',
          incarnation: 'not-recorded',
        });
        assert.equal(report.source.ignoredGlobalEntries, 1);
      }
      if (version >= 5) {
        assert.equal(report.totals.resources['scene-body'], 1);
        assert.equal(report.warnings.missingPersonas, 1);
        assert.equal(report.legacyWarnings.resolvedLabelsIgnored, 1);
        assert.equal(report.legacyWarnings.renderedAssemblies, 1);
      }
      if (version === 6) assert.equal(report.totals.resources.milestone, 1);
      const raw = JSON.stringify({ report, index: [...index.data] });
      for (const text of [
        'PRIVATE_TOKEN',
        'GLOBAL NAME',
        'GLOBAL BODY',
        'PRIVATE RESOLVED NAME',
        'Own prose',
        'Original',
        'Own title',
      ])
        assert.ok(!raw.includes(text), text);
      assert.ok(!Object.hasOwn(report, 'envelope'));
    },
  );
test('supports arbitrary root property order, whitespace/BOM, empty prose and missing optional dates/media', async () => {
  const value = fixture(1);
  delete value.book.coverUrl;
  delete value.book.status;
  const reversed = Object.fromEntries(Object.entries(value).reverse());
  const { report } = await inspect('\ufeff \n' + JSON.stringify(reversed, null, 2) + '\n');
  assert.equal(report.source.availability.cover, 'not-recorded');
  assert.equal(report.source.publicationDiscarded, false);
  const empty = fixture(1);
  empty.chapters = [];
  empty.lore = [];
  assert.equal((await inspect(empty)).report.totals.chapters, 0);
});
test('rejects unknown/future schema, mixed capabilities, malformed relationships and wrong hashes', async () => {
  const variants = [];
  for (const version of [0, 7, '1']) variants.push({ ...fixture(1), version });
  variants.push(
    { ...fixture(1), format: 'other' },
    { ...fixture(1), history: [] },
    { ...fixture(1), acts: [] },
  );
  const wrongUniverse = fixture(2);
  wrongUniverse.universe.id = 'other';
  variants.push(wrongUniverse);
  const wrongProfile = fixture(3);
  wrongProfile.personas[0].apiKey = 'DO NOT IMPORT';
  variants.push(wrongProfile);
  const wrongHash = fixture(5);
  wrongHash.scenes.scenes[0].bodyHash = 'f'.repeat(64);
  variants.push(wrongHash);
  const wrongGroup = fixture(5);
  wrongGroup.scenes.groups[0].title = 'Other';
  variants.push(wrongGroup);
  const wrongParent = fixture(6);
  wrongParent.narrative.milestones[0].arcId = 'gone';
  variants.push(wrongParent);
  for (const value of variants) await assert.rejects(() => inspect(value));
});
test('keeps missing profiles/old overrides neutral only for legacy and reports unused profiles', async () => {
  const value = fixture(3);
  value.chapters[0].personaComplement = {
    personaId: value.book.personaId,
    overrides: [{ traitId: 'removed-trait', value: 50 }],
  };
  value.personas.push({ ...structuredClone(DEFAULT_PERSONAS[1]), id: 'unused-style' });
  const { report } = await inspect(value);
  assert.equal(report.warnings.unknownOverrides, 1);
  assert.equal(report.legacyWarnings.unusedProfiles, 1);
  assert.equal(report.totals.profiles, 1);
});
test('ignores huge global bodies without materializing an oversized selected item and rejects duplicate local IDs', async () => {
  const value = fixture(2);
  value.universe.lore[0].details = 'x'.repeat(9 * 1024 * 1024);
  const { report } = await inspect(value);
  assert.equal(report.source.ignoredGlobalEntries, 1);
  assert.equal(report.totals.resources.lore, 1);
  const duplicate = fixture(1);
  duplicate.chapters.push({ ...duplicate.chapters[0] });
  await assert.rejects(() => inspect(duplicate), /duplicate/);
});
test('cancellation and temporary-index errors never produce a completed review', async () => {
  const controller = new AbortController();
  controller.abort();
  await assert.rejects(
    () =>
      inspectBookLegacyContent(source(fixture(1)), {
        index: indexFixture(),
        hash,
        signal: controller.signal,
      }),
    { name: 'AbortError' },
  );
  const index = indexFixture(),
    error = new Error('quota');
  index.add = async () => {
    throw error;
  };
  await assert.rejects(() => inspectBookLegacyContent(source(fixture(1)), { index, hash }), error);
});
