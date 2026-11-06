import { touchLiteraryBackupWrite } from './literaryBackupFence.mjs';
import { createLiteraryPassageInspectionService } from './literaryPassageInspection.mjs';
import { captureLiteraryWorkflowAdmission } from './literaryWorkflowAdmission.mjs';
import {
  readSequenceWorkflowGrant,
  prepareSequenceStep,
  checkSequenceWorkflowSettings,
} from './literarySequenceContracts.mjs';
import {
  workflowPassageInput,
  captureLiteraryWorkflowPassage,
} from './literaryWorkflowPassage.mjs';
import {
  workScope,
  workProject,
  workId,
  workFail,
  workRevision,
  workDate,
  digest,
  readWorkMetadata,
  workLimit,
} from './workProgressContracts.mjs';
import { validateId, platformTextGeneration } from './generation.mjs';
import { editorialText } from './literaryContracts.mjs';
import { readLiteraryCollaboration } from './literaryCollaboration.mjs';
import {
  workflowLimits,
  workflowPhases,
  workflowBirth,
  workflowIdentity,
  workflowChildMarker,
} from './literaryWorkflowContracts.mjs';
import {
  authorizeLiteraryWritingManifest,
  literaryWritingIsCurrent,
} from './literaryWritingContext.mjs';
import { createLiteraryDraftService, readLiteraryDraftSource } from './literaryDrafting.mjs';
import { createLiteraryReviewService, readLiteraryReviewSource } from './literaryReview.mjs';
import { createLiteraryMilestoneService } from './literaryMilestones.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
import { readWorkHistoryRevision } from './workHistorySnapshot.mjs';
const terminal = ['done', 'stale', 'canceled'];
const waiting = [
  'firstVersionAuthorization',
  'firstVersionAcceptance',
  'manualConfirmation',
  'reviewAcceptance',
  'revisedVersionAuthorization',
  'corrections',
  'reconciliation',
];
const scope = (db, uid, data, keys) => {
  const c = workScope(db, uid, data, keys);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return c;
};
const childId = (job, kind) =>
  'cycle-' +
  digest({
    workflowId: job.jobId,
    chapterId: job.chapterId,
    kind,
    attempt: kind === 'review' ? job.reviewAttempt : job.draftAttempt,
  });
const summary = (job) =>
  Object.fromEntries(
    [
      'jobId',
      'originToken',
      'bookTitle',
      'chapterTitle',
      'registrationState',
      'chapterId',
      'revision',
      'phase',
      'stop',
      'paused',
      'steps',
      'limits',
      'authorizedPhases',
      'collaboration',
      'draftId',
      'reviewId',
      'manualMilestoneId',
      'firstVersionId',
      'priorApplications',
      'priorCredits',
      'createdAt',
      'completedAt',
      'busyStep',
      'errorCode',
      'gate',
      'passage',
      'passageEntered',
      'admission',
      'admissionEntered',
    ].map((k) => [k, job[k] ?? null]),
  );
