import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { writeLiteraryBackupProcess } from './literaryBackupFence.mjs';
import { prepareSequenceApplication } from './literarySequenceContracts.mjs';
import { readWorkflowChildGrant, checkWorkflowDraftLimits } from './literaryWorkflowContracts.mjs';
import {
  normalizeLiteraryDraftExecution,
  literaryDraftBudgetReached,
} from './literaryDraftExecution.mjs';
import { readLiteraryCollaboration } from './literaryCollaboration.mjs';
import { readLiteraryPublicationPolicy } from './literaryPublicationPolicy.mjs';
import { literaryCollaborationAllowsDraft } from './literaryCollaborationProtocol.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
import {
  workScope,
  workProject,
  workId,
  workFail,
  workRevision,
  workDate,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { validateId, platformTextGeneration } from './generation.mjs';
import { editorialText } from './literaryContracts.mjs';
import { readLiteraryPersona } from './literaryPersona.mjs';
import { literaryWritingIsCurrent } from './literaryWritingContext.mjs';
import { readHistorySource } from './workHistoryContracts.mjs';
import { createWorkHistoryService } from './workHistory.mjs';
import { literaryProseText } from './literaryAIContext.mjs';
import { createLiteraryProseService } from './literaryProse.mjs';
import { createLiteraryMilestoneService } from './literaryMilestones.mjs';

const terminal = ['done', 'stale', 'canceled'];
const stamp = (snapshot, updated = false) => {
  const value = updated ? snapshot.updateTime : snapshot.createTime;
  if (!Number.isSafeInteger(value?.seconds) || !Number.isSafeInteger(value?.nanoseconds))
    workFail('failed-precondition', 'Identidade da redação indisponível.');
  return [value.seconds, value.nanoseconds];
};
function scope(db, uid, data, keys) {
  const c = workScope(db, uid, data, keys);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return c;
}
async function source(tx, c, chapterId) {
  const root = await workProject(tx, c),
    book = await tx.get(c.ref);
  const chapter = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + chapterId), [
    'bookId',
    'ownerId',
    'deleting',
    'contentMode',
    'assemblyRevision',
    'structureRevision',
    'sceneCount',
    'rankSlot',
    'rebalancing',
  ]);
  const value = chapter.data();
  if (
    !value ||
    value.deleting ||
    value.contentMode !== 'scenes' ||
    value.rebalancing ||
    (value.bookId && value.bookId !== c.target.id) ||
    (value.ownerId && value.ownerId !== c.uid)
  )
    workFail('failed-precondition', 'Use um capítulo composto por cenas, fora de reorganização.');
  const gate = (
    await readWorkMetadata(tx, c.db.doc(c.path + '/literaryPreparationGates/' + chapterId), [
      'revision',
      'stateToken',
      'manifest',
      'ready',
      'authorAccepted',
    ])
  ).data();
  if (
    !gate?.ready ||
    !gate.authorAccepted ||
    !(await literaryWritingIsCurrent(tx, c, gate.manifest))
  )
    workFail('failed-precondition', 'Confira e aceite a preparação atual antes de redigir.');
  let global = null;
  if (root.universeId) {
    const world = await readWorkMetadata(tx, c.db.doc('universes/' + workId(root.universeId)), []);
    global = world.exists ? { birth: stamp(world), updated: stamp(world, true) } : null;
  }
  const persona = await readLiteraryPersona(tx, c, { kind: 'chapter', id: chapterId });
  const collaboration = await readLiteraryCollaboration(tx, c);
  const proof = {
    ...(collaboration.configured ? { collaboration } : {}),
    personaToken: persona.metadata.versionToken,
    bookBirth: stamp(book),
    chapterBirth: stamp(chapter),
    chapterId,
    assemblyRevision: value.assemblyRevision ?? 0,
    structureRevision: value.structureRevision ?? 0,
    sceneCount: value.sceneCount ?? 0,
    slot: value.rankSlot === 'B' ? 'rankB' : 'rankA',
    sceneRevision: root.sceneRevision ?? 0,
    narrativeRevision: root.narrativeRevision ?? 0,
    literaryContextRevision: root.literaryContextRevision ?? 0,
    localLoreVersion: root.localLoreVersion ?? 0,
    universeId: root.universeId ?? null,
    global,
    gateRevision: gate.revision,
    gateToken: gate.stateToken,
  };
  return {
    root,
    chapter: value,
    proof,
    token: digest(proof),
    personaDependencies: persona.dependencies,
    collaboration,
  };
}
const summary = (job) => ({
  jobId: job.jobId,
  chapterId: job.chapterId,
  state: job.state,
  units: job.units,
  accepted: job.accepted,
  drafted: job.drafted,
  adopted: job.adopted,
  pendingRequestId: job.pendingRequestId ?? null,
  milestoneJobId: job.milestoneJobId ?? null,
  createdAt: job.createdAt,
  completedAt: job.completedAt ?? null,
  collaboration: job.collaboration ?? null,
  execution: normalizeLiteraryDraftExecution(job.execution),
  controlRevision: job.controlRevision ?? 0,
  paused: job.paused === true,
  chargedCredits: job.chargedCredits ?? job.drafted ?? 0,
  executionStop: job.executionStop ?? null,
  note: 'Primeira versão preservada não equivale a revisão, integração ou publicação.',
});
export function createLiteraryDraftService({
  db,
  generator,
  now = Date.now,
  prose = createLiteraryProseService({ db, generator, now }),
  history = createWorkHistoryService({ db, now }),
  milestones = createLiteraryMilestoneService({ db, now }),
}) {
  const ref = (c, id) => db.doc(c.path + '/literaryDraftJobs/' + id);
  const unitRef = (c, id, index) =>
    db.doc(c.path + '/literaryDraftUnits/' + digest({ jobId: id, index }));
  const captureId = (uid, c, job) =>
    'draft-version-' +
    digest({ uid, target: c.target, jobId: job.jobId, attempt: job.captureAttempt ?? 0 });
  async function current(tx, c, job) {
    await workProject(tx, c);
    if (job.state === 'canceled') return null;
    let actual;
    try {
      actual = await source(tx, c, job.chapterId);
    } catch (cause) {
      if (
        !['not-found', 'failed-precondition', 'permission-denied', 'resource-exhausted'].includes(
          cause.code,
        )
      )
        throw cause;
      await workProject(tx, c);
    }
    if (
      !actual ||
      actual.token !== job.sourceToken ||
      !literaryCollaborationAllowsDraft(
        actual.collaboration,
        normalizeLiteraryDraftExecution(job.execution),
      )
    ) {
      if (job.state !== 'stale')
        writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, job.jobId), { state: 'stale' });
      job.state = 'stale';
      return null;
    }
    return actual;
  }
  async function controller(c, id) {
    const frame = await db.runTransaction(async (tx) => {
      await workProject(tx, c);
      const job = (await tx.get(ref(c, id))).data();
      if (!job) return { response: { jobId: id, state: 'unconfirmed' } };
      const actual = await current(tx, c, job);
      if (!actual || terminal.includes(job.state)) return { response: { job: summary(job) } };
      const unit = (await tx.get(unitRef(c, id, job.accepted))).data() ?? null;
      let existing = null;
      if (job.state === 'existingText' && unit) {
        const saved = await readHistorySource(tx, db, c, { kind: 'scene', id: unit.sceneId });
        if (saved && saved.source.sourceToken === unit.existingSourceToken)
          existing = {
            sceneId: unit.sceneId,
            title: saved.source.title,
            content: saved.source.content,
            sourceToken: saved.source.sourceToken,
          };
      }
      return { job, unit, existing };
    });
    if (frame.response) return frame.response;
    return {
      job: summary(frame.job),
      unit: frame.unit ? { index: frame.unit.index, sceneId: frame.unit.sceneId } : null,
      existing: frame.existing,
      proposal: frame.job.pendingRequestId
        ? await prose.getLiteraryProse(c.uid, {
            target: c.target,
            requestId: frame.job.pendingRequestId,
          })
        : null,
    };
  }
  async function continuousFrame(c, id, controlRevision) {
    const frame = await controller(c, id);
    if (
      !frame.job ||
      frame.job.execution?.mode !== 'continuous' ||
      frame.job.paused ||
      frame.job.executionStop ||
      frame.job.controlRevision !== controlRevision ||
      frame.job.state !== 'awaitingAcceptance' ||
      !frame.proposal?.applicable ||
      frame.proposal.hasBlockingFindings
    )
      return frame;
    const requestId = frame.proposal.requestId;
    try {
      const result = await service.acceptLiteraryDraftScene(
        c.uid,
        {
          target: c.target,
          jobId: id,
          requestId,
          operationId:
            'continuous-' + digest({ uid: c.uid, target: c.target, jobId: id, requestId }),
        },
        { controlRevision },
      );
      return result.frame;
    } catch (cause) {
      if (
        !['failed-precondition', 'resource-exhausted', 'permission-denied', 'not-found'].includes(
          cause.code,
        )
      )
        throw cause;
      await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const job = (await tx.get(ref(c, id))).data();
        if (
          !job ||
          job.paused ||
          (job.controlRevision ?? 0) !== controlRevision ||
          job.pendingRequestId !== requestId ||
          terminal.includes(job.state)
        )
          return;
        writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
          executionStop:
            cause.details?.reason === 'draft-execution-budget'
              ? 'budget'
              : cause.code === 'resource-exhausted'
                ? 'credits'
                : 'attention',
        });
      });
      return controller(c, id);
    }
  }
  const service = {
    async startLiteraryDraft(uid, data, internal) {
      const c = scope(db, uid, data, [
          'jobId',
          'chapterId',
          'instruction',
          'generation',
          'execution',
        ]),
        id = validateId(data.jobId),
        chapterId = workId(data.chapterId);
      const instruction = editorialText(data.instruction ?? '', 4000),
        resolved = platformTextGeneration(data.generation, 12000);
      const generation = {
        version: 1,
        provider: 'platform',
        model: resolved.effective.model,
        reasoning: resolved.requested.reasoning,
      };
      let execution;
      try {
        execution = normalizeLiteraryDraftExecution(data.execution);
      } catch (cause) {
        workFail('invalid-argument', cause.message);
      }
      const fingerprint = digest({
        method: 'startLiteraryDraft',
        chapterId,
        instruction,
        generation,
        ...(data.execution === undefined ? {} : { execution }),
      });
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const old = (await tx.get(ref(c, id))).data();
        const receiptRef = db.doc(c.path + '/literaryOperations/' + id),
          receipt = (await tx.get(receiptRef)).data();
        if (receipt && receipt.fingerprint !== fingerprint)
          workFail('invalid-argument', 'Operação usada por outro pedido.');
        if (old) {
          if (old.state !== 'canceled' && old.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Redação usada por outro pedido.');
          if (!receipt)
            tx.create(receiptRef, {
              method: 'startLiteraryDraft',
              fingerprint,
              id,
              revision: 1,
              updatedAt: old.createdAt,
            });
          return { job: summary(old) };
        }
        const actual = await source(tx, c, chapterId);
        if (!literaryCollaborationAllowsDraft(actual.collaboration, execution))
          workFail(
            'failed-precondition',
            actual.collaboration.mode === 'guidance'
              ? 'O contrato está em orientação: conduza a escrita a partir das análises e sugestões.'
              : 'Escolha e salve o modo contínuo no contrato antes de autorizar a redação contínua.',
            'collaboration-mode',
          );
        const workflow = internal?.beforeStart ? await internal.beforeStart(tx, c, actual) : null;
        const publicationPolicy = await readLiteraryPublicationPolicy(tx, c);
        if (publicationPolicy.policy?.requirePreviousPublication === true && !workflow)
          workFail(
            'failed-precondition',
            'Inicie a redação pelo ciclo com admissão de publicação conferida.',
            'workflow-passage',
          );
        const first = await tx.get(
          db
            .collection(c.path + '/scenes')
            .where('parentId', '==', chapterId)
            .where('archived', '==', false)
            .limit(1)
            .select(),
        );
        if (!first.docs.length)
          workFail('failed-precondition', 'Planeje as cenas nativas antes de iniciar a redação.');
        const chapterBirth = literaryNativeBirth(
          await readWorkMetadata(tx, db.doc(c.path + '/chapters/' + chapterId), []),
        );
        const job = {
          schemaVersion: 1,
          captureBinding: { version: 1, chapterBirth },
          ...(workflow ? { workflow } : {}),
          jobId: id,
          chapterId,
          instruction,
          generation,
          effectiveGeneration: resolved.effective,
          fingerprint,
          proof: actual.proof,
          collaboration: actual.collaboration,
          personaDependencies: actual.personaDependencies,
          sourceToken: actual.token,
          slot: actual.proof.slot,
          state: 'planning',
          cursor: null,
          units: 0,
          accepted: 0,
          drafted: 0,
          adopted: 0,
          pendingRequestId: null,
          execution,
          controlRevision: 0,
          paused: false,
          chargedCredits: 0,
          executionStop: null,
          captureAttempt: 0,
          createdAt: workDate(now),
        };
        const dependencies = await prepareLiteraryDependencyWrite(tx, c);
        writeLiteraryBackupProcess(tx, c, 'draft', 'create', ref(c, id), job);
        dependencies.commit();
        tx.create(receiptRef, {
          method: 'startLiteraryDraft',
          fingerprint,
          id,
          revision: 1,
          updatedAt: job.createdAt,
        });
        return { job: summary(job) };
      });
    },
    async getLiteraryDraft(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        id = validateId(data.jobId);
      return controller(c, id);
    },
    async advanceLiteraryDraft(uid, data, internal) {
      const c = scope(db, uid, data, ['jobId']),
        id = validateId(data.jobId);
      const action = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const job = (await tx.get(ref(c, id))).data();
        if (!job) workFail('not-found', 'Redação indisponível.');
        const grant = await readWorkflowChildGrant(tx, c, job.workflow, 'draft', id);
        if (grant?.sequence && !internal?.beforeAdvance)
          workFail('failed-precondition', 'Avance esta redação pelo ciclo original da execução.');
        await internal?.beforeAdvance?.(tx, c, job);
        if (!(await current(tx, c, job)) || terminal.includes(job.state))
          return { stop: true, controlRevision: job.controlRevision ?? 0 };
        if (job.paused || job.executionStop)
          return { stop: true, controlRevision: job.controlRevision ?? 0 };
        if (job.state === 'planning') {
          let query = db
            .collection(c.path + '/scenes')
            .where('parentId', '==', job.chapterId)
            .where('archived', '==', false)
            .orderBy(job.slot)
            .orderBy('__name__')
            .limit(20)
            .select('ownerId', job.slot);
          if (job.cursor) query = query.startAfter(job.cursor.rank, job.cursor.id);
          const page = await tx.get(query),
            last = page.docs.at(-1);
          const jobBirth = literaryNativeBirth(await readWorkMetadata(tx, ref(c, id), []));
          const rows = page.docs.map((row, index) => {
            if (row.data().ownerId !== uid || typeof row.data()[job.slot] !== 'string')
              workFail('failed-precondition', 'Cena incompatível com a composição.');
            return {
              ref: unitRef(c, id, job.units + index),
              value: {
                jobId: id,
                index: job.units + index,
                sceneId: row.id,
                captureBinding: { version: 1, jobBirth, resourceBirth: literaryNativeBirth(row) },
                state: 'pending',
                attempt: 0,
              },
            };
          });
          const count = workRevision(job.units + rows.length);
          if (page.docs.length < 20 && count === 0)
            workFail('failed-precondition', 'A composição não tem cenas ordenadas.');
          rows.forEach((row) => tx.create(row.ref, row.value));
          writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
            units: count,
            cursor: last ? { rank: last.data()[job.slot], id: last.id } : job.cursor,
            state: page.docs.length === 20 ? 'planning' : 'writing',
          });
          return { stop: true, controlRevision: job.controlRevision ?? 0 };
        }
        if (job.state === 'preserving') return { capture: true, job };
        if (['awaitingAcceptance', 'existingText', 'attention'].includes(job.state))
          return { stop: true, controlRevision: job.controlRevision ?? 0 };
        const unit = (await tx.get(unitRef(c, id, job.accepted))).data();
        if (!unit) {
          if (job.units === 0 || job.accepted !== job.units)
            workFail('failed-precondition', 'A redação ainda tem unidades pendentes.');
          const milestoneJobId = captureId(uid, c, job);
          writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
            state: 'preserving',
            milestoneJobId,
          });
          return { stop: true, controlRevision: job.controlRevision ?? 0 };
        }
        if (
          literaryDraftBudgetReached(
            normalizeLiteraryDraftExecution(job.execution),
            job.drafted,
            job.chargedCredits ?? job.drafted,
          )
        ) {
          writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
            executionStop: 'budget',
          });
          return { stop: true, controlRevision: job.controlRevision ?? 0 };
        }
        const requestId =
          unit.requestId ??
          'draft-' +
            digest({ uid, target: c.target, jobId: id, index: unit.index, attempt: unit.attempt });
        return { job, unit, requestId };
      });
      if (action.stop) return continuousFrame(c, id, action.controlRevision);
      if (action.capture) {
        let milestone = await milestones.getLiteraryMilestone(uid, {
          target: c.target,
          jobId: action.job.milestoneJobId,
        });
        if (milestone.state === 'unconfirmed')
          milestone = await milestones.startLiteraryMilestone(uid, {
            target: c.target,
            jobId: action.job.milestoneJobId,
            chapterId: action.job.chapterId,
            kind: 'firstDraft',
          });
        else if (['planning', 'capturing', 'verifying'].includes(milestone.state))
          milestone = await milestones.advanceLiteraryMilestone(uid, {
            target: c.target,
            jobId: action.job.milestoneJobId,
          });
        await db.runTransaction(async (tx) => {
          await workProject(tx, c);
          const job = (await tx.get(ref(c, id))).data();
          if (!job || !(await current(tx, c, job)) || job.state !== 'preserving') return;
          if (milestone.state === 'done')
            writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
              state: 'done',
              completedAt: workDate(now, job.createdAt),
            });
          else if (['stale', 'canceled'].includes(milestone.state))
            writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
              state: 'attention',
            });
        });
        return controller(c, id);
      }
      const { job, unit, requestId } = action;
      let response = await prose.getLiteraryProse(uid, { target: c.target, requestId });
      if (response.state === 'unconfirmed') {
        const info = await prose.getLiteraryProseSourceInfo(uid, {
          target: c.target,
          chapterId: job.chapterId,
          sceneId: unit.sceneId,
        });
        if (!info.empty) {
          await db.runTransaction(async (tx) => {
            await workProject(tx, c);
            const latest = (await tx.get(ref(c, id))).data();
            if (
              !latest ||
              !(await current(tx, c, latest)) ||
              latest.state !== 'writing' ||
              latest.accepted !== unit.index
            )
              return;
            tx.update(unitRef(c, id, unit.index), {
              existingSourceToken: info.sourceToken,
              state: 'existing',
            });
            writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
              state: 'existingText',
            });
          });
          return controller(c, id);
        }
        if (
          digest(platformTextGeneration(job.generation, 12000).effective) !==
          digest(job.effectiveGeneration)
        )
          workFail(
            'failed-precondition',
            'As capacidades do modelo mudaram. Registre nova redação com a configuração atual.',
          );
        const registered = await db.runTransaction(async (tx) => {
          await workProject(tx, c);
          const latest = (await tx.get(ref(c, id))).data();
          if (
            !latest ||
            !(await current(tx, c, latest)) ||
            latest.state !== 'writing' ||
            latest.accepted !== unit.index ||
            latest.paused ||
            latest.executionStop ||
            (latest.controlRevision ?? 0) !== (job.controlRevision ?? 0)
          )
            return false;
          tx.update(unitRef(c, id, unit.index), { requestId, state: 'generating' });
          writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
            pendingRequestId: requestId,
          });
          return true;
        });
        if (!registered) return controller(c, id);
        response = await prose.startLiteraryProse(
          uid,
          {
            target: c.target,
            requestId,
            chapterId: job.chapterId,
            sceneId: unit.sceneId,
            mode: 'draftScene',
            segment: 0,
            expectedSourceToken: info.sourceToken,
            instruction: job.instruction,
            generation: job.generation,
          },
          {
            readExecutionBinding: async (tx) => {
              const workflow = await readWorkflowChildGrant(tx, c, job.workflow, 'draft', id);
              return workflow?.sequence
                ? {
                    kind: 'sequenceDraft',
                    draftId: id,
                    workflowId: workflow.jobId,
                    sequence: workflow.sequence,
                  }
                : null;
            },
          },
        );
      }
      await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const latest = (await tx.get(ref(c, id))).data();
        if (
          !latest ||
          !(await current(tx, c, latest)) ||
          latest.state !== 'writing' ||
          latest.accepted !== unit.index
        )
          return;
        const state =
          response.state === 'done' && response.applicable
            ? 'awaitingAcceptance'
            : ['running', 'unconfirmed'].includes(response.state)
              ? 'writing'
              : ['stale', 'revoked', 'applied'].includes(response.state)
                ? 'stale'
                : 'attention';
        if (state === 'awaitingAcceptance') {
          const source = await readWorkMetadata(
            tx,
            db.doc(c.path + '/literaryProseRequests/' + requestId),
            [
              'requestId',
              'chapterId',
              'sceneId',
              'mode',
              'state',
              'coverage',
              'generation',
              'sourceRevision',
            ],
          );
          const stored = (
            await readWorkMetadata(tx, unitRef(c, id, unit.index), ['captureBinding'])
          ).data();
          if (source.exists) {
            const header = source.data();
            if (
              header.requestId !== requestId ||
              header.chapterId !== latest.chapterId ||
              header.sceneId !== unit.sceneId ||
              header.mode !== 'draftScene' ||
              header.state !== 'done' ||
              header.sourceRevision !== response.sourceRevision ||
              digest(draftCaptureCanonical(header.coverage ?? null)) !==
                digest(draftCaptureCanonical(response.coverage ?? null)) ||
              digest(draftCaptureCanonical(header.generation ?? null)) !==
                digest(draftCaptureCanonical(response.generation ?? null))
            )
              workFail('failed-precondition', 'A origem da proposta mudou antes do checkpoint.');
            tx.update(unitRef(c, id, unit.index), {
              captureBinding: {
                ...(stored?.captureBinding ?? {}),
                version: 1,
                jobBirth: literaryNativeBirth(await readWorkMetadata(tx, ref(c, id), [])),
                request: { id: requestId, birth: literaryNativeBirth(source) },
              },
            });
          }
        }
        writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
          state,
          pendingRequestId: requestId,
        });
      });
      const result = await continuousFrame(c, id, job.controlRevision ?? 0);
      return { ...result, waitingForResult: ['running', 'unconfirmed'].includes(response.state) };
    },
    async acceptLiteraryDraftScene(uid, data, internal) {
      const c = scope(db, uid, data, ['jobId', 'requestId', 'operationId']),
        id = validateId(data.jobId),
        requestId = validateId(data.requestId),
        operationId = validateId(data.operationId);
      const flowRef = db.doc(c.path + '/literaryDraftReceipts/' + operationId);
      const previous = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const flow = (await tx.get(flowRef)).data();
        if (flow) {
          if (flow.jobId !== id || flow.requestId !== requestId)
            workFail('invalid-argument', 'Aceite usado por outro checkpoint.');
          return (
            await tx.get(db.doc(c.path + '/literaryProseApplications/' + operationId))
          ).data();
        }
        const job = (await tx.get(ref(c, id))).data();
        if (
          !job ||
          !(await current(tx, c, job)) ||
          job.state !== 'awaitingAcceptance' ||
          job.pendingRequestId !== requestId
        )
          workFail('failed-precondition', 'A cena não aguarda este aceite. Consulte a redação.');
        return null;
      });
      if (previous) return { frame: await controller(c, id), application: previous };
      const application = await prose.applyLiteraryProse(
        uid,
        { target: c.target, requestId, operationId },
        {
          prepareCommit: async (tx, { header, write }) => {
            const job = (await tx.get(ref(c, id))).data();
            if (!job || job.state !== 'awaitingAcceptance' || job.pendingRequestId !== requestId)
              workFail('failed-precondition', 'O checkpoint não aguarda esta proposta.');
            const actual = await current(tx, c, job);
            if (!actual) workFail('failed-precondition', 'As fontes da redação mudaram.');
            const grant = await readWorkflowChildGrant(tx, c, job.workflow, 'draft', id);
            if (
              grant?.sequence &&
              digest(header.executionBinding ?? null) !==
                digest({
                  kind: 'sequenceDraft',
                  draftId: id,
                  workflowId: grant.jobId,
                  sequence: grant.sequence,
                })
            )
              workFail(
                'failed-precondition',
                'O pedido não pertence à unidade original da execução.',
              );
            const sequenceApplication = grant
              ? await prepareSequenceApplication(tx, c, grant, header.paid ? 0 : 1, !!internal)
              : { commit() {} };
            const execution = normalizeLiteraryDraftExecution(job.execution);
            checkWorkflowDraftLimits(grant, execution);
            if (
              grant &&
              (grant.priorApplications + job.drafted >= grant.limits.maxApplications ||
                grant.priorCredits + (job.chargedCredits ?? job.drafted) + (header.paid ? 0 : 1) >
                  grant.limits.maxCredits)
            )
              workFail(
                'failed-precondition',
                'Limite autorizado do ciclo atingido.',
                'workflow-budget',
              );
            if (job.paused || (internal && (job.controlRevision ?? 0) !== internal.controlRevision))
              workFail(
                'failed-precondition',
                'A autorização foi pausada ou alterada.',
                'draft-authorization-changed',
              );
            if (
              literaryDraftBudgetReached(
                execution,
                job.drafted,
                job.chargedCredits ?? job.drafted,
                header.paid ? 0 : 1,
              )
            )
              workFail(
                'resource-exhausted',
                'O limite autorizado desta redação foi atingido.',
                'draft-execution-budget',
              );
            const unit = (await tx.get(unitRef(c, id, job.accepted))).data(),
              group = write.result.groups.find((item) => item.id === job.chapterId);
            if (
              !unit ||
              unit.requestId !== requestId ||
              unit.sceneId !== header.sceneId ||
              header.mode !== 'draftScene' ||
              !group
            )
              workFail('failed-precondition', 'A proposta não corresponde à unidade atual.');
            const proof = {
              ...actual.proof,
              assemblyRevision: group.assemblyRevision,
              structureRevision: group.structureRevision,
              sceneCount: group.sceneCount,
              sceneRevision: write.result.projectRevision,
            };
            return {
              commit(receipt) {
                sequenceApplication.commit();
                tx.update(unitRef(c, id, unit.index), {
                  state: 'drafted',
                  applicationId: operationId,
                  contentHash: receipt.contentHash,
                });
                writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
                  state: 'writing',
                  accepted: job.accepted + 1,
                  drafted: job.drafted + 1,
                  chargedCredits: (job.chargedCredits ?? job.drafted) + receipt.chargedCredits,
                  executionStop: null,
                  pendingRequestId: null,
                  proof,
                  sourceToken: digest(proof),
                });
                tx.create(flowRef, {
                  jobId: id,
                  requestId,
                  index: unit.index,
                  operationId,
                  revision: receipt.revision,
                  contentHash: receipt.contentHash,
                });
              },
            };
          },
        },
      );
      // If an external application consumed this operation without our hook, do not invent a checkpoint.
      const linked = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        return (await tx.get(flowRef)).exists;
      });
      if (!linked)
        workFail(
          'failed-precondition',
          'A proposta foi aplicada fora deste fluxo. Confira o manuscrito e o recibo antes de retomar.',
        );
      return { frame: await controller(c, id), application };
    },
    async adoptLiteraryDraftScene(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'expectedSourceToken', 'unitIndex']),
        id = validateId(data.jobId),
        unitIndex = workRevision(data.unitIndex);
      const reservation = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const job = (await tx.get(ref(c, id))).data();
        const prior = (await tx.get(unitRef(c, id, unitIndex))).data();
        if (prior?.state === 'adopted' && prior.existingSourceToken === data.expectedSourceToken)
          return { replay: true };
        if (
          !job ||
          job.accepted !== unitIndex ||
          !(await current(tx, c, job)) ||
          job.state !== 'existingText'
        )
          workFail('failed-precondition', 'Nenhuma cena existente aguarda adoção.');
        const unit = (await tx.get(unitRef(c, id, job.accepted))).data();
        if (!unit || unit.existingSourceToken !== data.expectedSourceToken)
          workFail('failed-precondition', 'Confira novamente o texto existente.');
        const saved = await readHistorySource(tx, db, c, { kind: 'scene', id: unit.sceneId });
        if (
          !saved ||
          saved.source.sourceToken !== data.expectedSourceToken ||
          !literaryProseText(saved.source.content).trim()
        )
          workFail('failed-precondition', 'O texto existente mudou ou está vazio.');
        return { job, unit };
      });
      if (reservation.replay) return controller(c, id);
      const version = await history.createWorkVersion(uid, {
        target: c.target,
        resource: { kind: 'scene', id: reservation.unit.sceneId },
        operationId:
          'draft-adopt-' +
          digest({ uid, target: c.target, jobId: id, index: reservation.unit.index }),
        expectedSourceToken: data.expectedSourceToken,
        label: 'Cena existente adotada na primeira versão',
      });
      await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const job = (await tx.get(ref(c, id))).data();
        if (
          !job ||
          !(await current(tx, c, job)) ||
          job.state !== 'existingText' ||
          job.accepted !== reservation.unit.index
        )
          return;
        const sourceVersion = await readWorkMetadata(
          tx,
          db.doc(c.path + '/workVersions/' + version.version.id),
          ['id', 'target', 'resource', 'contentHash', 'deleting'],
        );
        const storedUnit = (
          await readWorkMetadata(tx, unitRef(c, id, job.accepted), ['captureBinding'])
        ).data();
        const capturedVersion = sourceVersion.data();
        if (
          sourceVersion.exists &&
          (capturedVersion.id !== version.version.id ||
            capturedVersion.deleting ||
            digest(capturedVersion.target) !== digest(c.target) ||
            capturedVersion.resource?.kind !== 'scene' ||
            capturedVersion.resource.id !== reservation.unit.sceneId ||
            capturedVersion.contentHash !== version.version.contentHash)
        )
          workFail('failed-precondition', 'A versão adotada mudou antes do checkpoint.');
        tx.update(unitRef(c, id, job.accepted), {
          captureBinding: {
            ...(storedUnit?.captureBinding ?? {}),
            version: 1,
            jobBirth: literaryNativeBirth(await readWorkMetadata(tx, ref(c, id), [])),
            history: sourceVersion.exists
              ? { id: version.version.id, birth: literaryNativeBirth(sourceVersion) }
              : null,
          },
          state: 'adopted',
          versionId: version.version.id,
          contentHash: version.version.contentHash,
        });
        writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
          state: 'writing',
          accepted: job.accepted + 1,
          adopted: job.adopted + 1,
        });
      });
      return controller(c, id);
    },
    async regenerateLiteraryDraftScene(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        id = validateId(data.jobId);
      const job = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        return (await tx.get(ref(c, id))).data();
      });
      if (
        !job?.pendingRequestId ||
        !['writing', 'awaitingAcceptance', 'attention'].includes(job.state)
      )
        workFail(
          'failed-precondition',
          'Nenhum pedido de cena pode ser regenerado neste checkpoint.',
        );
      const previous = await prose.cancelLiteraryProse(uid, {
        target: c.target,
        requestId: job.pendingRequestId,
      });
      if (previous.hasBlockingFindings)
        workFail(
          'failed-precondition',
          'Resolva os impedimentos e confira a preparação antes de gerar outra versão.',
        );
      await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const latest = (await tx.get(ref(c, id))).data();
        if (!latest || !(await current(tx, c, latest))) return;
        if (latest.pendingRequestId !== job.pendingRequestId)
          workFail('failed-precondition', 'A redação avançou. Consulte o checkpoint.');
        const unit = (await tx.get(unitRef(c, id, latest.accepted))).data();
        tx.update(unitRef(c, id, latest.accepted), {
          state: 'pending',
          requestId: null,
          attempt: workRevision(unit.attempt + 1),
        });
        writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
          state: 'writing',
          pendingRequestId: null,
        });
      });
      return controller(c, id);
    },
    async restartLiteraryDraftPreservation(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        id = validateId(data.jobId);
      await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const job = (await tx.get(ref(c, id))).data();
        if (!job || !(await current(tx, c, job))) return;
        if (job.state !== 'attention' || job.pendingRequestId || job.accepted !== job.units)
          workFail('failed-precondition', 'A preservação não aguarda uma nova tentativa.');
        const next = {
          ...job,
          captureAttempt: workRevision((job.captureAttempt ?? 0) + 1),
          state: 'preserving',
        };
        next.milestoneJobId = captureId(uid, c, next);
        writeLiteraryBackupProcess(tx, c, 'draft', 'set', ref(c, id), next);
      });
      return controller(c, id);
    },
    async setLiteraryDraftExecution(uid, data) {
      const c = scope(db, uid, data, [
        'jobId',
        'operationId',
        'expectedRevision',
        'paused',
        'execution',
      ]);
      const id = validateId(data.jobId),
        operationId = validateId(data.operationId),
        expectedRevision = workRevision(data.expectedRevision);
      if (typeof data.paused !== 'boolean')
        workFail('invalid-argument', 'Escolha pausar ou retomar a autorização.');
      let execution;
      if (data.execution !== undefined) {
        try {
          execution = normalizeLiteraryDraftExecution(data.execution);
        } catch (cause) {
          workFail('invalid-argument', cause.message);
        }
      }
      const fingerprint = digest({
        method: 'setLiteraryDraftExecution',
        id,
        expectedRevision,
        paused: data.paused,
        ...(execution ? { execution } : {}),
      });
      await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const receiptRef = db.doc(c.path + '/literaryOperations/' + operationId),
          prior = (await tx.get(receiptRef)).data();
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Operação usada por outra autorização.');
          return;
        }
        const job = (await tx.get(ref(c, id))).data();
        if (!job) workFail('not-found', 'Redação indisponível.');
        if (!(await current(tx, c, job)) || terminal.includes(job.state))
          workFail('failed-precondition', 'Esta redação não aceita nova autorização.');
        if ((job.controlRevision ?? 0) !== expectedRevision)
          workFail(
            'failed-precondition',
            'A autorização mudou. Consulte o checkpoint.',
            'revision-conflict',
          );
        const selected = execution ?? normalizeLiteraryDraftExecution(job.execution);
        checkWorkflowDraftLimits(
          await readWorkflowChildGrant(tx, c, job.workflow, 'draft', id),
          selected,
        );
        const collaboration = await readLiteraryCollaboration(tx, c);
        if (!literaryCollaborationAllowsDraft(collaboration, selected))
          workFail(
            'failed-precondition',
            'O modo salvo no contrato não permite esta execução.',
            'collaboration-mode',
          );
        if (
          selected.mode === 'continuous' &&
          (selected.maxApplications < job.drafted ||
            selected.maxCredits < (job.chargedCredits ?? job.drafted))
        )
          workFail(
            'invalid-argument',
            'Os limites totais precisam incluir o que já foi aplicado e debitado.',
          );
        const dependencies = await prepareLiteraryDependencyWrite(tx, c);
        const revision = workRevision(expectedRevision + 1),
          updatedAt = workDate(now);
        writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), {
          execution: selected,
          controlRevision: revision,
          paused: data.paused,
          executionStop: null,
        });
        dependencies.commit();
        tx.create(receiptRef, {
          method: 'setLiteraryDraftExecution',
          bookBirth: job.proof.bookBirth,
          fingerprint,
          id,
          revision,
          updatedAt,
          execution: selected,
          paused: data.paused,
          chapterId: job.chapterId,
        });
      });
      return controller(c, id);
    },
    async cancelLiteraryDraft(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        id = validateId(data.jobId);
      const job = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        let value = (await tx.get(ref(c, id))).data();
        if (!value) {
          value = {
            schemaVersion: 1,
            jobId: id,
            chapterId: null,
            state: 'canceled',
            units: 0,
            accepted: 0,
            drafted: 0,
            adopted: 0,
            createdAt: now(),
          };
          writeLiteraryBackupProcess(tx, c, 'draft', 'create', ref(c, id), value);
        } else if (!terminal.includes(value.state)) {
          writeLiteraryBackupProcess(tx, c, 'draft', 'update', ref(c, id), { state: 'canceled' });
          value = { ...value, state: 'canceled' };
        }
        return value;
      });
      if (job.state === 'canceled' && job.pendingRequestId)
        await prose.cancelLiteraryProse(uid, { target: c.target, requestId: job.pendingRequestId });
      if (job.state === 'canceled' && job.milestoneJobId)
        await milestones.cancelLiteraryMilestone(uid, {
          target: c.target,
          jobId: job.milestoneJobId,
        });
      return { job: summary(job) };
    },
    async listLiteraryDrafts(uid, data) {
      const c = scope(db, uid, data, ['chapterId', 'afterId']),
        chapterId = workId(data.chapterId),
        after = data.afterId == null ? null : workId(data.afterId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        let query = db
          .collection(c.path + '/literaryDraftJobs')
          .where('chapterId', '==', chapterId)
          .orderBy('__name__')
          .limit(20);
        if (after) query = query.startAfter(after);
        const page = await tx.get(query);
        return {
          items: page.docs.map((row) => summary(row.data())),
          nextAfterId: page.docs.length === 20 ? page.docs.at(-1).id : null,
        };
      });
    },
  };
  return service;
}

export { source as readLiteraryDraftSource };

function draftCaptureCanonical(value) {
  return Array.isArray(value)
    ? value.map(draftCaptureCanonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, draftCaptureCanonical(value[key])]),
        )
      : value;
}
