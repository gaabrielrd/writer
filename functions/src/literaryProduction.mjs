import {
  workScope,
  workProject,
  workFail,
  workRevision,
  workConflict,
  workDate,
  workLimit,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { validateId } from './generation.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { editorialContract, editorialStored } from './literaryContracts.mjs';

function scope(db, uid, data, keys) {
  const context = workScope(db, uid, data, keys);
  if (context.target.kind !== 'book')
    workFail('invalid-argument', 'Produção literária exige um livro.');
  return context;
}
export function createLiteraryProductionService({ db, now = Date.now }) {
  const current = (context) => db.doc(context.path + '/literaryProduction/current');
  return {
    async getLiteraryOperation(uid, data) {
      const context = scope(db, uid, data, ['operationId']);
      const operationId = validateId(data.operationId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, context);
        const receipt = (
          await tx.get(db.doc(context.path + '/literaryOperations/' + operationId))
        ).data();
        if (
          !receipt ||
          ([
            'startLiteraryWorkflow',
            'advanceLiteraryWorkflow',
            'setLiteraryWorkflowControl',
          ].includes(receipt.method) &&
            ['registering', 'running'].includes(receipt.status))
        )
          return { state: 'unconfirmed' };
        if (
          [
            'saveLiteraryProgressNote',
            'setLiteraryDraftExecution',
            'startLiteraryWorkflow',
            'advanceLiteraryWorkflow',
            'setLiteraryWorkflowControl',
          ].includes(receipt.method) &&
          digest(receipt.bookBirth ?? null) !==
            digest(literaryNativeBirth(await readWorkMetadata(tx, context.ref, [])))
        )
          workFail('failed-precondition', 'A origem deste salvamento mudou.');
        if (
          [
            'startLiteraryPublication',
            'saveLiteraryPublicationGuideEntry',
            'confirmLiteraryPublication',
          ].includes(receipt.method) &&
          receipt.bookToken !==
            digest({
              domain: 'literary-publication-book-v1',
              uid,
              target: context.target,
              birth: literaryNativeBirth(await readWorkMetadata(tx, context.ref, [])),
            })
        )
          workFail('failed-precondition', 'A origem deste manifesto mudou.');
        const kind = [
          'startLiteraryWorkflow',
          'advanceLiteraryWorkflow',
          'setLiteraryWorkflowControl',
        ].includes(receipt.method)
          ? 'workflow'
          : receipt.method === 'saveLiteraryPublicationGuideEntry'
            ? 'publicationGuide'
            : receipt.method === 'confirmLiteraryPublication'
              ? 'publicationConfirm'
              : receipt.method === 'startLiteraryPublication'
                ? 'publication'
                : receipt.method === 'saveLiteraryProgressNote'
                  ? 'progress'
                  : receipt.method === 'saveLiteraryContract'
                    ? 'contract'
                    : receipt.method === 'saveLiteraryPlan'
                      ? 'plan'
                      : receipt.method === 'saveLiteraryPreparationGate'
                        ? 'gate'
                        : receipt.method === 'startLiteraryMilestone'
                          ? 'milestone'
                          : receipt.method === 'setLiteraryDraftExecution'
                            ? 'draftExecution'
                            : receipt.method === 'startLiteraryDraft'
                              ? 'draft'
                              : receipt.method === 'startLiteraryReview'
                                ? 'review'
                                : [
                                      'saveLiteraryFindingDecision',
                                      'confirmLiteraryFindingCorrection',
                                    ].includes(receipt.method)
                                  ? 'finding'
                                  : receipt.method === 'startLiteraryIntegration'
                                    ? 'integration'
                                    : receipt.method === 'startLiteraryIntegrationRecheck'
                                      ? 'integrationRecheck'
                                      : receipt.method === 'startLiteraryProse'
                                        ? 'prose'
                                        : receipt.method === 'applyLiteraryProse'
                                          ? 'proseApply'
                                          : null;
        if (!kind || !Number.isSafeInteger(receipt.revision) || receipt.revision < 1)
          workFail('failed-precondition', 'Recibo editorial inválido.');
        const versionPath =
          kind === 'workflow'
            ? context.path + '/literaryWorkflowJobs/' + receipt.id
            : kind === 'publicationGuide'
              ? context.path + '/literaryPublicationGuideVersions/' + receipt.versionId
              : kind === 'publicationConfirm'
                ? context.path + '/literaryPublicationConfirmations/' + receipt.confirmationId
                : kind === 'publication'
                  ? context.path + '/literaryPublications/' + receipt.id
                  : kind === 'progress'
                    ? context.path +
                      '/literaryProgressNoteVersions/' +
                      digest({ id: receipt.id, revision: receipt.revision })
                    : kind === 'contract'
                      ? context.path + '/literaryContractVersions/' + receipt.revision
                      : kind === 'milestone'
                        ? context.path + '/literaryMilestones/' + receipt.id
                        : ['draft', 'draftExecution'].includes(kind)
                          ? context.path + '/literaryDraftJobs/' + receipt.id
                          : kind === 'review'
                            ? context.path + '/literaryReviewJobs/' + receipt.id
                            : kind === 'finding'
                              ? context.path +
                                '/literaryFindingDecisionVersions/' +
                                digest({ id: receipt.id, revision: receipt.revision })
                              : kind === 'integration'
                                ? context.path + '/literaryIntegrationJobs/' + receipt.id
                                : kind === 'integrationRecheck'
                                  ? context.path + '/literaryIntegrationRechecks/' + receipt.id
                                  : kind === 'prose'
                                    ? context.path + '/literaryProseRequests/' + receipt.id
                                    : kind === 'proseApply'
                                      ? context.path + '/literaryProseApplications/' + operationId
                                      : context.path +
                                        (kind === 'gate'
                                          ? '/literaryPreparationGateVersions/'
                                          : '/literaryPlanVersions/') +
                                        digest({ id: receipt.id, revision: receipt.revision });
        const confirmed = await readWorkMetadata(
          tx,
          db.doc(versionPath),
          kind === 'workflow' ? ['workflowBirth', 'actorId'] : [],
        );
        if (!confirmed.exists) workFail('failed-precondition', 'Versão confirmada indisponível.');
        if (
          kind === 'workflow' &&
          (receipt.actorId !== uid ||
            confirmed.data().actorId !== uid ||
            digest(receipt.workflowBirth) !== digest(literaryNativeBirth(confirmed)) ||
            digest(confirmed.data().workflowBirth) !== digest(receipt.workflowBirth))
        )
          workFail('failed-precondition', 'A origem do ciclo confirmado mudou.');
        return {
          state: 'confirmed',
          kind,
          id: kind === 'contract' ? 'current' : receipt.id,
          revision: receipt.revision,
          updatedAt: receipt.updatedAt,
          noOp: receipt.noOp === true,
        };
      });
    },
    async getLiteraryContract(uid, data) {
      const context = scope(db, uid, data, []);
      return db.runTransaction(async (tx) => {
        await workProject(tx, context);
        return editorialStored((await tx.get(current(context))).data());
      });
    },
    async saveLiteraryContract(uid, data) {
      const context = scope(db, uid, data, ['operationId', 'expectedRevision', 'contract']);
      const operationId = validateId(data.operationId);
      const expectedRevision = workRevision(data.expectedRevision);
      const contract = editorialContract(data.contract);
      const fingerprint = digest({ expectedRevision, contract });
      // Receipts contain metadata only. Historical content belongs to book-owned revisions.
      const receiptRef = db.doc(context.path + '/literaryOperations/' + operationId);
      return db.runTransaction(async (tx) => {
        const root = await workProject(tx, context);
        const previous = (await tx.get(receiptRef)).data();
        const state = editorialStored((await tx.get(current(context))).data());
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Operação já usada com outro contrato.');
          const saved = (
            await tx.get(db.doc(context.path + '/literaryContractVersions/' + previous.revision))
          ).data();
          if (!saved) workFail('failed-precondition', 'Versão confirmada indisponível.');
          return editorialStored(saved);
        }
        if (state.revision !== expectedRevision) workConflict();
        // Existing decisions cannot disappear or silently change identity/history.
        for (const decision of state.contract.decisions) {
          const next = contract.decisions.find((item) => item.id === decision.id);
          if (!next || JSON.stringify(next) !== JSON.stringify(decision))
            workFail(
              'failed-precondition',
              'Preserve decisões anteriores e registre uma nova decisão que as substitua.',
            );
        }
        if (state.revision > 0 && digest(state.contract) === digest(contract)) {
          if (
            root.hasLiteraryResources !== true ||
            (contract.publicationPolicy && root.hasLiteraryPublications !== true)
          )
            tx.update(context.ref, {
              hasLiteraryResources: true,
              ...(contract.publicationPolicy ? { hasLiteraryPublications: true } : {}),
            });
          tx.create(receiptRef, {
            method: 'saveLiteraryContract',
            fingerprint,
            revision: state.revision,
            updatedAt: state.updatedAt,
            noOp: true,
          });
          return state;
        }
        const revision = workRevision(state.revision + 1);
        const updatedAt = workDate(now, Math.max(root.updatedAt ?? 0, state.updatedAt ?? 0));
        const result = { revision, updatedAt, contract };
        tx.set(current(context), result);
        tx.create(db.doc(context.path + '/literaryContractVersions/' + revision), result);
        tx.create(receiptRef, { method: 'saveLiteraryContract', fingerprint, revision, updatedAt });
        tx.update(context.ref, {
          updatedAt,
          hasLiteraryResources: true,
          ...(contract.publicationPolicy ? { hasLiteraryPublications: true } : {}),
          literaryRevision: workRevision((root.literaryRevision ?? 0) + 1),
          literaryContextRevision: workRevision((root.literaryContextRevision ?? 0) + 1),
        });
        return result;
      });
    },
    async listLiteraryContractVersions(uid, data) {
      const context = scope(db, uid, data, ['beforeRevision', 'limit']);
      const limit = workLimit(data.limit);
      const before = data.beforeRevision == null ? null : workRevision(data.beforeRevision);
      return db.runTransaction(async (tx) => {
        await workProject(tx, context);
        let query = db
          .collection(context.path + '/literaryContractVersions')
          .orderBy('revision', 'desc')
          .limit(limit);
        if (before !== null) query = query.startAfter(before);
        const page = await tx.get(query);
        return {
          items: page.docs.map((item) => {
            const row = editorialStored(item.data());
            return { revision: row.revision, updatedAt: row.updatedAt };
          }),
          nextBeforeRevision: page.docs.length === limit ? page.docs.at(-1).data().revision : null,
        };
      });
    },
    async getLiteraryContractVersion(uid, data) {
      const context = scope(db, uid, data, ['revision']);
      const revision = workRevision(data.revision);
      return db.runTransaction(async (tx) => {
        await workProject(tx, context);
        const value = (
          await tx.get(db.doc(context.path + '/literaryContractVersions/' + revision))
        ).data();
        if (!value) workFail('not-found', 'Versão editorial não encontrada.');
        return editorialStored(value);
      });
    },
  };
}
