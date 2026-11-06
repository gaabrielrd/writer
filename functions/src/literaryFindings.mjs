import {
  literaryArchitectureTargetId,
  LITERARY_ARCHITECTURE_TARGET_KINDS,
} from './literaryArchitectureProtocol.mjs';
import { readLiteraryArchitectureSource } from './literaryArchitectureSources.mjs';
import { authorizeLiteraryIntegrationRequest } from './literaryIntegrationRequestRead.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
import {
  workScope,
  workProject,
  workFail,
  workId,
  workRevision,
  workConflict,
  workDate,
  digest,
} from './workProgressContracts.mjs';
import { validateId } from './generation.mjs';
import { editorialText } from './literaryContracts.mjs';
import {
  readLiteraryIntegrationFence,
  readLiteraryIntegrationUnit,
} from './literaryIntegrationSources.mjs';
import { createLiteraryReferenceReader } from './literaryReferences.mjs';
import { readHistoryVersion } from './workHistoryContracts.mjs';
import { createWorkHistoryService } from './workHistory.mjs';
import {
  literaryFindingTarget,
  readLiteraryFindingTarget,
  literaryFindingTargetLink,
  literaryFindingArchitectureLabel,
} from './literaryFindingTargets.mjs';

const actions = ['investigate', 'correct', 'retain', 'defer'];
function scope(db, uid, data, keys) {
  const c = workScope(db, uid, data, keys);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return c;
}
const baseline = (value) =>
  value
    ? {
        target: value.target,
        label: value.label,
        identityToken: value.identityToken,
        versionToken: value.versionToken,
        contentHash: value.contentHash,
        revision: value.revision,
        proofKind: value.proofKind,
      }
    : null;
