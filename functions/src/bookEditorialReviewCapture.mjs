import { createHash } from 'node:crypto';
import { bookBackupIdentity, bookBackupChanged } from './bookBackupContext.mjs';
import { readWorkMetadata, workId, workFail, digest } from './workProgressContracts.mjs';
import { inspectLiteraryReviewSource } from './literaryReviewSource.mjs';
import { literaryProseCaptureFields, authorizeLiteraryProseCapture } from './literaryProse.mjs';
import {
  bookEditorialReviewArtifactIdentity,
  bookEditorialProseArtifactIdentity,
} from './bookEditorialProjection.mjs';
import {
  normalizeBookEditorialArtifact,
  normalizeBookEditorialReading,
} from './bookEditorialProtocol.mjs';
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
    'O registro histórico da revisão está inconsistente. Preserve a origem.',
  );
const count = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail();
  return value;
};
const jobFields = [
  'schemaVersion',
  'jobId',
  'chapterId',
  'instruction',
  'planIds',
  'generation',
  'effectiveGeneration',
  'state',
  'units',
  'completedUnits',
  'analyses',
  'blocking',
  'warnings',
  'suggestions',
  'createdAt',
  'completedAt',
  'authorAccepted',
  'paused',
  'sourceToken',
  'preservationState',
  'preservedAt',
];
const definitions = {
  job: { collection: 'literaryReviewJobs', fields: jobFields },
  unit: {
    collection: 'literaryReviewUnits',
    fields: ['jobId', 'index', 'sceneId', 'state', 'analyses', 'captureBinding'],
  },
  analysis: {
    collection: 'literaryReviewAnalyses',
    fields: [
      'jobId',
      'requestId',
      'chapterId',
      'sceneId',
      'unitIndex',
      'layer',
      'segment',
      'coverage',
      'captureBinding',
    ],
  },
};
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
/** Prose reports remain in the prose family; these are bounded historical associations. */
export async function readBookEditorialReviewCapture(
  tx,
  c,
  { id, family, bookBirth, itemToken, tokenForRow },
) {
  const definition = definitions[family];
  if (!definition) fail();
  const row = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/' + definition.collection + '/' + id),
    definition.fields,
  );
  if (!row.exists || tokenForRow(row) !== itemToken) bookBackupChanged(true);
  const value = row.data(),
    pins = [],
    ownBirth = bookBackupIdentity(row).created;
  const identity = (part, sourceId = id, sourceFamily = family, sourceBirth = ownBirth) =>
    bookEditorialReviewArtifactIdentity({
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
  let artifacts;
  if (family === 'job') {
    if (
      value.jobId !== id ||
      !['planning', 'reviewing', 'done', 'attention', 'stale', 'canceled'].includes(value.state)
    )
      fail();
    const units = count(value.units),
      completed = count(value.completedUnits),
      analyses = count(value.analyses);
    if (completed > units || (value.state === 'done' && (!units || completed !== units))) fail();
    for (const key of ['blocking', 'warnings', 'suggestions']) count(value[key]);
    const chapterId = value.chapterId == null ? null : workId(value.chapterId);
    const checkpoint = make(
      'checkpoint',
      'checkpoint',
      {
        process: 'review',
        phase: value.state,
        counters: { plannedUnits: units, completedUnits: completed, analyses },
        currentUnit: chapterId
          ? ref(c.target.id, chapterId, 'unavailable', 'chapter', 'subject')
          : null,
        references: [],
        haltReason: value.paused === true ? 'Pausa registrada no histórico.' : null,
        nextAction: null,
        controlsDisabled: true,
      },
      { createdAt: value.createdAt ?? null },
    );
    artifacts = [checkpoint];
    if (chapterId) {
      let probe = { current: false, reason: 'unsupported-legacy-schema' };
      if (
        value.schemaVersion === 1 &&
        typeof value.sourceToken === 'string' &&
        /^[a-f0-9]{64}$/.test(value.sourceToken)
      )
        probe = await inspectLiteraryReviewSource(tx, c, value);
      pins.push({
        current: probe.current,
        reason: probe.reason,
        token: probe.source?.token ?? null,
      });
      const chapter = ref(
        c.target.id,
        chapterId,
        probe.current ? 'recorded' : 'unavailable',
        'chapter',
        'subject',
      );
      const sections = [];
      if (typeof value.instruction === 'string')
        sections.push({ label: 'Instrução autoral', text: value.instruction });
      if (value.planIds !== undefined) {
        if (!Array.isArray(value.planIds) || value.planIds.length > 8) fail();
        sections.push({
          label: 'Planejamentos selecionados',
          text: value.planIds.map(workId).join('\n'),
        });
      }
      if (typeof value.generation?.model === 'string')
        sections.push({ label: 'Modelo solicitado', text: value.generation.model });
      if (typeof value.generation?.reasoning === 'string')
        sections.push({ label: 'Raciocínio solicitado', text: value.generation.reasoning });
      if (typeof value.authorAccepted === 'boolean')
        sections.push({
          label: 'Aceite histórico registrado',
          text: value.authorAccepted ? 'sim' : 'não',
        });
      if (typeof value.preservationState === 'string')
        sections.push({ label: 'Preservação registrada', text: value.preservationState });
      if (value.preservedAt != null)
        sections.push({
          label: 'Data registrada da preservação',
          text: String(count(value.preservedAt)),
        });
      artifacts.push(
        make(
          'document',
          'instruction',
          {
            role: 'preparation',
            title: 'Solicitação e decisões próprias da revisão',
            sections,
            references: [chapter],
          },
          { provenance: 'author', createdAt: value.createdAt ?? null },
        ),
      );
      if (probe.current) {
        const extra = {};
        if (
          value.effectiveGeneration &&
          (value.effectiveGeneration.provider !== 'gemini' ||
            typeof value.effectiveGeneration.model !== 'string')
        )
          fail();
        if (value.effectiveGeneration)
          extra.generation = {
            snapshot: 'historical',
            provider: 'platform',
            model: value.effectiveGeneration.model,
            reasoning: value.effectiveGeneration.reasoning ?? null,
          };
        artifacts.push(
          make(
            'report',
            'report',
            {
              role: 'review',
              title: 'Cobertura técnica registrada da revisão do capítulo',
              summary:
                'Os achados e citações são preservados nos relatórios de origem de cada leitura.',
              findings: [],
              observations: [
                { axis: 'Camadas', text: 'reviewStructure; reviewProse', evidenceIds: [] },
                ...['blocking', 'warnings', 'suggestions'].map((key) => ({
                  axis: key,
                  text: String(value[key]),
                  evidenceIds: [],
                })),
              ],
              references: [chapter, ref(c.target.id, identity('instruction'))],
              claimedCoverage: {
                scope: 'chapter-scenes',
                completed,
                total: units,
                limitations: [
                  value.state === 'done'
                    ? 'Censo e leituras registrados como concluídos.'
                    : 'Censo ou execução não concluídos; o total pode ser apenas o prefixo já enumerado.',
                  'Cobertura técnica não equivale a aceite literário, qualidade ou autorização de publicação.',
                ],
              },
            },
            extra,
          ),
        );
      } else
        artifacts.push(
          normalizeBookEditorialArtifact({
            schemaVersion: 1,
            id: identity('report'),
            kind: 'report',
            revision: null,
            createdAt: null,
            updatedAt: null,
            provenance: 'unknown',
            availability: { state: 'unavailable', reason: probe.reason },
            content: null,
          }),
        );
      artifacts[0] = normalizeBookEditorialArtifact({
        ...checkpoint,
        content: {
          ...checkpoint.content,
          currentUnit: chapter,
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
    } else if (value.state !== 'canceled' || units || completed || analyses) fail();
  } else {
    const jobId = workId(value.jobId),
      binding = value.captureBinding;
    let jobBirth = null,
      requestBirth = null,
      unitBirth = null;
    if (binding?.version === 1) {
      jobBirth = birth(binding.jobBirth);
      if (family === 'analysis') {
        unitBirth = birth(binding.unitBirth);
        requestBirth = binding.requestBirth == null ? null : birth(binding.requestBirth);
      }
    }
    const parent = await readWorkMetadata(
        tx,
        c.db.doc(c.path + '/literaryReviewJobs/' + jobId),
        jobFields,
      ),
      parentValue = parent.data();
    const parentKnown =
      !!jobBirth &&
      parent.exists &&
      stable(bookBackupIdentity(parent).created) === stable(jobBirth) &&
      parentValue.jobId === jobId &&
      (family === 'unit' || parentValue.chapterId === value.chapterId);
    pins.push({ parent: bookBackupIdentity(parent), parentKnown });
    const parentId = jobBirth
      ? identity('checkpoint', jobId, 'job', jobBirth)
      : digest({
          domain: 'writer-editorial-unbound-review-parent-v1',
          bookId: c.target.id,
          bookBirth,
          jobId,
        });
    const parentRef = ref(c.target.id, parentId, parentKnown ? 'recorded' : 'unavailable');
    if (family === 'unit') {
      const index = count(value.index),
        analyses = count(value.analyses);
      if (
        id !== digest({ jobId, index }) ||
        !['pending', 'reviewing', 'done'].includes(value.state)
      )
        fail();
      const sceneId = workId(value.sceneId);
      let available = false;
      if (parentKnown && parentValue.schemaVersion === 1) {
        if (index >= count(parentValue.units)) fail();
        const probe = await inspectLiteraryReviewSource(tx, c, parentValue);
        const scene = await readWorkMetadata(tx, c.db.doc(c.path + '/scenes/' + sceneId), [
          'ownerId',
          'parentId',
          'archived',
          'deleting',
        ]);
        const data = scene.data();
        available =
          probe.current &&
          scene.exists &&
          data.ownerId === c.uid &&
          data.parentId === parentValue.chapterId &&
          !data.archived &&
          !data.deleting;
        pins.push({
          source: probe.source?.token ?? null,
          scene: bookBackupIdentity(scene),
          available,
        });
      }
      artifacts = [
        make('checkpoint', 'checkpoint', {
          process: 'review',
          phase: value.state,
          counters: { plannedUnits: 1, completedUnits: value.state === 'done' ? 1 : 0, analyses },
          currentUnit: ref(
            c.target.id,
            sceneId,
            available ? 'recorded' : 'unavailable',
            'scene',
            'subject',
          ),
          references: [parentRef],
          haltReason: null,
          nextAction: null,
          controlsDisabled: true,
        }),
      ];
    } else {
      const requestId = workId(value.requestId),
        index = count(value.unitIndex),
        segment = count(value.segment);
      if (
        id !== digest({ jobId, requestId }) ||
        !['reviewStructure', 'reviewProse'].includes(value.layer) ||
        value.coverage?.scope !== 'scene-segment' ||
        value.coverage.wholeChapter !== false ||
        value.coverage.wholeBook !== false ||
        value.coverage.segment !== segment
      )
        fail();
      const raw = value.coverage;
      const reading = normalizeBookEditorialReading({
        unit: 'scene',
        sourceCharacters: raw.sourceCharacters,
        segment,
        segmentCount: raw.segmentCount,
        start: raw.start,
        end: raw.end,
        coreStart: raw.coreStart,
        coreEnd: raw.coreEnd,
        completeScene: raw.completeScene,
        previousSceneIncluded: raw.previousSceneIncluded,
      });
      const unitId = digest({ jobId, index });
      const unit = await readWorkMetadata(
        tx,
        c.db.doc(c.path + '/literaryReviewUnits/' + unitId),
        definitions.unit.fields,
      );
      const unitKnown =
        !!unitBirth &&
        unit.exists &&
        stable(bookBackupIdentity(unit).created) === stable(unitBirth) &&
        unit.data().jobId === jobId &&
        unit.data().index === index &&
        unit.data().sceneId === value.sceneId;
      pins.push({ unit: bookBackupIdentity(unit), unitKnown });
      const unitPointer = unitBirth
        ? identity('checkpoint', unitId, 'unit', unitBirth)
        : digest({
            domain: 'writer-editorial-unbound-review-unit-v1',
            bookId: c.target.id,
            bookBirth,
            jobId,
            index,
          });
      let proseId = digest({
          domain: 'writer-editorial-unbound-review-prose-v1',
          bookId: c.target.id,
          bookBirth,
          jobId,
          requestId,
        }),
        allowed = false;
      if (requestBirth) {
        proseId = bookEditorialProseArtifactIdentity({
          bookId: c.target.id,
          bookBirth,
          birth: requestBirth,
          id: requestId,
          part: 'report',
        });
        const native = await readWorkMetadata(
          tx,
          c.db.doc(c.path + '/literaryProseRequests/' + requestId),
          ['schemaVersion'],
        );
        const known =
          native.exists && stable(bookBackupIdentity(native).created) === stable(requestBirth);
        pins.push({ prose: bookBackupIdentity(native), known });
        if (known && native.data().schemaVersion === 1) {
          const meta = await readWorkMetadata(tx, native.ref, [
              ...literaryProseCaptureFields,
              'schemaVersion',
            ]),
            header = meta.data();
          if (
            header.requestId !== requestId ||
            header.schemaVersion !== 1 ||
            header.sceneId !== value.sceneId ||
            header.chapterId !== value.chapterId ||
            header.mode !== value.layer ||
            stable(header.coverage) !== stable(raw) ||
            header.sourceToken !== raw.sourceToken
          )
            fail();
          if (header.state === 'done') {
            try {
              await authorizeLiteraryProseCapture(tx, c, header);
              allowed = true;
            } catch (error) {
              if (!['permission-denied', 'not-found'].includes(error.code)) throw error;
            }
          }
        }
      }
      artifacts = [
        make('report', 'report', {
          role: 'review',
          title: 'Leitura registrada no ciclo de revisão',
          summary:
            'Registro técnico histórico; achados e citações pertencem ao relatório de origem.',
          findings: [],
          observations: [{ axis: 'Camada registrada', text: value.layer, evidenceIds: [] }],
          references: [
            parentRef,
            ref(c.target.id, unitPointer, unitKnown ? 'recorded' : 'unavailable'),
            ref(c.target.id, proseId, allowed ? 'recorded' : 'unavailable'),
          ],
          claimedCoverage: {
            scope: reading.completeScene ? 'unit' : 'excerpt',
            completed: 1,
            total: reading.segmentCount,
            limitations: [
              'Registro histórico não reautoriza a prosa nem equivale a revisão integral do capítulo; confira o relatório de origem.',
            ],
          },
          reading,
        }),
      ];
    }
  }
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, artifacts }), 'utf8');
  if (artifacts.length > 3 || bytes.length > 1024 * 1024) fail();
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
