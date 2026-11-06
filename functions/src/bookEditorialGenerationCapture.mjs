import { createHash } from 'node:crypto';
import { bookBackupIdentity, bookBackupChanged, bookBackupToken } from './bookBackupContext.mjs';
import { readWorkMetadata, workFail, workId, digest } from './workProgressContracts.mjs';
import { readLiteraryAICaptureContext } from './literaryAI.mjs';
import { normalizeLiteraryGenerationDependencies } from './literaryGenerationDependencies.mjs';
import {
  bookEditorialRecordIdentity,
  projectBookEditorialPlanReference,
} from './bookEditorialProjection.mjs';
import { normalizeBookEditorialArtifact } from './bookEditorialProtocol.mjs';
import { LITERARY_PLAN_SCHEMA } from './literaryPlanFields.mjs';
import { EDITORIAL_FIELDS } from './literaryEditorialFields.mjs';
const fields = [
  'schemaVersion',
  'operationId',
  'state',
  'createdAt',
  'request',
  'snapshot.proofToken',
  'dependencies',
];
const canonical = (value) =>
  Array.isArray(value)
    ? value.map(canonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, canonical(value[key])]),
        )
      : value;
const stable = (value) => digest(canonical(value ?? null));
const distinct = (refs) => [...new Map(refs.map((ref) => [stable(ref), ref])).values()];
const fail = () =>
  workFail(
    'failed-precondition',
    'A geração editorial salva está inconsistente. Preserve a origem.',
  );
const reference = (bookId, id, state = 'recorded', purpose = 'source') => ({
  kind: 'artifact',
  id,
  parentId: null,
  scope: { kind: 'book', id: bookId },
  revision: null,
  contentHash: null,
  state,
  purpose,
});
const sourceDocId = (ref) =>
  ref.kind === 'volumeUnit'
    ? 'volume-unit:' + digest({ id: ref.id, scopeId: ref.scopeId })
    : ref.kind + ':' + ref.id + ':' + (ref.purpose ?? 'source');
