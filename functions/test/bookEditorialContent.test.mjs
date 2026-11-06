import { LITERARY_GATE_CRITERIA } from '../src/literaryGateProtocol.mjs';
import { emptyEditorialContract } from '../src/literaryContracts.mjs';
import { LITERARY_PLAN_SCHEMA } from '../src/literaryPlanFields.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import { validateBookBackupContent } from '../src/bookBackupContent.mjs';
import { createBookContentMachine, createBookContentState } from '../src/bookContentMachine.mjs';
import {
  initialBookValidation,
  prepareBookValidationStep,
  completeBookValidation,
} from '../src/bookRestoreValidationStep.mjs';
import {
  fixture,
  source,
  record,
  hash,
  hashPort,
  indexFixture,
} from './helpers/bookContentFixture.mjs';
const h = 'a'.repeat(64),
  e = 'b'.repeat(64),
  other = 'c'.repeat(64);
const ref = (kind = 'book', id = 'book', extra = {}) => ({
  kind,
  id,
  parentId: null,
  scope: { kind: 'book', id: 'book' },
  revision: null,
  contentHash: null,
  state: 'recorded',
  purpose: 'source',
  ...extra,
});
const artifact = (kind, content, id = h) => ({
  schemaVersion: 1,
  id,
  kind,
  revision: 1,
  createdAt: null,
  updatedAt: 10,
  provenance: 'author',
  availability: { state: 'included' },
  content,
});
const evidence = (id = e) =>
  artifact(
    'evidence',
    {
      source: ref(),
      quote: 'carta',
      start: null,
      end: null,
      offsetUnit: 'not-recorded',
      classification: 'interpretation',
      rationale: 'Observação histórica.',
    },
    id,
  );
const report = (evidenceIds = [e], id = h) =>
  artifact(
    'report',
    {
      role: 'integration',
      title: 'Relatório original',
      summary: 'Uma passagem precisa de revisão.',
      findings: [
        {
          id: 'finding',
          status: 'open',
          severity: 'warning',
          problem: 'Uma divergência.',
          action: 'Conferir.',
          evidenceIds,
        },
      ],
      observations: [],
      claimedCoverage: { scope: 'act', completed: 1, total: 1, limitations: [] },
      references: [],
    },
    id,
  );
const decision = (id, supersedes = null, evidenceIds = []) =>
  artifact(
    'decision',
    {
      status: 'approved',
      category: 'preference',
      text: 'Decisão original',
      rationale: 'Motivo do autor',
      supersedes,
      evidenceIds,
    },
    id,
  );
const control = (artifacts, links = 0, extra = {}) =>
  record('book-editorial', 'book', {
    schemaVersion: 1,
    bookId: 'book',
    presence: 'captured',
    artifacts,
    links,
    ...extra,
  });
const entry = (value) => record('book-editorial-artifact', value.id, value);
const link = (from, to, relation = 'references', id = other) =>
  record('book-editorial-link', id, { schemaVersion: 1, id, from, to, relation });
async function validate(items) {
  const index = indexFixture(),
    report = await validateBookBackupContent(await source([...fixture(), ...items], 'book', 2), {
      index,
      hash: hashPort,
    });
  return { report, index };
}
async function machineAtRows(items) {
  const index = indexFixture();
  const machine = createBookContentMachine(createBookContentState('book', false, 2), {
    index,
    hash: hashPort,
  });
  for (const r of [...fixture(), ...items]) {
    if (['work-version-text', 'book-draft-text', 'book-cover-bytes'].includes(r.kind)) {
      await machine.acceptRawProof({
        byteLength: r.payload.length,
        chunkCount: 1,
        contentHash: hash(r.payload),
      });
      continue;
    }
    const value = JSON.parse(new TextDecoder().decode(r.payload));
    await machine.acceptJSON({ kind: r.kind, id: r.id, part: r.part }, value);
    while (machine.checkpoint().relations)
      await machine.advanceRelations({ kind: r.kind, id: r.id, part: r.part }, value, 64);
  }
  await machine.beginFinish();
  return { index, machine };
}

