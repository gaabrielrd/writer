import { LITERARY_GATE_CRITERIA } from '../src/literaryGateProtocol.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createBookEditorialRemapper } from '../src/bookEditorialRemap.mjs';
import { createBookRestoreRemapper } from '../src/bookRestoreRemap.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
const h = 'a'.repeat(64),
  h2 = 'b'.repeat(64),
  h3 = 'c'.repeat(64),
  sourceBookId = 'source',
  bookId = 'copy';
const hashBytes = (bytes) => createHash('sha256').update(bytes).digest('hex');
function fixture(target = bookId, override = {}) {
  const native = createBookRestoreRemapper({
    schemaVersion: 1,
    jobToken: h3,
    sourceBookId,
    bookId: target,
  });
  return {
    native,
    map: createBookEditorialRemapper({
      sourceBookId,
      bookId: target,
      hashBytes,
      mapResource: native.identity,
      ...override,
    }),
  };
}
const ref = (kind = 'chapter', id = 'chapter') => ({
  kind,
  id,
  parentId: null,
  scope: { kind: 'book', id: sourceBookId },
  revision: 3,
  contentHash: h3,
  state: 'recorded',
  purpose: 'source',
});
const artifact = (kind, content, id = h) => ({
  schemaVersion: 1,
  id,
  kind,
  revision: 4,
  createdAt: null,
  updatedAt: 10,
  provenance: 'author',
  availability: { state: 'included' },
  content,
});
const report = (id = h) =>
  artifact(
    'report',
    {
      role: 'integration',
      title: 'Ato',
      summary: 'Conclusão original.',
      findings: [
        {
          id: 'finding',
          status: 'reviewed',
          severity: 'warning',
          problem: 'Uma divergência.',
          action: 'Conferir.',
          evidenceIds: [h2],
        },
      ],
      observations: [{ axis: 'time', text: 'O momento precisa de revisão.', evidenceIds: [h2] }],
      claimedCoverage: { scope: 'act', completed: 2, total: 2, limitations: [] },
      references: [ref()],
    },
    id,
  );