function transfer(artifacts, pins) {
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, artifacts }), 'utf8');
  if (!artifacts.length || artifacts.length > 45 || bytes.length > 2 * 1024 * 1024) fail();
  return {
    artifact: artifacts[0],
    artifacts,
    bytes,
    state: 'artifact',
    contentHash: createHash('sha256').update(bytes).digest('hex'),
    head: null,
    pins,
  };
}
function generation(raw) {
  if (raw === undefined) return null;
  if (
    raw?.version !== 1 ||
    raw.requested?.provider !== 'platform' ||
    raw.effective?.provider !== 'gemini' ||
    typeof raw.effective.model !== 'string' ||
    (raw.effective.reasoning !== null && typeof raw.effective.reasoning !== 'string')
  )
    fail();
  return {
    snapshot: 'historical',
    provider: 'platform',
    model: raw.effective.model,
    reasoning: raw.effective.reasoning,
  };
}
/** Native current-proof gate precedes opening cached result or original snapshot documents. */
export async function readBookEditorialGenerationCapture(
  tx,
  c,
  { id, bookBirth, itemToken, tokenForRow },
) {
  const row = await readWorkMetadata(tx, c.db.doc(c.path + '/literaryGenerations/' + id), fields);
  if (!row.exists || tokenForRow(row) !== itemToken) bookBackupChanged(true);
  const header = row.data();
  if (
    header.operationId !== id ||
    !['running', 'done', 'error', 'stale', 'canceled'].includes(header.state)
  )
    fail();
  const identity = (part) =>
    digest({
      domain: 'writer-editorial-generation-artifact-v1',
      bookId: c.target.id,
      bookBirth,
      birth: bookBackupIdentity(row).created,
      id,
      part,
    });
  const make = (kind, part, content, provenance = 'unknown', extra = {}) =>
    normalizeBookEditorialArtifact({
      schemaVersion: 1,
      id: identity(part),
      kind,
      revision: null,
      createdAt: null,
      updatedAt: null,
      provenance,
      availability: { state: 'included' },
      content,
      ...extra,
    });
  const checkpoint = make('checkpoint', 'checkpoint', {
    process: 'planning',
    phase: header.state,
    counters: {},
    currentUnit: null,
    references: [],
    haltReason: null,
    nextAction: null,
    controlsDisabled: true,
  });
  if (header.state === 'canceled' && header.request == null) {
    const record =
      header.schemaVersion === 1
        ? { ...checkpoint, createdAt: header.createdAt ?? null }
        : {
            ...checkpoint,
            availability: { state: 'unavailable', reason: 'unsupported-legacy-schema' },
            content: null,
          };
    return transfer([normalizeBookEditorialArtifact(record)], [{ cancellation: 'before-input' }]);
  }
  const request = header.request;
  if (
    !request ||
    !['propose', 'audit', 'contract'].includes(request.mode) ||
    !request.plan ||
    !Object.hasOwn(LITERARY_PLAN_SCHEMA, request.plan.kind) ||
    !Array.isArray(request.plan.references) ||
    request.plan.references.length > 12 ||
    !Array.isArray(request.sourcePlanIds) ||
    request.sourcePlanIds.length > 8
  )
    fail();
  const sourcePlanIds = request.sourcePlanIds.map(workId);
  if (new Set(sourcePlanIds).size !== sourcePlanIds.length) fail();
  const frozen = generation(request.generation),
    pins = [];
  let unavailable =
    header.schemaVersion === 1
      ? header.state === 'done'
        ? null
        : 'not-recorded'
      : 'unsupported-legacy-schema';
  let probe = null,
    dependencies = null;
  if (header.dependencies?.version === 1)
    dependencies = normalizeLiteraryGenerationDependencies(header.dependencies);
  if (
    !unavailable &&
    (typeof header.snapshot?.proofToken !== 'string' ||
      !/^[a-f0-9]{64}$/.test(header.snapshot.proofToken))
  )
    unavailable = 'unsupported-legacy-schema';
  if (!unavailable) {
    const token = bookBackupToken(header.snapshot.proofToken);
    probe = await readLiteraryAICaptureContext(tx, c, { request, proofToken: token });
    if (!probe.current) unavailable = probe.reason;
    pins.push({
      current: probe.current,
      proof: probe.snapshot?.proofToken ?? null,
      reason: probe.reason,
    });
  }
  // A stale current universe never replaces the original metadata scope of an own draft.
  const proof = probe?.current ? probe.snapshot.proof : dependencies;
  const originBirth = proof?.bookBirth
    ? { seconds: proof.bookBirth[0], nanoseconds: proof.bookBirth[1] }
    : bookBirth;
  function resolved(raw) {
    const match = proof?.references.find(
      (item) =>
        item.reference.kind === raw.kind &&
        item.reference.id === raw.id &&
        (item.reference.purpose ?? 'source') === (raw.purpose ?? 'source') &&
        (raw.scopeId == null || raw.scopeId === item.reference.scopeId) &&
        item.reference.sourceToken === raw.sourceToken &&
        ((raw.purpose ?? 'source') === 'subject' || item.reference.revision === raw.revision),
    );
    return match ? { ...match.reference, revision: raw.revision } : raw;
  }
  function projectPlan(raw) {
    if (
      !raw ||
      !Object.hasOwn(LITERARY_PLAN_SCHEMA, raw.kind) ||
      !Array.isArray(raw.references) ||
      raw.references.length > 12 ||
      !raw.fields ||
      Object.keys(raw.fields).some(
        (key) => !Object.hasOwn(LITERARY_PLAN_SCHEMA[raw.kind].fields, key),
      )
    )
      fail();
    return {
      kind: raw.kind,
      title: raw.title,
      status: raw.status,
      fields: Object.fromEntries(
        Object.keys(LITERARY_PLAN_SCHEMA[raw.kind].fields).map((key) => [key, raw.fields?.[key]]),
      ),
      references: distinct(
        raw.references.map((ref) =>
          projectBookEditorialPlanReference(
            c.target.id,
            null,
            resolved(ref),
            unavailable ? 'unavailable' : 'recorded',
          ),
        ),
      ),
    };
  }
  const unknown = (key, purpose = 'source') =>
    reference(c.target.id, identity('unrecorded-source:' + key), 'unavailable', purpose);
  function savedPlan(id) {
    const source = proof?.plans.find((plan) => plan.id === id);
    if (!source || source.revision < 1) return unknown('plan:' + id);
    return reference(
      c.target.id,
      bookEditorialRecordIdentity({
        bookId: c.target.id,
        bookBirth: originBirth,
        kind: 'plan',
        id,
        revision: source.revision,
      }).id,
      unavailable ? 'unavailable' : 'recorded',
    );
  }
  const support = sourcePlanIds.map(savedPlan);
  const sections = [
    { label: 'Operação solicitada', text: request.mode },
    { label: 'Instrução', text: request.instruction },
    { label: 'Planejamentos de apoio registrados', text: sourcePlanIds.join('\n') },
  ];
  if (frozen)
    sections.push(
      { label: 'Modelo na solicitação', text: frozen.model },
      { label: 'Raciocínio efetivo solicitado', text: frozen.reasoning ?? '' },
    );
  const artifacts = [
    make(
      'document',
      'instruction',
      {
        role: 'preparation',
        title: 'Solicitação autoral de planejamento',
        sections,
        references: [reference(c.target.id, identity('input-plan')), ...support],
      },
      'author',
      { createdAt: header.createdAt ?? null },
    ),
    make('plan', 'input-plan', projectPlan(request.plan), 'author'),
    checkpoint,
  ];
  const missing = (kind, part) =>
    normalizeBookEditorialArtifact({
      schemaVersion: 1,
      id: identity(part),
      kind,
      revision: null,
      createdAt: null,
      updatedAt: null,
      provenance: 'unknown',
      availability: { state: 'unavailable', reason: unavailable },
      content: null,
    });
  const outputKind =
    request.mode === 'contract' ? 'contract' : request.mode === 'propose' ? 'plan' : null;
  if (unavailable) {
    artifacts.push(missing('report', 'report'));
    if (outputKind) artifacts.push(missing(outputKind, 'proposal'));
  } else {
    const body = await tx.get(row.ref),
      value = body.data();
    if (stable(bookBackupIdentity(body)) !== stable(bookBackupIdentity(row)))
      bookBackupChanged(true);
    if (
      stable(value.request) !== stable(request) ||
      value.snapshot?.proofToken !== header.snapshot.proofToken ||
      stable(value.snapshot.proof) !== stable(probe.snapshot.proof) ||
      !value.result ||
      !Array.isArray(value.snapshot.documents) ||
      value.snapshot.documents.length > 34
    )
      fail();
    const documents = new Map();
    for (const document of value.snapshot.documents) {
      if (
        !document ||
        typeof document.id !== 'string' ||
        typeof document.text !== 'string' ||
        documents.has(document.id)
      )
        fail();
      documents.set(document.id, document);
    }
    let draft;
    try {
      draft = JSON.parse(documents.get('draft')?.text);
    } catch {
      fail();
    }
    if (stable(draft) !== stable(request.plan)) fail();
    const coverage = value.snapshot.coverage,
      result = value.result;
    if (
      coverage?.scope !== 'selected-sources' ||
      coverage.completeForSelection !== true ||
      coverage.wholeBook !== false ||
      !Number.isSafeInteger(coverage.documentCount) ||
      coverage.documentCount !== documents.size ||
      stable(coverage) !== stable(probe.snapshot.coverage) ||
      stable(result.coverage) !== stable(coverage) ||
      !Array.isArray(result.findings) ||
      result.findings.length > 40 ||
      typeof result.rationale !== 'string' ||
      result.rationale.length > 6000
    )
      fail();
    if (
      !result.plan ||
      (request.mode === 'propose'
        ? result.plan.status !== 'proposal' ||
          result.plan.kind !== request.plan.kind ||
          stable(result.plan.references) !== stable(request.plan.references)
        : stable(result.plan) !== stable(request.plan))
    )
      fail();
    const metadata = frozen ? { generation: frozen } : {};
    if (request.mode === 'propose')
      artifacts.push(make('plan', 'proposal', projectPlan(result.plan), 'ai', metadata));
    if (request.mode === 'contract') {
      const proposal = result.contractProposal;
      if (
        !proposal ||
        proposal.schemaVersion !== 1 ||
        !Array.isArray(proposal.decisions) ||
        proposal.decisions.length > 30 ||
        proposal.decisions.some(
          (item) => !['proposal', 'gap'].includes(item.status) || item.supersedes !== null,
        )
      )
        fail();
      artifacts.push(
        make(
          'contract',
          'proposal',
          {
            schemaVersion: 1,
            fields: Object.fromEntries(
              Object.keys(EDITORIAL_FIELDS).map((key) => [key, proposal.fields?.[key]]),
            ),
            decisions: proposal.decisions.map((item) => ({
              id: item.id,
              text: item.text,
              category: item.category,
              status: item.status,
              source: item.source,
              supersedes: null,
            })),
          },
          'ai',
          metadata,
        ),
      );
    }
    const sources = new Map([['draft', reference(c.target.id, identity('input-plan'))]]);
    const contractRevision = proof.contractRevision;
    sources.set(
      'contract',
      contractRevision > 0
        ? reference(
            c.target.id,
            bookEditorialRecordIdentity({
              bookId: c.target.id,
              bookBirth: originBirth,
              kind: 'contract',
              id: 'current',
              revision: contractRevision,
            }).id,
          )
        : unknown('contract'),
    );
    for (const plan of proof.plans) sources.set('plan:' + plan.id, savedPlan(plan.id));
    for (const source of proof.references)
      sources.set(
        sourceDocId(source.reference),
        projectBookEditorialPlanReference(c.target.id, null, source.reference, 'recorded'),
      );
    const findings = [];
    for (let index = 0; index < result.findings.length; index++) {
      const finding = result.findings[index],
        source = documents.get(finding.sourceId);
      if (
        !source ||
        (request.mode === 'contract' && source.id === 'draft') ||
        typeof finding.quote !== 'string' ||
        !finding.quote.trim() ||
        finding.quote.length > 1000 ||
        !source.text.includes(finding.quote) ||
        !['blocking', 'warning', 'suggestion'].includes(finding.severity) ||
        typeof finding.problem !== 'string' ||
        !finding.problem.trim() ||
        finding.problem.length > 2000 ||
        typeof finding.action !== 'string' ||
        !finding.action.trim() ||
        finding.action.length > 2000
      )
        fail();
      const evidenceId = identity('evidence:' + index);
      artifacts.push(
        make(
          'evidence',
          'evidence:' + index,
          {
            source: sources.get(source.id) ?? unknown(source.id),
            quote: finding.quote,
            start: null,
            end: null,
            offsetUnit: 'not-recorded',
            classification: 'unclassified',
            rationale: finding.problem,
            context: { format: 'plain', documentId: source.id, offsetBase: null },
          },
          'ai',
        ),
      );
      findings.push({
        id: identity('finding:' + index),
        severity: finding.severity,
        status: null,
        problem: finding.problem,
        action: finding.action,
        evidenceIds: [evidenceId],
      });
    }
    const refs = [
      reference(c.target.id, identity('instruction')),
      reference(
        c.target.id,
        identity('input-plan'),
        'recorded',
        request.mode === 'audit' ? 'subject' : 'source',
      ),
      ...support,
      ...proof.references.map((source) =>
        projectBookEditorialPlanReference(c.target.id, null, source.reference, 'recorded'),
      ),
    ];
    if (outputKind) refs.push(reference(c.target.id, identity('proposal'), 'recorded', 'subject'));
    artifacts.push(
      make(
        'report',
        'report',
        {
          role: 'analysis',
          title:
            request.mode === 'audit'
              ? 'Auditoria editorial salva'
              : request.mode === 'contract'
                ? 'Inferência salva do contrato editorial'
                : 'Análise salva da proposta editorial',
          summary: result.rationale,
          findings,
          observations: [],
          references: distinct(refs),
          claimedCoverage: {
            scope: 'selected-sources',
            completed: coverage.documentCount,
            total: coverage.documentCount,
            limitations: [
              'Somente as fontes selecionadas e as entradas editoriais fornecidas, incluindo o rascunho; não comprova leitura integral do manuscrito, ato ou livro.',
            ],
          },
        },
        'ai',
        metadata,
      ),
    );
  }
  artifacts[2] = normalizeBookEditorialArtifact({
    ...checkpoint,
    content: {
      ...checkpoint.content,
      references: artifacts
        .filter((item) => item !== checkpoint && item.kind !== 'evidence')
        .map((item) =>
          reference(
            c.target.id,
            item.id,
            item.availability.state === 'included' ? 'recorded' : 'unavailable',
            item.id === identity('proposal') || item.kind === 'report' ? 'subject' : 'source',
          ),
        ),
    },
  });
  return transfer(artifacts, pins);
}
