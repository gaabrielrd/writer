import { LITERARY_GATE_CRITERIA } from '../src/literaryGateProtocol.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeBookEditorialArtifact,
  normalizeBookEditorialReference,
  normalizeBookEditorialLink,
  normalizeBookEditorialControl,
  bookEditorialArtifactReferences,
  BOOK_EDITORIAL_ITEM_BYTES,
} from '../src/bookEditorialProtocol.mjs';
import {
  editorialContract,
  emptyEditorialContract,
  EDITORIAL_FIELDS,
} from '../src/literaryContracts.mjs';
import { literaryPlan, LITERARY_PLAN_SCHEMA } from '../src/literaryPlanningSchema.mjs';
import { EDITORIAL_FIELDS as pureFields } from '../src/literaryEditorialFields.mjs';
import { LITERARY_PLAN_SCHEMA as purePlans } from '../src/literaryPlanFields.mjs';
const h = 'a'.repeat(64),
  h2 = 'b'.repeat(64),
  sourceBookId = 'source';
const reference = (kind = 'chapter', id = 'chapter') => ({
  kind,
  id,
  parentId: null,
  scope: { kind: 'book', id: sourceBookId },
  revision: 3,
  contentHash: null,
  state: 'recorded',
  purpose: 'source',
});
const artifact = (kind, content) => ({
  schemaVersion: 1,
  id: h,
  kind,
  revision: 4,
  createdAt: null,
  updatedAt: 10,
  provenance: 'author',
  availability: { state: 'included' },
  content,
});
const decision = (id) => ({
  id,
  text: 'Preservar o mistério.',
  category: 'requirement',
  status: 'approved',
  source: 'Decisão do autor',
  supersedes: null,
});
const checkpoint = () => ({
  process: 'workflow',
  phase: 'review',
  counters: { steps: 3, applications: 1, creditsSpent: 10, reviewedUnits: 2 },
  currentUnit: reference(),
  references: [],
  haltReason: 'Aguardar conferência do autor',
  nextAction: 'Rever a passagem',
  controlsDisabled: true,
});
const report = () => ({
  role: 'integration',
  title: 'Revisão do ato',
  summary: 'Há uma divergência temporal.',
  findings: [
    {
      id: 'finding',
      status: 'open',
      severity: 'warning',
      problem: 'Informação sem fonte.',
      action: 'Conferir a passagem.',
      evidenceIds: [h2],
    },
  ],
  observations: [
    { axis: 'knowledge', text: 'A personagem ainda não recebeu a carta.', evidenceIds: [h2] },
  ],
  claimedCoverage: {
    scope: 'act',
    completed: 2,
    total: 2,
    limitations: ['Afirmação histórica, ainda sem nova revisão.'],
  },
  references: [reference()],
});

test('portable contract preserves canonical decisions, source text and policy preferences without adding permissions', () => {
  const raw = emptyEditorialContract();
  raw.fields.premise = 'Uma viagem ao cais.';
  raw.decisions = [decision('old'), { ...decision('new'), supersedes: 'old' }];
  raw.collaborationPolicy = { version: 1, mode: 'continuous' };
  raw.publicationPolicy = { version: 1, unit: 'act', requirePreviousPublication: true };
  const native = editorialContract(raw),
    value = normalizeBookEditorialArtifact(artifact('contract', native));
  assert.deepEqual(value.content, native);
  assert.deepEqual(raw.decisions[0], decision('old'));
  assert.equal(Object.hasOwn(value, 'authorizedPhases'), false);
  assert.equal(Object.hasOwn(value, 'receipt'), false);
});
test('extracted native field registries keep the same objects and public editing exports', () => {
  assert.equal(pureFields, EDITORIAL_FIELDS);
  assert.equal(purePlans, LITERARY_PLAN_SCHEMA);
});
test('every native plan kind preserves its fields and literal text in the portable record', () => {
  for (const [kind, schema] of Object.entries(LITERARY_PLAN_SCHEMA)) {
    const native = literaryPlan({
      kind,
      title: 'Ficha',
      status: 'working',
      fields: Object.fromEntries(Object.keys(schema.fields).map((key) => [key, 'Texto de ' + key])),
      references: [],
    });
    const value = normalizeBookEditorialArtifact(artifact('plan', native));
    assert.deepEqual(value.content, native);
  }
});

