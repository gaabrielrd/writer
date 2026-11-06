import { writeLiteraryBackupProcess } from './literaryBackupFence.mjs';
import { workClosed, workFail, workDate, digest } from './workProgressContracts.mjs';
import { validateId } from './generation.mjs';
import { readLiteraryPublicationPolicy } from './literaryPublicationPolicy.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
import { readBookPublicationSource } from './bookLorePublication.mjs';
import {
  literaryPublicationScope as scope,
  literaryPublicationRef as ref,
  literaryPublicRevision as publicRef,
  readLiteraryPublicationJob as readJob,
  assertLiteraryPublicationCurrent as current,
  publicationHash,
} from './literaryPublicationContracts.mjs';
export function literaryPublicationEditionHash(job) {
  return digest({
    version: 1,
    manuscript: publicationHash(job.manifestHash),
    guide: publicationHash(job.guideHash),
    removals: publicationHash(job.removalHash),
  });
}
export function createLiteraryPublicationConfirmationService({ db, now = Date.now }) {
  return {
    async getLiteraryPublicationConfirmation(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'operationId']),
        jobId = validateId(data.jobId),
        operationId = validateId(data.operationId);
      return db.runTransaction(async (tx) => {
        const { job, root, bookToken } = await readJob(tx, c, jobId),
          saved = (await tx.get(ref(c, 'literaryPublicationConfirmations', operationId))).data();
        if (!saved) return { state: 'unconfirmed' };
        if (saved.jobId !== jobId || saved.bookToken !== bookToken)
          workFail('failed-precondition', 'Confirmação de outra origem.');
        const pointer = (await tx.get(db.doc('publicBooks/' + c.target.id))).data();
        return {
          state: 'confirmed',
          result: {
            ...saved.result,
            currentPointerMatches: pointer?.revisionId === job.jobId && root.status === 'published',
          },
        };
      });
    },
    async confirmLiteraryPublication(uid, data) {
      const c = scope(db, uid, data, [
          'jobId',
          'operationId',
          'expectedManifestHash',
          'expectedGuideHash',
          'expectedRemovalHash',
          'checks',
        ]),
        jobId = validateId(data.jobId),
        operationId = validateId(data.operationId),
        manuscript = publicationHash(data.expectedManifestHash),
        guide = publicationHash(data.expectedGuideHash),
        removals = publicationHash(data.expectedRemovalHash);
      workClosed(data.checks, [
        'wholeTextChecked',
        'guideChecked',
        'removalsChecked',
        'authorizePublicRelease',
      ]);
      if (
        Object.keys(data.checks).length !== 4 ||
        Object.values(data.checks).some((value) => value !== true)
      )
        workFail(
          'invalid-argument',
          'Confira o texto, o guia e as remoções antes de autorizar a edição pública.',
        );
      const fingerprint = digest({
        method: 'confirmLiteraryPublication',
        jobId,
        manuscript,
        guide,
        removals,
        checks: data.checks,
      });
      return db.runTransaction(async (tx) => {
        const { job, root, bookToken } = await readJob(tx, c, jobId),
          operationRef = ref(c, 'literaryOperations', operationId),
          previous = (await tx.get(operationRef)).data(),
          pointerRef = db.doc('publicBooks/' + c.target.id),
          pointer = await tx.get(pointerRef),
          confirmationRef = ref(c, 'literaryPublicationConfirmations', operationId);
        const pointerMatches = () =>
          pointer.data()?.revisionId === jobId && root.status === 'published';
        if (previous) {
          if (
            previous.method !== 'confirmLiteraryPublication' ||
            previous.fingerprint !== fingerprint ||
            previous.bookToken !== bookToken
          )
            workFail('invalid-argument', 'Pedido usado por outra confirmação.');
          const saved = (await tx.get(confirmationRef)).data();
          if (
            !saved ||
            saved.bookToken !== bookToken ||
            saved.fingerprint !== fingerprint ||
            saved.jobId !== jobId
          )
            workFail('failed-precondition', 'A confirmação preservada está indisponível.');
          return { ...saved.result, currentPointerMatches: pointerMatches() };
        }
        if (
          job.manifestHash !== manuscript ||
          job.guideHash !== guide ||
          job.removalHash !== removals
        )
          workFail(
            'failed-precondition',
            'A edição mudou desde a conferência. Compare a versão atual.',
          );
        if (job.state === 'published') {
          const canonical = (
            await tx.get(ref(c, 'literaryPublicationConfirmations', job.confirmationId))
          ).data();
          if (!canonical || canonical.bookToken !== bookToken || canonical.jobId !== jobId)
            workFail('failed-precondition', 'O recibo da edição está indisponível.');
          const at = workDate(now, root.updatedAt ?? 0),
            clock = await prepareLiteraryDependencyWrite(tx, c);
          tx.create(confirmationRef, {
            version: 1,
            jobId,
            operationId,
            bookToken,
            fingerprint,
            result: canonical.result,
          });
          tx.create(operationRef, {
            method: 'confirmLiteraryPublication',
            id: jobId,
            revision: 1,
            updatedAt: at,
            bookToken,
            confirmationId: operationId,
            fingerprint,
          });
          clock.commit();
          return { ...canonical.result, currentPointerMatches: pointerMatches() };
        }
        if (
          job.state !== 'verified' ||
          job.chapterCount < 1 ||
          job.compiledChapters !== job.chapterCount ||
          job.verifiedChapters !== job.chapterCount ||
          job.verifiedUnits !== job.unitCount ||
          job.verifiedCandidates !== job.candidates ||
          job.verifiedGuideEntries !== (job.guideCount ?? 0) ||
          job.verifiedGuideRevision !== (job.guideRevision ?? 0)
        )
          workFail(
            'failed-precondition',
            'Conclua todas as verificações desta edição antes de publicar.',
          );
        const publicationPolicy = await readLiteraryPublicationPolicy(tx, c);
        if (publicationPolicy.policy && publicationPolicy.policy.unit !== job.policy)
          workFail(
            'failed-precondition',
            'A unidade do contrato mudou. Confira o escopo antes de publicar uma nova edição.',
            'publication-policy-unit',
          );
        await current(tx, c, job);
        const captured = await readBookPublicationSource(tx, db, uid, c.target.id),
          source = captured.source,
          revisionRef = publicRef(c, jobId),
          existing = await tx.get(revisionRef);
        if (existing.exists)
          workFail('already-exists', 'Este destino já tem uma edição confirmada.');
        const publishedAt = workDate(now, Math.max(root.updatedAt ?? 0, job.preparedAt ?? 0)),
          editionHash = literaryPublicationEditionHash(job),
          world = source.universeId
            ? {
                universeId: source.universeId,
                universePrivacyVersion: source.universePrivacyVersion,
              }
            : {},
          scenes = source.hasScenes ? { sourceSceneRevision: source.sceneRevision } : {},
          header = {
            createdAt: publishedAt,
            chapterCount: job.chapterCount,
            loreCount: job.guideCount ?? 0,
            ...(job.actCount ? { actCount: job.actCount } : {}),
            privacyVersion: source.privacyVersion,
            sourceLoreToken: source.listToken,
            sourcePublicationToken: captured.sourceToken,
            ...world,
            ...scenes,
          },
          projection = {
            schemaVersion: source.universeId ? 2 : 1,
            title: job.title,
            authorName: job.authorName,
            revisionId: jobId,
            publishedAt,
            ...(job.actCount ? { hasActs: true } : {}),
            ...world,
            ...scenes,
            sourcePublicationToken: captured.sourceToken,
            readerGuideVersion: 1,
            literaryPublicationId: jobId,
            literaryManifestHash: editionHash,
          },
          result = {
            publicationConfirmed: true,
            bookId: c.target.id,
            revisionId: jobId,
            publishedAt,
            publicationUrl: '/read/' + encodeURIComponent(c.target.id),
            editionHash,
            manifestHash: manuscript,
            guideHash: guide,
            removalHash: removals,
            chapterCount: job.chapterCount,
            guideCount: job.guideCount ?? 0,
            removalCount: job.removalCount ?? 0,
          },
          clock = await prepareLiteraryDependencyWrite(tx, c);
        tx.create(revisionRef, header);
        tx.set(pointerRef, projection);
        tx.update(c.ref, { status: 'published', updatedAt: publishedAt });
        writeLiteraryBackupProcess(
          tx,
          c,
          'publication',
          'update',
          ref(c, 'literaryPublications', jobId),
          {
            state: 'published',
            phase: 'published',
            publishedAt,
            progressRevision: (job.progressRevision ?? 0) + 1,
            publicationUrl: result.publicationUrl,
            editionHash,
            publicationSourceToken: captured.sourceToken,
            confirmationId: operationId,
          },
        );
        tx.create(confirmationRef, {
          version: 1,
          jobId,
          operationId,
          bookToken,
          fingerprint,
          result,
        });
        tx.create(operationRef, {
          method: 'confirmLiteraryPublication',
          id: jobId,
          revision: 1,
          updatedAt: publishedAt,
          bookToken,
          confirmationId: operationId,
          fingerprint,
        });
        clock.commit();
        return { ...result, currentPointerMatches: true };
      });
    },
  };
}