test('v2 validates typed editorial content and records metadata-only indexes without granting activation', async () => {
  const values = [entry(evidence()), entry(report()), control(2)],
    { report: result, index } = await validate(values);
  assert.equal(result.envelope.manifest.version, 2);
  assert.equal(result.totals.editorialArtifacts, 2);
  assert.equal(result.totals.editorialLinks, 0);
  assert.equal(result.validation, 'content-only');
  assert.equal(Object.hasOwn(result, 'authorAccepted'), false);
  assert.equal(Object.hasOwn(result, 'publicationReady'), false);
  const data = JSON.stringify([...index.data]);
  assert.equal(data.includes('Uma passagem precisa'), false);
  assert.equal(data.includes('Motivo do autor'), false);
});
test('v1 keeps its old checkpoint and report shape instead of inventing an editorial section', async () => {
  const initial = createBookContentState('book');
  assert.equal(Object.hasOwn(initial, 'editorial'), false);
  assert.equal(Object.hasOwn(initial.totals, 'editorialArtifacts'), false);
  const result = await validateBookBackupContent(await source(fixture()), {
    index: indexFixture(),
    hash: hashPort,
  });
  assert.equal(result.envelope.manifest.version, 1);
  assert.equal(Object.hasOwn(result.totals, 'editorialArtifacts'), false);
});
test('editorial control is mandatory, terminal and matches logical artifact/link counts', async () => {
  await assert.rejects(validate([entry(evidence())]));
  await assert.rejects(validate([entry(evidence()), control(2)]));
  await assert.rejects(validate([control(0), entry(evidence())]));
  await assert.rejects(validate([control(0, 0, { presence: 'absent-in-legacy' })]));
});
test('duplicate artifact identities and forged per-record IDs cannot replace prior versions', async () => {
  await assert.rejects(validate([entry(evidence()), entry(evidence()), control(2)]));
  await assert.rejects(validate([{ ...entry(evidence()), id: h }, control(1)]));
});
test('every declared evidence ID must exist and point to an evidence artifact', async () => {
  await assert.rejects(validate([entry(report()), control(1)]));
  await assert.rejects(validate([entry(decision(e)), entry(report()), control(2)]));
});
test('one ID cannot serve as both superseded decision and evidence by confusing their roles', async () => {
  await assert.rejects(validate([entry(decision(e)), entry(decision(h, e, [e])), control(2)]));
});
test('typed unavailable evidence keeps the process readable as incomplete rather than fabricating a body', async () => {
  const missing = {
    ...evidence(),
    availability: { state: 'unavailable', reason: 'source-revoked' },
    content: null,
  };
  const { report: result } = await validate([entry(missing), entry(report()), control(2)]);
  assert.ok(result.warnings.editorialUnavailable > 0);
  assert.equal(result.totals.editorialArtifacts, 2);
});
test('external references are descriptors only and never request source or library data', async () => {
  const body = {
    role: 'progress',
    title: 'Nota',
    sections: [],
    references: [ref('lore', 'external', { scope: { kind: 'universe', id: 'world' } })],
  };
  const { report: result, index } = await validate([entry(artifact('document', body)), control(1)]);
  assert.equal(result.warnings.editorialExternal, 1);
  assert.ok([...index.data.keys()].every((key) => !key.includes('external')));
});
test('a local reference marked recorded must actually be present, while explicit unavailable descriptors survive', async () => {
  const body = {
    role: 'progress',
    title: 'Nota',
    sections: [],
    references: [ref('chapter', 'absent')],
  };
  await assert.rejects(validate([entry(artifact('document', body)), control(1)]));
  const { report: result } = await validate([
    entry(
      artifact('document', {
        ...body,
        references: [{ ...body.references[0], state: 'unavailable' }],
      }),
    ),
    control(1),
  ]);
  assert.ok(result.warnings.editorialUnavailable > 0);
});
test('replacement cycles are rejected both through decision bodies and independent links', async () => {
  await assert.rejects(validate([entry(decision(h, e)), entry(decision(e, h)), control(2)]));
  await assert.rejects(
    validate([
      entry(decision(h)),
      entry(decision(e)),
      link(ref('artifact', h), ref('artifact', e), 'supersedes', hash('one')),
      link(ref('artifact', e), ref('artifact', h), 'supersedes', hash('two')),
      control(2, 2),
    ]),
  );
});
test('replacement chains resume in small steps without storing an unbounded visited set', async () => {
  const ids = Array.from({ length: 70 }, (_, i) => hash('decision-' + i)),
    items = ids.map((id, i) => entry(decision(id, ids[i + 1] ?? null)));
  items.push(control(ids.length));
  const initial = await machineAtRows(items);
  const index = initial.index;
  let machine = initial.machine;
  await machine.advanceFinish(64);
  let checkpoint = machine.checkpoint();
  assert.equal(checkpoint.phase, 'edges');
  while (checkpoint.phase === 'edges') {
    await machine.advanceFinish(64);
    checkpoint = machine.checkpoint();
  }
  for (
    let n = 0;
    n < 1000 && !machine.checkpoint().editorial.walk && machine.checkpoint().phase !== 'done';
    n++
  )
    await machine.advanceFinish(1);
  checkpoint = machine.checkpoint();
  assert.equal(checkpoint.phase, 'rows');
  assert.ok(checkpoint.editorial.walk);
  assert.ok(JSON.stringify(checkpoint).length < 16384);
  machine = createBookContentMachine(structuredClone(checkpoint), { index, hash: hashPort });
  for (let n = 0; machine.checkpoint().phase !== 'done' && n < 10000; n++)
    await machine.advanceFinish(64);
  assert.equal(machine.result().totals.editorialArtifacts, 70);
  assert.equal(machine.checkpoint().editorial.walk, null);
});
test('large reference sets are paginated through the same relation checkpoint used by server validation', async () => {
  const ids = Array.from({ length: 100 }, (_, i) => hash('evidence-' + i)),
    refs = ids.map((id) => ref('artifact', id));
  const index = indexFixture(),
    machine = createBookContentMachine(createBookContentState('book', false, 2), {
      index,
      hash: hashPort,
    });
  const value = artifact('document', {
    role: 'preparation',
    title: 'Fontes',
    sections: [],
    references: refs,
  });
  await machine.acceptJSON({ kind: 'book-editorial-artifact', id: h, part: 0 }, value);
  assert.equal(machine.checkpoint().relations.total, 100);
  await machine.advanceRelations({ kind: 'book-editorial-artifact', id: h, part: 0 }, value, 64);
  assert.equal(machine.checkpoint().relations.position, 64);
  const resumed = createBookContentMachine(machine.checkpoint(), { index, hash: hashPort });
  await resumed.advanceRelations({ kind: 'book-editorial-artifact', id: h, part: 0 }, value, 64);
  assert.equal(resumed.checkpoint().relations, null);
});
test('relation continuation is bound to the original item and rejects a silently modified payload', async () => {
  const index = indexFixture(),
    machine = createBookContentMachine(createBookContentState('book', false, 2), {
      index,
      hash: hashPort,
    });
  const value = report([e]);
  await machine.acceptJSON({ kind: 'book-editorial-artifact', id: h, part: 0 }, value);
  await assert.rejects(
    machine.advanceRelations(
      { kind: 'book-editorial-artifact', id: h, part: 0 },
      { ...value, content: { ...value.content, summary: 'Changed' } },
      64,
    ),
  );
});
test('a v2 envelope cannot pass a server validator whose native upload descriptor declared v1', async () => {
  const input = await source([...fixture(), control(0)], 'book', 2),
    state = initialBookValidation(),
    store = { index: indexFixture() };
  await assert.rejects(
    prepareBookValidationStep(state, input, store, { format: 'writer-book-archive', version: 1 }),
    { code: 'invalid-record' },
  );
});

