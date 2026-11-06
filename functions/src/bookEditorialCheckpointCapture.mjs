import { createHash } from 'node:crypto';
import { bookBackupIdentity, bookBackupChanged } from './bookBackupContext.mjs';
import { readWorkMetadata, workId, workFail, digest } from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { normalizeLiteraryDraftExecution } from './literaryDraftExecution.mjs';
import { literaryProseCaptureFields, authorizeLiteraryProseCapture } from './literaryProse.mjs';
import { bookEditorialProseArtifactIdentity } from './bookEditorialProjection.mjs';
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
  workFail('failed-precondition', 'O checkpoint histórico está inconsistente. Preserve a origem.');
const count = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail();
  return value;
};
const text = (value, max = 4000) => {
  if (typeof value !== 'string' || !value.length || value.length > max || !value.isWellFormed())
    fail();
  return value;
};
const stamp = (value) => {
  if (
    !Array.isArray(value) ||
    value.length !== 2 ||
    !Number.isSafeInteger(value[0]) ||
    value[0] < 0 ||
    !Number.isInteger(value[1]) ||
    value[1] < 0 ||
    value[1] >= 1e9
  )
    fail();
  return value;
};
const birthObject = (value) => ({ seconds: stamp(value)[0], nanoseconds: value[1] });
const defs = {
  'draft-job': {
    collection: 'literaryDraftJobs',
    process: 'draft',
    parent: null,
    fields: [
      'schemaVersion',
      'jobId',
      'chapterId',
      'state',
      'instruction',
      'generation',
      'effectiveGeneration',
      'collaboration',
      'execution',
      'units',
      'accepted',
      'drafted',
      'adopted',
      'chargedCredits',
      'paused',
      'createdAt',
      'completedAt',
      'captureBinding',
    ],
  },
  'draft-unit': {
    collection: 'literaryDraftUnits',
    process: 'draft',
    parent: 'draft-job',
    fields: [
      'jobId',
      'index',
      'sceneId',
      'state',
      'requestId',
      'versionId',
      'contentHash',
      'captureBinding',
    ],
  },
  'milestone-job': {
    collection: 'literaryMilestones',
    process: 'preservation',
    parent: null,
    fields: [
      'schemaVersion',
      'jobId',
      'chapterId',
      'kind',
      'state',
      'planned',
      'captured',
      'verified',
      'wordCount',
      'createdAt',
      'completedAt',
      'captureBinding',
    ],
  },
  'milestone-unit': {
    collection: 'literaryMilestoneUnits',
    process: 'preservation',
    parent: 'milestone-job',
    fields: ['jobId', 'index', 'resource', 'state', 'versionId', 'contentHash', 'captureBinding'],
  },
};
const ref = (bookId, kind, id, state = 'unavailable', purpose = 'source', contentHash = null) => ({
  kind,
  id,
  parentId: null,
  scope: { kind: 'book', id: bookId },
  revision: null,
  contentHash,
  state,
  purpose,
});
function transfer(artifacts, pins) {
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, artifacts }), 'utf8');
  if (artifacts.length > 2 || bytes.length > 1024 * 1024) fail();
  return {
    artifact: artifacts[0],
    artifacts,
    bytes,
    state: 'artifact',
    head: null,
    pins,
    contentHash: createHash('sha256').update(bytes).digest('hex'),
  };
}
/** Metadata only. It neither resumes a process nor reads cached prose/history bodies. */
export async function readBookEditorialCheckpointCapture(
  tx,
  c,
  { id, family, bookBirth, itemToken, tokenForRow },
) {
  const def = defs[family];
  if (!def) fail();
  const row = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/' + def.collection + '/' + id),
    def.fields,
  );
  if (!row.exists || tokenForRow(row) !== itemToken) bookBackupChanged(true);
  const value = row.data(),
    pins = [];
  const identity = (
    part,
    sourceId = id,
    sourceFamily = family,
    born = bookBackupIdentity(row).created,
  ) =>
    digest({
      domain: 'writer-editorial-process-checkpoint-v1',
      bookId: c.target.id,
      bookBirth,
      birth: born,
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
  if (!def.parent && value.schemaVersion !== 1)
    return transfer(
      [
        normalizeBookEditorialArtifact({
          schemaVersion: 1,
          id: identity('checkpoint'),
          kind: 'checkpoint',
          revision: null,
          createdAt: null,
          updatedAt: null,
          provenance: 'unknown',
          availability: { state: 'unavailable', reason: 'unsupported-legacy-schema' },
          content: null,
        }),
      ],
      [],
    );
  const references = [],
    counters = {};
  const binding = value.captureBinding?.version === 1 ? value.captureBinding : null;
  let resource = null,
    available = false,
    ownInput = null,
    createdAt = null;
  if (!def.parent) {
    if (value.jobId !== id) fail();
    const stub = value.state === 'canceled' && value.chapterId == null;
    createdAt = value.createdAt ?? null;
    if (!stub) {
      resource = { kind: 'chapter', id: workId(value.chapterId) };
      if (family === 'draft-job') {
        counters.plannedUnits = count(value.units);
        counters.acceptedUnits = count(value.accepted);
        counters.applications = count(value.drafted);
        counters.adoptedUnits = count(value.adopted);
        if (value.chargedCredits !== undefined) counters.creditsSpent = count(value.chargedCredits);
        if (
          counters.acceptedUnits > counters.plannedUnits ||
          count(value.adopted) + counters.applications !== counters.acceptedUnits
        )
          fail();
        const sections = [
          {
            label: 'Instrução autoral',
            text:
              typeof value.instruction === 'string' && value.instruction.length === 0
                ? ''
                : text(value.instruction),
          },
        ];
        if (value.collaboration?.mode)
          sections.push({
            label: 'Colaboração histórica',
            text: text(value.collaboration.mode, 100),
          });
        if (value.generation?.model !== undefined)
          sections.push({
            label: 'Modelo solicitado',
            text:
              value.generation.model === null ? 'automático' : text(value.generation.model, 300),
          });
        if (value.generation?.reasoning)
          sections.push({
            label: 'Raciocínio solicitado',
            text: text(value.generation.reasoning, 300),
          });
        if (value.execution !== undefined) {
          const execution = normalizeLiteraryDraftExecution(value.execution);
          sections.push({ label: 'Modo histórico de execução', text: execution.mode });
          for (const key of ['maxApplications', 'maxCredits'])
            if (execution[key] !== null)
              sections.push({ label: 'Limite histórico: ' + key, text: String(execution[key]) });
        }
        sections.push({
          label: 'Limite do registro',
          text: 'Configuração histórica; não autoriza execução, aplicações, débitos ou publicação.',
        });
        ownInput = make(
          'document',
          'instruction',
          {
            role: 'preparation',
            title: 'Solicitação autoral da primeira versão',
            sections,
            references: [],
          },
          { provenance: 'author', createdAt },
        );
        if (value.effectiveGeneration) {
          if (
            value.effectiveGeneration.provider !== 'gemini' ||
            typeof value.effectiveGeneration.model !== 'string'
          )
            fail();
          ownInput = normalizeBookEditorialArtifact({
            ...ownInput,
            generation: {
              snapshot: 'historical',
              provider: 'platform',
              model: value.effectiveGeneration.model,
              reasoning: value.effectiveGeneration.reasoning ?? null,
            },
          });
        }
      } else {
        counters.plannedUnits = count(value.planned);
        counters.capturedUnits = count(value.captured);
        counters.verifiedUnits = count(value.verified);
        if (
          counters.verifiedUnits > counters.capturedUnits ||
          counters.capturedUnits > counters.plannedUnits
        )
          fail();
        if (value.wordCount !== undefined) counters.words = count(value.wordCount);
        ownInput = make('document', 'instruction', {
          role: 'progress',
          title: 'Marco histórico de preservação',
          sections: [
            { label: 'Tipo registrado', text: text(value.kind, 100) },
            {
              label: 'Limite da preservação',
              text: 'Preservar versões não comprova redação integral, revisão, qualidade ou publicação.',
            },
          ],
          references: [],
        });
      }
    }
  } else {
    const jobId = workId(value.jobId),
      index = count(value.index);
    if (id !== digest({ jobId, index })) fail();
    const parentDef = defs[def.parent];
    const parent = await readWorkMetadata(
        tx,
        c.db.doc(c.path + '/' + parentDef.collection + '/' + jobId),
        parentDef.fields,
      ),
      job = parent.data();
    const expected = binding?.jobBirth ? stamp(binding.jobBirth) : null;
    const parentKnown =
      !!expected &&
      parent.exists &&
      stable(literaryNativeBirth(parent)) === stable(expected) &&
      job.jobId === jobId &&
      job.schemaVersion === 1;
    pins.push({ parent: bookBackupIdentity(parent), parentKnown });
    const parentId = expected
      ? identity('checkpoint', jobId, def.parent, birthObject(expected))
      : identity('unbound-parent:' + jobId);
    references.push(
      ref(c.target.id, 'artifact', parentId, parentKnown ? 'recorded' : 'unavailable'),
    );
    resource =
      family === 'draft-unit' ? { kind: 'scene', id: workId(value.sceneId) } : value.resource;
    if (!resource || !['chapter', 'scene'].includes(resource.kind)) fail();
    workId(resource.id);
    if (family === 'draft-unit' && parentKnown && binding.resourceBirth) {
      const current = await readWorkMetadata(tx, c.db.doc(c.path + '/scenes/' + resource.id), [
        'ownerId',
        'parentId',
        'archived',
        'deleting',
      ]);
      const data = current.data();
      available =
        current.exists &&
        stable(literaryNativeBirth(current)) === stable(stamp(binding.resourceBirth)) &&
        data.ownerId === c.uid &&
        data.parentId === job.chapterId &&
        !data.archived &&
        !data.deleting;
      pins.push({ resource: bookBackupIdentity(current), available });
    }
    if (value.versionId) {
      const versionId = workId(value.versionId),
        proof = binding?.history;
      let recorded = false;
      if (proof?.id === versionId && proof.birth) {
        const source = await readWorkMetadata(tx, c.db.doc(c.path + '/workVersions/' + versionId), [
          'id',
          'target',
          'resource',
          'contentHash',
          'deleting',
        ]);
        const header = source.data();
        recorded =
          source.exists &&
          stable(literaryNativeBirth(source)) === stable(stamp(proof.birth)) &&
          header.id === versionId &&
          !header.deleting &&
          stable(header.target) === stable(c.target) &&
          stable(header.resource) === stable(resource) &&
          /^[a-f0-9]{64}$/.test(value.contentHash ?? '') &&
          header.contentHash === value.contentHash;
        pins.push({ version: bookBackupIdentity(source), recorded });
      }
      references.push(
        ref(
          c.target.id,
          'historyVersion',
          versionId,
          recorded ? 'recorded' : 'unavailable',
          'source',
          /^[a-f0-9]{64}$/.test(value.contentHash ?? '') ? value.contentHash : null,
        ),
      );
    }
    if (family === 'draft-unit' && value.requestId) {
      const requestId = workId(value.requestId),
        proof = binding?.request;
      let pointer = identity('unbound-request:' + requestId),
        recorded = false;
      if (proof?.id === requestId && proof.birth) {
        const expectedBirth = birthObject(proof.birth);
        pointer = bookEditorialProseArtifactIdentity({
          bookId: c.target.id,
          bookBirth,
          birth: expectedBirth,
          id: requestId,
          part: 'proposal',
        });
        const source = await readWorkMetadata(
          tx,
          c.db.doc(c.path + '/literaryProseRequests/' + requestId),
          ['schemaVersion'],
        );
        const known =
          source.exists && stable(literaryNativeBirth(source)) === stable(stamp(proof.birth));
        pins.push({ request: bookBackupIdentity(source), known });
        if (known && parentKnown && source.data().schemaVersion === 1) {
          const header = (
            await readWorkMetadata(tx, source.ref, [...literaryProseCaptureFields, 'schemaVersion'])
          ).data();
          if (
            header.requestId !== requestId ||
            header.chapterId !== job.chapterId ||
            header.sceneId !== resource.id ||
            header.mode !== 'draftScene'
          )
            fail();
          if (['done', 'applied'].includes(header.state))
            try {
              const origin = await authorizeLiteraryProseCapture(tx, c, header);
              recorded = true;
              pins.push({ nativeProseOrigin: origin.token });
            } catch (error) {
              if (
                ![
                  'not-found',
                  'permission-denied',
                  'failed-precondition',
                  'resource-exhausted',
                ].includes(error.code)
              )
                throw error;
            }
        }
      }
      references.push(ref(c.target.id, 'artifact', pointer, recorded ? 'recorded' : 'unavailable'));
    }
  }
  if (!def.parent && resource && binding?.chapterBirth) {
    const current = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + resource.id), [
      'bookId',
      'ownerId',
      'deleting',
    ]);
    const header = current.data();
    available =
      current.exists &&
      stable(literaryNativeBirth(current)) === stable(stamp(binding.chapterBirth)) &&
      !header.deleting &&
      (header.ownerId == null || header.ownerId === c.uid) &&
      (!header.bookId || header.bookId === c.target.id);
    pins.push({ chapter: bookBackupIdentity(current), available });
  }
  const currentUnit = resource
    ? ref(
        c.target.id,
        resource.kind,
        resource.id,
        available ? 'recorded' : 'unavailable',
        'subject',
      )
    : null;
  if (ownInput) {
    ownInput = normalizeBookEditorialArtifact({
      ...ownInput,
      content: { ...ownInput.content, references: currentUnit ? [currentUnit] : [] },
    });
    references.push(ref(c.target.id, 'artifact', ownInput.id, 'recorded'));
  }
  const checkpoint = make(
    'checkpoint',
    'checkpoint',
    {
      process: def.process,
      phase: text(value.state, 160),
      counters,
      currentUnit,
      references,
      haltReason: value.paused === true ? 'Pausa registrada no histórico.' : null,
      nextAction: null,
      controlsDisabled: true,
    },
    { createdAt },
  );
  const artifacts = [checkpoint, ...(ownInput ? [ownInput] : [])];
  return transfer(artifacts, pins);
}
