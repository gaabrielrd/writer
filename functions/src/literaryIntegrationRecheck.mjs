import { writeLiteraryBackupProcess } from './literaryBackupFence.mjs';
import { listLiteraryArchitectureSources } from './literaryArchitectureSources.mjs';
import { authorizeLiteraryIntegrationRequest } from './literaryIntegrationRequestRead.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
import { workScope, workProject, workFail, workDate, digest } from './workProgressContracts.mjs';
import { validateId } from './generation.mjs';
import {
  readLiteraryIntegrationFence,
  listLiteraryIntegrationChapters,
  readLiteraryIntegrationUnit,
} from './literaryIntegrationSources.mjs';
import { literaryFindingTargetLink } from './literaryFindingTargets.mjs';

const summary = (value) => ({
  operationId: value.operationId,
  jobId: value.jobId,
  state: value.state,
  phase: value.phase,
  selectedChapters: value.selectedChapters ?? 0,
  verifiedUnits: value.verifiedUnits ?? 0,
  verifiedAnalyses: value.verifiedAnalyses ?? 0,
  ...(value.architectureCompared === undefined
    ? {}
    : { architectureCompared: value.architectureCompared }),
  impact: value.impact ?? null,
  createdAt: value.createdAt,
  completedAt: value.completedAt ?? null,
});
function scope(db, uid, data, keys) {
  const c = workScope(db, uid, data, keys);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return c;
}
export function createLiteraryIntegrationRecheckService({ db, now = Date.now }) {
  const ref = (c, id) => db.doc(c.path + '/literaryIntegrationRechecks/' + id);
  const jobRef = (c, id) => db.doc(c.path + '/literaryIntegrationJobs/' + id);
  const indexed = (c, kind, jobId, index) =>
    db.doc(c.path + '/literaryIntegration' + kind + '/' + digest({ jobId, index }));
  async function job(tx, c, value) {
    const current = (await tx.get(jobRef(c, value.jobId))).data();
    if (!current) workFail('not-found', 'A integração original não está disponível.');
    return current;
  }
  function changed(tx, c, value, original, impact) {
    const next = {
      ...value,
      state: 'changed',
      impact,
      completedAt: workDate(now, value.createdAt),
    };
    tx.set(ref(c, value.operationId), next);
    if (original.recheckOperationId === value.operationId)
      writeLiteraryBackupProcess(tx, c, 'integration', 'update', jobRef(c, value.jobId), {
        state: 'stale',
        authorAccepted: false,
        recheckOperationId: null,
        lastRecheckId: value.operationId,
      });
    return summary(next);
  }
  return {
    async startLiteraryIntegrationRecheck(uid, data) {
      const c = scope(db, uid, data, ['operationId', 'jobId', 'expectedSourceToken']);
      const operationId = validateId(data.operationId),
        jobId = validateId(data.jobId);
      if (
        typeof data.expectedSourceToken !== 'string' ||
        !/^[a-f0-9]{64}$/.test(data.expectedSourceToken)
      )
        workFail('invalid-argument', 'Versão da integração inválida.');
      const fingerprint = digest({
        method: 'startLiteraryIntegrationRecheck',
        jobId,
        expectedSourceToken: data.expectedSourceToken,
      });
      return db.runTransaction(async (tx) => {
        const fence = await readLiteraryIntegrationFence(tx, c),
          r = ref(c, operationId),
          old = (await tx.get(r)).data();
        const receiptRef = db.doc(c.path + '/literaryOperations/' + operationId),
          receipt = (await tx.get(receiptRef)).data();
        if (receipt && receipt.fingerprint !== fingerprint)
          workFail('invalid-argument', 'Operação usada por outro pedido.');
        if (old) {
          if (old.state !== 'canceled' && old.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Reconferência usada por outro pedido.');
          return summary(old);
        }
        const original = (await tx.get(jobRef(c, jobId))).data();
        if (
          !original ||
          !original.completedAt ||
          original.phase !== 'done' ||
          !original.finalRequestId ||
          !['done', 'stale'].includes(original.state) ||
          original.sourceFence !== data.expectedSourceToken
        )
          workFail(
            'failed-precondition',
            'Escolha uma integração integral concluída para reconferir.',
          );
        if (original.recheckOperationId)
          workFail('failed-precondition', 'Consulte ou cancele a reconferência já registrada.');
        const value = {
          schemaVersion: 1,
          operationId,
          jobId,
          fingerprint,
          state: 'scanning',
          phase: 'chapters',
          previousFence: original.sourceFence,
          newFence: fence.token,
          previousAcceptedAt: original.acceptedAt ?? null,
          finalRequestId: original.finalRequestId,
          analyses: original.analyses,
          units: original.units,
          selectedChapters: 0,
          mainChapters: 0,
          verifiedUnits: 0,
          verifiedAnalyses: 0,
          cursor: null,
          createdAt: workDate(now),
        };
        tx.create(r, value);
        writeLiteraryBackupProcess(tx, c, 'integration', 'update', jobRef(c, jobId), {
          recheckOperationId: operationId,
        });
        tx.create(receiptRef, {
          method: 'startLiteraryIntegrationRecheck',
          fingerprint,
          id: operationId,
          revision: 1,
          updatedAt: value.createdAt,
        });
        return summary(value);
      });
    },
    async getLiteraryIntegrationRecheck(uid, data) {
      const c = scope(db, uid, data, ['operationId']),
        operationId = validateId(data.operationId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const value = (await tx.get(ref(c, operationId))).data();
        if (!value) return { operationId, state: 'unconfirmed' };
        return summary(value);
      });
    },
    async advanceLiteraryIntegrationRecheck(uid, data) {
      const c = scope(db, uid, data, ['operationId']),
        operationId = validateId(data.operationId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const value = (await tx.get(ref(c, operationId))).data();
        if (!value) workFail('not-found', 'Reconferência indisponível.');
        if (value.state !== 'scanning') return summary(value);
        const original = await job(tx, c, value);
        if (
          original.recheckOperationId !== operationId ||
          original.sourceFence !== value.previousFence ||
          original.finalRequestId !== value.finalRequestId ||
          original.analyses !== value.analyses ||
          original.units !== value.units
        )
          return changed(tx, c, value, original, {
            kind: 'checkpoint',
            message: 'O checkpoint original mudou. Consulte novamente.',
          });
        let fence;
        try {
          fence = await readLiteraryIntegrationFence(tx, c);
        } catch (cause) {
          if (!['permission-denied', 'not-found', 'failed-precondition'].includes(cause.code))
            throw cause;
          await workProject(tx, c);
          return changed(tx, c, value, original, {
            kind: 'origin',
            message: 'Uma origem deixou de estar disponível.',
          });
        }
        if (fence.token !== value.newFence)
          return changed(tx, c, value, original, {
            kind: 'concurrent',
            message: 'As fontes mudaram durante a conferência. Registre outra reconferência.',
          });
        if (value.phase === 'chapters') {
          let page;
          try {
            page = await listLiteraryIntegrationChapters(tx, c, {
              level: 'book',
              afterId: value.cursor,
            });
          } catch (cause) {
            if (!['permission-denied', 'not-found', 'failed-precondition'].includes(cause.code))
              throw cause;
            return changed(tx, c, value, original, {
              kind: 'organization',
              message: 'A organização do manuscrito precisa de conferência.',
            });
          }
          const records = page.items.map((chapter) => ({
            ref: db.doc(
              c.path +
                '/literaryIntegrationRecheckChapters/' +
                digest({ operationId, chapterId: chapter.id }),
            ),
            value: {
              ...chapter,
              operationId,
              chapterId: chapter.id,
              sortActOrder: chapter.actOrder ?? Number.MAX_SAFE_INTEGER,
              sortActId: chapter.actId ?? '',
            },
          }));
          const next = {
            ...value,
            cursor: page.nextAfterId,
            phase: page.nextAfterId ? 'chapters' : 'selection',
          };
          records.forEach((row) => tx.create(row.ref, row.value));
          tx.set(ref(c, operationId), next);
          return summary(next);
        }
        if (value.phase === 'selection') {
          let query = db
            .collection(c.path + '/literaryIntegrationRecheckChapters')
            .where('operationId', '==', operationId)
            .orderBy('sortActOrder')
            .orderBy('sortActId')
            .orderBy('order')
            .orderBy('chapterId')
            .limit(1);
          if (value.orderCursor) query = query.startAfter(...value.orderCursor);
          const row = (await tx.get(query)).docs[0];
          if (!row) {
            if (
              value.selectedChapters !== original.selectedChapters ||
              value.mainChapters !== original.mainChapters
            )
              return changed(tx, c, value, original, {
                kind: 'organization',
                message: 'O conjunto de capítulos ou a passagem anterior mudou.',
              });
            const next = {
              ...value,
              phase: original.audit === 'architecture' ? 'architecture' : 'units',
              ...(original.audit === 'architecture'
                ? { architectureCursor: null, architectureCompared: 0 }
                : {}),
            };
            tx.set(ref(c, operationId), next);
            return summary(next);
          }
          const chapter = row.data(),
            selected = original.level === 'book' || chapter.actId === original.actId;
          const next = {
            ...value,
            orderCursor: [
              chapter.sortActOrder,
              chapter.sortActId,
              chapter.order,
              chapter.chapterId,
            ],
          };
          if (selected) {
            const predecessor =
              original.level === 'act' && value.mainChapters === 0 ? value.previousCandidate : null;
            const expected = predecessor
              ? [
                  { chapter: predecessor, role: 'passage' },
                  { chapter, role: 'main' },
                ]
              : [{ chapter, role: 'main' }];
            for (let offset = 0; offset < expected.length; offset++) {
              const old = (
                await tx.get(
                  indexed(c, 'SelectedChapters', original.jobId, value.selectedChapters + offset),
                )
              ).data();
              if (
                !old ||
                old.chapterId !== expected[offset].chapter.chapterId ||
                old.token !== expected[offset].chapter.token ||
                old.role !== expected[offset].role
              )
                return changed(tx, c, value, original, {
                  kind: 'chapter',
                  chapterId: expected[offset].chapter.chapterId,
                  message:
                    'Título, posição, composição, texto ou identidade do capítulo mudou. Preserve os registros e reavalie as unidades afetadas.',
                });
            }
            next.selectedChapters = value.selectedChapters + expected.length;
            next.mainChapters = value.mainChapters + 1;
          } else if (value.mainChapters === 0) next.previousCandidate = chapter;
          tx.set(ref(c, operationId), next);
          return summary(next);
        }
        if (value.phase === 'architecture') {
          const page = await listLiteraryArchitectureSources(tx, c, value.architectureCursor);
          for (let index = 0; index < page.items.length; index++) {
            const previous = (
                await tx.get(
                  indexed(c, 'Architecture', original.jobId, value.architectureCompared + index),
                )
              ).data(),
              actual = page.items[index];
            if (
              !previous ||
              previous.identityToken !== actual.identityToken ||
              previous.nativeToken !== actual.nativeToken
            )
              return changed(tx, c, value, original, {
                kind: 'architecture',
                message:
                  'O inventário ou uma fonte da arquitetura mudou; gere uma sucessora para comparar as novas versões.',
              });
          }
          const compared = value.architectureCompared + page.items.length;
          if (page.nextCursor === null && compared !== original.architectureSources)
            return changed(tx, c, value, original, {
              kind: 'architecture',
              message: 'O conjunto de fontes arquiteturais mudou.',
            });
          const next = {
            ...value,
            architectureCompared: compared,
            architectureCursor: page.nextCursor,
            phase: page.nextCursor === null ? 'units' : 'architecture',
          };
          tx.set(ref(c, operationId), next);
          return summary(next);
        }
        if (value.phase === 'units') {
          if (value.verifiedUnits === original.units) {
            const next = { ...value, phase: 'analyses' };
            tx.set(ref(c, operationId), next);
            return summary(next);
          }
          const unit = (
            await tx.get(indexed(c, 'Units', original.jobId, value.verifiedUnits))
          ).data();
          if (!unit || !unit.coverage?.complete)
            return changed(tx, c, value, original, {
              kind: 'coverage',
              message: 'Há uma unidade sem prova de leitura integral.',
            });
          try {
            await readLiteraryIntegrationUnit(tx, c, unit);
          } catch (cause) {
            if (!['permission-denied', 'not-found', 'failed-precondition'].includes(cause.code))
              throw cause;
            return changed(tx, c, value, original, {
              kind: 'unit',
              chapterId: unit.chapterId,
              resource: unit.resource,
              message: 'O texto ou a origem da unidade mudou; esta análise exige reavaliação.',
            });
          }
          const next = { ...value, verifiedUnits: value.verifiedUnits + 1 };
          const dependencies = await prepareLiteraryDependencyWrite(tx, c);
          tx.set(
            db.doc(
              c.path +
                '/literaryIntegrationUnitLinks/' +
                digest({ jobId: original.jobId, kind: unit.resource.kind, id: unit.resource.id }),
            ),
            {
              jobId: original.jobId,
              resource: unit.resource,
              unitIndex: unit.index,
              role: unit.role,
              chapterId: unit.chapterId,
            },
          );
          dependencies.commit();
          tx.set(ref(c, operationId), next);
          return summary(next);
        }
        if (value.phase === 'analyses') {
          if (value.verifiedAnalyses === original.analyses) {
            if (
              original.mainReadUnits !== original.mainUnits ||
              original.boundaries !== Math.max(0, original.selectedChapters - 1)
            )
              return changed(tx, c, value, original, {
                kind: 'coverage',
                message: 'A cobertura original não está completa.',
              });
            const completedAt = workDate(now, value.createdAt),
              next = { ...value, state: 'done', phase: 'done', completedAt };
            tx.set(ref(c, operationId), next);
            writeLiteraryBackupProcess(tx, c, 'integration', 'update', jobRef(c, original.jobId), {
              sourceFence: value.newFence,
              state: 'done',
              authorAccepted: false,
              acceptedAt: null,
              dismissedBlocking: 0,
              findingDecisionEpoch: (original.findingDecisionEpoch ?? 0) + 1,
              recheckOperationId: null,
              lastRecheckId: operationId,
              recheckedAt: completedAt,
            });
            return summary(next);
          }
          const sequence = (
            await tx.get(indexed(c, 'Sequence', original.jobId, value.verifiedAnalyses))
          ).data();
          if (!sequence)
            return changed(tx, c, value, original, {
              kind: 'coverage',
              message: 'A sequência de evidências não está completa.',
            });
          const header = (
            await tx.get(db.doc(c.path + '/literaryIntegrationRequests/' + sequence.requestId))
          ).data();
          if (!header || header.state !== 'done' || header.jobId !== original.jobId)
            return changed(tx, c, value, original, {
              kind: 'analysis',
              requestId: sequence.requestId,
              message: 'Uma análise não está confirmada.',
            });
          let valid = true;
          try {
            await authorizeLiteraryIntegrationRequest(tx, c, header);
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
            valid = false;
          }
          if (!valid)
            return changed(tx, c, value, original, {
              kind: 'editorial',
              requestId: sequence.requestId,
              message:
                'Uma fonte editorial ou origem da análise mudou; a evidência anterior não comprova o estado atual.',
            });
          const next = { ...value, verifiedAnalyses: value.verifiedAnalyses + 1 };
          const dependencies = header.manifest ? await prepareLiteraryDependencyWrite(tx, c) : null;
          if (header.manifest) {
            const store = (target, proof) =>
              tx.set(
                db.doc(
                  c.path +
                    '/literaryIntegrationSourceLinks/' +
                    literaryFindingTargetLink(original.jobId, target),
                ),
                { jobId: original.jobId, target, ...proof },
              );
            if (header.manifest.contractRevision)
              store(
                { kind: 'contract', id: 'current', scopeId: c.target.id },
                {
                  scheme: 'editorial-revision',
                  originToken: header.manifest.bookToken,
                  revision: header.manifest.contractRevision,
                },
              );
            for (const plan of header.manifest.plans)
              store(
                { kind: 'plan', id: plan.id, scopeId: c.target.id },
                {
                  scheme: 'writing-plan',
                  identityToken: plan.identityToken,
                  revision: plan.revision,
                },
              );
            for (const item of header.manifest.references)
              if (item.reference.purpose === 'source')
                store(
                  {
                    kind: item.reference.kind,
                    id: item.reference.id,
                    scopeId:
                      item.reference.kind === 'globalLore'
                        ? (item.reference.scopeId ?? fence.root.universeId)
                        : item.reference.kind === 'volumeUnit'
                          ? item.reference.scopeId
                          : c.target.id,
                  },
                  {
                    scheme: 'reference',
                    originToken: item.reference.sourceToken,
                    identityToken: item.identityToken,
                    versionToken: item.versionToken,
                    revision: item.reference.revision,
                  },
                );
          }
          dependencies?.commit();
          tx.set(ref(c, operationId), next);
          return summary(next);
        }
        workFail('failed-precondition', 'Etapa de reconferência inválida.');
      });
    },
    async cancelLiteraryIntegrationRecheck(uid, data) {
      const c = scope(db, uid, data, ['operationId']),
        operationId = validateId(data.operationId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const r = ref(c, operationId),
          value = (await tx.get(r)).data();
        if (!value) {
          const next = {
            schemaVersion: 1,
            operationId,
            jobId: null,
            state: 'canceled',
            phase: 'canceled',
            createdAt: workDate(now),
          };
          tx.create(r, next);
          return summary(next);
        }
        if (value.state !== 'scanning') return summary(value);
        const original = await job(tx, c, value),
          next = { ...value, state: 'canceled', completedAt: workDate(now, value.createdAt) };
        tx.set(r, next);
        if (original.recheckOperationId === operationId)
          writeLiteraryBackupProcess(tx, c, 'integration', 'update', jobRef(c, value.jobId), {
            recheckOperationId: null,
            lastRecheckId: operationId,
          });
        return summary(next);
      });
    },
  };
}
