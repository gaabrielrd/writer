import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeAdventureImportStart,
  normalizeAdventureImportMutation,
  adventureImportSection,
  adventureImportRequestHash,
  adventureImportReviewHash,
  adventureImportChain,
  adventureImportSeed,
  adventureImportIds,
  adventureImportJobToken,
  adventureImportRawSourceHash,
  importSum,
  importDate,
} from '../src/adventureImportContracts.mjs';
const uid = 'owner-fixture',
  id = 'ImportFixture0001';
const sections = [
  { title: 'Chegada', content: '<p>Olá 🐉</p>\n' },
  { title: 'Mapa', content: '<p>"Mapa" &amp; trilha\\</p>' },
];
const project = { title: 'Aventura Á', synopsis: 'Revisão confirmada.', universeId: null };
const source = {
  mediaType: 'text/html',
  sha256: adventureImportRawSourceHash(Buffer.from('fixture-source\n')),
  byteLength: 15,
};
const reason = (r) => (e) => e.details?.reason === r;
function fixture() {
  let chain = adventureImportSeed,
    total = 0;
  for (let i = 0; i < sections.length; i++) {
    const t = adventureImportSection(sections[i]);
    chain = adventureImportChain(chain, i, t);
    total += t.bodyBytes;
  }
  const start = { operationId: id, project, source, sectionCount: 2, totalBodyBytes: total };
  return { ...start, reviewHash: adventureImportReviewHash(start, chain) };
}
test('independently frozen wire vectors preserve UTF8, canonical keys, identity and nanosecond born stamp', () => {
  const start = fixture(),
    a = adventureImportSection(sections[0]),
    b = adventureImportSection(sections[1]);
  assert.equal(source.sha256, '1f008eb780e579037a4dfb134513ce3b9aeff647dc382509aba1a5496a33baeb');
  assert.equal(
    adventureImportSeed,
    'd2a67ba77ac3caf09710e8cbf85c86b53b0473dffe89d097d84a0347976f6a3c',
  );
  assert.deepEqual([a.bodyBytes, b.bodyBytes, start.totalBodyBytes], [17, 27, 44]);
  assert.equal(a.bodyHash, '447c09cf2bd5f277f57d7024019d08be702fb7c0ebddb822275f092383dcfda7');
  assert.equal(b.bodyHash, 'd56096092e997987043cf247ea1c4d99f8a44a386fae33dd920672985ed61b30');
  const c0 = adventureImportChain(adventureImportSeed, 0, a),
    c1 = adventureImportChain(c0, 1, b);
  assert.equal(c0, '07f5c6c7bd7b9731d091ffda7ac8b9d6fda783b33f57437d9cb298a51bd93928');
  assert.equal(c1, '7e336479d44b7d39f7806113b5ff8f743ff7f3dcd75e7c71e782a053b2b14c47');
  assert.equal(
    start.reviewHash,
    '78e8daa3650d494acfed5bdda5e90da6c4835d0f2ca9b5e699e0c7270a098440',
  );
  assert.equal(
    adventureImportRequestHash('startAdventureImport', start),
    'd1c11bea1afd5c852b98740d6a67a81f63738a53c16efcea7c402a6e7fbff8ed',
  );
  assert.deepEqual(adventureImportIds(uid, id, 0), {
    adventureId: 'd0b805cd641b02db651d7d20ab1a2584ecc393bb49678176f41ef5840a425933',
    partId: '3e2c5cf8ba6d9b00dca85eaf125a9e52cd4409deed75cef0a4c1160bff9cdd33',
    sceneId: '0e1fa91e8dcdb989621d68c71d50233e351c283112290b39ec5f95003a4a1338',
  });
  assert.equal(
    adventureImportJobToken(uid, id, {
      createTime: { seconds: 1700000000, nanoseconds: 123456789 },
    }),
    'e568a4a32319f6f6ac380c6e7181b9dad716e16646ed41dfb49490982247a20c',
  );
  assert.equal(
    adventureImportJobToken(uid, id, {
      createTime: { seconds: 1700000000, nanoseconds: 123456790 },
    }),
    '334a585f75cd82d7a61a1eebec0ef5373568e677f6a42c76c20f627738f83c78',
  );
  assert.equal(
    adventureImportRequestHash('startAdventureImport', {
      ...start,
      project: { universeId: null, synopsis: project.synopsis, title: project.title },
    }),
    adventureImportRequestHash('startAdventureImport', start),
  );
});
test('normalization trims only metadata; exact prose/newline/Unicode and closed inputs remain observable', () => {
  const start = fixture();
  assert.deepEqual(
    normalizeAdventureImportStart({
      ...start,
      project: { ...project, title: ' Aventura Á ', synopsis: ' Revisão confirmada. ' },
    }),
    start,
  );
  const text = ' \n<p>🧙 ação</p>\r\n ';
  assert.equal(adventureImportSection({ title: ' Cena ', content: text }).section.content, text);
  assert.notEqual(
    adventureImportSection({ title: 'Cena', content: text }).bodyHash,
    adventureImportSection({ title: 'Cena', content: text.trim() }).bodyHash,
  );
  for (const extra of [{ ownerId: 'intruder' }, { jobToken: '0'.repeat(64) }, { extra: null }])
    assert.throws(
      () => normalizeAdventureImportStart({ ...start, ...extra }),
      reason('invalid-input'),
    );
  for (const x of [undefined, null, NaN, -1, 0.1, Number.MAX_SAFE_INTEGER + 1])
    assert.throws(() => normalizeAdventureImportStart({ ...start, sectionCount: x }));
  assert.throws(() =>
    normalizeAdventureImportStart({ ...start, project: { ...project, title: '\ud800' } }),
  );
  assert.throws(() =>
    normalizeAdventureImportStart({ ...start, project: { ...project, universeId: undefined } }),
  );
  assert.throws(() =>
    normalizeAdventureImportStart({ ...start, source: { ...source, mediaType: 'PDF' } }),
  );
  assert.throws(() => adventureImportSection({ title: 'Cena', content: '\ud800' }));
});
test('UTF8/envelope budgets reject exactly beyond boundaries without trimming or truncation', () => {
  assert.equal(
    adventureImportSection({ title: 'Cena', content: 'á'.repeat(400000) }).bodyBytes,
    800000,
  );
  assert.throws(
    () => adventureImportSection({ title: 'Cena', content: 'á'.repeat(400001) }),
    reason('payload-too-large'),
  );
  assert.throws(
    () => adventureImportSection({ title: 'Cena', content: '\u0000'.repeat(160000) }),
    reason('payload-too-large'),
  );
  assert.throws(
    () =>
      normalizeAdventureImportMutation(
        {
          importId: id,
          jobToken: '0'.repeat(64),
          operationId: 'AppendOperation001',
          expectedCheckpoint: 0,
          index: 0,
          section: { title: 'Cena', content: '"'.repeat(460000) },
        },
        true,
      ),
    reason('payload-too-large'),
  );
  for (const expectedCheckpoint of [undefined, null, -1, NaN, 1.2])
    assert.throws(() =>
      normalizeAdventureImportMutation({
        importId: id,
        jobToken: '0'.repeat(64),
        operationId: 'AppendOperation001',
        expectedCheckpoint,
      }),
    );
  assert.throws(() => importSum(Number.MAX_SAFE_INTEGER, 1), reason('counter-overflow'));
  assert.throws(() => importDate(() => NaN), reason('inconsistent'));
  assert.throws(
    () => adventureImportJobToken(uid, id, { createTime: { seconds: 1, nanoseconds: 1000000000 } }),
    reason('inconsistent'),
  );
});
