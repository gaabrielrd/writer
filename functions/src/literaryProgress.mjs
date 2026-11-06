import {
  workScope,
  workProject,
  workId,
  workFail,
  workClosed,
  workRevision,
  workDate,
  workConflict,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { validateId } from './generation.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
const specs = Object.freeze({
  contract: { collection: 'literaryProduction', fields: ['revision', 'updatedAt'] },
  planning: {
    collection: 'literaryPlans',
    fields: ['revision', 'updatedAt', 'plan.kind', 'plan.title', 'plan.status'],
  },
  preparation: {
    collection: 'literaryPreparationGates',
    fields: ['chapterId', 'revision', 'updatedAt', 'ready', 'authorAccepted'],
  },
  drafting: {
    collection: 'literaryDraftJobs',
    fields: [
      'chapterId',
      'state',
      'units',
      'accepted',
      'drafted',
      'adopted',
      'milestoneJobId',
      'createdAt',
      'completedAt',
    ],
  },
  versions: {
    collection: 'literaryMilestones',
    fields: [
      'chapterId',
      'kind',
      'state',
      'planned',
      'captured',
      'verified',
      'wordCount',
      'createdAt',
      'completedAt',
    ],
  },
  review: {
    collection: 'literaryReviewJobs',
    fields: [
      'chapterId',
      'state',
      'blocking',
      'warnings',
      'authorAccepted',
      'preservationState',
      'revisedMilestoneId',
      'createdAt',
      'completedAt',
    ],
  },
  publication: {
    collection: 'literaryPublications',
    fields: [
      'policy',
      'unitId',
      'state',
      'phase',
      'chapterCount',
      'compiledChapters',
      'unitCount',
      'verifiedUnits',
      'verifiedChapters',
      'verifiedCandidates',
      'guideCount',
      'verifiedGuideEntries',
      'wordCount',
      'removalCount',
      'createdAt',
      'preparedAt',
      'publishedAt',
    ],
  },
  integration: {
    collection: 'literaryIntegrationJobs',
    fields: [
      'level',
      'actId',
      'state',
      'blocking',
      'dismissedBlocking',
      'authorAccepted',
      'createdAt',
      'completedAt',
    ],
  },
});
export const LITERARY_PROGRESS_STAGES = Object.freeze(Object.keys(specs));
function scope(db, uid, data, keys) {
  const c = workScope(db, uid, data, keys);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return c;
}
function stage(value) {
  if (typeof value !== 'string' || !Object.hasOwn(specs, value))
    workFail('invalid-argument', 'Etapa editorial inválida.');
  return value;
}
const token = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Versão do artefato inválida.');
  return value;
};
const integer = (value) => (Number.isSafeInteger(value) && value >= 0 ? value : null);
function noteText(value, max) {
  if (typeof value !== 'string' || !value.isWellFormed() || value.length > max)
    workFail('invalid-argument', 'Anotação acima do limite.');
  return value.trim();
}
function notes(value) {
  workClosed(value, ['blockers', 'nextStep']);
  if (!Array.isArray(value.blockers) || value.blockers.length > 12)
    workFail('invalid-argument', 'Use até 12 bloqueios.');
  return {
    blockers: value.blockers.map((item) => noteText(item, 600)).filter(Boolean),
    nextStep: noteText(value.nextStep, 4000),
  };
}
function changed(row) {
  const t = row.updateTime;
  if (!Number.isSafeInteger(t?.seconds) || !Number.isSafeInteger(t?.nanoseconds))
    workFail('failed-precondition', 'Versão nativa indisponível.');
  return [t.seconds, t.nanoseconds];
}
function artifact(c, book, row, selected) {
  const data = row.data(),
    id = workId(row.id),
    nativeOrigin = digest({
      domain: 'literary-progress-artifact-origin-v1',
      uid: c.uid,
      target: c.target,
      bookBirth: literaryNativeBirth(book),
      stage: selected,
      id,
      birth: literaryNativeBirth(row),
    }),
    sourceToken = digest({
      domain: 'literary-progress-artifact-version-v1',
      nativeOrigin,
      changed: changed(row),
      metadata: data,
    }),
    noteId = digest({ domain: 'literary-progress-note-v1', nativeOrigin }),
    spec = specs[selected];
  const resource =
    selected === 'publication' && ['chapter', 'act'].includes(data.policy) && data.unitId
      ? { kind: data.policy, id: workId(data.unitId) }
      : data.chapterId
        ? { kind: 'chapter', id: workId(data.chapterId) }
        : selected === 'integration' && data.level === 'act' && data.actId
          ? { kind: 'act', id: workId(data.actId) }
          : { kind: 'book', id: c.target.id };
  const state =
    selected === 'planning'
      ? (data.plan?.status ?? 'unrecorded')
      : selected === 'contract'
        ? 'saved'
        : selected === 'preparation'
          ? data.authorAccepted === true && data.ready === true
            ? 'accepted'
            : 'pending'
          : (data.state ?? 'unrecorded');
  const counters = {};
  for (const key of [
    'units',
    'accepted',
    'drafted',
    'adopted',
    'planned',
    'captured',
    'verified',
    'wordCount',
    'blocking',
    'warnings',
    'chapterCount',
    'compiledChapters',
    'unitCount',
    'verifiedUnits',
    'verifiedChapters',
    'removalCount',
    'verifiedCandidates',
    'guideCount',
    'verifiedGuideEntries',
  ])
    if (integer(data[key]) !== null) counters[key] = data[key];
  if (selected === 'integration' && integer(data.blocking) !== null)
    counters.unresolvedBlocking = Math.max(
      0,
      data.blocking - (integer(data.dismissedBlocking) ?? 0),
    );
  return {
    stage: selected,
    id,
    collection: spec.collection,
    nativeOrigin,
    sourceToken,
    noteId,
    resource,
    title: selected === 'planning' && typeof data.plan?.title === 'string' ? data.plan.title : null,
    kind:
      selected === 'planning'
        ? (data.plan?.kind ?? null)
        : selected === 'versions'
          ? (data.kind ?? null)
          : null,
    state,
    revision: integer(data.revision),
    createdAt: integer(data.createdAt),
    updatedAt: integer(data.updatedAt),
    completedAt: integer(data.completedAt),
    authorAccepted: data.authorAccepted === true,
    preservationState: typeof data.preservationState === 'string' ? data.preservationState : null,
    versionId: data.revisedMilestoneId ?? data.milestoneJobId ?? null,
    counters,
    active: [
      'planning',
      'drafting',
      'reading',
      'synthesizing',
      'capturing',
      'verifying',
      'generating',
      'preserving',
      'writing',
      'compiling',
      'checkingGuide',
    ].includes(state),
    sourceCurrentness: 'not-rechecked',
    qualityCertified: false,
    publicationCertified: false,
  };
}
async function readArtifact(tx, c, selected, id) {
  const book = await readWorkMetadata(tx, c.ref, []),
    spec = specs[selected],
    row = await readWorkMetadata(
      tx,
      c.db.doc(c.path + '/' + spec.collection + '/' + id),
      spec.fields,
    );
  if (!row.exists) workFail('not-found', 'Artefato indisponível.');
  return artifact(c, book, row, selected);
}
function noteView(raw, item) {
  if (!raw)
    return {
      id: item.noteId,
      revision: 0,
      blockers: [],
      nextStep: '',
      updatedAt: null,
      artifactChanged: false,
    };
  if (
    raw.version !== 1 ||
    raw.nativeOrigin !== item.nativeOrigin ||
    raw.artifact.stage !== item.stage ||
    raw.artifact.id !== item.id
  )
    workFail('failed-precondition', 'A anotação pertence a outra origem.');
  return {
    id: item.noteId,
    revision: workRevision(raw.revision),
    ...notes(raw.notes),
    updatedAt: raw.updatedAt,
    artifactChanged: raw.sourceToken !== item.sourceToken,
  };
}
export function createLiteraryProgressService({ db, now = Date.now }) {
  return {
    async listLiteraryProgressArtifacts(uid, data) {
      const c = scope(db, uid, data, ['stage', 'afterId']),
        selected = stage(data.stage),
        spec = specs[selected],
        after = data.afterId == null ? null : workId(data.afterId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const book = await readWorkMetadata(tx, c.ref, []);
        let query = db
          .collection(c.path + '/' + spec.collection)
          .orderBy('__name__')
          .limit(12)
          .select(...spec.fields);
        if (selected === 'contract') query = query.where('__name__', '==', 'current');
        if (after) query = query.startAfter(after);
        const page = await tx.get(query),
          items = [];
        for (const row of page.docs) {
          const item = artifact(c, book, row, selected),
            note = (
              await readWorkMetadata(tx, db.doc(c.path + '/literaryProgressNotes/' + item.noteId), [
                'version',
                'nativeOrigin',
                'artifact',
                'revision',
                'sourceToken',
                'updatedAt',
                'blockerCount',
                'hasNextStep',
              ])
            ).data();
          items.push({
            ...item,
            note: {
              revision: note?.revision ?? 0,
              updatedAt: note?.updatedAt ?? null,
              artifactChanged: !!note && note.sourceToken !== item.sourceToken,
              blockerCount: note?.blockerCount ?? 0,
              hasNextStep: note?.hasNextStep === true,
            },
          });
        }
        return {
          items,
          nextAfterId: page.docs.length === 12 ? page.docs.at(-1).id : null,
          stage: selected,
          wholeBookComplete: false,
          sourceCurrentness: 'not-rechecked',
        };
      });
    },
    async getLiteraryProgressArtifact(uid, data) {
      const c = scope(db, uid, data, ['stage', 'id']),
        selected = stage(data.stage),
        id = workId(data.id);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const item = await readArtifact(tx, c, selected, id),
          raw = (await tx.get(db.doc(c.path + '/literaryProgressNotes/' + item.noteId))).data();
        return { artifact: item, note: noteView(raw, item) };
      });
    },
    async saveLiteraryProgressNote(uid, data) {
      const c = scope(db, uid, data, [
          'stage',
          'id',
          'sourceToken',
          'expectedRevision',
          'operationId',
          'notes',
        ]),
        selected = stage(data.stage),
        id = workId(data.id),
        expectedRevision = workRevision(data.expectedRevision),
        operationId = validateId(data.operationId),
        sourceToken = token(data.sourceToken),
        annotation = notes(data.notes),
        fingerprint = digest({
          method: 'saveLiteraryProgressNote',
          stage: selected,
          id,
          sourceToken,
          expectedRevision,
          notes: annotation,
        });
      return db.runTransaction(async (tx) => {
        const root = await workProject(tx, c),
          book = await readWorkMetadata(tx, c.ref, []),
          operationRef = db.doc(c.path + '/literaryOperations/' + operationId),
          previous = (await tx.get(operationRef)).data();
        if (previous) {
          if (digest(previous.bookBirth ?? null) !== digest(literaryNativeBirth(book)))
            workFail('failed-precondition', 'A origem deste salvamento mudou.');
          if (
            previous.method !== 'saveLiteraryProgressNote' ||
            previous.fingerprint !== fingerprint
          )
            workFail('invalid-argument', 'Pedido usado com outra anotação.');
          const saved = (
            await tx.get(
              db.doc(
                c.path +
                  '/literaryProgressNoteVersions/' +
                  digest({ id: previous.id, revision: previous.revision }),
              ),
            )
          ).data();
          if (!saved) workFail('failed-precondition', 'Versão confirmada indisponível.');
          return {
            id: previous.id,
            revision: saved.revision,
            blockers: saved.notes.blockers,
            nextStep: saved.notes.nextStep,
            updatedAt: saved.updatedAt,
            artifactChanged: saved.sourceToken !== sourceToken,
          };
        }
        const item = await readArtifact(tx, c, selected, id),
          ref = db.doc(c.path + '/literaryProgressNotes/' + item.noteId),
          current = (await tx.get(ref)).data(),
          actual = current?.revision ?? 0;
        if (item.sourceToken !== sourceToken || actual !== expectedRevision) workConflict();
        if (current && current.nativeOrigin !== item.nativeOrigin)
          workFail('failed-precondition', 'A origem da anotação mudou.');
        const revision = workRevision(actual + 1),
          updatedAt = workDate(now, Math.max(root.updatedAt ?? 0, current?.updatedAt ?? 0)),
          value = {
            version: 1,
            nativeOrigin: item.nativeOrigin,
            artifact: { stage: selected, id, resource: item.resource },
            sourceToken,
            revision,
            notes: annotation,
            blockerCount: annotation.blockers.length,
            hasNextStep: !!annotation.nextStep,
            updatedAt,
          },
          clock = await prepareLiteraryDependencyWrite(tx, c);
        tx.set(ref, value);
        tx.create(
          db.doc(c.path + '/literaryProgressNoteVersions/' + digest({ id: item.noteId, revision })),
          value,
        );
        tx.create(operationRef, {
          method: 'saveLiteraryProgressNote',
          fingerprint,
          id: item.noteId,
          revision,
          updatedAt,
          bookBirth: literaryNativeBirth(book),
        });
        clock.commit();
        return { id: item.noteId, revision, ...annotation, updatedAt, artifactChanged: false };
      });
    },
  };
}

// Server metadata port only. The caller must reauthorize the owning book first.
export { readArtifact as readLiteraryProgressArtifactMetadata };
