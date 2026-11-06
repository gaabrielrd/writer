import { createHash } from 'node:crypto';
import { bookBackupIdentity, bookBackupChanged } from './bookBackupContext.mjs';
import { readWorkMetadata, workId, workFail, digest } from './workProgressContracts.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { workflowLimits, workflowPhases } from './literaryExecutionContracts.mjs';
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
  workFail('failed-precondition', 'O ciclo histórico está inconsistente. Preserve a origem.');
const count = (value) => {
  if (!Number.isSafeInteger(value) || value < 0) fail();
  return value;
};
const text = (value, max = 4000) => {
  if (typeof value !== 'string' || value.length > max || !value.isWellFormed()) fail();
  return value;
};
const born = (value) => {
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
const objectBirth = (value) => ({ seconds: born(value)[0], nanoseconds: value[1] });
const identityFields = [
  'schemaVersion',
  'jobId',
  'actorId',
  'bookBirth',
  'registrationState',
  'workflowBirth',
  'birth',
];
const fields = [
  'schemaVersion',
  'jobId',
  'actorId',
  'bookBirth',
  'registrationState',
  'instruction',
  'generation',
  'effectiveGeneration',
  'limits',
  'authorizedPhases',
  'collaboration',
  'paused',
  'steps',
  'createdAt',
  'completedAt',
];
const definitions = {
  'workflow-job': {
    collection: 'literaryWorkflowJobs',
    fields: [
      ...fields,
      'workflowBirth',
      'phase',
      'stop',
      'chapterId',
      'chapterBirth',
      'actId',
      'sequence',
      'priorApplications',
      'priorCredits',
      'draftId',
      'reviewId',
      'manualMilestoneId',
      'firstVersionId',
    ],
  },
  'sequence-job': {
    collection: 'literarySequenceJobs',
    fields: [
      ...fields,
      'birth',
      'state',
      'stop',
      'chapters',
      'index',
      'completed',
      'applications',
      'credits',
      'continueBetweenChapters',
      'currentWorkflowId',
    ],
  },
};
const identity = ({ bookId, bookBirth, birth, id, family, part }) =>
  digest({
    domain: 'writer-editorial-orchestration-v1',
    bookId,
    bookBirth,
    birth,
    id,
    family,
    part,
  });
const ref = (bookId, kind, id, state = 'unavailable', purpose = 'source') => ({
  kind,
  id,
  parentId: null,
  scope: { kind: 'book', id: bookId },
  revision: null,
  contentHash: null,
  state,
  purpose,
});
/** Historical author settings and bounded metadata only. No mutable controller or child driver. */
export async function readBookEditorialOrchestrationCapture(
  tx,
  c,
  { id, family, bookBirth, itemToken, tokenForRow },
) {
  const definition = definitions[family];
  if (!definition) fail();
  const row = await readWorkMetadata(
    tx,
    c.db.doc(c.path + '/' + definition.collection + '/' + id),
    identityFields,
  );
  if (!row.exists || tokenForRow(row) !== itemToken) bookBackupChanged(true);
  let value = row.data();
  const root = await readWorkMetadata(tx, c.ref, []),
    pins = [],
    self = bookBackupIdentity(row).created;
  const ownId = (part) =>
    identity({ bookId: c.target.id, bookBirth, birth: self, id, family, part });
  const make = (kind, part, content, extra = {}) =>
    normalizeBookEditorialArtifact({
      schemaVersion: 1,
      id: ownId(part),
      kind,
      revision: null,
      createdAt: value.createdAt ?? null,
      updatedAt: null,
      provenance: 'unknown',
      availability: { state: 'included' },
      content,
      ...extra,
    });
  let unavailable =
    value.schemaVersion !== 1
      ? 'unsupported-legacy-schema'
      : value.actorId !== c.uid ||
          value.jobId !== id ||
          stable(born(value.bookBirth)) !== stable(literaryNativeBirth(root))
        ? 'source-unavailable'
        : null;
  const nativeSelf = family === 'workflow-job' ? value.workflowBirth : value.birth;
  if (
    !unavailable &&
    value.registrationState === 'active' &&
    stable(born(nativeSelf)) !== stable(literaryNativeBirth(row))
  )
    unavailable = 'source-unavailable';
  let artifacts;
  if (unavailable)
    artifacts = [
      normalizeBookEditorialArtifact({
        schemaVersion: 1,
        id: ownId('checkpoint'),
        kind: 'checkpoint',
        revision: null,
        createdAt: null,
        updatedAt: null,
        provenance: 'unknown',
        availability: { state: 'unavailable', reason: unavailable },
        content: null,
      }),
    ];
  else {
    const details = await readWorkMetadata(tx, row.ref, definition.fields);
    if (stable(bookBackupIdentity(details)) !== stable(bookBackupIdentity(row)))
      bookBackupChanged(true);
    value = details.data();
    const association = async (sourceFamily, sourceId, expected) => {
      const initial = await readWorkMetadata(
        tx,
        c.db.doc(c.path + '/' + definitions[sourceFamily].collection + '/' + sourceId),
        identityFields,
      );
      const header = initial.data();
      const known =
        initial.exists &&
        header.schemaVersion === 1 &&
        header.actorId === c.uid &&
        header.jobId === sourceId &&
        stable(literaryNativeBirth(initial)) === stable(expected) &&
        stable(header.bookBirth) === stable(value.bookBirth);
      if (!known) return { row: initial, data: null };
      const selected = await readWorkMetadata(
        tx,
        initial.ref,
        sourceFamily === 'workflow-job'
          ? ['chapterId', 'sequence']
          : ['chapters', 'index', 'currentWorkflowId', 'completed'],
      );
      if (stable(bookBackupIdentity(selected)) !== stable(bookBackupIdentity(initial)))
        bookBackupChanged(true);
      return { row: initial, data: selected.data() };
    };
    const references = [],
      sections = [
        { label: 'Instrução autoral', text: text(value.instruction) },
        { label: 'Registro histórico', text: text(value.registrationState, 100) },
      ];
    if (value.generation?.model !== undefined)
      sections.push({
        label: 'Modelo solicitado',
        text: value.generation.model === null ? 'automático' : text(value.generation.model, 300),
      });
    if (value.generation?.reasoning !== undefined)
      sections.push({
        label: 'Raciocínio solicitado',
        text:
          value.generation.reasoning === null
            ? 'automático'
            : text(value.generation.reasoning, 300),
      });
    const limits = workflowLimits(value.limits),
      phases = workflowPhases(value.authorizedPhases);
    for (const key of ['maxApplications', 'maxCredits', 'maxSteps'])
      sections.push({ label: 'Limite histórico: ' + key, text: String(limits[key]) });
    sections.push({ label: 'Fases autorizadas no histórico', text: phases.join('; ') });
    if (value.collaboration?.mode)
      sections.push({ label: 'Colaboração registrada', text: text(value.collaboration.mode, 100) });
    sections.push({
      label: 'Limite do documento',
      text: 'Configuração e decisões históricas; não autorizam retomar ciclos, aplicar sugestões, consumir créditos ou publicar.',
    });
    const chapter = async (chapterId, birth, actId) => {
      const source = await readWorkMetadata(
        tx,
        c.db.doc(c.path + '/chapters/' + workId(chapterId)),
        ['ownerId', 'bookId', 'deleting', 'contentMode', 'actId'],
      );
      const header = source.data(),
        available =
          source.exists &&
          stable(literaryNativeBirth(source)) === stable(born(birth)) &&
          !header.deleting &&
          (!header.ownerId || header.ownerId === c.uid) &&
          (!header.bookId || header.bookId === c.target.id) &&
          header.contentMode === 'scenes' &&
          (header.actId ?? null) === actId;
      pins.push({ chapter: bookBackupIdentity(source), available });
      return ref(
        c.target.id,
        'chapter',
        chapterId,
        available ? 'recorded' : 'unavailable',
        'subject',
      );
    };
    const counters = { steps: count(value.steps) };
    let currentUnit = null;
    if (family === 'workflow-job') {
      currentUnit = await chapter(workId(value.chapterId), value.chapterBirth, value.actId ?? null);
      sections.push(
        {
          label: 'Aplicações anteriores registradas',
          text: String(count(value.priorApplications)),
        },
        { label: 'Créditos anteriores registrados', text: String(count(value.priorCredits)) },
      );
      // Native current child IDs do not contain a frozen child birth. Preserve unknown provenance explicitly.
      for (const [key, childFamily] of [
        ['draftId', 'draft-job'],
        ['reviewId', 'review-job'],
        ['manualMilestoneId', 'milestone-job'],
        ['firstVersionId', 'milestone-job'],
      ])
        if (value[key]) {
          references.push(
            ref(
              c.target.id,
              'artifact',
              digest({
                domain: 'writer-editorial-unbound-workflow-child-v1',
                bookId: c.target.id,
                bookBirth,
                parent: ownId('checkpoint'),
                family: childFamily,
                id: workId(value[key]),
                role: key,
              }),
            ),
          );
        }
      if (value.sequence) {
        const sequenceId = workId(value.sequence.id),
          expected = born(value.sequence.birth),
          linked = await association('sequence-job', sequenceId, expected),
          sequence = linked.row;
        const parent = linked.data;
        const available =
          !!parent &&
          parent.chapters?.[count(value.sequence.index)]?.id === value.chapterId &&
          ((parent.index === value.sequence.index && parent.currentWorkflowId === id) ||
            parent.completed?.some(
              (item) =>
                item.index === value.sequence.index &&
                item.workflowId === id &&
                stable(item.birth) === stable(literaryNativeBirth(row)),
            ));
        const pointer = identity({
          bookId: c.target.id,
          bookBirth,
          birth: objectBirth(expected),
          id: sequenceId,
          family: 'sequence-job',
          part: 'checkpoint',
        });
        references.push(
          ref(c.target.id, 'artifact', pointer, available ? 'recorded' : 'unavailable'),
        );
        pins.push({ sequence: bookBackupIdentity(sequence), available });
      }
    } else {
      if (
        !Array.isArray(value.chapters) ||
        !value.chapters.length ||
        value.chapters.length > 25 ||
        !Array.isArray(value.completed) ||
        value.completed.length > value.chapters.length ||
        count(value.index) !== value.completed.length
      )
        fail();
      if (new Set(value.chapters.map((item) => item.id)).size !== value.chapters.length) fail();
      counters.plannedUnits = value.chapters.length;
      counters.completedUnits = value.completed.length;
      counters.applications = count(value.applications);
      counters.creditsSpent = count(value.credits);
      if (typeof value.continueBetweenChapters !== 'boolean') fail();
      sections.push({
        label: 'Continuidade histórica entre capítulos',
        text: value.continueBetweenChapters ? 'sim' : 'não',
      });
      for (const [index, item] of value.chapters.entries()) {
        const source = await chapter(workId(item.id), item.birth, item.actId ?? null);
        references.push(source);
        if (index === value.index) currentUnit = source;
      }
      for (const [index, completed] of value.completed.entries()) {
        if (completed.index !== index) fail();
        const workflowId = workId(completed.workflowId),
          expected = born(completed.birth);
        const linked = await association('workflow-job', workflowId, expected),
          child = linked.row,
          header = linked.data;
        const available =
          !!header &&
          header.chapterId === value.chapters[index].id &&
          header.sequence?.id === id &&
          header.sequence?.index === index &&
          stable(header.sequence?.birth) === stable(literaryNativeBirth(row));
        const pointer = identity({
          bookId: c.target.id,
          bookBirth,
          birth: objectBirth(expected),
          id: workflowId,
          family: 'workflow-job',
          part: 'checkpoint',
        });
        references.push(
          ref(c.target.id, 'artifact', pointer, available ? 'recorded' : 'unavailable'),
        );
        pins.push({ workflow: bookBackupIdentity(child), available });
      }
      if (value.currentWorkflowId)
        references.push(
          ref(
            c.target.id,
            'artifact',
            digest({
              domain: 'writer-editorial-unbound-current-workflow-v1',
              bookId: c.target.id,
              bookBirth,
              parent: ownId('checkpoint'),
              id: workId(value.currentWorkflowId),
            }),
          ),
        );
    }
    let document = make(
      'document',
      'instruction',
      {
        role: 'progress',
        title:
          family === 'workflow-job'
            ? 'Configuração histórica do ciclo de capítulo'
            : 'Configuração histórica da sequência de capítulos',
        sections,
        references: currentUnit ? [currentUnit] : [],
      },
      { provenance: 'author' },
    );
    if (value.effectiveGeneration) {
      if (
        value.effectiveGeneration.provider !== 'gemini' ||
        typeof value.effectiveGeneration.model !== 'string'
      )
        fail();
      document = normalizeBookEditorialArtifact({
        ...document,
        generation: {
          snapshot: 'historical',
          provider: 'platform',
          model: value.effectiveGeneration.model,
          reasoning: value.effectiveGeneration.reasoning ?? null,
        },
      });
    }
    references.push(ref(c.target.id, 'artifact', document.id, 'recorded'));
    artifacts = [
      make('checkpoint', 'checkpoint', {
        process: family === 'workflow-job' ? 'workflow' : 'sequence',
        phase: text(family === 'workflow-job' ? value.phase : value.state, 160),
        counters,
        currentUnit,
        references,
        haltReason:
          value.paused === true
            ? 'Pausa registrada.'
            : value.stop == null
              ? null
              : text(value.stop, 160),
        nextAction: null,
        controlsDisabled: true,
      }),
      document,
    ];
  }
  const bytes = Buffer.from(JSON.stringify({ schemaVersion: 1, artifacts }), 'utf8');
  if (bytes.length > 1024 * 1024) fail();
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