const receipt = (value) => ({ id: value.id, revision: value.revision, updatedAt: value.updatedAt });
function sourceInput(data) {
  const jobId = validateId(data.jobId),
    requestId = validateId(data.requestId),
    index = data.findingIndex;
  if (!Number.isSafeInteger(index) || index < 0 || index >= 40)
    workFail('invalid-argument', 'Achado inválido.');
  return { jobId, requestId, index };
}
export function createLiteraryFindingService({
  db,
  now = Date.now,
  history = createWorkHistoryService({ db, now }),
}) {
  const ref = (c, id) => db.doc(c.path + '/literaryFindingDecisions/' + id);
  const versionRef = (c, id, revision) =>
    db.doc(c.path + '/literaryFindingDecisionVersions/' + digest({ id, revision }));
  async function finding(tx, c, source) {
    const fence = await readLiteraryIntegrationFence(tx, c),
      job = (await tx.get(db.doc(c.path + '/literaryIntegrationJobs/' + source.jobId))).data();
    if (!job || ['stale', 'canceled'].includes(job.state) || job.sourceFence !== fence.token)
      workFail(
        'failed-precondition',
        'Confira uma análise atual antes de decidir sobre seu achado.',
      );
    const header = (
      await tx.get(db.doc(c.path + '/literaryIntegrationRequests/' + source.requestId))
    ).data();
    if (!header || header.jobId !== source.jobId || header.state !== 'done')
      workFail('not-found', 'Análise indisponível.');
    if (job.audit === 'architecture' && header.kind === 'synthesis' && job.state !== 'done')
      workFail(
        'failed-precondition',
        'Conclua a conferência global antes de decidir sobre a síntese.',
      );
    const authorized = await authorizeLiteraryIntegrationRequest(tx, c, header);
    const result = (
      await tx.get(db.doc(c.path + '/literaryIntegrationResults/' + source.requestId))
    ).data();
    const item = result?.result.findings[source.index];
    if (!item) workFail('not-found', 'Achado indisponível.');
    return {
      job,
      header,
      item,
      fence: fence.token,
      architectureSource: authorized.architectureSource,
    };
  }
  async function verifyEditorialVersion(tx, c, target) {
    const versionPath =
      target.target.kind === 'contract'
        ? c.path + '/literaryContractVersions/' + target.revision
        : c.path +
          '/literaryPlanVersions/' +
          digest({ id: target.target.id, revision: target.revision });
    const snapshot = (await tx.get(db.doc(versionPath))).data();
    const content = target.target.kind === 'contract' ? snapshot?.contract : snapshot?.plan;
    if (!content || digest(content) !== target.contentHash)
      workFail('failed-precondition', 'A revisão editorial preservada não foi confirmada.');
  }
  async function currentSuccessor(tx, c, value, successorJobId, target) {
    const fence = await readLiteraryIntegrationFence(tx, c);
    const previous = (
      await tx.get(db.doc(c.path + '/literaryIntegrationJobs/' + value.source.jobId))
    ).data();
    const successor = (
      await tx.get(db.doc(c.path + '/literaryIntegrationJobs/' + successorJobId))
    ).data();
    if (
      !previous ||
      !successor ||
      successorJobId === value.source.jobId ||
      successor.state !== 'done' ||
      successor.sourceFence !== fence.token ||
      successor.phase !== 'done' ||
      !successor.finalRequestId ||
      successor.verifiedUnits !== successor.units ||
      successor.verifiedAnalyses !== successor.analyses ||
      successor.level !== previous.level ||
      successor.actId !== previous.actId ||
      successor.audit !== previous.audit ||
      (previous.audit === 'architecture' &&
        (!successor.architectureInventoryComplete ||
          successor.architectureVerifiedSources !== successor.architectureSources))
    )
      workFail(
        'failed-precondition',
        'Conclua uma integração sucessora atual do mesmo escopo para reconferir a alteração.',
      );
    if (target.proofKind === 'text') {
      const link = (
        await tx.get(
          db.doc(
            c.path +
              '/literaryIntegrationUnitLinks/' +
              digest({
                jobId: successorJobId,
                kind: target.target.kind,
                id: target.target.id,
              }),
          ),
        )
      ).data();
      if (!link) workFail('failed-precondition', 'A integração sucessora não leu este destino.');
      const unit = (
        await tx.get(
          db.doc(
            c.path +
              '/literaryIntegrationUnits/' +
              digest({ jobId: successorJobId, index: link.unitIndex }),
          ),
        )
      ).data();
      if (
        !unit ||
        !unit.coverage?.complete ||
        unit.resource.kind !== target.target.kind ||
        unit.resource.id !== target.target.id
      )
        workFail('failed-precondition', 'O destino ainda não tem cobertura integral.');
      await readLiteraryIntegrationUnit(tx, c, unit);
    } else {
      const link = (
        await tx.get(
          db.doc(
            c.path +
              '/literaryIntegrationSourceLinks/' +
              literaryFindingTargetLink(successorJobId, target.target),
          ),
        )
      ).data();
      if (
        !link ||
        (target.proofKind === 'architecture' &&
          (link.scheme !== 'architecture-source' || link.identityToken !== target.identityToken)) ||
        (target.proofKind === 'editorial'
          ? link.revision !== target.revision
          : link.versionToken !== target.versionToken)
      )
        workFail(
          'failed-precondition',
          'A integração sucessora não conferiu a revisão atual desta fonte.',
        );
    }
    return { fence: fence.token, successor };
  }
  return {
    async getLiteraryFindingContext(uid, data) {
      const c = scope(db, uid, data, [
          'jobId',
          'requestId',
          'findingIndex',
          'afterArchitectureIndex',
        ]),
        source = sourceInput(data);
      return db.runTransaction(async (tx) => {
        const found = await finding(tx, c, source),
          options = [];
        const add = (target, label) => {
          if (!options.some((item) => digest(item.target) === digest(target)))
            options.push({ target, label });
        };
        if (
          found.architectureSource &&
          ['plan', 'contract', 'act', 'arc', 'event'].includes(found.architectureSource.source.kind)
        )
          add(
            {
              kind: found.architectureSource.source.kind,
              id: found.architectureSource.source.id,
              scopeId: c.target.id,
            },
            found.architectureSource.label,
          );
        if (
          found.architectureSource &&
          LITERARY_ARCHITECTURE_TARGET_KINDS.includes(found.architectureSource.source.kind)
        )
          add(
            {
              kind: 'architecture',
              id: literaryArchitectureTargetId(found.architectureSource.source),
              scopeId: c.target.id,
            },
            literaryFindingArchitectureLabel(found.architectureSource),
          );
        const after = data.afterArchitectureIndex ?? -1;
        if (!Number.isSafeInteger(after) || after < -1)
          workFail('invalid-argument', 'Página de destinos inválida.');
        let nextAfterArchitectureIndex = null;
        if (found.job.audit === 'architecture') {
          const end = Math.min(found.job.architectureSources, after + 11);
          for (let index = after + 1; index < end; index++) {
            const entry = (
              await tx.get(
                db.doc(
                  c.path +
                    '/literaryIntegrationArchitecture/' +
                    digest({ jobId: source.jobId, index }),
                ),
              )
            ).data();
            if (!entry || entry.jobId !== source.jobId || entry.index !== index)
              workFail('failed-precondition', 'Inventário arquitetural inconsistente.');
            if (!entry.coverage?.complete) continue;
            const current = await readLiteraryArchitectureSource(tx, c, entry);
            if (LITERARY_ARCHITECTURE_TARGET_KINDS.includes(current.source.kind))
              add(
                {
                  kind: 'architecture',
                  id: literaryArchitectureTargetId(current.source),
                  scopeId: c.target.id,
                },
                current.label,
              );
            else
              add(
                { kind: current.source.kind, id: current.source.id, scopeId: c.target.id },
                current.label,
              );
          }
          if (end < found.job.architectureSources) nextAfterArchitectureIndex = end - 1;
        }
        for (const unit of found.header.sources ?? [])
          add({ kind: unit.resource.kind, id: unit.resource.id, scopeId: c.target.id }, unit.title);
        if (found.header.manifest?.contractRevision)
          add({ kind: 'contract', id: 'current', scopeId: c.target.id }, 'Guia editorial');
        for (const plan of found.header.manifest?.plans ?? []) {
          const value = (await tx.get(db.doc(c.path + '/literaryPlans/' + plan.id))).data();
          if (value) add({ kind: 'plan', id: plan.id, scopeId: c.target.id }, value.plan.title);
        }
        const root = await workProject(tx, c),
          read = await createLiteraryReferenceReader(tx, c, root);
        for (const item of found.header.manifest?.references ?? []) {
          if (item.reference.kind === 'volumeUnit') continue;
          const current = await read(item.reference, true);
          if (current)
            add(
              {
                kind: item.reference.kind,
                id: item.reference.id,
                scopeId: current.reference.scopeId,
              },
              current.label,
            );
        }
        return {
          id: digest(source),
          source: { ...source, severity: found.item.severity },
          options,
          nextAfterArchitectureIndex,
          architectureAudit: found.job.audit === 'architecture',
        };
      });
    },
    async saveLiteraryFindingDecision(uid, data) {
      const c = scope(db, uid, data, [
        'jobId',
        'requestId',
        'findingIndex',
        'operationId',
        'expectedRevision',
        'action',
        'rationale',
        'correctionTarget',
      ]);
      const source = sourceInput(data),
        id = digest(source),
        operationId = validateId(data.operationId),
        expectedRevision = workRevision(data.expectedRevision);
      if (!actions.includes(data.action))
        workFail('invalid-argument', 'Decisão editorial inválida.');
      const rationale = editorialText(data.rationale, 6000, true),
        target = literaryFindingTarget(data.correctionTarget ?? null);
      if (data.action === 'correct' && !target)
        workFail('invalid-argument', 'Escolha o destino da correção.');
      const fingerprint = digest({
        method: 'saveLiteraryFindingDecision',
        source,
        expectedRevision,
        action: data.action,
        rationale,
        target,
      });
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const receiptRef = db.doc(c.path + '/literaryOperations/' + operationId),
          prior = (await tx.get(receiptRef)).data();
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Operação usada por outra decisão.');
          return { id, revision: prior.revision, updatedAt: prior.updatedAt };
        }
        const found = await finding(tx, c, source),
          old = (await tx.get(ref(c, id))).data();
        if ((old?.revision ?? 0) !== expectedRevision) workConflict();
        const current = target ? await readLiteraryFindingTarget(tx, c, target) : null;
        if (current?.proofKind === 'architecture' && found.job.audit !== 'architecture')
          workFail('invalid-argument', 'O destino estrutural exige uma auditoria global.');
        const epoch = found.job.findingDecisionEpoch ?? 0;
        const retainedBefore =
          old?.action === 'retain' &&
          old.boundFence === found.fence &&
          (old.boundEpoch ?? 0) === epoch;
        const retainedAfter = data.action === 'retain';
        const delta =
          found.item.severity === 'blocking' ? Number(retainedAfter) - Number(retainedBefore) : 0;
        const dismissed = (found.job.dismissedBlocking ?? 0) + delta;
        if (dismissed < 0 || dismissed > found.job.blocking)
          workFail(
            'failed-precondition',
            'O acompanhamento de impedimentos precisa ser conferido.',
          );
        const updatedAt = workDate(now, old?.updatedAt ?? 0),
          value = {
            schemaVersion: 1,
            id,
            revision: expectedRevision + 1,
            source: { ...source, fingerprint: digest(found.item), severity: found.item.severity },
            action: data.action,
            rationale,
            target: current?.target ?? null,
            baseline: baseline(current),
            boundFence: found.fence,
            boundEpoch: epoch,
            state:
              data.action === 'correct'
                ? 'planned'
                : data.action === 'retain'
                  ? 'retained'
                  : data.action === 'defer'
                    ? 'deferred'
                    : 'investigating',
            correction: null,
            createdAt: old?.createdAt ?? updatedAt,
            updatedAt,
          };
        const dependencies = await prepareLiteraryDependencyWrite(tx, c);
        tx.set(ref(c, id), value);
        tx.create(versionRef(c, id, value.revision), value);
        dependencies.commit();
        tx.update(db.doc(c.path + '/literaryIntegrationJobs/' + source.jobId), {
          dismissedBlocking: dismissed,
          authorAccepted: false,
        });
        tx.create(receiptRef, {
          method: 'saveLiteraryFindingDecision',
          fingerprint,
          ...receipt(value),
        });
        return receipt(value);
      });
    },
    async getLiteraryFindingDecision(uid, data) {
      const c = scope(db, uid, data, ['id']),
        id = workId(data.id);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const value = (await tx.get(ref(c, id))).data();
        if (!value) return { id, state: 'unrecorded' };
        const originalJob = (
          await tx.get(db.doc(c.path + '/literaryIntegrationJobs/' + value.source.jobId))
        ).data();
        let current = null,
          fence = null,
          confirmationCurrent = false;
        try {
          fence = (await readLiteraryIntegrationFence(tx, c)).token;
          if (value.target) current = await readLiteraryFindingTarget(tx, c, value.target);
          if (
            value.correction &&
            current &&
            current.identityToken === value.baseline.identityToken &&
            value.correction.contentHash === current.contentHash &&
            value.correction.sourceFence === fence
          ) {
            await currentSuccessor(tx, c, value, value.correction.successorJobId, current);
            if (value.correction.versionId) {
              const version = await readHistoryVersion(tx, db, c, value.correction.versionId);
              confirmationCurrent =
                version.resource.kind === current.target.kind &&
                version.resource.id === current.target.id &&
                version.contentHash === current.contentHash;
            } else {
              if (current.proofKind === 'editorial') await verifyEditorialVersion(tx, c, current);
              confirmationCurrent = true;
            }
          }
        } catch (cause) {
          if (
            ![
              'permission-denied',
              'not-found',
              'failed-precondition',
              'resource-exhausted',
            ].includes(cause.code)
          )
            throw cause;
        }
        return {
          ...value,
          baseline: value.baseline
            ? {
                ...value.baseline,
                label:
                  current?.identityToken === value.baseline.identityToken
                    ? value.baseline.label
                    : null,
              }
            : null,
          effectiveRetention:
            value.action === 'retain' &&
            value.boundFence === fence &&
            originalJob?.sourceFence === fence &&
            !['stale', 'canceled'].includes(originalJob?.state) &&
            (value.boundEpoch ?? 0) === (originalJob?.findingDecisionEpoch ?? 0),
          originalSourceCurrent:
            !!fence &&
            originalJob?.sourceFence === fence &&
            !['stale', 'canceled'].includes(originalJob?.state),
          sourceScope: originalJob
            ? {
                level: originalJob.level,
                actId: originalJob.actId,
                ...(originalJob.audit ? { audit: originalJob.audit } : {}),
              }
            : null,
          confirmationCurrent,
          targetUnavailable:
            !!value.target && (!current || current.identityToken !== value.baseline?.identityToken),
          currentTarget: baseline(current),
        };
      });
    },
    async confirmLiteraryFindingCorrection(uid, data) {
      const c = scope(db, uid, data, [
        'id',
        'operationId',
        'expectedRevision',
        'successorJobId',
        'note',
      ]);
      const id = workId(data.id),
        operationId = validateId(data.operationId),
        expectedRevision = workRevision(data.expectedRevision);
      const successorJobId = validateId(data.successorJobId),
        note = editorialText(data.note, 6000, true);
      const fingerprint = digest({
        method: 'confirmLiteraryFindingCorrection',
        id,
        expectedRevision,
        successorJobId,
        note,
      });
      const preflight = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const prior = (await tx.get(db.doc(c.path + '/literaryOperations/' + operationId))).data();
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Operação usada por outra confirmação.');
          return { receipt: { id, revision: prior.revision, updatedAt: prior.updatedAt } };
        }
        const value = (await tx.get(ref(c, id))).data();
        if (!value || value.action !== 'correct' || !value.target || !value.baseline)
          workFail('failed-precondition', 'Registre primeiro o destino e a intenção de correção.');
        if (value.revision !== expectedRevision) workConflict();
        const current = await readLiteraryFindingTarget(tx, c, value.target);
        if (
          current.identityToken !== value.baseline.identityToken ||
          current.contentHash === value.baseline.contentHash
        )
          workFail(
            'failed-precondition',
            'A mesma origem precisa ter uma alteração salva; uma nota ou um ID recriado não comprova correção.',
          );
        await currentSuccessor(tx, c, value, successorJobId, current);
        return { value, current };
      });
      if (preflight.receipt) return preflight.receipt;
      const { value, current } = preflight;
      let captured = null;
      if (current.proofKind === 'text') {
        captured = await history.createWorkVersion(uid, {
          target: c.target,
          resource: { kind: current.target.kind, id: current.target.id },
          operationId:
            'finding-' +
            digest({ uid, target: c.target, id, sourceToken: current.source.sourceToken }),
          expectedSourceToken: current.source.sourceToken,
          label: 'Alteração vinculada à decisão editorial',
        });
      }
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const receiptRef = db.doc(c.path + '/literaryOperations/' + operationId),
          prior = (await tx.get(receiptRef)).data();
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Operação usada por outra confirmação.');
          return { id, revision: prior.revision, updatedAt: prior.updatedAt };
        }
        const latest = (await tx.get(ref(c, id))).data();
        if (
          !latest ||
          latest.revision !== expectedRevision ||
          digest(latest.baseline) !== digest(value.baseline)
        )
          workConflict();
        const actual = await readLiteraryFindingTarget(tx, c, latest.target);
        if (
          actual.identityToken !== current.identityToken ||
          actual.versionToken !== current.versionToken ||
          actual.contentHash !== current.contentHash
        )
          workFail('failed-precondition', 'A alteração mudou durante a confirmação.');
        const successor = await currentSuccessor(tx, c, latest, successorJobId, actual);
        if (captured) {
          const version = await readHistoryVersion(tx, db, c, captured.version.id);
          if (
            version.resource.kind !== actual.target.kind ||
            version.resource.id !== actual.target.id ||
            version.contentHash !== actual.contentHash
          )
            workFail('failed-precondition', 'A versão preservada não corresponde à alteração.');
        } else if (actual.proofKind === 'editorial') await verifyEditorialVersion(tx, c, actual);
        const updatedAt = workDate(now, latest.updatedAt),
          next = {
            ...latest,
            revision: expectedRevision + 1,
            state: 'correctionConfirmed',
            updatedAt,
            correction: {
              successorJobId,
              sourceFence: successor.fence,
              versionId: captured?.version.id ?? null,
              contentHash: actual.contentHash,
              versionToken: actual.versionToken,
              targetRevision: actual.revision,
              proofKind: actual.proofKind,
              note,
              confirmedAt: updatedAt,
            },
          };
        const dependencies = await prepareLiteraryDependencyWrite(tx, c);
        tx.set(ref(c, id), next);
        tx.create(versionRef(c, id, next.revision), next);
        dependencies.commit();
        tx.update(db.doc(c.path + '/literaryIntegrationJobs/' + latest.source.jobId), {
          state: 'stale',
          authorAccepted: false,
        });
        tx.create(receiptRef, {
          method: 'confirmLiteraryFindingCorrection',
          fingerprint,
          ...receipt(next),
        });
        return receipt(next);
      });
    },
    async listLiteraryFindingDecisions(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'afterId']),
        jobId = validateId(data.jobId),
        after = data.afterId == null ? null : workId(data.afterId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        let query = db
          .collection(c.path + '/literaryFindingDecisions')
          .where('source.jobId', '==', jobId)
          .orderBy('__name__')
          .limit(20)
          .select('id', 'revision', 'action', 'state', 'updatedAt', 'source', 'rationale');
        if (after) query = query.startAfter(after);
        const page = await tx.get(query);
        return {
          items: page.docs.map((row) => ({ ...row.data(), currentUnknown: true })),
          nextAfterId: page.docs.length === 20 ? page.docs.at(-1).id : null,
        };
      });
    },
    async getLiteraryFindingDecisionVersion(uid, data) {
      const c = scope(db, uid, data, ['id', 'revision']),
        id = workId(data.id),
        revision = workRevision(data.revision);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const value = (await tx.get(versionRef(c, id, revision))).data();
        if (!value) workFail('not-found', 'Versão da decisão indisponível.');
        return {
          ...value,
          baseline: value.baseline ? { ...value.baseline, label: null } : null,
          historical: true,
          effectiveRetention: false,
          confirmationCurrent: false,
          originalSourceCurrent: false,
          currentTarget: null,
        };
      });
    },
    async listLiteraryFindingDecisionVersions(uid, data) {
      const c = scope(db, uid, data, ['id', 'beforeRevision']),
        id = workId(data.id),
        before = data.beforeRevision == null ? null : workRevision(data.beforeRevision);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        let query = db
          .collection(c.path + '/literaryFindingDecisionVersions')
          .where('id', '==', id)
          .orderBy('revision', 'desc')
          .limit(20)
          .select('id', 'revision', 'action', 'state', 'updatedAt');
        if (before !== null) query = query.startAfter(before);
        const page = await tx.get(query);
        return {
          items: page.docs.map((row) => row.data()),
          nextBeforeRevision: page.docs.length === 20 ? page.docs.at(-1).data().revision : null,
        };
      });
    },
  };
}
