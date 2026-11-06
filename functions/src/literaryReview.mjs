import { writeLiteraryBackupProcess } from './literaryBackupFence.mjs';
import { readWorkflowChildGrant } from './literaryWorkflowContracts.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
import {
  workScope,
  workProject,
  workId,
  workFail,
  digest,
  workDate,
  workRevision,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { validateId, platformTextGeneration } from './generation.mjs';
import { editorialText } from './literaryContracts.mjs';
import {
  readLiteraryMilestoneEnvelope,
  createLiteraryMilestoneService,
} from './literaryMilestones.mjs';
import { readWorkHistoryRevision } from './workHistorySnapshot.mjs';
import {
  readLiteraryReviewSource,
  inspectLiteraryReviewSource,
  literaryReviewBirth,
} from './literaryReviewSource.mjs';
export { readLiteraryReviewSource } from './literaryReviewSource.mjs';
import { createLiteraryProseService } from './literaryProse.mjs';

const reviewCanonical = (value) =>
  Array.isArray(value)
    ? value.map(reviewCanonical)
    : value && typeof value === 'object'
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, reviewCanonical(value[key])]),
        )
      : value;
const terminal = ['done', 'stale', 'canceled'];
const layers = ['reviewStructure', 'reviewProse'];
function scope(db, uid, data, keys) {
  const c = workScope(db, uid, data, keys);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return c;
}
const source = readLiteraryReviewSource;
const summary = (job) => ({
  jobId: job.jobId,
  chapterId: job.chapterId,
  state: job.state,
  sourceToken: job.sourceToken ?? null,
  units: job.units,
  completedUnits: job.completedUnits,
  analyses: job.analyses,
  blocking: job.blocking,
  warnings: job.warnings,
  suggestions: job.suggestions,
  pendingRequestId: job.pendingRequestId ?? null,
  createdAt: job.createdAt,
  completedAt: job.completedAt ?? null,
  paused: job.paused === true,
  authorAccepted: job.authorAccepted === true,
  revisedMilestoneId: job.revisedMilestoneId ?? null,
  preservationState: job.preservationState ?? 'unrecorded',
  preservationCurrent: job.preservationCurrent === true,
  preservedAt: job.preservedAt ?? null,
  preservationProgress: job.preservationProgress ?? null,
  coverage: {
    scope: 'chapter-scenes',
    wholeChapter: job.state === 'done',
    wholeBook: false,
    layers: [...layers],
    units: job.units,
    completedUnits: job.completedUnits,
  },
});
export function createLiteraryReviewService({
  db,
  generator,
  now = Date.now,
  prose = createLiteraryProseService({ db, generator, now }),
  milestones = createLiteraryMilestoneService({ db, now }),
}) {
  const jobRef = (c, id) => db.doc(c.path + '/literaryReviewJobs/' + id);
  const unitRef = (c, id, index) =>
    db.doc(c.path + '/literaryReviewUnits/' + digest({ jobId: id, index }));
  async function current(tx, c, ref, job) {
    const probe = await inspectLiteraryReviewSource(tx, c, job);
    if (job.state === 'canceled') return false;
    const actual = probe.source;
    if (!probe.matches) {
      if (job.state !== 'stale')
        writeLiteraryBackupProcess(tx, c, 'review', 'update', ref, {
          state: 'stale',
          authorAccepted: false,
        });
      job.state = 'stale';
      job.authorAccepted = false;
      job.preservationCurrent = false;
      return false;
    }
    job.preservationCurrent =
      job.state === 'done' &&
      job.authorAccepted === true &&
      job.preservationState === 'done' &&
      job.preservedHistoryRevision === readWorkHistoryRevision(actual.root);
    return job.state !== 'stale';
  }
  return {
    async startLiteraryReview(uid, data, internal) {
      const c = scope(db, uid, data, [
        'jobId',
        'chapterId',
        'instruction',
        'generation',
        'planIds',
      ]);
      const jobId = validateId(data.jobId),
        chapterId = workId(data.chapterId),
        instruction = editorialText(data.instruction ?? '', 4000);
      let planIds;
      if (data.planIds !== undefined) {
        if (!Array.isArray(data.planIds) || data.planIds.length > 8)
          workFail('invalid-argument', 'Escolha até oito planejamentos.');
        planIds = data.planIds.map(workId).sort();
        if (new Set(planIds).size !== planIds.length)
          workFail('invalid-argument', 'Planejamento repetido.');
      }
      const resolved = platformTextGeneration(data.generation, 12000);
      const generation = {
        version: 1,
        provider: 'platform',
        model: resolved.effective.model,
        reasoning: resolved.requested.reasoning,
      };
      const fingerprint = digest({
        method: 'startLiteraryReview',
        chapterId,
        instruction,
        generation,
        ...(planIds === undefined ? {} : { planIds }),
      });
      return db.runTransaction(async (tx) => {
        const snapshot = await source(tx, c, chapterId),
          ref = jobRef(c, jobId),
          old = (await tx.get(ref)).data();
        const receiptRef = db.doc(c.path + '/literaryOperations/' + jobId),
          receipt = (await tx.get(receiptRef)).data();
        if (receipt && receipt.fingerprint !== fingerprint)
          workFail('invalid-argument', 'Operação usada por outro pedido.');
        if (old) {
          if (old.state !== 'canceled' && old.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Revisão usada por outro pedido.');
          await current(tx, c, ref, old);
          if (!receipt)
            tx.create(receiptRef, {
              method: 'startLiteraryReview',
              fingerprint,
              id: jobId,
              revision: 1,
              updatedAt: old.createdAt,
            });
          return summary(old);
        }
        const workflow = internal?.beforeStart ? await internal.beforeStart(tx, c, snapshot) : null;
        const first = await tx.get(
          db
            .collection(c.path + '/scenes')
            .where('parentId', '==', chapterId)
            .where('archived', '==', false)
            .limit(1)
            .select(),
        );
        if (!first.docs.length)
          workFail('failed-precondition', 'O capítulo precisa de cenas ativas antes da revisão.');
        const job = {
          schemaVersion: 1,
          ...(workflow ? { workflow } : {}),
          jobId,
          chapterId,
          instruction,
          generation,
          effectiveGeneration: resolved.effective,
          fingerprint,
          ...(planIds === undefined ? {} : { planIds }),
          personaDependencies: snapshot.personaDependencies,
          sourceToken: snapshot.token,
          slot: snapshot.chapter.rankSlot === 'B' ? 'rankB' : 'rankA',
          state: 'planning',
          cursor: null,
          units: 0,
          completedUnits: 0,
          analyses: 0,
          blocking: 0,
          warnings: 0,
          suggestions: 0,
          pendingRequestId: null,
          createdAt: workDate(now),
          authorAccepted: false,
        };
        const dependencies = await prepareLiteraryDependencyWrite(tx, c);
        writeLiteraryBackupProcess(tx, c, 'review', 'create', ref, job);
        dependencies.commit();
        tx.create(receiptRef, {
          method: 'startLiteraryReview',
          fingerprint,
          id: jobId,
          revision: 1,
          updatedAt: job.createdAt,
        });
        // Adoption marker is not an editorial/source change.
        tx.update(c.ref, { hasLiteraryResources: true });
        return summary(job);
      });
    },
    async getLiteraryReview(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const ref = jobRef(c, jobId),
          job = (await tx.get(ref)).data();
        if (!job) return { jobId, state: 'unconfirmed' };
        await current(tx, c, ref, job);
        return summary(job);
      });
    },
    async advanceLiteraryReview(uid, data, internal) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId),
        ref = jobRef(c, jobId);
      const action = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const job = (await tx.get(ref)).data();
        if (!job) workFail('not-found', 'Revisão indisponível.');
        const grant = await readWorkflowChildGrant(tx, c, job.workflow, 'review', jobId);
        if (grant?.sequence && !internal?.beforeAdvance)
          workFail('failed-precondition', 'Avance esta revisão pelo ciclo original da execução.');
        await internal?.beforeAdvance?.(tx, c, job);
        if (job.paused || !(await current(tx, c, ref, job)) || terminal.includes(job.state))
          return { result: summary(job) };
        if (job.state === 'planning') {
          const jobBirth = literaryReviewBirth(await readWorkMetadata(tx, ref, []));
          let query = db
            .collection(c.path + '/scenes')
            .where('parentId', '==', job.chapterId)
            .where('archived', '==', false)
            .orderBy(job.slot)
            .orderBy('__name__')
            .limit(20)
            .select('ownerId', 'parentId', 'archived', job.slot);
          if (job.cursor) query = query.startAfter(job.cursor.rank, job.cursor.id);
          const page = await tx.get(query),
            last = page.docs.at(-1);
          const units = page.docs.map((row, index) => {
            const value = row.data();
            if (
              value.ownerId !== uid ||
              value.parentId !== job.chapterId ||
              value.archived !== false ||
              typeof value[job.slot] !== 'string'
            )
              workFail('failed-precondition', 'Uma cena não pertence à composição esperada.');
            return {
              ref: unitRef(c, jobId, job.units + index),
              value: {
                jobId,
                captureBinding: { version: 1, jobBirth },
                index: job.units + index,
                sceneId: row.id,
                state: 'pending',
                layer: 0,
                segment: 0,
                attempt: 0,
                segmentCount: null,
                sourceToken: null,
                analyses: 0,
                covered: 0,
              },
            };
          });
          const count = job.units + page.docs.length;
          const next = {
            ...job,
            units: count,
            cursor: last ? { id: last.id, rank: last.data()[job.slot] } : job.cursor,
            state: page.docs.length === 20 ? 'planning' : count ? 'reviewing' : 'stale',
          };
          units.forEach((unit) => tx.create(unit.ref, unit.value));
          writeLiteraryBackupProcess(tx, c, 'review', 'set', ref, next);
          return { result: summary(next) };
        }
        const unit = (await tx.get(unitRef(c, jobId, job.completedUnits))).data();
        if (!unit) {
          if (job.units === 0)
            workFail('failed-precondition', 'Não há cenas conferidas para concluir esta revisão.');
          if (job.completedUnits !== job.units)
            workFail('failed-precondition', 'Checkpoint de revisão incompleto.');
          const next = { ...job, state: 'done', completedAt: workDate(now, job.createdAt) };
          writeLiteraryBackupProcess(tx, c, 'review', 'set', ref, next);
          return { result: summary(next) };
        }
        const requestId =
          'review-' +
          digest({
            uid,
            target: c.target,
            jobId,
            index: unit.index,
            layer: unit.layer,
            segment: unit.segment,
            attempt: unit.attempt ?? 0,
          });
        writeLiteraryBackupProcess(tx, c, 'review', 'update', ref, { pendingRequestId: requestId });
        return { job, unit, requestId };
      });
      if (action.result) return action.result;
      const { job, unit, requestId } = action;
      // Existing requests are read first. A pending record is not proof of a live producer.
      let response = await prose.getLiteraryProse(uid, { target: c.target, requestId });
      let info;
      if (response.state === 'unconfirmed') {
        if (
          digest(platformTextGeneration(job.generation, 12000).effective) !==
          digest(job.effectiveGeneration)
        )
          workFail(
            'failed-precondition',
            'As capacidades do modelo mudaram. Registre uma nova revisão para usar a configuração atual.',
          );
        info = await prose.getLiteraryProseSourceInfo(uid, {
          target: c.target,
          chapterId: job.chapterId,
          sceneId: unit.sceneId,
        });
        if (info.empty)
          workFail(
            'failed-precondition',
            'Há uma cena sem prosa. Conclua a redação antes da revisão integral.',
          );
        if (unit.sourceToken && unit.sourceToken !== info.sourceToken)
          workFail('failed-precondition', 'A cena mudou durante a revisão.');
        response = await prose.startLiteraryProse(uid, {
          target: c.target,
          requestId,
          chapterId: job.chapterId,
          sceneId: unit.sceneId,
          expectedSourceToken: info.sourceToken,
          mode: layers[unit.layer],
          segment: unit.segment,
          instruction: job.instruction,
          generation: job.generation,
          ...(job.planIds === undefined ? {} : { planIds: job.planIds }),
        });
      }
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const stored = (await tx.get(ref)).data();
        if (!stored) workFail('not-found', 'Revisão indisponível.');
        if (!(await current(tx, c, ref, stored)) || terminal.includes(stored.state))
          return summary(stored);
        const unitPath = unitRef(c, jobId, unit.index),
          latest = (await tx.get(unitPath)).data();
        if (
          stored.completedUnits !== unit.index ||
          latest.layer !== unit.layer ||
          latest.segment !== unit.segment
        )
          return summary(stored);
        if (response.state === 'running' || response.state === 'unconfirmed')
          return { ...summary(stored), waitingForResult: true };
        if (
          response.state !== 'done' ||
          !response.current ||
          !response.coverage ||
          !response.result
        ) {
          const next = {
            ...stored,
            state:
              response.state === 'stale' || response.state === 'revoked' ? 'stale' : 'attention',
          };
          writeLiteraryBackupProcess(tx, c, 'review', 'set', ref, next);
          return { ...summary(next), requestState: response.state };
        }
        const coverage = response.coverage;
        if (
          response.sceneId !== unit.sceneId ||
          response.chapterId !== job.chapterId ||
          response.mode !== layers[unit.layer] ||
          coverage.segment !== unit.segment ||
          coverage.wholeChapter !== false ||
          coverage.wholeBook !== false ||
          (latest.sourceToken && latest.sourceToken !== coverage.sourceToken) ||
          (latest.segmentCount !== null && latest.segmentCount !== coverage.segmentCount)
        )
          workFail('failed-precondition', 'A análise não corresponde ao segmento esperado.');
        // Core ranges, not overlapping context, prove complete nonduplicated coverage.
        if (
          coverage.coreStart !== latest.covered ||
          coverage.coreEnd < coverage.coreStart ||
          coverage.coreEnd > coverage.sourceCharacters ||
          coverage.segmentCount < 1
        )
          workFail('failed-precondition', 'A cobertura da análise tem lacunas.');
        const segmentDone = unit.segment + 1 === coverage.segmentCount;
        if (segmentDone && coverage.coreEnd !== coverage.sourceCharacters)
          workFail('failed-precondition', 'A análise não chegou ao fim da cena.');
        const layerDone = segmentDone && unit.layer + 1 === layers.length;
        const updated = {
          ...latest,
          sourceToken: coverage.sourceToken,
          segmentCount: coverage.segmentCount,
          analyses: latest.analyses + 1,
          covered: segmentDone ? 0 : coverage.coreEnd,
          layer: segmentDone ? unit.layer + 1 : unit.layer,
          segment: segmentDone ? 0 : unit.segment + 1,
          state: layerDone ? 'done' : 'reviewing',
        };
        const evidenceRef = db.doc(
          c.path + '/literaryReviewAnalyses/' + digest({ jobId, requestId }),
        );
        const existing = await tx.get(evidenceRef);
        const jobBirth = literaryReviewBirth(await readWorkMetadata(tx, ref, []));
        const unitBirth = literaryReviewBirth(await readWorkMetadata(tx, unitPath, []));
        const requestMeta = await readWorkMetadata(
          tx,
          db.doc(c.path + '/literaryProseRequests/' + requestId),
          ['requestId', 'chapterId', 'sceneId', 'mode', 'state', 'coverage'],
        );
        if (requestMeta.exists) {
          const value = requestMeta.data();
          if (
            value.requestId !== requestId ||
            value.chapterId !== stored.chapterId ||
            value.sceneId !== latest.sceneId ||
            value.mode !== layers[unit.layer] ||
            value.state !== 'done' ||
            digest(reviewCanonical(value.coverage ?? null)) !== digest(reviewCanonical(coverage))
          )
            workFail('failed-precondition', 'A origem nativa da análise mudou antes do registro.');
        }
        const requestBirth = literaryReviewBirth(requestMeta);
        if (existing.exists)
          workFail('failed-precondition', 'Esta análise já pertence a outro checkpoint.');
        const findings = response.result.findings;
        const next = {
          ...stored,
          state: 'reviewing',
          pendingRequestId: null,
          completedUnits: stored.completedUnits + (layerDone ? 1 : 0),
          analyses: stored.analyses + 1,
          blocking:
            stored.blocking + findings.filter((item) => item.severity === 'blocking').length,
          warnings: stored.warnings + findings.filter((item) => item.severity === 'warning').length,
          suggestions:
            stored.suggestions + findings.filter((item) => item.severity === 'suggestion').length,
        };
        // Keep references/coverage only; quotations and prose remain in the authorized request.
        tx.create(evidenceRef, {
          jobId,
          chapterId: stored.chapterId,
          sceneId: latest.sceneId,
          captureBinding: { version: 1, jobBirth, unitBirth, requestBirth },
          requestId,
          unitIndex: unit.index,
          layer: layers[unit.layer],
          segment: unit.segment,
          coverage,
        });
        tx.set(unitPath, updated);
        writeLiteraryBackupProcess(tx, c, 'review', 'set', ref, next);
        return summary(next);
      });
    },
    async cancelLiteraryReview(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId);
      const canceled = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const ref = jobRef(c, jobId),
          job = (await tx.get(ref)).data();
        if (!job) {
          const fence = {
            schemaVersion: 1,
            jobId,
            chapterId: null,
            state: 'canceled',
            units: 0,
            completedUnits: 0,
            analyses: 0,
            blocking: 0,
            warnings: 0,
            suggestions: 0,
            createdAt: now(),
            authorAccepted: false,
            pendingRequestId: null,
          };
          writeLiteraryBackupProcess(tx, c, 'review', 'create', ref, fence);
          return { job: fence };
        }
        if (!terminal.includes(job.state)) {
          writeLiteraryBackupProcess(tx, c, 'review', 'update', ref, {
            state: 'canceled',
            authorAccepted: false,
          });
          job.state = 'canceled';
          job.authorAccepted = false;
        }
        return { job, requestId: job.pendingRequestId };
      });
      if (canceled.requestId)
        await prose.cancelLiteraryProse(uid, { target: c.target, requestId: canceled.requestId });
      return summary(canceled.job);
    },
    async cancelPendingLiteraryReviewAnalysis(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId),
        ref = jobRef(c, jobId);
      const job = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const value = (await tx.get(ref)).data();
        if (!value || !value.pendingRequestId || terminal.includes(value.state))
          workFail('failed-precondition', 'Não há análise pendente neste checkpoint.');
        return value;
      });
      const response = await prose.cancelLiteraryProse(uid, {
        target: c.target,
        requestId: job.pendingRequestId,
      });
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const latest = (await tx.get(ref)).data();
        if (!latest) workFail('not-found', 'Revisão indisponível.');
        if (!(await current(tx, c, ref, latest)) || terminal.includes(latest.state))
          return summary(latest);
        if (latest.pendingRequestId !== job.pendingRequestId)
          workFail('failed-precondition', 'A revisão avançou. Consulte o checkpoint.');
        if (response.state === 'done' && response.current) return summary(latest);
        const state = ['stale', 'revoked'].includes(response.state) ? 'stale' : 'attention';
        writeLiteraryBackupProcess(tx, c, 'review', 'update', ref, {
          state,
          authorAccepted: false,
        });
        return summary({ ...latest, state, authorAccepted: false });
      });
    },
    async retryLiteraryReviewAnalysis(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId),
        ref = jobRef(c, jobId);
      const job = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const currentJob = (await tx.get(ref)).data();
        if (!currentJob || currentJob.state !== 'attention' || !currentJob.pendingRequestId)
          workFail(
            'failed-precondition',
            'Esta revisão não tem uma análise interrompida para regenerar.',
          );
        return currentJob;
      });
      const response = await prose.getLiteraryProse(uid, {
        target: c.target,
        requestId: job.pendingRequestId,
      });
      if (!['error', 'canceled'].includes(response.state))
        workFail(
          'failed-precondition',
          'Consulte ou cancele o pedido existente antes de regenerar.',
        );
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const latest = (await tx.get(ref)).data();
        if (!latest) workFail('not-found', 'Revisão indisponível.');
        if (!(await current(tx, c, ref, latest))) return summary(latest);
        if (latest.state !== 'attention' || latest.pendingRequestId !== job.pendingRequestId)
          workFail('failed-precondition', 'O checkpoint mudou. Consulte novamente.');
        const unitPath = unitRef(c, jobId, latest.completedUnits),
          unit = (await tx.get(unitPath)).data();
        if (!unit) workFail('failed-precondition', 'Unidade da revisão indisponível.');
        tx.update(unitPath, { attempt: workRevision((unit.attempt ?? 0) + 1) });
        writeLiteraryBackupProcess(tx, c, 'review', 'update', ref, {
          state: 'reviewing',
          pendingRequestId: null,
        });
        return summary({ ...latest, state: 'reviewing', pendingRequestId: null });
      });
    },
    async acceptLiteraryReview(uid, data, internal) {
      const c = scope(db, uid, data, ['jobId', 'expectedSourceToken']),
        jobId = validateId(data.jobId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const ref = jobRef(c, jobId),
          job = (await tx.get(ref)).data();
        if (!job) workFail('not-found', 'Revisão indisponível.');
        if (!(await current(tx, c, ref, job))) return summary(job);
        if (
          job.state !== 'done' ||
          job.blocking > 0 ||
          data.expectedSourceToken !== job.sourceToken
        )
          workFail(
            'failed-precondition',
            'Conclua a cobertura e resolva impedimentos antes do aceite.',
          );
        await readWorkflowChildGrant(tx, c, job.workflow, 'review', jobId);
        if (job.paused) workFail('failed-precondition', 'Revisão pausada.');
        const extension = await internal?.prepareCommit?.(tx, { context: c, job });
        writeLiteraryBackupProcess(tx, c, 'review', 'update', ref, { authorAccepted: true });
        extension?.commit();
        return summary({ ...job, authorAccepted: true });
      });
    },
    async advanceLiteraryReviewedVersion(uid, data, internal) {
      const c = scope(db, uid, data, ['jobId', 'expectedSourceToken', 'restart']),
        jobId = validateId(data.jobId),
        ref = jobRef(c, jobId);
      if (data.restart !== undefined && typeof data.restart !== 'boolean')
        workFail('invalid-argument', 'Retomada inválida.');
      const action = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const job = (await tx.get(ref)).data();
        if (!job) workFail('not-found', 'Revisão indisponível.');
        const grant = await readWorkflowChildGrant(tx, c, job.workflow, 'review', jobId);
        if (grant?.sequence && !internal?.beforeAdvance)
          workFail('failed-precondition', 'Avance esta revisão pelo ciclo original da execução.');
        await internal?.beforeAdvance?.(tx, c, job);
        if (job.paused) return { result: summary(job) };
        if (!(await current(tx, c, ref, job))) return { result: summary(job) };
        if (
          job.state !== 'done' ||
          !job.authorAccepted ||
          job.blocking > 0 ||
          job.units < 1 ||
          job.completedUnits !== job.units ||
          data.expectedSourceToken !== job.sourceToken
        )
          workFail(
            'failed-precondition',
            'Conclua e aceite a revisão integral atual antes de preservar a versão revisada.',
          );
        if (job.preservationCurrent) return { result: summary(job) };
        if (job.preservationState === 'attention' && !data.restart) return { result: summary(job) };
        const attempt =
          data.restart && job.preservationState === 'attention'
            ? (job.preservationAttempt ?? 0) + 1
            : (job.preservationAttempt ?? 0);
        const milestoneId = 'reviewed-' + digest({ uid, target: c.target, jobId, attempt });
        const envelope = await readLiteraryMilestoneEnvelope(tx, c, job.chapterId);
        const next = {
          ...job,
          preservationState: 'capturing',
          preservationCurrent: false,
          preservationAttempt: attempt,
          revisedMilestoneId: milestoneId,
        };
        writeLiteraryBackupProcess(tx, c, 'review', 'set', ref, next);
        return { job: next, manuscriptToken: envelope.token };
      });
      if (action.result) return action.result;
      const { job, manuscriptToken } = action;
      await milestones.startLiteraryMilestone(uid, {
        target: c.target,
        jobId: job.revisedMilestoneId,
        chapterId: job.chapterId,
        kind: 'revised',
      });
      const capture = await milestones.recheckLiteraryMilestone(uid, {
        target: c.target,
        jobId: job.revisedMilestoneId,
      });
      if (!['done', 'stale', 'canceled'].includes(capture.state))
        await milestones.advanceLiteraryMilestone(uid, {
          target: c.target,
          jobId: job.revisedMilestoneId,
        });
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const latest = (await tx.get(ref)).data();
        if (!latest) workFail('not-found', 'Revisão indisponível.');
        if (!(await current(tx, c, ref, latest))) return summary(latest);
        if (latest.revisedMilestoneId !== job.revisedMilestoneId) return summary(latest);
        const snapshot = (
          await tx.get(db.doc(c.path + '/literaryMilestones/' + job.revisedMilestoneId))
        ).data();
        const envelope = await readLiteraryMilestoneEnvelope(tx, c, latest.chapterId);
        if (
          !snapshot ||
          snapshot.chapterId !== latest.chapterId ||
          snapshot.kind !== 'revised' ||
          snapshot.sourceToken !== manuscriptToken ||
          envelope.token !== manuscriptToken
        )
          workFail('failed-precondition', 'O marco não corresponde ao manuscrito revisado.');
        let next = {
          ...latest,
          preservationState: ['stale', 'canceled'].includes(snapshot.state)
            ? 'attention'
            : 'capturing',
          preservationProgress: {
            planned: snapshot.planned,
            captured: snapshot.captured,
            verified: snapshot.verified,
          },
        };
        if (snapshot.state === 'done') {
          const revision = readWorkHistoryRevision(envelope.root);
          if (
            snapshot.planned !== latest.units ||
            snapshot.planned !== snapshot.captured ||
            snapshot.planned !== snapshot.verified
          )
            workFail('failed-precondition', 'O marco revisado tem cobertura incompleta.');
          if (snapshot.verifyHistoryRevision === revision)
            next = {
              ...next,
              preservationState: 'done',
              preservationCurrent: true,
              preservedHistoryRevision: revision,
              preservedAt: workDate(now, latest.completedAt ?? latest.createdAt),
            };
        }
        writeLiteraryBackupProcess(tx, c, 'review', 'set', ref, next);
        return summary(next);
      });
    },
    async listLiteraryReviews(uid, data) {
      const c = scope(db, uid, data, ['chapterId', 'afterId']),
        chapterId = workId(data.chapterId);
      const after = data.afterId == null ? null : workId(data.afterId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        let query = db
          .collection(c.path + '/literaryReviewJobs')
          .where('chapterId', '==', chapterId)
          .orderBy('__name__')
          .limit(20);
        if (after) query = query.startAfter(after);
        const page = await tx.get(query);
        return {
          items: page.docs.map((row) => summary({ ...row.data(), preservationCurrent: false })),
          nextAfterId: page.docs.length === 20 ? page.docs.at(-1).id : null,
        };
      });
    },
    async listLiteraryReviewAnalyses(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'afterId']),
        jobId = validateId(data.jobId),
        after = data.afterId == null ? null : workId(data.afterId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const ref = jobRef(c, jobId),
          job = (await tx.get(ref)).data();
        if (!job) workFail('not-found', 'Revisão indisponível.');
        // Rows contain no derived text. The prose service reauthorizes before opening an analysis.
        let query = db
          .collection(c.path + '/literaryReviewAnalyses')
          .where('jobId', '==', jobId)
          .orderBy('__name__')
          .limit(20);
        if (after) query = query.startAfter(after);
        const page = await tx.get(query);
        await current(tx, c, ref, job);
        return {
          items: page.docs.map((row) => {
            // Capture birth witnesses stay server-side; preserve the existing public metadata DTO.
            const value = row.data();
            return {
              id: row.id,
              jobId: value.jobId,
              requestId: value.requestId,
              unitIndex: value.unitIndex,
              layer: value.layer,
              segment: value.segment,
              coverage: value.coverage,
            };
          }),
          nextAfterId: page.docs.length === 20 ? page.docs.at(-1).id : null,
          state: job.state,
        };
      });
    },
  };
}