test('the bounded server parser resumes the shared v2 semantic machine with the same logical summary', async () => {
  const input = await source(
    [...fixture(), entry(evidence()), entry(report()), control(2)],
    'book',
    2,
  );
  const expected = await validateBookBackupContent(input, {
      index: indexFixture(),
      hash: hashPort,
    }),
    index = indexFixture(),
    items = new Map();
  const store = {
    index,
    setItemIndex() {},
    async addItem(at, value) {
      assert.equal(items.has(at), false);
      items.set(at, structuredClone(value));
    },
  };
  const descriptor = { format: 'writer-book-archive', version: 2 };
  let state = initialBookValidation(),
    steps = 0;
  while (state.phase !== 'recheck') {
    await prepareBookValidationStep(state, input, store, descriptor);
    state = structuredClone(state);
    assert.ok(++steps < 2000);
  }
  const result = completeBookValidation(
    state,
    hash(await input.read(0, input.size)),
    index,
    descriptor,
  );
  assert.deepEqual(result.totals, expected.totals);
  assert.deepEqual(result.warnings, expected.warnings);
  assert.equal(result.envelope.manifest.version, 2);
  assert.equal(result.validation, 'server-content-only');
  assert.ok(items.size > 0);
  assert.equal(JSON.stringify([...items.values()]).includes('Uma passagem precisa'), false);
  assert.throws(() =>
    completeBookValidation(state, 'a'.repeat(64), index, {
      format: 'writer-book-archive',
      version: 1,
    }),
  );
});

