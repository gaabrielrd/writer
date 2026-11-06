import { writeLiteraryBackupProcess } from './literaryBackupFence.mjs';
import {
  workScope,
  workProject,
  workId,
  workRevision,
  workFail,
  workDate,
  digest,
} from './workProgressContracts.mjs';
import { platformTextGeneration } from './generation.mjs';
import { editorialText } from './literaryContracts.mjs';
import { workflowBirth } from './literaryWorkflowOrigins.mjs';
import { workflowLimits, workflowPhases } from './literaryExecutionContracts.mjs';
import {
  captureLiterarySequenceScope,
  sequenceChapterIds,
  readLiterarySequence,
  assertLiterarySequenceIdentity,
} from './literarySequenceContracts.mjs';
import { readLiteraryReviewSource } from './literaryReviewSource.mjs';
import { readWorkHistoryRevision } from './workHistorySnapshot.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
const scope = (db, uid, data, keys) => {
  const c = workScope(db, uid, data, keys);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return c;
};
const token = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Confira a origem da execução.');
  return value;
};
const fail = (message) => workFail('failed-precondition', message, 'sequence-control');
const summary = (context) => {
  const { job } = context;
  return Object.fromEntries(
    [
      'jobId',
      'bookTitle',
      'chapters',
      'registrationState',
      'revision',
      'state',
      'paused',
      'index',
      'currentWorkflowId',
      'completed',
      'stop',
      'busyStep',
      'limits',
      'authorizedPhases',
      'continueBetweenChapters',
      'collaboration',
      'applications',
      'credits',
      'steps',
      'createdAt',
      'completedAt',
    ]
      .map((key) => [key, job[key] ?? null])
      .concat([['originToken', context.originToken]]),
  );
};
/** Native core only. Public consumers use the serialized driver; hooks remain internal. */
export function createLiterarySequenceService({ db, now = Date.now }) {
  const ref = (c, id) => db.doc(c.path + '/literarySequenceJobs/' + id);
  const receiptRef = (c, id) => db.doc(c.path + '/literaryOperations/' + id);
  async function read(tx, c, id, closing = false) {
    const context = await readLiterarySequence(tx, c, id);
    await assertLiterarySequenceIdentity(tx, c, context, { closing });
    return context;
  }
  async function checked(tx, c, data, closing = false) {
    const context = await read(tx, c, workId(data.jobId), closing);
    if (
      context.originToken !== token(data.expectedOriginToken) ||
      context.job.revision !== workRevision(data.expectedRevision)
    )
      fail('A execução mudou. Consulte o checkpoint original.');
    return context;
  }
  const api = {
    async getLiterarySequenceScope(uid, data) {
      const c = scope(db, uid, data, ['chapterIds']);
      return db.runTransaction((tx) =>
        captureLiterarySequenceScope(tx, c, sequenceChapterIds(data.chapterIds)),
      );
    },
    async startLiterarySequence(uid, data) {
      const c = scope(db, uid, data, [
        'jobId',
        'chapterIds',
        'expectedScopeToken',
        'instruction',
        'generation',
        'limits',
        'authorizedPhases',
        'continueBetweenChapters',
        'requestHash',
      ]);
      const id = workId(data.jobId),
        ids = sequenceChapterIds(data.chapterIds),
        expectedScopeToken = token(data.expectedScopeToken),
        requestHash = data.requestHash === undefined ? null : token(data.requestHash),
        limits = workflowLimits(data.limits),
        phases = workflowPhases(data.authorizedPhases),
        instruction = editorialText(data.instruction ?? '', 4000);
      if (typeof data.continueBetweenChapters !== 'boolean')
        workFail('invalid-argument', 'Escolha a autorização de passagem entre capítulos.');
      const resolved = platformTextGeneration(data.generation, 12000),
        generation = {
          version: 1,
          provider: 'platform',
          model: resolved.effective.model,
          reasoning: resolved.requested.reasoning,
        };
      const fingerprint = digest({
        domain: 'literary-sequence-registration-v1',
        ...(requestHash ? { requestHash } : {}),
        uid,
        target: c.target,
        ids,
        expectedScopeToken,
        limits,
        phases,
        instruction,
        generation,
        continueBetweenChapters: data.continueBetweenChapters,
      });
      await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const existing = await tx.get(ref(c, id));
        const receipt = (await tx.get(receiptRef(c, id))).data();
        if (receipt && receipt.fingerprint !== fingerprint)
          workFail('invalid-argument', 'Registro usado por outro pedido.');
        if (receipt && !existing.exists)
          fail('O registro original foi retirado e não pode ser recriado.');
        if (existing.exists) {
          const old = existing.data();
          if (old.actorId !== uid) workFail('not-found', 'Execução indisponível.');
          if (!receipt) fail('O recibo original da execução não está disponível.');
          if (old.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Registro usado por outro escopo.');
          if (
            old.registrationState === 'active' &&
            digest(old.birth) !== digest(workflowBirth(existing))
          )
            fail('A execução original foi recriada.');
          return;
        }
        const source = await captureLiterarySequenceScope(tx, c, ids);
        if (source.originToken !== expectedScopeToken) fail('O escopo mudou desde a consulta.');
        if (
          source.collaboration.mode !== 'continuous' &&
          (phases.length || data.continueBetweenChapters)
        )
          workFail(
            'invalid-argument',
            'Autorize fases e passagens contínuas somente no modo contínuo.',
          );
        const dependencies = await prepareLiteraryDependencyWrite(tx, c);
        writeLiteraryBackupProcess(tx, c, 'sequence', 'create', ref(c, id), {
          schemaVersion: 1,
          jobId: id,
          actorId: uid,
          bookBirth: source.bookBirth,
          bookTitle: source.bookTitle,
          chapters: source.chapters,
          collaboration: source.collaboration,
          scopeToken: source.originToken,
          fingerprint,
          generation,
          effectiveGeneration: resolved.effective,
          instruction,
          limits,
          authorizedPhases: phases,
          continueBetweenChapters: data.continueBetweenChapters,
          registrationState: 'registering',
          birth: null,
          state: 'active',
          revision: 1,
          paused: false,
          index: 0,
          currentWorkflowId: null,
          completed: [],
          stop: null,
          applications: 0,
          credits: 0,
          steps: 0,
          busyStep: null,
          createdAt: workDate(now),
        });
        tx.create(receiptRef(c, id), {
          method: 'startLiterarySequence',
          requestHash,
          id,
          fingerprint,
          actorId: uid,
          bookBirth: source.bookBirth,
          status: 'registering',
          birth: null,
          revision: 1,
          updatedAt: workDate(now),
        });
        tx.update(c.ref, { hasLiteraryResources: true });
        dependencies.commit();
      });
      await db.runTransaction(async (tx) => {
        const context = await readLiterarySequence(tx, c, id),
          { job } = context;
        const receipt = (await tx.get(receiptRef(c, id))).data();
        if (job.fingerprint !== fingerprint || receipt?.fingerprint !== fingerprint)
          fail('Registro de origem indisponível.');
        if (job.registrationState === 'active') {
          await assertLiterarySequenceIdentity(tx, c, context, { closing: true });
          return;
        }
        if (
          job.registrationState !== 'registering' ||
          (await captureLiterarySequenceScope(tx, c, ids)).originToken !== expectedScopeToken
        )
          fail('O escopo original do registro mudou.');
        writeLiteraryBackupProcess(tx, c, 'sequence', 'update', context.ref, {
          registrationState: 'active',
          birth: workflowBirth(context.snapshot),
        });
        tx.update(receiptRef(c, id), { status: 'done', birth: workflowBirth(context.snapshot) });
      });
      return api.getLiterarySequence(uid, { target: c.target, jobId: id });
    },
    async getLiterarySequence(uid, data) {
      const c = scope(db, uid, data, ['jobId']);
      return db.runTransaction(async (tx) => {
        const context = await readLiterarySequence(tx, c, workId(data.jobId));
        if (context.job.registrationState !== 'active') return summary(context);
        await assertLiterarySequenceIdentity(tx, c, context, { closing: true });
        try {
          await assertLiterarySequenceIdentity(tx, c, context);
        } catch (cause) {
          if (!['failed-precondition', 'not-found', 'permission-denied'].includes(cause.code))
            throw cause;
          if (context.job.state !== 'canceled')
            context.job = { ...context.job, state: 'stale', stop: 'scope' };
        }
        return summary(context);
      });
    },
    // Trusted composition hook. This capability is never accepted in an HTTP DTO.
    workflowHooks(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'expectedOriginToken']),
        id = workId(data.jobId),
        expectedOriginToken = token(data.expectedOriginToken);
      return {
        prepareStart: async (tx, nativeContext, details) => {
          if (nativeContext.uid !== uid || digest(nativeContext.target) !== digest(c.target))
            fail('Origem interna da execução inválida.');
          const context = await read(tx, c, id),
            { job } = context;
          if (
            context.originToken !== expectedOriginToken ||
            job.state !== 'active' ||
            job.paused ||
            job.currentWorkflowId ||
            job.chapters[job.index]?.id !== details.chapterId ||
            (job.stop && job.stop !== 'actIntegration')
          )
            fail('A unidade original não está autorizada para novo ciclo.');
          if (
            details.instruction !== job.instruction ||
            digest(details.generation) !== digest(job.generation) ||
            digest(details.effectiveGeneration) !== digest(job.effectiveGeneration)
          )
            fail('Preserve a orientação e a configuração de geração autorizadas na execução.');
          if (
            details.limits.maxApplications > job.limits.maxApplications - job.applications ||
            details.limits.maxCredits > job.limits.maxCredits - job.credits ||
            details.limits.maxSteps > job.limits.maxSteps - job.steps ||
            details.authorizedPhases.some((phase) => !job.authorizedPhases.includes(phase))
          )
            fail('Os limites do ciclo excedem o saldo autorizado da execução.');
          if (
            job.index > 0 &&
            details.source.passage?.input.previousWorkflowId !== job.completed.at(-1)?.workflowId
          )
            fail('Vincule a passagem ao capítulo anterior concluído desta execução.');
          const binding = { id, birth: job.birth, index: job.index };
          return {
            binding,
            commit() {
              writeLiteraryBackupProcess(tx, c, 'sequence', 'update', context.ref, {
                currentWorkflowId: details.jobId,
                stop: null,
              });
            },
          };
        },
      };
    },
    async completeLiterarySequenceChapter(uid, data, internal) {
      const c = scope(db, uid, data, [
        'jobId',
        'expectedOriginToken',
        'expectedRevision',
        'workflowId',
      ]);
      return db.runTransaction(async (tx) => {
        const context = await checked(tx, c, data),
          { job } = context;
        if (job.busyStep && !internal?.prepareCommit)
          fail('Recupere o passo registrado antes de fechar a unidade.');
        if (
          job.state !== 'active' ||
          job.paused ||
          job.currentWorkflowId !== workId(data.workflowId)
        )
          fail('Confira a unidade ativa antes de avançar.');
        const row = await tx.get(db.doc(c.path + '/literaryWorkflowJobs/' + job.currentWorkflowId)),
          child = row.data();
        if (
          !child ||
          child.actorId !== uid ||
          child.jobId !== job.currentWorkflowId ||
          child.chapterId !== job.chapters[job.index]?.id ||
          digest(child.bookBirth) !== digest(job.bookBirth) ||
          child.phase !== 'done' ||
          child.registrationState !== 'active' ||
          child.sequence?.id !== job.jobId ||
          digest(child.sequence?.birth) !== digest(job.birth) ||
          child.sequence?.index !== job.index ||
          digest(child.workflowBirth) !== digest(workflowBirth(row))
        )
          fail('Conclua o ciclo nativo da unidade antes de passar ao próximo capítulo.');
        const review = (
            await tx.get(db.doc(c.path + '/literaryReviewJobs/' + child.reviewId))
          ).data(),
          source = await readLiteraryReviewSource(tx, c, child.chapterId);
        if (
          !review ||
          review.chapterId !== child.chapterId ||
          review.workflow?.id !== child.jobId ||
          digest(review.workflow?.birth ?? null) !== digest(child.workflowBirth) ||
          review.units < 1 ||
          review.completedUnits !== review.units ||
          review.state !== 'done' ||
          !review.authorAccepted ||
          review.blocking !== 0 ||
          review.sourceToken !== source.token ||
          review.preservationState !== 'done' ||
          review.preservedHistoryRevision !== readWorkHistoryRevision(source.root)
        )
          fail('Reconfira a revisão e a preservação atuais antes da passagem.');
        const first = (
            await tx.get(db.doc(c.path + '/literaryMilestones/' + child.firstVersionId))
          ).data(),
          revised = (
            await tx.get(db.doc(c.path + '/literaryMilestones/' + review.revisedMilestoneId))
          ).data();
        if (
          first?.state !== 'done' ||
          first.chapterId !== child.chapterId ||
          first.kind !== 'firstDraft' ||
          revised?.state !== 'done' ||
          revised.chapterId !== child.chapterId ||
          revised.kind !== 'revised' ||
          revised.planned !== review.units ||
          revised.captured !== review.units ||
          revised.verified !== review.units ||
          revised.sourceToken !== source.manuscriptToken ||
          child.firstVersionId === review.revisedMilestoneId
        )
          fail('Preserve as duas versões completas antes de avançar.');
        const index = job.index + 1,
          done = index === job.chapters.length;
        const stop = done
          ? null
          : !job.continueBetweenChapters
            ? 'nextChapterAuthorization'
            : job.chapters[job.index].actId &&
                job.chapters[job.index].actId !== job.chapters[index].actId
              ? 'actIntegration'
              : null;
        const patch = {
          index,
          state: done ? 'done' : 'active',
          currentWorkflowId: null,
          stop,
          completed: [
            ...job.completed,
            { index: job.index, workflowId: child.jobId, birth: workflowBirth(row) },
          ],
          revision: job.revision + 1,
          ...(done ? { completedAt: workDate(now) } : {}),
        };
        const extension = await internal?.prepareCommit?.(tx, context, patch);
        const effectivePatch = { ...patch, ...extension?.patch };
        writeLiteraryBackupProcess(tx, c, 'sequence', 'update', context.ref, effectivePatch);
        extension?.commit();
        context.job = { ...job, ...effectivePatch };
        return summary(context);
      });
    },
    async setLiterarySequenceControl(uid, data, internal) {
      const c = scope(db, uid, data, [
        'jobId',
        'expectedOriginToken',
        'expectedRevision',
        'action',
        'limits',
        'authorizedPhases',
      ]);
      if (
        !['pause', 'resume', 'cancel', 'authorizeNext', 'confirmRegistration'].includes(data.action)
      )
        workFail('invalid-argument', 'Controle de execução inválido.');
      const limits = data.limits === undefined ? null : workflowLimits(data.limits),
        phases = data.authorizedPhases === undefined ? null : workflowPhases(data.authorizedPhases);
      if ((limits || phases) && !['pause', 'resume'].includes(data.action))
        workFail('invalid-argument', 'Separe a decisão de unidade da alteração de limites.');
      return db.runTransaction(async (tx) => {
        const raw = await readLiterarySequence(tx, c, workId(data.jobId));
        if (
          raw.originToken !== token(data.expectedOriginToken) ||
          raw.job.revision !== workRevision(data.expectedRevision)
        )
          fail('O controle original mudou.');
        if (raw.job.registrationState === 'registering') {
          const receipt = (await tx.get(receiptRef(c, raw.job.jobId))).data();
          if (receipt?.fingerprint !== raw.job.fingerprint)
            fail('O recibo original do registro não está disponível.');
          if (!['confirmRegistration', 'cancel'].includes(data.action))
            fail('Confirme ou cancele o registro original.');
          if (
            data.action === 'confirmRegistration' &&
            (
              await captureLiterarySequenceScope(
                tx,
                c,
                raw.job.chapters.map((v) => v.id),
              )
            ).originToken !== raw.job.scopeToken
          )
            fail('O escopo original do registro mudou.');
          const patch = {
            birth: workflowBirth(raw.snapshot),
            revision: raw.job.revision + 1,
            registrationState: data.action === 'cancel' ? 'canceled' : 'active',
            ...(data.action === 'cancel' ? { state: 'canceled', paused: true } : {}),
          };
          const extension = await internal?.prepareCommit?.(tx, raw, patch);
          const effectivePatch = { ...patch, ...extension?.patch };
          writeLiteraryBackupProcess(tx, c, 'sequence', 'update', raw.ref, effectivePatch);
          extension?.commit();
          tx.update(receiptRef(c, raw.job.jobId), {
            status: data.action === 'cancel' ? 'canceled' : 'done',
            birth: patch.birth,
          });
          raw.job = { ...raw.job, ...effectivePatch };
          return summary(raw);
        }
        const closing = ['pause', 'cancel'].includes(data.action),
          context = await checked(tx, c, data, closing),
          { job } = context;
        if (['done', 'canceled'].includes(job.state))
          fail('Esta execução não aceita nova autorização.');
        if (
          limits &&
          (limits.maxApplications < job.applications ||
            limits.maxCredits < job.credits ||
            limits.maxSteps < job.steps)
        )
          workFail('invalid-argument', 'Os limites precisam preservar o consumo já ocorrido.');
        if (phases && job.collaboration.mode !== 'continuous' && phases.length)
          fail('O contrato não permite fases contínuas.');
        if (data.action === 'confirmRegistration') fail('O registro já está ativo.');
        if (
          data.action === 'authorizeNext' &&
          (job.currentWorkflowId || job.stop !== 'nextChapterAuthorization')
        )
          fail('A próxima unidade não aguarda autorização.');
        const row = job.currentWorkflowId
            ? await tx.get(db.doc(c.path + '/literaryWorkflowJobs/' + job.currentWorkflowId))
            : null,
          child = row?.data();
        const ownChild =
          child &&
          child.actorId === uid &&
          child.sequence?.id === job.jobId &&
          digest(child.sequence?.birth) === digest(job.birth) &&
          child.sequence?.index === job.index &&
          (child.registrationState === 'registering' ||
            digest(child.workflowBirth) === digest(workflowBirth(row)));
        const draftRef = ownChild ? db.doc(c.path + '/literaryDraftJobs/' + child.draftId) : null,
          reviewRef = ownChild ? db.doc(c.path + '/literaryReviewJobs/' + child.reviewId) : null,
          draft = draftRef ? (await tx.get(draftRef)).data() : null,
          review = reviewRef ? (await tx.get(reviewRef)).data() : null,
          pendingRef =
            ownChild && child.busyStep
              ? db.doc(c.path + '/literaryOperations/' + child.busyStep)
              : null,
          pending = pendingRef ? (await tx.get(pendingRef)).data() : null;
        const sequencePendingRef = job.busyStep ? receiptRef(c, job.busyStep) : null,
          sequencePending = sequencePendingRef ? (await tx.get(sequencePendingRef)).data() : null;
        const paused =
          data.action === 'pause' || data.action === 'cancel'
            ? true
            : data.action === 'resume'
              ? false
              : job.paused;
        const patch = {
          paused,
          busyStep: null,
          revision: job.revision + 1,
          ...(data.action === 'cancel' ? { state: 'canceled', stop: null } : {}),
          ...(data.action === 'authorizeNext' ? { stop: null } : {}),
          ...(data.action === 'resume' &&
          ['attention', 'budget', 'phaseAuthorization', 'awaitingResult'].includes(job.stop)
            ? { stop: null }
            : {}),
          ...(limits ? { limits } : {}),
          ...(phases ? { authorizedPhases: phases } : {}),
        };
        const dependencies = await prepareLiteraryDependencyWrite(tx, c);
        const extension = await internal?.prepareCommit?.(tx, context, patch);
        const effectivePatch = { ...patch, ...extension?.patch };
        if (ownChild && ['pause', 'resume', 'cancel'].includes(data.action)) {
          tx.update(row.ref, {
            paused,
            revision: child.revision + 1,
            busyStep: null,
            ...(data.action === 'cancel' ? { phase: 'canceled' } : {}),
          });
          if (
            draft?.workflow?.id === child.jobId &&
            digest(draft.workflow.birth) === digest(workflowBirth(row))
          )
            tx.update(draftRef, {
              paused,
              controlRevision: (draft.controlRevision ?? 0) + 1,
              ...(data.action === 'cancel' ? { state: 'canceled' } : {}),
            });
          if (
            review?.workflow?.id === child.jobId &&
            digest(review.workflow.birth) === digest(workflowBirth(row))
          )
            tx.update(reviewRef, {
              paused,
              ...(data.action === 'cancel' ? { state: 'canceled' } : {}),
            });
          if (pending?.status === 'running') tx.update(pendingRef, { status: 'superseded' });
        }
        if (
          sequencePending?.method === 'advanceLiterarySequence' &&
          sequencePending.status === 'running' &&
          sequencePending.id === job.jobId &&
          sequencePending.actorId === uid &&
          digest(sequencePending.birth) === digest(job.birth)
        )
          tx.update(sequencePendingRef, { status: 'superseded' });
        writeLiteraryBackupProcess(tx, c, 'sequence', 'update', context.ref, effectivePatch);
        extension?.commit();
        dependencies.commit();
        context.job = { ...job, ...effectivePatch };
        return summary(context);
      });
    },
  };
  return api;
}