test('local resource references use the existing native restore identity projection', () => {
  const { map, native } = fixture(),
    original = ref(),
    value = map.reference(original);
  assert.equal(value.id, native.identity('chapter', 'chapter'));
  assert.equal(value.scope.id, bookId);
  assert.equal(value.revision, 3);
  assert.equal(value.contentHash, h3);
  assert.equal(value.purpose, 'source');
  assert.deepEqual(original, ref());
  assert.equal(map.reference(ref('book', sourceBookId)).id, bookId);
});
test('the same original archive produces different artifact IDs in different private copies', () => {
  const first = fixture().map,
    second = fixture('other-copy').map,
    raw = report();
  assert.deepEqual(first.artifact(raw), first.artifact(raw));
  assert.notEqual(first.artifact(raw).record.id, second.artifact(raw).record.id);
  assert.notEqual(first.artifact(raw).record.id, raw.id);
});
test('composite milestone references map their parent and leaf in the native namespaces', () => {
  const { map, native } = fixture(),
    value = map.reference({ ...ref('arcMilestone', 'milestone'), parentId: 'arc' });
  assert.equal(value.id, native.identity('milestone', 'milestone', 'arc'));
  assert.equal(value.parentId, native.identity('arc', 'arc'));
  assert.equal(value.scope.id, bookId);
});
test('contract decisions and supersession remain connected across archived contract versions', () => {
  const { map } = fixture(),
    contract = emptyEditorialContract();
  contract.decisions = [
    {
      id: 'old',
      text: 'Primeira decisão',
      category: 'preference',
      status: 'approved',
      source: 'Autor',
      supersedes: null,
    },
    {
      id: 'new',
      text: 'Nova decisão',
      category: 'requirement',
      status: 'approved',
      source: 'Autor',
      supersedes: 'old',
    },
  ];
  const first = map.artifact(artifact('contract', contract)),
    second = map.artifact({ ...artifact('contract', contract, h2), revision: 5 });
  assert.equal(first.record.content.decisions[1].supersedes, first.record.content.decisions[0].id);
  assert.equal(first.record.content.decisions[0].id, second.record.content.decisions[0].id);
  assert.notEqual(first.record.content.decisions[0].id, 'old');
  assert.equal(first.record.content.decisions[1].text, 'Nova decisão');
});
test('report evidence links follow the remapped evidence artifact rather than a native operation ID', () => {
  const { map } = fixture(),
    evidence = artifact(
      'evidence',
      {
        source: ref(),
        quote: 'carta',
        start: null,
        end: null,
        offsetUnit: 'not-recorded',
        classification: 'observed',
        rationale: '',
      },
      h2,
    );
  const mappedEvidence = map.artifact(evidence),
    mappedReport = map.artifact(report());
  assert.equal(mappedReport.record.content.findings[0].evidenceIds[0], mappedEvidence.record.id);
  assert.equal(
    mappedReport.record.content.observations[0].evidenceIds[0],
    mappedEvidence.record.id,
  );
  assert.equal(mappedReport.record.content.findings[0].status, 'reviewed');
  assert.equal(mappedEvidence.record.content.source.scope.id, bookId);
});
test('finding IDs are scoped to their original report even when the source used repeated local IDs', () => {
  const { map } = fixture();
  assert.notEqual(
    map.artifact(report()).record.content.findings[0].id,
    map.artifact(report(h2)).record.content.findings[0].id,
  );
});
test('external universes, libraries and other volumes remain unavailable without consulting current sources', () => {
  let calls = 0;
  const { map } = fixture(bookId, {
    mapResource: () => {
      calls++;
      throw new Error('must not resolve');
    },
  });
  for (const [kind, scope] of [
    ['lore', { kind: 'universe', id: 'world' }],
    ['persona', { kind: 'library', id: 'actor' }],
    ['chapter', { kind: 'book', id: 'other-volume' }],
  ]) {
    const raw = { ...ref(kind, 'external'), scope },
      value = map.reference(raw);
    assert.equal(value.state, 'unavailable');
    assert.deepEqual(value.scope, scope);
    assert.equal(value.id, 'external');
    assert.equal(value.revision, 3);
  }
  assert.equal(calls, 0);
});
test('an unavailable local reference never resolves or becomes an asserted current identity', () => {
  let calls = 0;
  const { map } = fixture(bookId, {
      mapResource: () => {
        calls++;
        return 'unexpected';
      },
    }),
    raw = { ...ref(), state: 'unavailable' };
  assert.deepEqual(map.reference(raw), raw);
  assert.equal(calls, 0);
});
test('missing local content stays an explicit old-origin descriptor instead of inventing a restored resource', () => {
  const { map } = fixture(bookId, { mapResource: () => null }),
    raw = ref(),
    value = map.reference(raw);
  assert.deepEqual(value, { ...raw, state: 'unavailable' });
  assert.equal(value.scope.id, sourceBookId);
});
test('checkpoint phase and historical cost do not reactivate execution or charge credit in the copy', () => {
  const { map } = fixture(),
    raw = artifact('checkpoint', {
      process: 'sequence',
      phase: 'running',
      counters: { steps: 10, applications: 2, creditsSpent: 30 },
      currentUnit: ref(),
      references: [],
      haltReason: null,
      nextAction: 'Revisar o capítulo',
      controlsDisabled: true,
    });
  const value = map.artifact(raw);
  assert.equal(value.record.content.phase, 'running');
  assert.equal(value.record.content.controlsDisabled, true);
  assert.deepEqual(value.restoration, {
    execution: 'disabled',
    publication: 'private',
    review: 'required',
    historical: true,
  });
  assert.equal(Object.hasOwn(value.record, 'jobToken'), false);
  assert.equal(Object.hasOwn(value.record, 'receipt'), false);
  assert.equal(value.record.content.counters.creditsSpent, 30);
});
test('historically complete reports and approved decisions still require review in the restored copy', () => {
  const { map } = fixture(),
    value = map.artifact(report());
  assert.equal(value.record.content.claimedCoverage.completed, 2);
  assert.equal(value.restoration.review, 'required');
  assert.equal(value.restoration.publication, 'private');
  assert.equal(value.restoration.execution, 'disabled');
});
test('links map both endpoints consistently and preserve their meaning without resuming any operation', () => {
  const { map } = fixture(),
    from = ref('artifact', h),
    link = { schemaVersion: 1, id: h3, from, to: ref(), relation: 'reviews' },
    mapped = map.link(link);
  assert.equal(mapped.from.id, map.artifact(report()).record.id);
  assert.equal(mapped.to.id, map.reference(ref()).id);
  assert.equal(mapped.relation, 'reviews');
  assert.notEqual(mapped.id, link.id);
  assert.deepEqual(link.from, from);
});
test('restoration refuses the source book, unmapped resource aliases and injected native job context', () => {
  assert.throws(
    () =>
      createBookEditorialRemapper({
        sourceBookId,
        bookId: sourceBookId,
        hashBytes,
        mapResource: () => null,
      }),
    TypeError,
  );
  assert.throws(
    () => fixture(bookId, { mapResource: (_kind, id) => id }).map.reference(ref()),
    TypeError,
  );
  assert.throws(
    () =>
      createBookEditorialRemapper({
        sourceBookId,
        bookId,
        hashBytes,
        mapResource: () => null,
        jobToken: h3,
      }),
    TypeError,
  );
});
test('unavailable artifacts preserve their absence and nullable original dates while receiving a new archive identity', () => {
  const { map } = fixture(),
    raw = {
      ...report(),
      availability: { state: 'unavailable', reason: 'source-revoked' },
      content: null,
      updatedAt: null,
    };
  const value = map.artifact(raw);
  assert.equal(value.record.content, null);
  assert.equal(value.record.createdAt, null);
  assert.equal(value.record.updatedAt, null);
  assert.equal(value.record.availability.reason, 'source-revoked');
  assert.notEqual(value.record.id, raw.id);
  assert.equal(value.restoration.review, 'required');
});