const versionedContract = (id, revision, role, lineage = other) => ({
  ...artifact('contract', emptyEditorialContract(), id),
  revision,
  lineage: { id: lineage, role },
});
test('semantic lineages preserve earlier versions while one current head identifies the active contract', async () => {
  const { report } = await validate([
    entry(versionedContract(h, 2, 'current')),
    entry(versionedContract(e, 1, 'version')),
    control(2),
  ]);
  assert.equal(report.totals.editorialArtifacts, 2);
});
test('two current contracts, duplicate lineage revisions and versions newer than the declared head are rejected', async () => {
  await assert.rejects(
    validate([
      entry(versionedContract(h, 2, 'current')),
      entry(versionedContract(e, 1, 'current', 'd'.repeat(64))),
      control(2),
    ]),
  );
  await assert.rejects(
    validate([
      entry(versionedContract(h, 2, 'current')),
      entry(versionedContract(e, 2, 'version')),
      control(2),
    ]),
  );
  await assert.rejects(
    validate([
      entry(versionedContract(h, 2, 'current')),
      entry(versionedContract(e, 3, 'version')),
      control(2),
    ]),
  );
});
test('a logical plan cannot change its native kind between historical versions', async () => {
  const plan = (id, kind, revision, role) => ({
    ...artifact(
      'plan',
      {
        kind,
        title: 'Ficha',
        status: 'working',
        fields: Object.fromEntries(
          Object.keys(LITERARY_PLAN_SCHEMA[kind].fields).map((key) => [key, '']),
        ),
        references: [],
      },
      id,
    ),
    revision,
    lineage: { id: other, role },
  });
  await assert.rejects(
    validate([
      entry(plan(h, 'chapterBrief', 2, 'current')),
      entry(plan(e, 'bookOverview', 1, 'version')),
      control(2),
    ]),
  );
});

test('preparation evidence links must resolve to actual evidence artifacts rather than arbitrary private documents', async () => {
  const body = {
    role: 'preparation',
    title: 'Preparação',
    sections: [],
    references: [],
    preparation: {
      chapter: ref('chapter', 'chapter'),
      historicalAcceptance: true,
      historicalReady: true,
      notes: 'Histórica.',
      criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
        id,
        result: 'pass',
        rationale: 'Uma razão.',
        evidenceIds: [e],
      })),
    },
  };
  const value = entry(artifact('document', body));
  const result = await validate([value, entry(evidence()), control(2)]);
  assert.equal(result.report.totals.editorialArtifacts, 2);
  await assert.rejects(validate([value, entry(decision(e)), control(2)]));
  await assert.rejects(validate([value, control(1)]));
});
test('a versioned document cannot change its role under the same logical lineage', async () => {
  const current = {
      ...artifact('document', { role: 'progress', title: 'Nota', sections: [], references: [] }, h),
      revision: 2,
      lineage: { id: other, role: 'current' },
    },
    old = {
      ...artifact(
        'document',
        { role: 'preparation', title: 'Outra função', sections: [], references: [] },
        e,
      ),
      revision: 1,
      lineage: { id: other, role: 'version' },
    };
  await assert.rejects(validate([entry(current), entry(old), control(2)]));
});

test('decision context references do not shift the typed superseded/evidence positions', async () => {
  const parent = decision(h, e, [other]);
  parent.content.references = [ref('book', 'book')];
  const result = await validate([
    entry(parent),
    entry(decision(e)),
    entry(evidence(other)),
    control(3),
  ]);
  assert.equal(result.report.totals.editorialArtifacts, 3);
  await assert.rejects(
    validate([entry(parent), entry(evidence(e)), entry(evidence(other)), control(3)]),
  );
});
test('a versioned own decision cannot switch finding/impact families under one lineage', async () => {
  const body = (family) =>
    family === 'finding'
      ? {
          status: 'retained',
          category: null,
          text: 'retain',
          rationale: 'Uma escolha.',
          supersedes: null,
          evidenceIds: [],
          references: [],
          annotation: { family, action: 'retain', state: 'retained', targetType: null },
        }
      : {
          status: 'needs-review',
          category: null,
          text: 'needs-review',
          rationale: 'Uma pendência.',
          supersedes: null,
          evidenceIds: [],
          references: [],
          annotation: { family, action: null, state: 'needs-review', targetType: null },
        };
  const current = {
      ...artifact('decision', body('finding'), h),
      revision: 2,
      lineage: { id: other, role: 'current' },
    },
    old = {
      ...artifact('decision', body('impact'), e),
      revision: 1,
      lineage: { id: other, role: 'version' },
    };
  await assert.rejects(validate([entry(current), entry(old), control(2)]));
});