export function createLiteraryWorkflowService({
  db,
  generator,
  now = Date.now,
  drafts = createLiteraryDraftService({ db, generator, now }),
  reviews = createLiteraryReviewService({ db, generator, now }),
  milestones = createLiteraryMilestoneService({ db, now }),
}) {
  const ref = (c, id) => db.doc(c.path + '/literaryWorkflowJobs/' + id);
  const op = (c, id) => db.doc(c.path + '/literaryOperations/' + id);
  const updateJob = (tx, c, id, patch) => {
    tx.update(ref(c, id), patch);
    touchLiteraryBackupWrite(tx, c);
  };
  const draftRef = (c, id) => db.doc(c.path + '/literaryDraftJobs/' + id);
  const reviewRef = (c, id) => db.doc(c.path + '/literaryReviewJobs/' + id);
  const milestoneRef = (c, id) => db.doc(c.path + '/literaryMilestones/' + id);
  const token = (value) => {
    if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
      workFail('invalid-argument', 'Confira a origem atual do ciclo.');
    return value;
  };
  async function scopeSnapshot(tx, c, chapterId, passage = null, admissionInspectionId = null) {
    const root = await workProject(tx, c),
      book = await readWorkMetadata(tx, c.ref, []),
      chapter = await readWorkMetadata(tx, db.doc(c.path + '/chapters/' + chapterId), [
        'title',
        'bookId',
        'ownerId',
        'deleting',
        'contentMode',
        'actId',
      ]);
    const value = chapter.data();
    if (
      !value ||
      value.deleting ||
      value.contentMode !== 'scenes' ||
      (value.bookId && value.bookId !== c.target.id) ||
      (value.ownerId && value.ownerId !== c.uid)
    )
      workFail('failed-precondition', 'Escolha um capítulo composto por cenas.');
    const data = {
      bookBirth: workflowBirth(book),
      chapterBirth: workflowBirth(chapter),
      chapterId,
      actId: value.actId ?? null,
      collaboration: await readLiteraryCollaboration(tx, c),
      ...(passage
        ? { passage: await captureLiteraryWorkflowPassage(tx, c, chapterId, passage) }
        : {}),
      bookTitle: root.title ?? 'Livro',
      chapterTitle: value.title ?? 'Capítulo',
    };
    const selectedInspection = admissionInspectionId ?? passage?.inspectionId ?? null;
    const admission = await captureLiteraryWorkflowAdmission(
      tx,
      c,
      chapterId,
      selectedInspection,
      data.passage ?? null,
    );
    return {
      ...data,
      ...(admission ? { admission } : {}),
      originToken: digest({
        actorId: c.uid,
        target: c.target,
        chapterId,
        bookBirth: data.bookBirth,
        chapterBirth: data.chapterBirth,
        actId: data.actId,
        collaboration: data.collaboration,
        ...(data.passage ? { passage: data.passage } : {}),
        ...(admission ? { admission } : {}),
      }),
    };
  }
  async function gate(tx, c, chapterId) {
    const value = (
      await readWorkMetadata(tx, db.doc(c.path + '/literaryPreparationGates/' + chapterId), [
        'ready',
        'authorAccepted',
        'revision',
        'stateToken',
        'manifest',
      ])
    ).data();
    if (!value) return null;
    await authorizeLiteraryWritingManifest(tx, c, value.manifest);
    if (
      !value.ready ||
      !value.authorAccepted ||
      !(await literaryWritingIsCurrent(tx, c, value.manifest))
    )
      return null;
    return { revision: value.revision, stateToken: value.stateToken };
  }
  async function read(tx, c, id) {
    await workProject(tx, c);
    const snapshot = await tx.get(ref(c, id)),
      job = snapshot.data();
    if (!job || job.actorId !== c.uid) workFail('not-found', 'Ciclo indisponível.');
    job.originToken = digest({
      actorId: c.uid,
      target: c.target,
      jobId: id,
      chapterId: job.chapterId,
      bookBirth: job.bookBirth,
      chapterBirth: job.chapterBirth,
      workflowBirth: workflowBirth(snapshot),
    });
    return { job, snapshot };
  }
  async function current(tx, c, job) {
    try {
      await workflowIdentity(tx, c, job);
      return true;
    } catch (cause) {
      if (!['failed-precondition', 'not-found', 'permission-denied'].includes(cause.code))
        throw cause;
      await workProject(tx, c);
      return false;
    }
  }
  async function frame(c, id) {
    const job = await db.runTransaction(async (tx) => {
      const { job } = await read(tx, c, id);
      if (job.registrationState !== 'active') {
        job.stop = 'registration';
        return job;
      }
      if (job.phase !== 'canceled' && !(await current(tx, c, job))) {
        job.phase = 'stale';
        job.stop = 'reconciliation';
        updateJob(tx, c, id, { phase: job.phase, stop: job.stop });
      }
      return job;
    });
    if (job.registrationState !== 'active' || ['stale', 'canceled'].includes(job.phase))
      return { job: summary(job) };
    const draft =
      job.collaboration.mode !== 'guidance' && job.draftId
        ? await drafts.getLiteraryDraft(c.uid, { target: c.target, jobId: job.draftId })
        : null;
    const review = job.reviewId
      ? await reviews.getLiteraryReview(c.uid, { target: c.target, jobId: job.reviewId })
      : null;
    if (
      job.phase === 'done' &&
      (!review || review.state !== 'done' || !review.authorAccepted || !review.preservationCurrent)
    ) {
      await db.runTransaction(async (tx) => {
        const latest = await read(tx, c, id);
        if (latest.job.phase !== 'done' || latest.job.revision !== job.revision) return;
        const native = (await tx.get(reviewRef(c, job.reviewId))).data();
        let actual;
        try {
          actual = await readLiteraryReviewSource(tx, c, job.chapterId);
        } catch (cause) {
          if (!['failed-precondition', 'not-found', 'permission-denied'].includes(cause.code))
            throw cause;
        }
        if (
          native &&
          actual &&
          native.state === 'done' &&
          native.authorAccepted &&
          native.sourceToken === actual.token &&
          native.preservationState === 'done' &&
          native.preservedHistoryRevision === readWorkHistoryRevision(actual.root)
        )
          return;
        const reusable =
          native &&
          actual &&
          native.state === 'done' &&
          native.authorAccepted &&
          native.sourceToken === actual.token;
        job.phase = reusable ? 'revisedVersion' : 'review';
        job.stop = reusable
          ? job.collaboration.mode === 'continuous' &&
            job.authorizedPhases.includes('revisedVersion')
            ? null
            : 'revisedVersionAuthorization'
          : 'reconciliation';
        job.revision = workRevision(job.revision + 1);
        updateJob(tx, c, id, { phase: job.phase, stop: job.stop, revision: job.revision });
      });
    }
    const waitingForResult = await db.runTransaction(async (tx) => {
      await workProject(tx, c);
      const pending =
        job.phase === 'firstVersion' ? draft?.job?.pendingRequestId : review?.pendingRequestId;
      if (!pending) return false;
      return (
        (
          await readWorkMetadata(tx, db.doc(c.path + '/literaryProseRequests/' + pending), [
            'state',
          ])
        ).data()?.state === 'running'
      );
    });
    return {
      job: summary(job),
      draft: draft?.job ? draft : null,
      review: review?.sourceToken ? review : null,
      waitingForResult,
    };
  }
  async function activeStep(tx, c, id, step) {
    const context = await read(tx, c, id),
      job = context.job;
    if (
      !(await current(tx, c, job)) ||
      job.paused ||
      terminal.includes(job.phase) ||
      job.busyStep !== step.operationId ||
      job.revision !== step.expectedRevision ||
      job.originToken !== step.expectedOriginToken
    )
      workFail(
        'failed-precondition',
        'O controle do ciclo mudou. Consulte o checkpoint.',
        'workflow-control',
      );
    return context;
  }
  const receipt = (job, method, fingerprint, revision, status = 'done', extra = {}) => ({
    method,
    fingerprint,
    id: job.jobId,
    revision,
    updatedAt: workDate(now),
    bookBirth: job.bookBirth,
    workflowBirth: job.workflowBirth ?? null,
    actorId: job.actorId,
    status,
    ...extra,
  });
  async function choose(tx, c, job) {
    if (job.phase === 'preparation') {
      const actual = await gate(tx, c, job.chapterId);
      if (!actual) return { transition: { stop: 'preparation' } };
      return {
        transition: {
          phase: 'firstVersion',
          ...(job.passage ? { passageEntered: true } : {}),
          ...(job.admission ? { admissionEntered: true } : {}),
          gate: actual,
          stop:
            job.collaboration.mode === 'guidance'
              ? 'manualConfirmation'
              : job.collaboration.mode === 'continuous' &&
                  job.authorizedPhases.includes('firstVersion')
                ? null
                : 'firstVersionAuthorization',
        },
      };
    }
    if (waiting.includes(job.stop)) return { transition: {} };
    if (job.phase === 'firstVersion') {
      if (job.collaboration.mode === 'guidance') {
        const native = (await tx.get(milestoneRef(c, job.manualMilestoneId))).data();
        if (!native) return { kind: 'startManual' };
        if (native.state === 'done')
          return {
            transition: {
              firstVersionId: job.manualMilestoneId,
              phase: 'review',
              stop: 'firstVersionAcceptance',
            },
          };
        if (['stale', 'canceled'].includes(native.state))
          return { transition: { stop: 'reconciliation' } };
        return { kind: 'advanceManual', marker: workflowChildMarker(native) };
      }
      const native = (await tx.get(draftRef(c, job.draftId))).data();
      if (!native) {
        if (
          job.priorApplications >= job.limits.maxApplications ||
          job.priorCredits >= job.limits.maxCredits
        )
          return { transition: { stop: 'budget' } };
        if (digest(await gate(tx, c, job.chapterId)) !== digest(job.gate))
          return { transition: { stop: 'reconciliation' } };
        return { kind: 'startDraft' };
      }
      let actual;
      try {
        actual = await readLiteraryDraftSource(tx, c, job.chapterId);
      } catch (cause) {
        if (!['failed-precondition', 'permission-denied', 'not-found'].includes(cause.code))
          throw cause;
      }
      if (
        !actual ||
        actual.token !== native.sourceToken ||
        ['stale', 'canceled'].includes(native.state)
      )
        return { transition: { stop: 'reconciliation' } };
      if (native.state === 'done')
        return {
          transition: {
            firstVersionId: native.milestoneJobId,
            phase: 'review',
            stop:
              job.collaboration.mode === 'continuous' && job.authorizedPhases.includes('review')
                ? null
                : 'firstVersionAcceptance',
          },
        };
      if (native.state === 'existingText') return { transition: { stop: 'existingText' } };
      if (native.state === 'attention') return { transition: { stop: 'attention' } };
      if (native.executionStop)
        return { transition: { stop: native.executionStop === 'budget' ? 'budget' : 'attention' } };
      if (native.state === 'awaitingAcceptance' && native.execution?.mode !== 'continuous')
        return { transition: { stop: 'scene' } };
      return { kind: 'advanceDraft', marker: workflowChildMarker(native) };
    }
    const native = (await tx.get(reviewRef(c, job.reviewId))).data();
    if (!native)
      return job.phase === 'review'
        ? { kind: 'startReview' }
        : { transition: { stop: 'reconciliation' } };
    let actual;
    try {
      actual = await readLiteraryReviewSource(tx, c, job.chapterId);
    } catch (cause) {
      if (!['failed-precondition', 'permission-denied', 'not-found'].includes(cause.code))
        throw cause;
    }
    if (
      !actual ||
      actual.token !== native.sourceToken ||
      ['stale', 'canceled'].includes(native.state)
    )
      return { transition: { stop: 'reconciliation' } };
    if (job.phase === 'review') {
      if (native.state === 'attention') return { transition: { stop: 'attention' } };
      if (native.state !== 'done')
        return { kind: 'advanceReview', marker: workflowChildMarker(native) };
      if (native.blocking > 0) return { transition: { stop: 'corrections' } };
      if (native.authorAccepted)
        return {
          transition: {
            phase: 'revisedVersion',
            stop:
              job.collaboration.mode === 'continuous' &&
              job.authorizedPhases.includes('revisedVersion')
                ? null
                : 'revisedVersionAuthorization',
          },
        };
      if (
        job.collaboration.mode === 'continuous' &&
        job.authorizedPhases.includes('review') &&
        native.warnings === 0 &&
        native.suggestions === 0
      )
        return {
          kind: 'acceptReview',
          sourceToken: native.sourceToken,
          marker: workflowChildMarker(native),
        };
      return { transition: { stop: 'reviewAcceptance' } };
    }
    if (!native.authorAccepted || native.blocking > 0)
      return { transition: { stop: 'reconciliation' } };
    if (
      native.preservationState === 'done' &&
      native.preservedHistoryRevision === readWorkHistoryRevision(actual.root)
    )
      return { transition: { phase: 'done', stop: null, completedAt: workDate(now) } };
    if (native.preservationState === 'attention') return { transition: { stop: 'attention' } };
    return {
      kind: 'advanceVersion',
      sourceToken: native.sourceToken,
      marker: workflowChildMarker(native),
    };
  }
  async function finish(c, id, step, patch = {}) {
    await db.runTransaction(async (tx) => {
      const { job } = await read(tx, c, id),
        old = (await tx.get(op(c, step.operationId))).data();
      if (
        !old ||
        old.fingerprint !== step.fingerprint ||
        old.status === 'done' ||
        old.status === 'superseded'
      )
        return;
      if (
        job.busyStep !== step.operationId ||
        job.revision !== step.expectedRevision ||
        job.originToken !== step.expectedOriginToken ||
        job.paused ||
        !(await current(tx, c, job))
      ) {
        tx.update(op(c, step.operationId), { status: 'superseded' });
        return;
      }
      updateJob(tx, c, id, { ...patch, busyStep: null, revision: workRevision(job.revision + 1) });
      tx.update(op(c, step.operationId), {
        status: 'done',
        revision: job.revision + 1,
        updatedAt: workDate(now),
      });
    });
  }
  const childGuard = (c, id, step, marker) => async (tx, _context, native) => {
    const active = await activeStep(tx, c, id, step);
    if (marker && workflowChildMarker(native) !== marker)
      workFail(
        'failed-precondition',
        'O filho já avançou; confira o ciclo.',
        'workflow-checkpoint',
      );
    return active;
  };
  const service = {
    async getLiteraryWorkflowScope(uid, data) {
      const c = scope(db, uid, data, ['chapterId', 'passage', 'admissionInspectionId']);
      const passage = workflowPassageInput(data.passage);
      return db.runTransaction((tx) =>
        scopeSnapshot(
          tx,
          c,
          workId(data.chapterId),
          passage,
          data.admissionInspectionId == null ? null : validateId(data.admissionInspectionId),
        ),
      );
    },
    async startLiteraryWorkflow(uid, data, internal) {
      const c = scope(db, uid, data, [
          'jobId',
          'chapterId',
          'expectedScopeToken',
          'instruction',
          'generation',
          'limits',
          'authorizedPhases',
          'passage',
          'admissionInspectionId',
        ]),
        id = validateId(data.jobId),
        chapterId = workId(data.chapterId),
        passage = workflowPassageInput(data.passage),
        admissionInspectionId =
          data.admissionInspectionId == null ? null : validateId(data.admissionInspectionId),
        expectedScopeToken = token(data.expectedScopeToken),
        instruction = editorialText(data.instruction ?? '', 4000),
        limits = workflowLimits(data.limits),
        authorizedPhases = workflowPhases(data.authorizedPhases);
      const resolved = platformTextGeneration(data.generation, 12000),
        generation = {
          version: 1,
          provider: 'platform',
          model: resolved.effective.model,
          reasoning: resolved.requested.reasoning,
        },
        fingerprint = digest({
          method: 'startLiteraryWorkflow',
          ...(passage ? { passage } : {}),
          ...(admissionInspectionId ? { admissionInspectionId } : {}),
          actorId: uid,
          target: c.target,
          chapterId,
          expectedScopeToken,
          instruction,
          generation,
          limits,
          authorizedPhases,
        });
      await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const old = (await tx.get(ref(c, id))).data(),
          prior = (await tx.get(op(c, id))).data();
        if (old && old.actorId !== uid) workFail('not-found', 'Ciclo indisponível.');
        if (prior && prior.fingerprint !== fingerprint)
          workFail('invalid-argument', 'Operação usada por outro ciclo.');
        if (old) {
          if (old.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Ciclo usado por outro pedido.');
          return;
        }
        if (prior)
          workFail('failed-precondition', 'O registro original do ciclo não está mais disponível.');
        const source = await scopeSnapshot(tx, c, chapterId, passage, admissionInspectionId);
        if (source.originToken !== expectedScopeToken)
          workFail(
            'failed-precondition',
            'O livro, capítulo ou contrato mudou desde a consulta.',
            'workflow-origin',
          );
        if (source.collaboration.mode !== 'continuous' && authorizedPhases.length)
          workFail(
            'invalid-argument',
            'Autorize fases contínuas somente no modo contínuo do contrato.',
          );
        const proof = {
          bookBirth: source.bookBirth,
          chapterBirth: source.chapterBirth,
          chapterId,
          actId: source.actId,
          collaboration: source.collaboration,
          bookTitle: source.bookTitle,
          chapterTitle: source.chapterTitle,
          ...(source.passage ? { passage: source.passage, passageEntered: false } : {}),
          ...(source.admission ? { admission: source.admission, admissionEntered: false } : {}),
        };
        const sequence = internal?.prepareStart
          ? await internal.prepareStart(tx, c, {
              jobId: id,
              chapterId,
              source,
              limits,
              authorizedPhases,
              instruction,
              generation,
              effectiveGeneration: resolved.effective,
            })
          : null;
        const job = {
          schemaVersion: 1,
          ...(sequence ? { sequence: sequence.binding } : {}),
          jobId: id,
          actorId: uid,
          expectedScopeToken,
          ...proof,
          instruction,
          generation,
          effectiveGeneration: resolved.effective,
          fingerprint,
          limits,
          authorizedPhases,
          registrationState: 'registering',
          workflowBirth: null,
          phase: 'preparation',
          stop: null,
          gate: null,
          revision: 1,
          paused: false,
          steps: 0,
          busyStep: null,
          draftAttempt: 0,
          reviewAttempt: 0,
          priorApplications: 0,
          priorCredits: 0,
          firstVersionId: null,
          createdAt: workDate(now),
        };
        job.draftId = childId(job, 'draft');
        job.reviewId = childId(job, 'review');
        job.manualMilestoneId = childId(job, 'manual');
        const dependencies = await prepareLiteraryDependencyWrite(tx, c);
        tx.create(ref(c, id), job);
        touchLiteraryBackupWrite(tx, c);
        sequence?.commit();
        tx.create(op(c, id), receipt(job, 'startLiteraryWorkflow', fingerprint, 1, 'registering'));
        dependencies.commit();
        tx.update(c.ref, { hasLiteraryResources: true });
      });
      // Registration is recoverable, but only native-born active records can authorize work.
      await db.runTransaction(async (tx) => {
        const { job, snapshot } = await read(tx, c, id),
          saved = (await tx.get(op(c, id))).data();
        await internal?.beforeActivate?.(tx, c, job);
        if (job.fingerprint !== fingerprint || saved?.fingerprint !== fingerprint)
          workFail('failed-precondition', 'Registro de origem indisponível.');
        if (job.registrationState === 'active') {
          if (digest(job.workflowBirth) !== digest(workflowBirth(snapshot)))
            workFail(
              'failed-precondition',
              'O ciclo foi recriado. Registre nova autorização.',
              'workflow-origin',
            );
          return;
        }
        if (
          job.registrationState !== 'registering' ||
          (await scopeSnapshot(tx, c, chapterId, passage, admissionInspectionId)).originToken !==
            expectedScopeToken
        )
          workFail(
            'failed-precondition',
            'O escopo original do registro mudou.',
            'workflow-origin',
          );
        await readSequenceWorkflowGrant(tx, c, job);
        const birth = workflowBirth(snapshot);
        updateJob(tx, c, id, { registrationState: 'active', workflowBirth: birth });
        tx.update(op(c, id), { status: 'done', workflowBirth: birth });
      });
      return frame(c, id);
    },
    async getLiteraryWorkflow(uid, data) {
      const c = scope(db, uid, data, ['jobId']);
      return frame(c, validateId(data.jobId));
    },
    async listLiteraryWorkflows(uid, data) {
      const c = scope(db, uid, data, ['chapterId', 'afterId', 'limit']),
        chapterId = data.chapterId == null ? null : workId(data.chapterId),
        after = data.afterId == null ? null : workId(data.afterId),
        limit = workLimit(data.limit);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const book = await readWorkMetadata(tx, c.ref, []),
          collaboration = await readLiteraryCollaboration(tx, c);
        const chapters = new Map();
        async function chapter(id) {
          if (!chapters.has(id))
            chapters.set(
              id,
              await readWorkMetadata(tx, db.doc(c.path + '/chapters/' + workId(id)), [
                'bookId',
                'ownerId',
                'deleting',
                'title',
                'actId',
              ]),
            );
          return chapters.get(id);
        }
        function available(row) {
          const value = row.data();
          return (
            value &&
            !value.deleting &&
            (!value.bookId || value.bookId === c.target.id) &&
            (!value.ownerId || value.ownerId === uid)
          );
        }
        if (chapterId && !available(await chapter(chapterId)))
          workFail('not-found', 'Capítulo indisponível.');
        let q = db.collection(c.path + '/literaryWorkflowJobs');
        if (chapterId) q = q.where('chapterId', '==', chapterId);
        q = q
          .orderBy('__name__')
          .limit(limit)
          .select(
            'jobId',
            'chapterId',
            'phase',
            'stop',
            'paused',
            'revision',
            'createdAt',
            'completedAt',
            'bookBirth',
            'chapterBirth',
            'actorId',
            'workflowBirth',
            'registrationState',
            'collaboration',
            'actId',
          );
        if (after) q = q.startAfter(after);
        const p = await tx.get(q),
          items = [];
        for (const d of p.docs) {
          const value = d.data();
          if (value.actorId !== uid || digest(value.bookBirth) !== digest(workflowBirth(book)))
            continue;
          const native = await chapter(value.chapterId);
          if (!available(native) || digest(value.chapterBirth) !== digest(workflowBirth(native)))
            continue;
          const sameScope =
            digest(value.collaboration) === digest(collaboration) &&
            (value.actId ?? null) === (native.data().actId ?? null);
          items.push({
            jobId: value.jobId,
            chapterId: value.chapterId,
            chapterTitle: native.data().title ?? 'Capítulo',
            actId: native.data().actId ?? null,
            phase:
              value.registrationState === 'registering' && sameScope
                ? 'preparation'
                : value.registrationState === 'active' &&
                    sameScope &&
                    digest(value.workflowBirth) === digest(workflowBirth(d))
                  ? value.phase
                  : 'stale',
            stop: value.stop,
            paused: value.paused,
            revision: value.revision,
            createdAt: value.createdAt,
            completedAt: value.completedAt ?? null,
          });
        }
        return { items, nextAfterId: p.docs.length === limit ? p.docs.at(-1).id : null };
      });
    },
    async advanceLiteraryWorkflow(uid, data, internal) {
      const c = scope(db, uid, data, [
          'jobId',
          'operationId',
          'expectedRevision',
          'expectedOriginToken',
        ]),
        id = validateId(data.jobId),
        operationId = validateId(data.operationId),
        expectedRevision = workRevision(data.expectedRevision),
        expectedOriginToken = token(data.expectedOriginToken),
        step = { operationId, expectedRevision, expectedOriginToken },
        fingerprint = digest({
          method: 'advanceLiteraryWorkflow',
          id,
          expectedRevision,
          expectedOriginToken,
        });
      step.fingerprint = fingerprint;
      const action = await db.runTransaction(async (tx) => {
        const { job } = await read(tx, c, id),
          old = (await tx.get(op(c, operationId))).data();
        await internal?.beforeAdvance?.(tx, c, job);
        if (old) {
          if (old.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Passo usado por outro pedido.');
          return old.status === 'running' ? old.action : null;
        }
        if (job.originToken !== expectedOriginToken)
          workFail('failed-precondition', 'A instância do ciclo mudou.', 'workflow-origin');
        if (job.revision !== expectedRevision)
          workFail(
            'failed-precondition',
            'O ciclo mudou. Consulte o checkpoint.',
            'revision-conflict',
          );
        if (job.busyStep)
          workFail(
            'failed-precondition',
            'Recupere o mesmo passo pendente antes de iniciar outro.',
          );
        if (job.paused || terminal.includes(job.phase) || !(await current(tx, c, job)))
          workFail('failed-precondition', 'Este ciclo não pode avançar.');
        if (job.steps >= job.limits.maxSteps) {
          updateJob(tx, c, id, { stop: 'budget', revision: job.revision + 1 });
          tx.create(
            op(c, operationId),
            receipt(job, 'advanceLiteraryWorkflow', fingerprint, job.revision + 1),
          );
          return null;
        }
        const chosen = await choose(tx, c, job),
          sequenceStep = await prepareSequenceStep(tx, c, job),
          dependencies = await prepareLiteraryDependencyWrite(tx, c);
        sequenceStep.commit();
        if (chosen.transition) {
          updateJob(tx, c, id, {
            ...chosen.transition,
            steps: job.steps + 1,
            revision: job.revision + 1,
          });
          tx.create(
            op(c, operationId),
            receipt(job, 'advanceLiteraryWorkflow', fingerprint, job.revision + 1),
          );
          dependencies.commit();
          return null;
        }
        updateJob(tx, c, id, { steps: job.steps + 1, busyStep: operationId, stop: null });
        tx.create(
          op(c, operationId),
          receipt(job, 'advanceLiteraryWorkflow', fingerprint, job.revision + 1, 'running', {
            action: chosen,
          }),
        );
        dependencies.commit();
        return chosen;
      });
      if (!action) return frame(c, id);
      try {
        const guardedStep = async (tx) => {
            const active = await activeStep(tx, c, id, step);
            await internal?.beforeAdvance?.(tx, c, active.job);
            return active;
          },
          initial = await db.runTransaction(guardedStep),
          job = initial.job;
        if (
          ['startDraft', 'startReview'].includes(action.kind) &&
          digest(platformTextGeneration(job.generation, 12000).effective) !==
            digest(job.effectiveGeneration)
        )
          workFail(
            'failed-precondition',
            'As capacidades do modelo mudaram; registre nova autorização.',
          );
        const beforeStart = async (tx, ctx, native) => {
            await guardedStep(tx);
            const active = await childGuard(c, id, step)(tx, ctx, native);
            return { id, birth: workflowBirth(active.snapshot) };
          },
          beforeAdvance = async (tx, ctx, native) => {
            await guardedStep(tx);
            return childGuard(c, id, step, action.marker)(tx, ctx, native);
          },
          common = { target: c.target };
        if (action.kind === 'startDraft') {
          const execution =
            job.collaboration.mode === 'continuous' && job.authorizedPhases.includes('firstVersion')
              ? {
                  version: 1,
                  mode: 'continuous',
                  maxApplications: job.limits.maxApplications - job.priorApplications,
                  maxCredits: job.limits.maxCredits - job.priorCredits,
                }
              : undefined;
          await drafts.startLiteraryDraft(
            uid,
            {
              ...common,
              jobId: job.draftId,
              chapterId: job.chapterId,
              instruction: job.instruction,
              generation: job.generation,
              ...(execution ? { execution } : {}),
            },
            {
              beforeStart: async (tx, ctx, native) => {
                if (
                  native.proof.gateToken !== job.gate.stateToken ||
                  native.proof.gateRevision !== job.gate.revision
                )
                  workFail('failed-precondition', 'A preparação mudou.');
                return beforeStart(tx, ctx, native);
              },
            },
          );
        } else if (action.kind === 'advanceDraft')
          await drafts.advanceLiteraryDraft(
            uid,
            { ...common, jobId: job.draftId },
            { beforeAdvance },
          );
        else if (action.kind === 'startReview')
          await reviews.startLiteraryReview(
            uid,
            {
              ...common,
              jobId: job.reviewId,
              chapterId: job.chapterId,
              instruction: job.instruction,
              generation: job.generation,
            },
            { beforeStart },
          );
        else if (action.kind === 'advanceReview')
          await reviews.advanceLiteraryReview(
            uid,
            { ...common, jobId: job.reviewId },
            { beforeAdvance },
          );
        else if (action.kind === 'acceptReview')
          await reviews.acceptLiteraryReview(
            uid,
            { ...common, jobId: job.reviewId, expectedSourceToken: action.sourceToken },
            {
              prepareCommit: async (tx, { context, job: native }) => {
                await beforeAdvance(tx, context, native);
                return {
                  commit: () => {
                    updateJob(tx, c, id, {
                      phase: 'revisedVersion',
                      stop: job.authorizedPhases.includes('revisedVersion')
                        ? null
                        : 'revisedVersionAuthorization',
                      busyStep: null,
                      revision: expectedRevision + 1,
                    });
                    tx.update(op(c, operationId), {
                      status: 'done',
                      revision: expectedRevision + 1,
                    });
                  },
                };
              },
            },
          );
        else if (action.kind === 'advanceVersion')
          await reviews.advanceLiteraryReviewedVersion(
            uid,
            { ...common, jobId: job.reviewId, expectedSourceToken: action.sourceToken },
            { beforeAdvance },
          );
        else if (action.kind === 'startManual')
          await milestones.startLiteraryMilestone(
            uid,
            {
              ...common,
              jobId: job.manualMilestoneId,
              chapterId: job.chapterId,
              kind: 'firstDraft',
            },
            { beforeStart },
          );
        else if (action.kind === 'advanceManual')
          await milestones.advanceLiteraryMilestone(
            uid,
            { ...common, jobId: job.manualMilestoneId },
            { beforeAdvance },
          );
        await finish(c, id, step);
      } catch (cause) {
        if (
          !['failed-precondition', 'resource-exhausted', 'not-found', 'permission-denied'].includes(
            cause.code,
          )
        )
          throw cause;
        await finish(
          c,
          id,
          step,
          cause.details?.reason === 'workflow-checkpoint'
            ? {}
            : { stop: 'attention', errorCode: cause.code },
        );
      }
      return frame(c, id);
    },
    async setLiteraryWorkflowControl(uid, data, internal) {
      const c = scope(db, uid, data, [
          'jobId',
          'operationId',
          'expectedRevision',
          'expectedOriginToken',
          'action',
          'limits',
          'authorizedPhases',
          'expectedGateToken',
          'expectedFirstVersionId',
          'expectedReviewSourceToken',
        ]),
        id = validateId(data.jobId),
        operationId = validateId(data.operationId),
        expectedRevision = workRevision(data.expectedRevision),
        expectedOriginToken = token(data.expectedOriginToken);
      const actions = [
        'confirmRegistration',
        'pause',
        'resume',
        'cancel',
        'startFirstVersion',
        'confirmManual',
        'acceptFirstVersion',
        'acceptReview',
        'startRevisedVersion',
        'reconcileDraft',
        'reconcileReview',
      ];
      if (!actions.includes(data.action))
        workFail('invalid-argument', 'Decisão de ciclo inválida.');
      const limits = data.limits === undefined ? undefined : workflowLimits(data.limits),
        phases =
          data.authorizedPhases === undefined ? undefined : workflowPhases(data.authorizedPhases);
      for (const token of [data.expectedGateToken, data.expectedReviewSourceToken])
        if (token !== undefined && (typeof token !== 'string' || !/^[a-f0-9]{64}$/.test(token)))
          workFail('invalid-argument', 'Confira a versão atual antes de decidir.');
      if (data.expectedFirstVersionId !== undefined) workId(data.expectedFirstVersionId);
      const fingerprint = digest({
        method: 'setLiteraryWorkflowControl',
        id,
        expectedRevision,
        expectedOriginToken,
        action: data.action,
        limits: limits ?? null,
        authorizedPhases: phases ?? null,
        expectedGateToken: data.expectedGateToken ?? null,
        expectedFirstVersionId: data.expectedFirstVersionId ?? null,
        expectedReviewSourceToken: data.expectedReviewSourceToken ?? null,
      });
      async function prepare(tx) {
        const { job } = await read(tx, c, id),
          old = (await tx.get(op(c, operationId))).data();
        await internal?.beforeControl?.(tx, c, job);
        if (job.originToken !== expectedOriginToken)
          workFail('failed-precondition', 'A instância do ciclo mudou.', 'workflow-origin');
        if (old) {
          if (old.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Controle usado por outro pedido.');
          return { job, old };
        }
        if (job.originToken !== expectedOriginToken)
          workFail('failed-precondition', 'A instância do ciclo mudou.', 'workflow-origin');
        if (job.revision !== expectedRevision)
          workFail(
            'failed-precondition',
            'O controle mudou. Consulte o checkpoint.',
            'revision-conflict',
          );
        if (['pause', 'cancel'].includes(data.action)) {
          // Invalidated prerequisites must never trap a live child: closing the
          // original parent is safe, but still requires its native actor/origin.
          await workflowIdentity(tx, c, job, { ignorePassage: true });
          if (['done', 'canceled'].includes(job.phase))
            workFail('failed-precondition', 'Este ciclo não aceita nova autorização.');
        } else {
          await readSequenceWorkflowGrant(tx, c, job);
          if (!(await current(tx, c, job)) || terminal.includes(job.phase))
            workFail('failed-precondition', 'Este ciclo não aceita nova autorização.');
        }
        return { job };
      }
      const incomplete = await db.runTransaction(async (tx) => {
        const { job } = await read(tx, c, id);
        return job.registrationState !== 'active';
      });
      if (data.action === 'confirmRegistration' || (data.action === 'cancel' && incomplete)) {
        if (limits || phases)
          workFail('invalid-argument', 'Preserve o escopo original do registro.');
        await db.runTransaction(async (tx) => {
          const { job, snapshot } = await read(tx, c, id),
            old = (await tx.get(op(c, operationId))).data(),
            initial = (await tx.get(op(c, id))).data();
          await internal?.beforeControl?.(tx, c, job);
          if (job.originToken !== expectedOriginToken)
            workFail('failed-precondition', 'A instância do registro mudou.', 'workflow-origin');
          if (old) {
            if (old.fingerprint !== fingerprint)
              workFail('invalid-argument', 'Controle usado por outro pedido.');
            return;
          }
          if (
            job.revision !== expectedRevision ||
            job.phase !== 'preparation' ||
            !['registering', 'active'].includes(job.registrationState)
          )
            workFail('failed-precondition', 'O registro original não aguarda esta decisão.');
          if (!initial || initial.fingerprint !== job.fingerprint)
            workFail('failed-precondition', 'Recibo original indisponível.');
          if (
            data.action === 'confirmRegistration' &&
            (
              await scopeSnapshot(
                tx,
                c,
                job.chapterId,
                job.passage?.input,
                job.admission?.inspection.inspectionId ?? null,
              )
            ).originToken !== job.expectedScopeToken
          )
            workFail(
              'failed-precondition',
              'O escopo original do registro mudou.',
              'workflow-origin',
            );
          if (data.action === 'confirmRegistration') await readSequenceWorkflowGrant(tx, c, job);
          const birth = workflowBirth(snapshot),
            dependencies = await prepareLiteraryDependencyWrite(tx, c);
          if (job.registrationState === 'active' && digest(job.workflowBirth) !== digest(birth))
            workFail('failed-precondition', 'O ciclo foi recriado.', 'workflow-origin');
          const patch =
            data.action === 'cancel'
              ? { registrationState: 'canceled', phase: 'canceled', paused: true, stop: null }
              : { registrationState: 'active', stop: null };
          updateJob(tx, c, id, { ...patch, workflowBirth: birth, revision: expectedRevision + 1 });
          tx.update(op(c, id), {
            status: data.action === 'cancel' ? 'superseded' : 'done',
            workflowBirth: birth,
          });
          tx.create(
            op(c, operationId),
            receipt(
              { ...job, workflowBirth: birth },
              'setLiteraryWorkflowControl',
              fingerprint,
              expectedRevision + 1,
            ),
          );
          dependencies.commit();
        });
        return frame(c, id);
      }
      if (data.action === 'acceptReview') {
        if (limits || phases)
          workFail('invalid-argument', 'Separe alteração de limites do aceite de revisão.');
        const checked = await db.runTransaction(prepare);
        if (!checked.old) {
          const job = checked.job;
          await reviews.acceptLiteraryReview(
            uid,
            {
              target: c.target,
              jobId: job.reviewId,
              expectedSourceToken: data.expectedReviewSourceToken,
            },
            {
              prepareCommit: async (tx, { job: native }) => {
                const latest = await prepare(tx);
                if (latest.old) return { commit() {} };
                if (
                  latest.job.paused ||
                  latest.job.phase !== 'review' ||
                  latest.job.reviewId !== native.jobId ||
                  !['reviewAcceptance', 'corrections'].includes(latest.job.stop)
                )
                  workFail('failed-precondition', 'Confira a revisão atual antes de aceitar.');
                const dependencies = await prepareLiteraryDependencyWrite(tx, c);
                return {
                  commit: () => {
                    updateJob(tx, c, id, {
                      phase: 'revisedVersion',
                      stop: null,
                      busyStep: null,
                      revision: expectedRevision + 1,
                    });
                    tx.create(
                      op(c, operationId),
                      receipt(job, 'setLiteraryWorkflowControl', fingerprint, expectedRevision + 1),
                    );
                    dependencies.commit();
                  },
                };
              },
            },
          );
        }
        return frame(c, id);
      }
      await db.runTransaction(async (tx) => {
        const { job, old } = await prepare(tx);
        if (old) return;
        const draft = (await tx.get(draftRef(c, job.draftId))).data(),
          review = (await tx.get(reviewRef(c, job.reviewId))).data(),
          pending = job.busyStep ? (await tx.get(op(c, job.busyStep))).data() : null;
        const patch = { busyStep: null, revision: expectedRevision + 1, errorCode: null };
        if (limits || phases)
          await checkSequenceWorkflowSettings(
            tx,
            c,
            job,
            limits ?? job.limits,
            phases ?? job.authorizedPhases,
          );
        if (limits) {
          if (
            limits.maxApplications < job.priorApplications + (draft?.drafted ?? 0) ||
            limits.maxCredits < job.priorCredits + (draft?.chargedCredits ?? draft?.drafted ?? 0) ||
            limits.maxSteps < job.steps
          )
            workFail(
              'invalid-argument',
              'Os limites totais precisam preservar gastos e passos anteriores.',
            );
          if (
            draft?.execution?.mode === 'continuous' &&
            (limits.maxApplications - job.priorApplications < 1 ||
              limits.maxCredits - job.priorCredits < 1)
          )
            workFail(
              'invalid-argument',
              'Pause o ciclo ou mantenha limites positivos da redação registrada.',
            );
          patch.limits = limits;
        }
        if (phases) {
          if (job.collaboration.mode !== 'continuous' && phases.length)
            workFail('invalid-argument', 'O contrato não permite fases contínuas.');
          patch.authorizedPhases = phases;
        }
        if ((limits || phases) && !['pause', 'resume'].includes(data.action))
          workFail('invalid-argument', 'Altere limites e fases pelo controle de pausa/retomada.');
        if (data.action === 'pause') patch.paused = true;
        if (data.action === 'resume') {
          patch.paused = false;
          if (['budget', 'attention', 'scene', 'existingText'].includes(job.stop))
            patch.stop = null;
        }
        if (data.action === 'cancel') {
          patch.phase = 'canceled';
          patch.paused = true;
          patch.stop = null;
        }
        if (['startFirstVersion', 'confirmManual'].includes(data.action)) {
          if (
            job.paused ||
            job.phase !== 'firstVersion' ||
            !['firstVersionAuthorization', 'manualConfirmation'].includes(job.stop) ||
            data.expectedGateToken !== job.gate?.stateToken ||
            digest(await gate(tx, c, job.chapterId)) !== digest(job.gate)
          )
            workFail('failed-precondition', 'Confira e aceite a preparação atual.');
          if ((data.action === 'confirmManual') !== (job.collaboration.mode === 'guidance'))
            workFail('invalid-argument', 'Escolha a passagem correspondente ao modo do contrato.');
          patch.stop = null;
        }
        if (data.action === 'acceptFirstVersion') {
          const first = job.firstVersionId
            ? (await tx.get(milestoneRef(c, job.firstVersionId))).data()
            : null;
          if (
            job.paused ||
            job.phase !== 'review' ||
            job.stop !== 'firstVersionAcceptance' ||
            job.firstVersionId !== data.expectedFirstVersionId ||
            first?.state !== 'done' ||
            first.chapterId !== job.chapterId
          )
            workFail(
              'failed-precondition',
              'Confira a primeira versão preservada antes de seguir.',
            );
          patch.stop = null;
        }
        if (data.action === 'startRevisedVersion') {
          if (
            job.paused ||
            job.phase !== 'revisedVersion' ||
            job.stop !== 'revisedVersionAuthorization'
          )
            workFail('failed-precondition', 'Confira e aceite a revisão atual.');
          patch.stop = null;
        }
        if (data.action === 'reconcileDraft') {
          patch.priorApplications = job.priorApplications + (draft?.drafted ?? 0);
          patch.priorCredits = job.priorCredits + (draft?.chargedCredits ?? draft?.drafted ?? 0);
          patch.draftAttempt = workRevision(job.draftAttempt + 1);
          patch.reviewAttempt = workRevision(job.reviewAttempt + 1);
          patch.phase = 'preparation';
          patch.gate = null;
          patch.firstVersionId = null;
          patch.stop = null;
          patch.paused = false;
          patch.draftId = childId({ ...job, ...patch }, 'draft');
          patch.manualMilestoneId = childId({ ...job, ...patch }, 'manual');
          patch.reviewId = childId({ ...job, ...patch }, 'review');
        }
        if (data.action === 'reconcileReview') {
          if (!job.firstVersionId || !['review', 'revisedVersion'].includes(job.phase))
            workFail(
              'failed-precondition',
              'Preserve a primeira versão antes de reconciliar a revisão.',
            );
          patch.reviewAttempt = workRevision(job.reviewAttempt + 1);
          patch.reviewId = childId({ ...job, ...patch }, 'review');
          patch.phase = 'review';
          patch.stop = null;
          patch.paused = false;
        }
        const dependencies = await prepareLiteraryDependencyWrite(tx, c);
        if (draft && ['pause', 'resume', 'cancel', 'reconcileDraft'].includes(data.action)) {
          const change = {
            paused: patch.paused ?? job.paused,
            controlRevision: workRevision((draft.controlRevision ?? 0) + 1),
          };
          if (['cancel', 'reconcileDraft'].includes(data.action)) change.state = 'canceled';
          else if (limits && draft.execution?.mode === 'continuous')
            change.execution = {
              ...draft.execution,
              maxApplications: limits.maxApplications - job.priorApplications,
              maxCredits: limits.maxCredits - job.priorCredits,
            };
          if (data.action === 'resume') change.executionStop = null;
          tx.update(draftRef(c, job.draftId), change);
        }
        if (
          review &&
          ['pause', 'resume', 'cancel', 'reconcileDraft', 'reconcileReview'].includes(data.action)
        )
          tx.update(reviewRef(c, job.reviewId), {
            paused: patch.paused ?? job.paused,
            ...(['cancel', 'reconcileDraft', 'reconcileReview'].includes(data.action)
              ? { state: 'canceled' }
              : {}),
          });
        if (pending?.status === 'running') tx.update(op(c, job.busyStep), { status: 'superseded' });
        updateJob(tx, c, id, patch);
        tx.create(
          op(c, operationId),
          receipt(job, 'setLiteraryWorkflowControl', fingerprint, expectedRevision + 1, 'done', {
            previous: {
              draftId: job.draftId,
              reviewId: job.reviewId,
              firstVersionId: job.firstVersionId,
            },
          }),
        );
        dependencies.commit();
      });
      return frame(c, id);
    },
  };
  return Object.assign(service, createLiteraryPassageInspectionService({ db, now }));
}