test('versions of one logical contract keep a shared remapped lineage and distinct artifact identities', () => {
  const { map } = fixture(),
    current = {
      ...artifact('contract', emptyEditorialContract(), h),
      lineage: { id: h3, role: 'current' },
    },
    old = {
      ...artifact('contract', emptyEditorialContract(), h2),
      revision: 3,
      lineage: { id: h3, role: 'version' },
    };
  const a = map.artifact(current),
    b = map.artifact(old);
  assert.equal(a.record.lineage.id, b.record.lineage.id);
  assert.notEqual(a.record.lineage.id, h3);
  assert.notEqual(a.record.id, b.record.id);
  assert.equal(a.record.lineage.role, 'current');
  assert.equal(b.record.lineage.role, 'version');
  assert.notEqual(
    fixture('another-copy').map.artifact(current).record.lineage.id,
    a.record.lineage.id,
  );
});
test('a missing legacy universe scope never resolves against the current library or another world', () => {
  let calls = 0;
  const { map } = fixture(bookId, {
      mapResource: () => {
        calls++;
        return 'unexpected';
      },
    }),
    value = {
      ...ref('lore', 'entity'),
      scope: { kind: 'universe', id: null },
      state: 'unavailable',
    };
  assert.deepEqual(map.reference(value), value);
  assert.equal(calls, 0);
});

test('an unavailable local archive pointer is remapped without resolving a live native resource or granting availability', () => {
  let calls = 0;
  const { map } = fixture(bookId, {
      mapResource: () => {
        calls++;
        return 'unexpected';
      },
    }),
    value = { ...ref('artifact', h), state: 'unavailable' },
    mapped = map.reference(value);
  assert.equal(mapped.id, map.reference({ ...value, state: 'recorded' }).id);
  assert.notEqual(mapped.id, h);
  assert.equal(mapped.scope.id, bookId);
  assert.equal(mapped.state, 'unavailable');
  assert.equal(calls, 0);
});
test('historical preparation remaps chapter and evidence relations while acceptance remains a disabled archival claim', () => {
  const { map } = fixture(),
    value = artifact('document', {
      role: 'preparation',
      title: 'Preparação',
      sections: [],
      references: [],
      preparation: {
        chapter: ref(),
        historicalAcceptance: true,
        historicalReady: true,
        notes: 'Texto próprio.',
        criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
          id,
          result: 'pass',
          rationale: 'Uma razão.',
          evidenceIds: [h2],
        })),
      },
    }),
    mapped = map.artifact(value);
  assert.equal(mapped.record.content.preparation.chapter.id, map.reference(ref()).id);
  assert.notEqual(mapped.record.content.preparation.criteria[0].evidenceIds[0], h2);
  assert.equal(mapped.record.content.preparation.historicalAcceptance, true);
  assert.equal(mapped.restoration.execution, 'disabled');
  assert.equal(mapped.restoration.review, 'required');
});

test('own decision context and evidence IDs remap while historical correction notes remain private and disabled', () => {
  const { map } = fixture(),
    raw = artifact('decision', {
      status: 'correctionConfirmed',
      category: null,
      text: 'correct',
      rationale: 'Minha decisão.',
      supersedes: null,
      evidenceIds: [h2],
      references: [{ ...ref('artifact', h3), state: 'unavailable' }],
      annotation: {
        family: 'finding',
        action: 'correct',
        state: 'correctionConfirmed',
        targetType: 'chapter',
        correction: { note: 'Conferi a mudança.', confirmedAt: 50 },
      },
    }),
    mapped = map.artifact(raw);
  assert.notEqual(mapped.record.content.references[0].id, h3);
  assert.equal(mapped.record.content.references[0].state, 'unavailable');
  assert.equal(mapped.record.content.references[0].scope.id, bookId);
  assert.notEqual(mapped.record.content.evidenceIds[0], h2);
  assert.equal(mapped.record.content.annotation.correction.note, 'Conferi a mudança.');
  assert.equal(mapped.restoration.execution, 'disabled');
  assert.equal(mapped.restoration.publication, 'private');
});

test('unavailable structural-index descriptors retain original provenance and never call a native identity mapper', () => {
  let calls = 0;
  const { map } = fixture(bookId, {
    mapResource: () => {
      calls++;
      return 'unexpected';
    },
  });
  for (const kind of ['sceneLink', 'narrativeLink', 'narrativeControl']) {
    const value = { ...ref(kind, 'original-link'), state: 'unavailable' };
    assert.deepEqual(map.reference(value), value);
  }
  assert.equal(calls, 0);
});
