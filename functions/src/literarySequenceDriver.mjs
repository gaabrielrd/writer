import { writeLiteraryBackupProcess } from './literaryBackupFence.mjs';
import { workflowLimits, workflowPhases } from './literaryExecutionContracts.mjs';
import {
  workScope,
  workId,
  workLimit,
  workProject,
  workRevision,
  workFail,
  workDate,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { validateId } from './generation.mjs';
import { readLiteraryPublicationPolicy } from './literaryPublicationPolicy.mjs';
import { readLiteraryIntegrationChapter } from './literaryIntegrationSources.mjs';
import { workflowBirth } from './literaryWorkflowOrigins.mjs';
import {
  readLiterarySequence,
  assertLiterarySequenceIdentity,
} from './literarySequenceContracts.mjs';
import { createLiterarySequenceService } from './literarySequence.mjs';
import { createLiteraryWorkflowService } from './literaryWorkflow.mjs';
const scope = (db, uid, data, keys) => {
  const c = workScope(db, uid, data, keys);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return c;
};
const token = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value))
    workFail('invalid-argument', 'Confira a origem observada da execução.');
  return value;
};
const fail = (message, reason = 'sequence-step') =>
  workFail('failed-precondition', message, reason);
const result = (job, disposition = 'advanced') => ({
  disposition,
  index: job.index,
  currentWorkflowId: job.currentWorkflowId,
  state: job.state,
  paused: job.paused,
  stop: job.stop ?? null,
});
const soft = ['failed-precondition', 'not-found', 'permission-denied', 'resource-exhausted'];
/** Serialized public driver. Only its explicit domain methods may be routed. */
export function createLiterarySequenceDriver({
  db,
  generator,
  now = Date.now,
  sequences = createLiterarySequenceService({ db, now }),
  workflows = createLiteraryWorkflowService({ db, generator, now }),
}) {
  const op = (c, id) => db.doc(c.path + '/literaryOperations/' + id);
  const childRef = (c, id) => db.doc(c.path + '/literaryWorkflowJobs/' + id);
  const childOperation = (step, kind) =>
    'sequence-child-' +
    digest({ operationId: step.operationId, origin: step.expectedOriginToken, kind });
  const receipt = (context, method, fingerprint, revision, status, extra = {}) => ({
    method,
    fingerprint,
    id: context.job.jobId,
    actorId: context.job.actorId,
    bookBirth: context.job.bookBirth,
    birth: context.job.birth ?? null,
    revision,
    status,
    updatedAt: workDate(now),
    ...extra,
  });
  async function original(tx, c, id, expectedOriginToken) {
    const context = await readLiterarySequence(tx, c, id);
    if (context.originToken !== expectedOriginToken)
      fail('A instância original da execução mudou.', 'sequence-origin');
    await assertLiterarySequenceIdentity(tx, c, context, { closing: true });
    return context;
  }
  async function active(tx, c, id, step) {
    const context = await original(tx, c, id, step.expectedOriginToken);
    const { job } = context;
    await assertLiterarySequenceIdentity(tx, c, context);
    if (
      job.paused ||
      job.state !== 'active' ||
      job.revision !== step.expectedRevision ||
      job.busyStep !== step.operationId
    )
      fail('O controle mudou. Recupere ou consulte o passo original.');
    return context;
  }
  async function frame(uid, target, id) {
    const job = await sequences.getLiterarySequence(uid, { target, jobId: id });
    if (
      job.registrationState !== 'active' ||
      job.paused ||
      ['stale', 'canceled', 'done'].includes(job.state) ||
      !job.currentWorkflowId
    )
      return { job };
    const workflow = await workflows.getLiteraryWorkflow(uid, {
      target,
      jobId: job.currentWorkflowId,
    });
    // Re-read after the native view: a concurrent control may have closed/replaced this unit.
    const latest = await sequences.getLiterarySequence(uid, { target, jobId: id });
    if (
      latest.originToken !== job.originToken ||
      latest.currentWorkflowId !== workflow.job.jobId ||
      latest.paused ||
      latest.state !== 'active'
    )
      return { job: latest };
    return { job: latest, workflow, waitingForResult: workflow.waitingForResult === true };
  }
  async function freeze(c, id, step, previousKind, action) {
    return db.runTransaction(async (tx) => {
      await active(tx, c, id, step);
      const saved = (await tx.get(op(c, step.operationId))).data();
      if (saved?.fingerprint !== step.fingerprint || saved.status !== 'running')
        fail('O passo original foi encerrado.');
      if (saved.action.kind !== previousKind) return saved.action;
      tx.update(op(c, step.operationId), { action });
      return action;
    });
  }
  async function finish(c, id, step, patch = {}, disposition = 'advanced') {
    await db.runTransaction(async (tx) => {
      const context = await original(tx, c, id, step.expectedOriginToken),
        { job } = context;
      const saved = (await tx.get(op(c, step.operationId))).data();
      if (!saved || saved.fingerprint !== step.fingerprint || saved.status !== 'running') return;
      if (
        job.revision !== step.expectedRevision ||
        job.busyStep !== step.operationId ||
        job.paused ||
        job.state !== 'active'
      ) {
        tx.update(op(c, step.operationId), { status: 'superseded' });
        return;
      }
      const next = { ...job, ...patch, busyStep: null, revision: job.revision + 1 };
      writeLiteraryBackupProcess(tx, c, 'sequence', 'update', context.ref, {
        ...patch,
        busyStep: null,
        revision: next.revision,
      });
      tx.update(op(c, step.operationId), {
        status: 'done',
        revision: next.revision,
        result: result(next, disposition),
        updatedAt: workDate(now),
      });
    });
  }
  async function existingOutcome(c, id, operationId, expectedOriginToken, fingerprint) {
    return db.runTransaction(async (tx) => {
      const context = await readLiterarySequence(tx, c, id);
      if (context.originToken !== expectedOriginToken)
        fail('A origem da operação mudou.', 'sequence-origin');
      const saved = (await tx.get(op(c, operationId))).data();
      if (!saved) return null;
      const book = await readWorkMetadata(tx, c.ref, []);
      if (digest(context.job.bookBirth) !== digest(workflowBirth(book)))
        fail('O livro original foi recriado.', 'sequence-origin');
      if (
        saved.fingerprint !== fingerprint ||
        saved.id !== id ||
        saved.actorId !== c.uid ||
        digest(saved.bookBirth) !== digest(context.job.bookBirth) ||
        digest(saved.birth) !== digest(workflowBirth(context.snapshot))
      )
        workFail('invalid-argument', 'Operação usada por outro pedido ou origem.');
      return saved;
    });
  }
  const api = {
    getLiterarySequenceScope: sequences.getLiterarySequenceScope,
    async listLiterarySequences(uid, data) {
      const c = scope(db, uid, data, ['afterId', 'limit']),
        afterId = data.afterId == null ? null : workId(data.afterId),
        limit = workLimit(data.limit);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const book = await readWorkMetadata(tx, c.ref, []);
        let query = db
          .collection(c.path + '/literarySequenceJobs')
          .orderBy('__name__')
          .limit(limit)
          .select(
            'jobId',
            'actorId',
            'bookBirth',
            'birth',
            'registrationState',
            'revision',
            'state',
            'paused',
            'index',
            'chapters',
            'createdAt',
            'completedAt',
          );
        if (afterId) query = query.startAfter(afterId);
        const page = await tx.get(query),
          items = [];
        for (const row of page.docs) {
          const value = row.data();
          if (value.actorId !== uid || digest(value.bookBirth) !== digest(workflowBirth(book)))
            continue;
          if (
            value.jobId !== row.id ||
            !Array.isArray(value.chapters) ||
            value.chapters.length < 1 ||
            value.chapters.length > 25 ||
            !Number.isSafeInteger(value.index) ||
            value.index < 0 ||
            value.index > value.chapters.length ||
            !Number.isSafeInteger(value.revision) ||
            value.revision < 1
          )
            continue;
          items.push({
            jobId: row.id,
            registrationState: value.registrationState,
            state:
              value.registrationState === 'active' &&
              digest(value.birth) !== digest(workflowBirth(row))
                ? 'stale'
                : value.state,
            paused: value.paused === true,
            revision: value.revision,
            index: value.index,
            chapterCount: value.chapters.length,
            createdAt: value.createdAt,
            completedAt: value.completedAt ?? null,
          });
        }
        // The cursor follows the scanned page, including unavailable rows.
        return { items, nextAfterId: page.docs.length === limit ? page.docs.at(-1).id : null };
      });
    },
    async startLiterarySequence(uid, data) {
      const registered = await sequences.startLiterarySequence(uid, data);
      return frame(uid, data.target, registered.jobId);
    },
    async getLiterarySequence(uid, data) {
      const c = scope(db, uid, data, ['jobId']);
      return frame(uid, c.target, workId(data.jobId));
    },
    async getLiterarySequenceOperation(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'operationId']),
        id = workId(data.jobId),
        operationId = validateId(data.operationId);
      return db.runTransaction(async (tx) => {
        const context = await readLiterarySequence(tx, c, id),
          saved = (await tx.get(op(c, operationId))).data(),
          book = await readWorkMetadata(tx, c.ref, []);
        if (!saved) return { state: 'unconfirmed' };
        if (
          ![
            'startLiterarySequence',
            'advanceLiterarySequence',
            'setLiterarySequenceControl',
          ].includes(saved.method) ||
          saved.id !== id ||
          saved.actorId !== uid ||
          digest(saved.bookBirth) !== digest(workflowBirth(book)) ||
          digest(context.job.bookBirth) !== digest(workflowBirth(book))
        )
          fail('Recibo de outra origem.');
        if (
          !['registering', 'running', 'done', 'superseded', 'canceled'].includes(saved.status) ||
          !Number.isSafeInteger(saved.revision) ||
          saved.revision < 1
        )
          fail('Recibo de execução inválido.');
        if (saved.status === 'registering' && context.job.registrationState === 'registering')
          return { state: 'unconfirmed' };
        if (
          digest(saved.birth) !== digest(workflowBirth(context.snapshot)) ||
          digest(context.job.birth) !== digest(saved.birth)
        )
          fail('A origem nativa do recibo foi recriada.', 'sequence-origin');
        return {
          state:
            saved.status === 'running'
              ? 'running'
              : ['superseded', 'canceled'].includes(saved.status)
                ? 'superseded'
                : 'confirmed',
          method: saved.method,
          id,
          revision: saved.revision,
          updatedAt: saved.updatedAt,
          requestHash: saved.requestHash ?? null,
          ...(saved.result ? { result: saved.result } : {}),
        };
      });
    },
    async advanceLiterarySequence(uid, data) {
      const c = scope(db, uid, data, [
          'jobId',
          'operationId',
          'expectedRevision',
          'expectedOriginToken',
          'actIntegrationId',
          'admissionInspectionId',
          'previousWorkflowId',
          'requestHash',
        ]),
        id = workId(data.jobId),
        operationId = validateId(data.operationId),
        expectedRevision = workRevision(data.expectedRevision),
        expectedOriginToken = token(data.expectedOriginToken),
        actIntegrationId = data.actIntegrationId == null ? null : workId(data.actIntegrationId),
        admissionInspectionId =
          data.admissionInspectionId == null ? null : validateId(data.admissionInspectionId),
        previousWorkflowId =
          data.previousWorkflowId == null ? null : workId(data.previousWorkflowId),
        requestHash = data.requestHash === undefined ? null : token(data.requestHash),
        fingerprint = digest({
          method: 'advanceLiterarySequence',
          ...(requestHash ? { requestHash } : {}),
          uid,
          target: c.target,
          id,
          expectedRevision,
          expectedOriginToken,
          actIntegrationId,
          ...(admissionInspectionId ? { admissionInspectionId } : {}),
          ...(previousWorkflowId ? { previousWorkflowId } : {}),
        }),
        step = { operationId, expectedRevision, expectedOriginToken, fingerprint };
      let action = await db.runTransaction(async (tx) => {
        const context = await original(tx, c, id, expectedOriginToken),
          { job } = context,
          saved = (await tx.get(op(c, operationId))).data();
        if (saved) {
          if (saved.fingerprint !== fingerprint || digest(saved.birth) !== digest(job.birth))
            workFail('invalid-argument', 'Passo usado por outro pedido.');
          return saved.status === 'running' ? saved.action : null;
        }
        await assertLiterarySequenceIdentity(tx, c, context);
        if (
          job.revision !== expectedRevision ||
          job.busyStep ||
          job.paused ||
          job.state !== 'active'
        )
          fail('Consulte ou recupere o passo pendente antes de avançar.');
        let chosen;
        if (job.currentWorkflowId) {
          if (actIntegrationId || admissionInspectionId || previousWorkflowId)
            workFail(
              'invalid-argument',
              'As condições de entrada pertencem ao registro da próxima unidade.',
            );
          chosen = { kind: 'inspectWorkflow', workflowId: job.currentWorkflowId, index: job.index };
        } else if (job.stop === 'nextChapterAuthorization')
          chosen = { kind: 'wait', stop: job.stop };
        else if (
          job.steps >= job.limits.maxSteps ||
          (job.collaboration.mode !== 'guidance' &&
            (job.applications >= job.limits.maxApplications ||
              job.credits >= job.limits.maxCredits))
        )
          chosen = { kind: 'wait', stop: 'budget' };
        else {
          const canonicalPrevious = job.index > 0 ? job.completed.at(-1).workflowId : null;
          if (job.index > 0 && previousWorkflowId && previousWorkflowId !== canonicalPrevious)
            workFail('invalid-argument', 'Preserve a predecessora concluída desta sequência.');
          const previous = canonicalPrevious ?? previousWorkflowId;
          let previousActId = job.index > 0 ? job.chapters[job.index - 1].actId : null;
          if (job.index === 0 && previous) {
            const native = (
              await readWorkMetadata(tx, childRef(c, previous), [
                'actorId',
                'chapterId',
                'registrationState',
              ])
            ).data();
            if (!native || native.actorId !== uid || native.registrationState !== 'active')
              fail('Escolha um ciclo anterior autorizado e concluído.', 'workflow-passage');
            previousActId = (await readLiteraryIntegrationChapter(tx, c, workId(native.chapterId)))
              .actId;
          }
          const policy = await readLiteraryPublicationPolicy(tx, c);
          const crossesAct =
            previous && previousActId && previousActId !== job.chapters[job.index].actId;
          if (actIntegrationId && !crossesAct)
            workFail('invalid-argument', 'Escolha integração somente ao sair de um ato.');
          if (policy.policy?.requirePreviousPublication === true && !admissionInspectionId)
            chosen = { kind: 'wait', stop: 'publication' };
          else if (crossesAct && !actIntegrationId)
            chosen = { kind: 'wait', stop: 'actIntegration' };
          else
            chosen = {
              kind: 'prepareWorkflow',
              index: job.index,
              workflowId: 'sequence-unit-' + digest({ id, birth: job.birth, index: job.index }),
              passage: previous
                ? {
                    previousWorkflowId: previous,
                    actIntegrationId,
                    ...(admissionInspectionId ? { inspectionId: admissionInspectionId } : {}),
                  }
                : null,
              ...(admissionInspectionId ? { admissionInspectionId } : {}),
            };
        }
        writeLiteraryBackupProcess(tx, c, 'sequence', 'update', context.ref, {
          busyStep: operationId,
        });
        tx.create(
          op(c, operationId),
          receipt(context, 'advanceLiterarySequence', fingerprint, expectedRevision, 'running', {
            action: chosen,
            requestHash,
            request: {
              expectedRevision,
              expectedOriginToken,
              actIntegrationId,
              requestHash,
              ...(admissionInspectionId ? { admissionInspectionId } : {}),
              ...(previousWorkflowId ? { previousWorkflowId } : {}),
            },
          }),
        );
        return chosen;
      });
      if (!action) return frame(uid, c.target, id);
      try {
        let context = await db.runTransaction((tx) => active(tx, c, id, step));
        if (action.kind === 'prepareWorkflow') {
          const job = context.job,
            chapterId = job.chapters[action.index].id;
          const source = await workflows.getLiteraryWorkflowScope(uid, {
            target: c.target,
            chapterId,
            ...(action.passage ? { passage: action.passage } : {}),
            ...(action.admissionInspectionId
              ? { admissionInspectionId: action.admissionInspectionId }
              : {}),
          });
          const wire = {
            target: c.target,
            jobId: action.workflowId,
            chapterId,
            expectedScopeToken: source.originToken,
            instruction: job.instruction,
            generation: job.generation,
            limits: {
              maxApplications: job.limits.maxApplications - job.applications,
              maxCredits: job.limits.maxCredits - job.credits,
              maxSteps: job.limits.maxSteps - job.steps,
            },
            authorizedPhases: job.authorizedPhases,
            ...(action.passage ? { passage: action.passage } : {}),
            ...(action.admissionInspectionId
              ? { admissionInspectionId: action.admissionInspectionId }
              : {}),
          };
          action = await freeze(c, id, step, 'prepareWorkflow', { kind: 'startWorkflow', wire });
        }
        if (action.kind === 'inspectWorkflow') {
          const observed = await workflows.getLiteraryWorkflow(uid, {
            target: c.target,
            jobId: action.workflowId,
          });
          context = await db.runTransaction(async (tx) => {
            const current = await active(tx, c, id, step),
              native = await tx.get(childRef(c, action.workflowId)),
              child = native.data();
            if (
              !child ||
              child.actorId !== uid ||
              child.sequence?.id !== id ||
              child.sequence.index !== current.job.index ||
              digest(child.sequence.birth) !== digest(current.job.birth)
            )
              fail('A unidade observada não pertence à execução.');
            return current;
          });
          const child = observed.job;
          let chosen;
          if (child.registrationState === 'registering')
            chosen = {
              kind: 'confirmWorkflow',
              wire: {
                target: c.target,
                jobId: child.jobId,
                operationId: childOperation(step, 'registration'),
                action: 'confirmRegistration',
                expectedRevision: child.revision,
                expectedOriginToken: child.originToken,
              },
            };
          else if (['stale', 'canceled'].includes(child.phase))
            chosen = { kind: 'wait', stop: 'reconciliation' };
          else if (child.paused) chosen = { kind: 'wait', stop: 'chapterPaused' };
          else if (child.phase === 'done')
            chosen = { kind: 'completeWorkflow', workflowId: child.jobId };
          else if (observed.waitingForResult) chosen = { kind: 'wait', stop: 'awaitingResult' };
          else if (child.stop === 'budget') {
            const parent = context.job,
              spentApplications = child.priorApplications + (observed.draft?.job.drafted ?? 0),
              spentCredits =
                child.priorCredits +
                (observed.draft?.job.chargedCredits ?? observed.draft?.job.drafted ?? 0),
              limits = {
                maxApplications:
                  spentApplications + parent.limits.maxApplications - parent.applications,
                maxCredits: spentCredits + parent.limits.maxCredits - parent.credits,
                maxSteps: child.steps + parent.limits.maxSteps - parent.steps,
              };
            chosen =
              limits.maxSteps > 0 &&
              Object.keys(limits).some((key) => limits[key] > child.limits[key])
                ? {
                    kind: 'amendWorkflow',
                    wire: {
                      target: c.target,
                      jobId: child.jobId,
                      operationId: childOperation(step, 'limits'),
                      expectedRevision: child.revision,
                      expectedOriginToken: child.originToken,
                      action: 'resume',
                      limits,
                    },
                  }
                : { kind: 'wait', stop: 'budget' };
          } else if (child.stop && !['preparation', 'scene', 'existingText'].includes(child.stop))
            chosen = { kind: 'wait', stop: child.stop };
          else if (['scene', 'existingText'].includes(child.stop)) {
            const nativeWaiting = observed.draft?.job.state;
            chosen = ['awaitingAcceptance', 'existingText'].includes(nativeWaiting)
              ? { kind: 'wait', stop: child.stop }
              : {
                  kind: 'advanceWorkflow',
                  wire: {
                    target: c.target,
                    jobId: child.jobId,
                    operationId: child.busyStep ?? childOperation(step, 'advance'),
                    expectedRevision: child.revision,
                    expectedOriginToken: child.originToken,
                  },
                };
          } else
            chosen = {
              kind: 'advanceWorkflow',
              wire: {
                target: c.target,
                jobId: child.jobId,
                operationId: child.busyStep ?? childOperation(step, 'advance'),
                expectedRevision: child.revision,
                expectedOriginToken: child.originToken,
              },
            };
          action = await freeze(c, id, step, 'inspectWorkflow', chosen);
        }
        const guard = async (tx) => active(tx, c, id, step);
        if (action.kind === 'wait') await finish(c, id, step, { stop: action.stop }, 'waiting');
        else if (action.kind === 'startWorkflow') {
          const hooks = sequences.workflowHooks(uid, {
            target: c.target,
            jobId: id,
            expectedOriginToken,
          });
          await workflows.startLiteraryWorkflow(uid, action.wire, {
            prepareStart: async (tx, ctx, details) => {
              await guard(tx);
              return hooks.prepareStart(tx, ctx, details);
            },
            beforeActivate: guard,
          });
          await finish(c, id, step, { stop: null });
        } else if (
          action.kind === 'advanceWorkflow' ||
          action.kind === 'confirmWorkflow' ||
          action.kind === 'amendWorkflow'
        ) {
          const observed =
            action.kind === 'advanceWorkflow'
              ? await workflows.advanceLiteraryWorkflow(uid, action.wire, { beforeAdvance: guard })
              : await workflows.setLiteraryWorkflowControl(uid, action.wire, {
                  beforeControl: guard,
                });
          await finish(c, id, step, {
            stop: observed.waitingForResult ? 'awaitingResult' : (observed.job.stop ?? null),
          });
        } else if (action.kind === 'completeWorkflow') {
          await sequences.completeLiterarySequenceChapter(
            uid,
            {
              target: c.target,
              jobId: id,
              workflowId: action.workflowId,
              expectedRevision,
              expectedOriginToken,
            },
            {
              prepareCommit: async (tx, current, patch) => {
                await guard(tx);
                const saved = (await tx.get(op(c, operationId))).data();
                if (saved?.fingerprint !== fingerprint || saved.status !== 'running')
                  fail('O passo original foi encerrado.');
                return {
                  patch: { busyStep: null },
                  commit() {
                    tx.update(op(c, operationId), {
                      status: 'done',
                      revision: patch.revision,
                      updatedAt: workDate(now),
                      result: result({ ...current.job, ...patch }, 'completedUnit'),
                    });
                  },
                };
              },
            },
          );
        }
      } catch (cause) {
        const saved = await existingOutcome(c, id, operationId, expectedOriginToken, fingerprint);
        if (saved?.status === 'done' || saved?.status === 'superseded')
          return frame(uid, c.target, id);
        if (!soft.includes(cause.code)) throw cause;
        const reason = cause.details?.reason;
        await finish(
          c,
          id,
          step,
          {
            stop:
              reason === 'sequence-budget'
                ? 'budget'
                : reason === 'sequence-phase'
                  ? 'phaseAuthorization'
                  : reason === 'workflow-publication'
                    ? 'publication'
                    : reason === 'workflow-passage'
                      ? 'actIntegration'
                      : 'attention',
            errorCode: cause.code,
          },
          'stopped',
        );
      }
      return frame(uid, c.target, id);
    },
    async resumeLiterarySequenceOperation(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'operationId']),
        id = workId(data.jobId),
        operationId = validateId(data.operationId);
      const outcome = await api.getLiterarySequenceOperation(uid, data);
      if (outcome.state === 'unconfirmed') fail('O passo original não foi confirmado.');
      if (outcome.method !== 'advanceLiterarySequence')
        fail('Somente um avanço registrado pode ser retomado por esta ação.');
      if (outcome.state !== 'running') return frame(uid, c.target, id);
      const request = await db.runTransaction(async (tx) => {
        const context = await readLiterarySequence(tx, c, id),
          saved = (await tx.get(op(c, operationId))).data();
        await assertLiterarySequenceIdentity(tx, c, context, { closing: true });
        if (
          saved?.method !== 'advanceLiterarySequence' ||
          saved.id !== id ||
          saved.actorId !== uid ||
          digest(saved.birth) !== digest(context.job.birth) ||
          saved.status !== 'running' ||
          context.job.busyStep !== operationId
        )
          fail('Consulte novamente o resultado do passo original.');
        const request = saved.request;
        if (
          !request ||
          Object.keys(request).sort().join(',') !==
            [
              'actIntegrationId',
              'expectedOriginToken',
              'expectedRevision',
              'requestHash',
              ...(request.admissionInspectionId !== undefined ? ['admissionInspectionId'] : []),
              ...(request.previousWorkflowId !== undefined ? ['previousWorkflowId'] : []),
            ]
              .sort()
              .join(',') ||
          (request.admissionInspectionId !== undefined &&
            validateId(request.admissionInspectionId) !== request.admissionInspectionId) ||
          (request.previousWorkflowId !== undefined &&
            workId(request.previousWorkflowId) !== request.previousWorkflowId) ||
          workRevision(request.expectedRevision) !== saved.revision ||
          token(request.expectedOriginToken) !== context.originToken ||
          (request.actIntegrationId !== null &&
            workId(request.actIntegrationId) !== request.actIntegrationId) ||
          request.requestHash !== (saved.requestHash ?? null) ||
          (request.requestHash !== null && token(request.requestHash) !== request.requestHash) ||
          digest({
            method: 'advanceLiterarySequence',
            uid,
            target: c.target,
            id,
            expectedRevision: request.expectedRevision,
            expectedOriginToken: request.expectedOriginToken,
            actIntegrationId: request.actIntegrationId,
            ...(request.admissionInspectionId
              ? { admissionInspectionId: request.admissionInspectionId }
              : {}),
            ...(request.previousWorkflowId
              ? { previousWorkflowId: request.previousWorkflowId }
              : {}),
            ...(request.requestHash ? { requestHash: request.requestHash } : {}),
          }) !== saved.fingerprint
        )
          fail('A referência original do avanço não está disponível.');
        return request;
      });
      // Explicit recovery uses only the server's immutable request and frozen action.
      return api.advanceLiterarySequence(uid, {
        target: c.target,
        jobId: id,
        operationId,
        expectedRevision: request.expectedRevision,
        expectedOriginToken: request.expectedOriginToken,
        actIntegrationId: request.actIntegrationId,
        ...(request.admissionInspectionId
          ? { admissionInspectionId: request.admissionInspectionId }
          : {}),
        ...(request.previousWorkflowId ? { previousWorkflowId: request.previousWorkflowId } : {}),
        ...(request.requestHash ? { requestHash: request.requestHash } : {}),
      });
    },
    async setLiterarySequenceControl(uid, data) {
      const c = scope(db, uid, data, [
          'jobId',
          'operationId',
          'expectedRevision',
          'expectedOriginToken',
          'action',
          'limits',
          'authorizedPhases',
          'requestHash',
        ]),
        id = workId(data.jobId),
        operationId = validateId(data.operationId),
        expectedOriginToken = token(data.expectedOriginToken),
        expectedRevision = workRevision(data.expectedRevision),
        requestHash = data.requestHash === undefined ? null : token(data.requestHash),
        limits = data.limits === undefined ? undefined : workflowLimits(data.limits),
        phases =
          data.authorizedPhases === undefined ? undefined : workflowPhases(data.authorizedPhases),
        fingerprint = digest({
          method: 'setLiterarySequenceControl',
          ...(requestHash ? { requestHash } : {}),
          uid,
          target: c.target,
          id,
          expectedOriginToken,
          expectedRevision,
          action: data.action,
          limits: limits ?? null,
          authorizedPhases: phases ?? null,
        });
      const prior = await existingOutcome(c, id, operationId, expectedOriginToken, fingerprint);
      if (prior) return frame(uid, c.target, id);
      const wire = {
        ...data,
        ...(limits ? { limits } : {}),
        ...(phases ? { authorizedPhases: phases } : {}),
      };
      delete wire.operationId;
      delete wire.requestHash;
      try {
        await sequences.setLiterarySequenceControl(uid, wire, {
          prepareCommit: async (tx, context, patch) => {
            const saved = (await tx.get(op(c, operationId))).data();
            if (saved) fail('O controle original já foi registrado.');
            if (context.originToken !== expectedOriginToken)
              fail('A origem original do controle mudou.');
            const pendingRef = context.job.busyStep ? op(c, context.job.busyStep) : null,
              pending = pendingRef ? (await tx.get(pendingRef)).data() : null;
            return {
              patch: { busyStep: null },
              commit() {
                if (
                  pending?.status === 'running' &&
                  pending.method === 'advanceLiterarySequence' &&
                  pending.id === id &&
                  pending.actorId === uid &&
                  digest(pending.birth) === digest(context.job.birth)
                )
                  tx.update(pendingRef, { status: 'superseded' });
                tx.create(
                  op(c, operationId),
                  receipt(
                    {
                      ...context,
                      job: { ...context.job, birth: patch.birth ?? context.job.birth },
                    },
                    'setLiterarySequenceControl',
                    fingerprint,
                    patch.revision,
                    'done',
                    { requestHash, result: result({ ...context.job, ...patch }, 'controlled') },
                  ),
                );
              },
            };
          },
        });
      } catch (cause) {
        if (!(await existingOutcome(c, id, operationId, expectedOriginToken, fingerprint)))
          throw cause;
      }
      return frame(uid, c.target, id);
    },
  };
  return api;
}