test('portable plan references retain logical identity and observed revision without native source tokens', () => {
  const native = Object.keys(LITERARY_PLAN_SCHEMA)[0],
    value = normalizeBookEditorialArtifact(
      artifact('plan', {
        kind: native,
        title: 'Ficha',
        status: 'approved',
        fields: Object.fromEntries(
          Object.keys(LITERARY_PLAN_SCHEMA[native].fields).map((key) => [key, '']),
        ),
        references: [reference()],
      }),
    );
  assert.equal(value.content.references[0].revision, 3);
  assert.equal(JSON.stringify(value).includes('sourceToken'), false);
});
test('unknown credential, native receipt and authorization fields are rejected at their actual boundaries', () => {
  const valid = artifact('checkpoint', checkpoint());
  for (const key of [
    'apiKey',
    'jobToken',
    'requestHash',
    'receipt',
    'authorization',
    'authorizedPhases',
    'sourceToken',
  ])
    assert.throws(() => normalizeBookEditorialArtifact({ ...valid, [key]: 'PRIVATE' }), TypeError);
  for (const key of ['key', 'authorizedPhases', 'operationId', 'requestHash', 'limits'])
    assert.throws(
      () =>
        normalizeBookEditorialArtifact({
          ...valid,
          content: { ...valid.content, [key]: 'PRIVATE' },
        }),
      TypeError,
    );
  assert.throws(
    () => normalizeBookEditorialReference({ ...reference(), sourceToken: h }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeBookEditorialReference({
        ...reference(),
        scope: { kind: 'book', id: sourceBookId, authorization: h },
      }),
    TypeError,
  );
});
test('text survives BOM, UTF-8, CRLF, HTML and strings resembling commands without interpretation', () => {
  const text = '\ufeffA carta dizia: "não execute".\r\n<img src="x"> $() `texto` 🕯️';
  const input = artifact('prose', {
    role: 'proposal',
    format: 'html',
    text,
    rationale: '',
    source: reference(),
  });
  const result = normalizeBookEditorialArtifact(JSON.parse(JSON.stringify(input)));
  assert.equal(result.content.text, text);
  assert.deepEqual(new TextEncoder().encode(result.content.text), new TextEncoder().encode(text));
});
test('contract replacement cycles and missing decisions are rejected instead of silently rewriting history', () => {
  for (const rows of [
    [{ ...decision('a'), supersedes: 'a' }],
    [{ ...decision('a'), supersedes: 'missing' }],
    [
      { ...decision('a'), supersedes: 'b' },
      { ...decision('b'), supersedes: 'a' },
    ],
  ])
    assert.throws(
      () =>
        normalizeBookEditorialArtifact(
          artifact('contract', { ...emptyEditorialContract(), decisions: rows }),
        ),
      TypeError,
    );
});
test('a historically complete report remains a declared claim, not author acceptance or publication readiness', () => {
  const value = normalizeBookEditorialArtifact(artifact('report', report()));
  assert.equal(value.content.claimedCoverage.completed, 2);
  assert.equal(Object.hasOwn(value, 'authorAccepted'), false);
  for (const key of ['publicationReady', 'authorAccepted', 'verified'])
    assert.throws(
      () =>
        normalizeBookEditorialArtifact({
          ...artifact('report', report()),
          content: { ...report(), [key]: true },
        }),
      TypeError,
    );
  assert.throws(
    () =>
      normalizeBookEditorialArtifact(
        artifact('report', {
          ...report(),
          claimedCoverage: { ...report().claimedCoverage, completed: 3 },
        }),
      ),
    TypeError,
  );
});
test('checkpoints preserve progress counters but execution controls are obligatorily disabled', () => {
  const value = normalizeBookEditorialArtifact(artifact('checkpoint', checkpoint()));
  assert.deepEqual(value.content.counters, checkpoint().counters);
  assert.equal(value.content.controlsDisabled, true);
  assert.throws(
    () =>
      normalizeBookEditorialArtifact(
        artifact('checkpoint', { ...checkpoint(), controlsDisabled: false }),
      ),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeBookEditorialArtifact(
        artifact('checkpoint', { ...checkpoint(), counters: { maxCredits: 100 } }),
      ),
    TypeError,
  );
});
test('unavailable sources retain typed absence and cannot carry a derived body in the same record', () => {
  const value = {
    ...artifact('report', report()),
    availability: { state: 'unavailable', reason: 'source-revoked' },
    content: null,
  };
  assert.deepEqual(normalizeBookEditorialArtifact(value), value);
  assert.throws(() => normalizeBookEditorialArtifact({ ...value, content: report() }), TypeError);
  assert.throws(
    () => normalizeBookEditorialArtifact({ ...value, availability: { state: 'unavailable' } }),
    TypeError,
  );
});
test('evidence offsets explicitly distinguish UTF-16 from absent range metadata', () => {
  const value = {
    source: reference(),
    quote: 'carta',
    start: 10,
    end: 15,
    offsetUnit: 'utf16',
    classification: 'observed',
    rationale: '',
  };
  assert.deepEqual(normalizeBookEditorialArtifact(artifact('evidence', value)).content, value);
  assert.throws(
    () =>
      normalizeBookEditorialArtifact(
        artifact('evidence', { ...value, offsetUnit: 'not-recorded' }),
      ),
    TypeError,
  );
  assert.throws(
    () => normalizeBookEditorialArtifact(artifact('evidence', { ...value, start: null })),
    TypeError,
  );
  assert.throws(
    () => normalizeBookEditorialArtifact(artifact('evidence', { ...value, end: 5 })),
    TypeError,
  );
});
test('native composite identities keep their explicit parent and scope', () => {
  const arc = { ...reference('arcMilestone', 'milestone'), parentId: 'arc' };
  assert.deepEqual(normalizeBookEditorialReference(arc), arc);
  assert.throws(() => normalizeBookEditorialReference({ ...arc, parentId: null }), TypeError);
  assert.throws(
    () => normalizeBookEditorialReference({ ...reference(), parentId: 'arc' }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeBookEditorialReference({
        ...reference('book', 'other'),
        scope: { kind: 'book', id: sourceBookId },
      }),
    TypeError,
  );
});
test('reference extraction yields the complete explicit evidence set in a valid book scope', () => {
  const refs = bookEditorialArtifactReferences(artifact('report', report()), sourceBookId);
  assert.equal(refs.length, 3);
  assert.ok(
    refs
      .filter((ref) => ref.kind === 'artifact')
      .every((ref) => ref.id === h2 && ref.scope.id === sourceBookId),
  );
  for (const ref of refs) assert.deepEqual(normalizeBookEditorialReference(ref), ref);
});
test('legacy absence is explicit and never fabricates artifacts, dates or history', () => {
  const value = {
    schemaVersion: 1,
    bookId: sourceBookId,
    presence: 'absent-in-legacy',
    artifacts: 0,
    links: 0,
  };
  assert.deepEqual(normalizeBookEditorialControl(value), value);
  assert.throws(() => normalizeBookEditorialControl({ ...value, artifacts: 1 }), TypeError);
  const absent = {
    ...artifact('document', null),
    availability: { state: 'unavailable', reason: 'not-recorded' },
    content: null,
    updatedAt: null,
  };
  assert.equal(normalizeBookEditorialArtifact(absent).createdAt, null);
  assert.equal(normalizeBookEditorialArtifact(absent).updatedAt, null);
});
test('links are closed content references and cannot contain old RPC payloads or native grants', () => {
  const link = {
    schemaVersion: 1,
    id: h,
    from: reference('artifact', h),
    to: reference(),
    relation: 'reviews',
  };
  assert.deepEqual(normalizeBookEditorialLink(link), link);
  assert.throws(
    () => normalizeBookEditorialLink({ ...link, request: { action: 'apply' } }),
    TypeError,
  );
});
test('accessors, unknown prototypes and malformed Unicode are rejected without invoking supplied behavior', () => {
  let executed = false;
  const raw = artifact('checkpoint', checkpoint());
  Object.defineProperty(raw, 'content', {
    enumerable: false,
    get() {
      executed = true;
      return checkpoint();
    },
  });
  assert.throws(() => normalizeBookEditorialArtifact(raw), TypeError);
  assert.equal(executed, false);
  assert.throws(
    () =>
      normalizeBookEditorialArtifact(
        Object.assign(Object.create({ granted: true }), artifact('checkpoint', checkpoint())),
      ),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeBookEditorialArtifact(
        artifact('prose', {
          role: 'proposal',
          format: 'plain',
          text: '\ud800',
          rationale: '',
          source: null,
        }),
      ),
    TypeError,
  );
});
test('historical public generation settings are retained separately from any live provider capability or secret', () => {
  const value = {
    ...artifact('report', report()),
    provenance: 'ai',
    generation: {
      snapshot: 'historical',
      provider: 'byok',
      model: 'retired-model',
      reasoning: 'legacy-level',
    },
  };
  assert.deepEqual(normalizeBookEditorialArtifact(value).generation, value.generation);
  assert.equal(
    normalizeBookEditorialArtifact({
      ...value,
      generation: { ...value.generation, reasoning: null },
    }).generation.reasoning,
    null,
  );
  assert.throws(
    () =>
      normalizeBookEditorialArtifact({
        ...value,
        generation: { ...value.generation, key: 'PRIVATE' },
      }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeBookEditorialArtifact({
        ...value,
        generation: { ...value.generation, snapshot: 'active' },
      }),
    TypeError,
  );
});

test('resource kinds cannot masquerade as library or universe identities', () => {
  assert.throws(
    () =>
      normalizeBookEditorialReference({ ...reference(), scope: { kind: 'library', id: 'author' } }),
    TypeError,
  );
  assert.throws(
    () =>
      normalizeBookEditorialReference({
        ...reference('persona', 'profile'),
        scope: { kind: 'universe', id: 'world' },
      }),
    TypeError,
  );
  assert.equal(
    normalizeBookEditorialReference({
      ...reference('lore', 'entry'),
      scope: { kind: 'universe', id: 'world' },
    }).scope.kind,
    'universe',
  );
});
test('a plan preserves distinct source/subject roles while rejecting exactly repeated descriptors', () => {
  const kind = Object.keys(LITERARY_PLAN_SCHEMA)[0],
    body = {
      kind,
      title: 'Ficha',
      status: 'working',
      fields: Object.fromEntries(
        Object.keys(LITERARY_PLAN_SCHEMA[kind].fields).map((key) => [key, '']),
      ),
      references: [{ ...reference(), purpose: 'subject' }],
    };
  assert.equal(
    normalizeBookEditorialArtifact(artifact('plan', body)).content.references[0].purpose,
    'subject',
  );
  assert.equal(
    normalizeBookEditorialArtifact(
      artifact('plan', {
        ...body,
        references: [reference(), { ...reference(), purpose: 'subject' }],
      }),
    ).content.references.length,
    2,
  );
  assert.throws(
    () =>
      normalizeBookEditorialArtifact(
        artifact('plan', { ...body, references: [reference(), reference()] }),
      ),
    TypeError,
  );
});

test('the physical item limit is measured in UTF-8 bytes and never truncates an oversized prose copy', () => {
  const text = 'ç'.repeat(BOOK_EDITORIAL_ITEM_BYTES / 2),
    raw = artifact('prose', {
      role: 'proposal',
      format: 'plain',
      text,
      rationale: '',
      source: null,
    });
  assert.throws(() => normalizeBookEditorialArtifact(raw), TypeError);
  assert.equal(raw.content.text, text);
});

test('logical lineage preserves current/version roles without accepting operational IDs', () => {
  const value = {
    ...artifact('contract', emptyEditorialContract()),
    lineage: { id: h2, role: 'current' },
  };
  assert.deepEqual(normalizeBookEditorialArtifact(value).lineage, value.lineage);
  for (const lineage of [
    { id: 'native-plan-id', role: 'current' },
    { id: h2, role: 'running' },
    { id: h2, role: 'current', jobToken: h },
  ])
    assert.throws(() => normalizeBookEditorialArtifact({ ...value, lineage }));
});
test('lineage requires a positive revision and a supported versioned artifact family', () => {
  assert.throws(() =>
    normalizeBookEditorialArtifact({
      ...artifact('checkpoint', checkpoint()),
      lineage: { id: h2, role: 'current' },
    }),
  );
  assert.throws(() =>
    normalizeBookEditorialArtifact({
      ...artifact('contract', emptyEditorialContract()),
      revision: null,
      lineage: { id: h2, role: 'version' },
    }),
  );
  assert.throws(() =>
    normalizeBookEditorialArtifact({
      ...artifact('contract', emptyEditorialContract()),
      revision: 0,
      lineage: { id: h2, role: 'version' },
    }),
  );
});
test('unknown legacy universe scope stays explicitly unavailable and cannot be promoted to a recorded source', () => {
  const value = {
    ...reference('lore', 'entity'),
    scope: { kind: 'universe', id: null },
    state: 'unavailable',
  };
  assert.deepEqual(normalizeBookEditorialReference(value), value);
  assert.throws(() => normalizeBookEditorialReference({ ...value, state: 'recorded' }));
  assert.throws(() =>
    normalizeBookEditorialReference({ ...value, scope: { kind: 'book', id: null } }),
  );
  assert.throws(() =>
    normalizeBookEditorialReference({
      ...value,
      kind: 'persona',
      scope: { kind: 'library', id: null },
    }),
  );
});

const preparationBody = () => ({
  role: 'preparation',
  title: 'Preparação histórica',
  sections: [],
  references: [],
  preparation: {
    chapter: reference('chapter', 'chapter'),
    historicalAcceptance: true,
    historicalReady: true,
    notes: 'Decisão preservada.',
    criteria: Object.keys(LITERARY_GATE_CRITERIA).map((id) => ({
      id,
      result: 'pass',
      rationale: 'Uma razão.',
      evidenceIds: [h2],
    })),
  },
});
test('historical preparation preserves structured criteria/evidence without accepting active gate fields', () => {
  const raw = { ...artifact('document', preparationBody()), lineage: { id: h2, role: 'current' } },
    value = normalizeBookEditorialArtifact(raw);
  assert.equal(value.content.preparation.historicalAcceptance, true);
  assert.equal(value.lineage.role, 'current');
  assert.equal(bookEditorialArtifactReferences(value, sourceBookId).length, 15);
  assert.throws(() =>
    normalizeBookEditorialArtifact({
      ...raw,
      content: {
        ...raw.content,
        preparation: { ...raw.content.preparation, authorAccepted: true },
      },
    }),
  );
  assert.throws(() =>
    normalizeBookEditorialArtifact({
      ...raw,
      content: {
        ...raw.content,
        preparation: { ...raw.content.preparation, historicalReady: false },
      },
    }),
  );
});
test('preparation claims require the real criterion set, typed evidence IDs and a preparation document role', () => {
  const raw = artifact('document', preparationBody());
  assert.throws(() =>
    normalizeBookEditorialArtifact({ ...raw, content: { ...raw.content, role: 'progress' } }),
  );
  const missing = preparationBody();
  missing.preparation.criteria.pop();
  assert.throws(() => normalizeBookEditorialArtifact({ ...raw, content: missing }));
  const noEvidence = preparationBody();
  noEvidence.preparation.criteria[0].evidenceIds = [];
  assert.throws(() => normalizeBookEditorialArtifact({ ...raw, content: noEvidence }));
});

test('own finding decisions preserve native states and correction absence without accepting live confirmation grants', () => {
  const body = {
      status: 'correctionConfirmed',
      category: null,
      text: 'correct',
      rationale: 'Minha decisão.',
      supersedes: null,
      evidenceIds: [],
      references: [],
      annotation: {
        family: 'finding',
        action: 'correct',
        state: 'correctionConfirmed',
        targetType: 'chapter',
        correction: { note: null, confirmedAt: null },
      },
    },
    raw = { ...artifact('decision', body), lineage: { id: h2, role: 'current' } },
    value = normalizeBookEditorialArtifact(raw);
  assert.equal(value.content.annotation.correction.note, null);
  assert.equal(value.content.status, 'correctionConfirmed');
  assert.throws(() =>
    normalizeBookEditorialArtifact({ ...raw, content: { ...body, effectiveRetention: true } }),
  );
  assert.throws(() =>
    normalizeBookEditorialArtifact({
      ...raw,
      content: { ...body, annotation: { ...body.annotation, confirmationCurrent: true } },
    }),
  );
  assert.throws(() =>
    normalizeBookEditorialArtifact({
      ...raw,
      content: { ...body, annotation: { ...body.annotation, action: 'retain' } },
    }),
  );
});
test('impact reviewed/dismissed declarations require own evidence and cannot masquerade as another decision family', () => {
  const body = {
    status: 'reviewed',
    category: null,
    text: 'reviewed',
    rationale: 'Minha observação.',
    supersedes: null,
    evidenceIds: [h2],
    references: [],
    annotation: { family: 'impact', action: null, state: 'reviewed', targetType: null },
  };
  assert.equal(
    normalizeBookEditorialArtifact(artifact('decision', body)).content.annotation.family,
    'impact',
  );
  assert.throws(() =>
    normalizeBookEditorialArtifact(artifact('decision', { ...body, evidenceIds: [] })),
  );
  assert.throws(() =>
    normalizeBookEditorialArtifact(
      artifact('decision', { ...body, annotation: { ...body.annotation, action: 'retain' } }),
    ),
  );
});

test('derived structural-index references preserve original IDs only as explicit unavailable descriptors', () => {
  for (const kind of ['sceneLink', 'narrativeLink', 'narrativeControl']) {
    const value = { ...reference(kind, 'original-link'), state: 'unavailable' };
    assert.equal(normalizeBookEditorialReference(value).id, 'original-link');
    assert.throws(() => normalizeBookEditorialReference({ ...value, state: 'recorded' }));
    assert.throws(() =>
      normalizeBookEditorialReference({ ...value, scope: { kind: 'universe', id: 'world' } }),
    );
  }
});
