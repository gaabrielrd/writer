import { createHash } from 'node:crypto';
import { bookBackupIdentity, bookBackupChanged } from './bookBackupContext.mjs';
import { readWorkMetadata, workId, workFail, digest } from './workProgressContracts.mjs';
import {
  inspectLiteraryIntegrationSource,
  authorizeLiteraryIntegrationRequest,
} from './literaryIntegrationRequestRead.mjs';
import { LITERARY_INTEGRATION_AXES } from './literaryIntegrationProtocol.mjs';
import { bookEditorialIntegrationArtifactIdentity } from './bookEditorialProjection.mjs';
import { normalizeBookEditorialArtifact } from './bookEditorialProtocol.mjs';
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
const fail = () =>
  workFail(
    'failed-precondition',
    'O histórico da integração está inconsistente. Preserve a origem.',
  );
const count = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail();
  return value;
};
const text = (value, max, required = false) => {
  if (
    typeof value !== 'string' ||
    value.length > max ||
    !value.isWellFormed() ||
    (required && !value.trim())
  )
    fail();
  return value;
};
const list = (value, max) => {
  if (!Array.isArray(value) || value.length > max) fail();
  return value;
};
function frozenGeneration(value) {
  if (
    value?.version !== 1 ||
    value.requested?.provider !== 'platform' ||
    value.effective?.provider !== 'gemini' ||
    typeof value.effective.model !== 'string' ||
    (value.effective.reasoning !== null && typeof value.effective.reasoning !== 'string')
  )
    fail();
  return {
    generation: {
      snapshot: 'historical',
      provider: 'platform',
      model: value.effective.model,
      reasoning: value.effective.reasoning,
    },
  };
}
const states = [
  'planning',
  'reading',
  'synthesizing',
  'verifying',
  'done',
  'attention',
  'stale',
  'canceled',
];
const jobFields = [
  'schemaVersion',
  'jobId',
  'state',
  'phase',
  'level',
  'actId',
  'note',
  'generation',
  'planIds',
  'audit',
  'sourceFence',
  'mainChapters',
  'selectedChapters',
  'mainUnits',
  'mainReadUnits',
  'analyses',
  'segments',
  'boundaries',
  'blocking',
  'warnings',
  'suggestions',
  'dismissedBlocking',
  'verifiedUnits',
  'verifiedAnalyses',
  'authorAccepted',
  'createdAt',
  'completedAt',
  'architectureSources',
  'architectureReadSources',
  'architectureSegments',
  'architectureVerifiedSources',
  'architectureInventoryComplete',
];
const requestFields = [
  'schemaVersion',
  'requestId',
  'jobId',
  'state',
  'kind',
  'sources',
  'manifest',
  'architectureSource',
  'architectureGuide',
  'coverage',
  'evidenceIds',
  'createdAt',
  'captureBinding',
];
function birth(value) {
  if (
    !value ||
    Object.keys(value).sort().join(',') !== 'nanoseconds,seconds' ||
    !Number.isSafeInteger(value.seconds) ||
    value.seconds < 0 ||
    !Number.isInteger(value.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    fail();
  return value;
}
const ref = (bookId, id, state = 'recorded', kind = 'artifact', purpose = 'source') => ({
  kind,
  id,
  parentId: null,
  scope: { kind: 'book', id: bookId },
  revision: null,
  contentHash: null,
  state,
  purpose,
});
/** Bounded internal projection; opening the native result follows both native gates. */
export async function readBookEditorialIntegrationCapture(
  tx,
  c,
  { id, family, bookBirth, itemToken, tokenForRow },
) {
  if (!['job', 'request'].includes(family)) fail();
  const row = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/literaryIntegration' + (family === 'job' ? 'Jobs' : 'Requests') + '/' + id),
    family === 'job' ? jobFields : requestFields,
  );
  if (!row.exists || tokenForRow(row) !== itemToken) bookBackupChanged(true);
  const value = row.data(),
    pins = [],
    ownBirth = bookBackupIdentity(row).created;
  const identity = (part, sourceId = id, sourceFamily = family, sourceBirth = ownBirth) =>
    bookEditorialIntegrationArtifactIdentity({
      bookId: c.target.id,
      bookBirth,
      birth: sourceBirth,
      id: sourceId,
      family: sourceFamily,
      part,
    });
  const make = (kind, part, content, extra = {}) =>
    normalizeBookEditorialArtifact({
      schemaVersion: 1,
      id: identity(part),
      kind,
      revision: null,
      createdAt: null,
      updatedAt: null,
      provenance: 'unknown',
      availability: { state: 'included' },
      content,
      ...extra,
    });
  const missing = (reason) =>
    normalizeBookEditorialArtifact({
      schemaVersion: 1,
      id: identity('report'),
      kind: 'report',
      revision: null,
      createdAt: null,
      updatedAt: null,
      provenance: 'unknown',
      availability: { state: 'unavailable', reason },
      content: null,
    });
  let artifacts;
  if (family === 'job') {
    if (value.jobId !== id || !states.includes(value.state)) fail();
    const canceledStub = value.state === 'canceled' && value.level == null;
    const counters = canceledStub
      ? {}
      : {
          plannedUnits: count(value.mainUnits),
          completedUnits: count(value.mainReadUnits),
          analyses: count(value.analyses),
        };
    if (!canceledStub && counters.completedUnits > counters.plannedUnits) fail();
    const checkpoint = make(
      'checkpoint',
      'checkpoint',
      {
        process: 'integration',
        phase: value.state,
        counters,
        currentUnit: null,
        references: [],
        haltReason: null,
        nextAction: null,
        controlsDisabled: true,
      },
      { createdAt: value.createdAt ?? null },
    );
    artifacts = [checkpoint];
    if (!canceledStub) {
      if (
        !['act', 'book'].includes(value.level) ||
        (value.level === 'act' ? !value.actId : value.actId !== null)
      )
        fail();
      const subject = ref(
        c.target.id,
        value.level === 'act' ? workId(value.actId) : c.target.id,
        'unavailable',
        value.level,
        'subject',
      );
      const sections = [{ label: 'Instrução autoral', text: text(value.note, 4000) }];
      if (value.generation) {
        sections.push({
          label: 'Modelo solicitado',
          text:
            value.generation.requested.model === null
              ? 'automático'
              : text(value.generation.requested.model, 300, true),
        });
        if (value.generation.requested.reasoning != null)
          sections.push({
            label: 'Raciocínio solicitado',
            text: text(value.generation.requested.reasoning, 300, true),
          });
      }
      if (value.planIds !== undefined)
        sections.push({
          label: 'Planejamentos selecionados',
          text: list(value.planIds, 8).map(workId).join('\n'),
        });
      if (typeof value.authorAccepted === 'boolean')
        sections.push({
          label: 'Aceite histórico registrado',
          text: value.authorAccepted ? 'sim' : 'não',
        });
      if (value.audit === 'architecture')
        sections.push({
          label: 'Modalidade',
          text: 'Auditoria da arquitetura; não pressupõe leitura dos corpos referenciados.',
        });
      let probe = { current: false, reason: 'unsupported-legacy-schema' };
      if (value.schemaVersion === 1 && /^[a-f0-9]{64}$/.test(value.sourceFence ?? ''))
        probe = await inspectLiteraryIntegrationSource(tx, c, value);
      pins.push({
        current: probe.current,
        source: probe.source?.token ?? null,
        reason: probe.reason,
      });
      subject.state = probe.current ? 'recorded' : 'unavailable';
      artifacts.push(
        make(
          'document',
          'instruction',
          {
            role: 'preparation',
            title: 'Solicitação e decisão próprias da integração',
            sections,
            references: [subject],
          },
          { provenance: 'author', createdAt: value.createdAt ?? null },
        ),
      );
      if (!probe.current) artifacts.push(missing(probe.reason));
      else {
        const observations = [];
        for (const key of [
          'mainChapters',
          'selectedChapters',
          'segments',
          'boundaries',
          'blocking',
          'warnings',
          'suggestions',
          'dismissedBlocking',
          'verifiedUnits',
          'verifiedAnalyses',
          'architectureSources',
          'architectureReadSources',
          'architectureSegments',
          'architectureVerifiedSources',
        ])
          if (value[key] !== undefined)
            observations.push({ axis: key, text: String(count(value[key])), evidenceIds: [] });
        if (value.audit === 'architecture')
          observations.push({
            axis: 'architectureInventoryComplete',
            text: value.architectureInventoryComplete === true ? 'sim' : 'não',
            evidenceIds: [],
          });
        artifacts.push(
          make(
            'report',
            'report',
            {
              role: 'integration',
              title: 'Cobertura técnica registrada da integração',
              summary: 'Os achados pertencem aos relatórios de leitura e síntese.',
              findings: [],
              observations,
              references: [subject],
              claimedCoverage: {
                scope: value.level,
                completed: counters.completedUnits,
                total: counters.plannedUnits,
                limitations: [
                  value.state === 'done'
                    ? 'Execução registrada como concluída; contagens e verificação são históricas.'
                    : 'Censo ou execução incompletos; o total pode ser um prefixo.',
                  'Sínteses não constituem novas leituras do manuscrito; cobertura técnica não certifica qualidade, aceite vigente ou publicação.',
                ],
              },
            },
            value.generation ? frozenGeneration(value.generation) : {},
          ),
        );
      }
      artifacts[0] = normalizeBookEditorialArtifact({
        ...checkpoint,
        content: {
          ...checkpoint.content,
          currentUnit: subject,
          references: artifacts
            .slice(1)
            .map((item) =>
              ref(
                c.target.id,
                item.id,
                item.availability.state === 'included' ? 'recorded' : 'unavailable',
                'artifact',
                item.kind === 'report' ? 'subject' : 'source',
              ),
            ),
        },
      });
    }
  } else {
    if (
      value.requestId !== id ||
      !['running', 'done', 'error', 'canceled'].includes(value.state) ||
      !['reading', 'boundary', 'architecture', 'synthesis'].includes(value.kind)
    )
      fail();
    const jobId = workId(value.jobId),
      parent = await readWorkMetadata(
        tx,
        c.db.doc(c.path + '/literaryIntegrationJobs/' + jobId),
        jobFields,
      ),
      job = parent.data();
    const binding = value.captureBinding,
      originalBirth = binding?.version === 1 ? birth(binding.jobBirth) : null;
    const matchesBirth =
      !originalBirth ||
      (parent.exists && stable(bookBackupIdentity(parent).created) === stable(originalBirth));
    let reason =
      value.schemaVersion === 1 && (!binding || binding.version === 1)
        ? null
        : 'unsupported-legacy-schema';
    if (!reason && (!parent.exists || job.jobId !== jobId || !matchesBirth))
      reason = 'source-unavailable';
    if (!reason && (job.schemaVersion !== 1 || !/^[a-f0-9]{64}$/.test(job.sourceFence ?? '')))
      reason = 'unsupported-legacy-schema';
    if (!reason && value.state !== 'done') reason = 'not-recorded';
    if (
      !reason &&
      job.audit === 'architecture' &&
      value.kind === 'synthesis' &&
      job.state !== 'done'
    )
      reason = 'not-recorded';
    if (!reason) {
      const probe = await inspectLiteraryIntegrationSource(tx, c, job);
      pins.push({ source: probe.source?.token ?? null, current: probe.current });
      if (!probe.current) reason = probe.reason;
    }
    if (!reason) {
      try {
        await authorizeLiteraryIntegrationRequest(tx, c, value);
      } catch (error) {
        if (
          !['permission-denied', 'not-found', 'failed-precondition', 'resource-exhausted'].includes(
            error.code,
          )
        )
          throw error;
        reason = ['permission-denied', 'not-found'].includes(error.code)
          ? 'source-revoked'
          : 'source-unavailable';
      }
    }
    pins.push({ parent: bookBackupIdentity(parent), matchesBirth, reason });
    const parentId = originalBirth
      ? identity('checkpoint', jobId, 'job', originalBirth)
      : identity('unbound-parent:' + jobId);
    const parentRef = ref(
      c.target.id,
      parentId,
      originalBirth && parent.exists && matchesBirth ? 'recorded' : 'unavailable',
    );
    const checkpoint = make(
      'checkpoint',
      'checkpoint',
      {
        process: 'integration',
        phase: value.state,
        counters: {},
        currentUnit: null,
        references: [parentRef],
        haltReason: null,
        nextAction: null,
        controlsDisabled: true,
      },
      { createdAt: value.createdAt ?? null },
    );
    artifacts = [checkpoint];
    if (reason) artifacts.push(missing(reason));
    else {
      const body = await tx.get(c.db.doc(c.path + '/literaryIntegrationResults/' + id)),
        saved = body.data();
      pins.push({ result: bookBackupIdentity(body) });
      if (
        !body.exists ||
        saved.schemaVersion !== 1 ||
        saved.jobId !== jobId ||
        saved.requestId !== id
      )
        fail();
      const result = saved.result,
        scope = {
          reading: 'unit-segment',
          boundary: 'chapter-boundary',
          architecture: 'architecture-segment',
          synthesis: 'evidence-synthesis',
        }[value.kind];
      if (
        result?.complete !== true ||
        result.coverage?.scope !== scope ||
        result.coverage.wholeChapter !== false ||
        result.coverage.wholeAct !== false ||
        result.coverage.wholeBook !== false
      )
        fail();
      const sources = new Map();
      for (const source of list(saved.sources, 128)) {
        text(source.id, 4000, true);
        if (sources.has(source.id)) fail();
        count(source.offsetBase);
        if (source.format !== undefined && source.format !== 'canonical-json') fail();
        sources.set(source.id, source);
      }
      const reportSources = new Map(),
        nativeIds = list(value.evidenceIds, 4).map(workId);
      if (
        new Set(nativeIds).size !== nativeIds.length ||
        (value.kind === 'synthesis' ? !nativeIds.length : nativeIds.length)
      )
        fail();
      const witnesses = binding?.version === 1 ? list(binding.reportSources, 4) : [];
      if (
        new Set(witnesses.map((item) => item.requestId)).size !== witnesses.length ||
        witnesses.some((item) => !nativeIds.includes(item.requestId)) ||
        (binding?.version === 1 && witnesses.length !== nativeIds.length)
      )
        fail();
      for (const sourceId of nativeIds) {
        const witness = witnesses.find((item) => item.requestId === sourceId);
        let pointer = identity('unbound-report:' + sourceId),
          available = false;
        if (witness) {
          const born = birth(witness.birth);
          pointer = identity('report', sourceId, 'request', born);
          const source = await readWorkMetadata(
            tx,
            c.db.doc(c.path + '/literaryIntegrationRequests/' + sourceId),
            ['schemaVersion', 'requestId', 'jobId', 'state'],
          );
          available =
            source.exists &&
            stable(bookBackupIdentity(source).created) === stable(born) &&
            source.data().schemaVersion === 1 &&
            source.data().requestId === sourceId &&
            source.data().jobId === jobId &&
            source.data().state === 'done';
          pins.push({ reportSource: bookBackupIdentity(source), available });
        }
        reportSources.set(
          sourceId,
          ref(c.target.id, pointer, available ? 'recorded' : 'unavailable'),
        );
      }
      const dependencies = (ids) => {
        list(ids, 12);
        if (
          !ids.length ||
          new Set(ids).size !== ids.length ||
          ids.some((id) => !reportSources.has(id))
        )
          fail();
        return ids.map((id) => reportSources.get(id));
      };
      const evidence = [],
        evidenceIndex = new Map();
      const quotes = (values) => {
        if (!list(values, 3).length) fail();
        return values.map((raw) => {
          const source = sources.get(raw.sourceId);
          if (!source) fail();
          const quote = text(raw.quote, 1200, true),
            offset = count(raw.offset);
          if (offset < source.offsetBase) fail();
          const key = stable({ sourceId: raw.sourceId, quote, offset });
          if (!evidenceIndex.has(key)) {
            const part = 'evidence:' + key;
            const unit = (value.sources ?? []).find(
              (unit) =>
                raw.sourceId ===
                'manuscript:' +
                  unit.chapterId +
                  ':' +
                  unit.resource?.kind +
                  ':' +
                  unit.resource?.id,
            );
            const sourceRef =
              unit && ['chapter', 'scene'].includes(unit.resource?.kind)
                ? ref(c.target.id, workId(unit.resource.id), 'recorded', unit.resource.kind)
                : ref(c.target.id, identity('source:' + raw.sourceId), 'unavailable');
            evidence.push(
              make('evidence', part, {
                source: sourceRef,
                quote,
                start: offset,
                end: offset + quote.length,
                offsetUnit: 'utf16',
                classification: 'unclassified',
                rationale:
                  'Citação e posição registradas pelo produtor nativo; a fonte fornecida pode ser texto lógico ou JSON canônico.',
                context: {
                  format: source.format ?? 'plain',
                  documentId: raw.sourceId,
                  offsetBase: source.offsetBase,
                },
              }),
            );
            evidenceIndex.set(key, identity(part));
          }
          return evidenceIndex.get(key);
        });
      };
      const findings = list(result.findings, 40).map((item, index) => ({
        id: identity('finding:' + index),
        severity: item.severity,
        status: item.status,
        problem: text(item.problem, 2000, true),
        action: text(item.action, 2000, true),
        ...(value.kind === 'synthesis'
          ? { evidenceIds: [], reportSources: dependencies(item.evidenceIds) }
          : { evidenceIds: [...new Set(quotes(item.evidence))] }),
      }));
      const observations =
        value.kind === 'synthesis'
          ? list(result.conclusions, 40).map((item) => {
              if (!LITERARY_INTEGRATION_AXES.includes(item.axis) || item.status !== 'proposal')
                fail();
              return {
                axis: item.axis,
                text: text(item.observation, 3000, true),
                evidenceIds: [],
                reportSources: dependencies(item.evidenceIds),
              };
            })
          : list(result.matrix, 40).map((item) => {
              if (
                !LITERARY_INTEGRATION_AXES.includes(item.axis) ||
                !['established', 'interpretation', 'uncertain'].includes(item.certainty) ||
                item.status !== 'proposal' ||
                (value.kind === 'architecture' && item.certainty === 'established')
              )
                fail();
              return {
                axis: item.axis,
                text:
                  text(item.subject, 300, true) +
                  '\n' +
                  text(item.observation, 3000, true) +
                  '\nCerteza registrada: ' +
                  item.certainty,
                evidenceIds: [...new Set(quotes(item.evidence))],
              };
            });
      let total = value.kind === 'synthesis' ? nativeIds.length : 1;
      if (['reading', 'architecture'].includes(value.kind)) {
        const raw = value.coverage;
        if (!raw || !/^[a-f0-9]{64}$/.test(raw.sourceToken ?? '')) fail();
        const values = Object.fromEntries(
          ['sourceCharacters', 'segment', 'segmentCount', 'coreStart', 'coreEnd'].map((key) => [
            key,
            count(raw[key]),
          ]),
        );
        if (
          !values.segmentCount ||
          values.segment >= values.segmentCount ||
          values.coreStart >= values.coreEnd ||
          values.coreEnd > values.sourceCharacters
        )
          fail();
        total = values.segmentCount;
        observations.push({
          axis: 'Limites técnicos do segmento',
          text: JSON.stringify(values),
          evidenceIds: [],
        });
      } else if (value.coverage !== null) fail();
      artifacts.push(
        make(
          'report',
          'report',
          {
            role: 'integration',
            title: 'Relatório histórico de integração: ' + value.kind,
            summary: text(result.report, 6000),
            findings,
            observations,
            references: [parentRef],
            claimedCoverage: {
              scope,
              completed: value.kind === 'synthesis' ? nativeIds.length : 1,
              total,
              limitations: [
                'Leitura e síntese preservam escopos distintos; este relatório não afirma leitura integral de capítulo, ato ou livro.',
                originalBirth
                  ? 'Configuração efetiva preservada do job original conferido.'
                  : 'Configuração efetiva do job original não conferida para este registro legado.',
              ],
            },
          },
          originalBirth && job.generation ? frozenGeneration(job.generation) : {},
        ),
      );
      artifacts.push(...evidence);
    }
    artifacts[0] = normalizeBookEditorialArtifact({
      ...checkpoint,
      content: {
        ...checkpoint.content,
        references: [
          ...checkpoint.content.references,
          ref(
            c.target.id,
            identity('report'),
            reason ? 'unavailable' : 'recorded',
            'artifact',
            'subject',
          ),
        ],
      },
    });
  }
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, artifacts }), 'utf8');
  if (artifacts.length > 242 || bytes.length > 2 * 1024 * 1024) fail();
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
