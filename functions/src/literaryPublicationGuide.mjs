import { writeLiteraryBackupProcess } from './literaryBackupFence.mjs';
import { normalizeLiteraryReaderGuide } from './literaryReaderGuideProtocol.mjs';
export { normalizeLiteraryReaderGuide } from './literaryReaderGuideProtocol.mjs';
import {
  createLiteraryGuideDependencyIndex,
  guideDependencyIndexRef,
} from './literaryPublicationGuideDependencies.mjs';
import {
  workId,
  workFail,
  workDate,
  workRevision,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { validateId } from './generation.mjs';
import { prepareLiteraryDependencyWrite } from './literaryDependencyClock.mjs';
import { literaryProseText } from './literaryAIContext.mjs';
import {
  literaryPublicationScope as scope,
  literaryPublicationRef as ref,
  literaryPublicationEntry as entry,
  literaryPublicRevision as publicRef,
  readLiteraryPublicationJob as readJob,
  assertLiteraryPublicationCurrent as current,
  literaryPublicationSummary as summary,
  publicationHash,
  persistLiteraryPublicationStep as persist,
} from './literaryPublicationContracts.mjs';
const facts = (guide) => [
  ...guide.evidence.map((value, index) => ({ ...value, kind: 'summary', index })),
  ...guide.facts.map((value, index) => ({ ...value, kind: 'fact', index })),
  ...guide.relationships.map((value, index) => ({ ...value, kind: 'relationship', index })),
  ...guide.appearances.map((value, index) => ({
    ...value,
    appearanceKind: value.kind,
    kind: 'appearance',
    index,
  })),
];
const reveal = (c, jobId, chapterId) => ({
  version: 1,
  bookId: c.target.id,
  revisionId: jobId,
  chapterId,
});
function projection(c, jobId, guide) {
  return {
    name: guide.name,
    aliases: guide.aliases,
    category: guide.category,
    summary: guide.summary,
    certainty: guide.certainty,
    disambiguation: guide.disambiguation,
    readerGuide: reveal(c, jobId, guide.revealAfterChapterId),
    facts: guide.facts.map((v) => ({
      text: v.text,
      certainty: v.certainty,
      readerGuide: reveal(c, jobId, v.chapterId),
    })),
    relationships: guide.relationships.map((v) => ({
      targetId: v.targetId,
      description: v.description,
      certainty: v.certainty,
      readerGuide: reveal(c, jobId, v.chapterId),
    })),
    appearances: guide.appearances.map((v) => ({
      kind: v.kind,
      readerGuide: reveal(c, jobId, v.chapterId),
    })),
  };
}
const view = (value, id) =>
  value
    ? {
        id,
        revision: value.revision,
        deleted: value.deleted,
        guide: value.guide,
        updatedAt: value.updatedAt,
      }
    : { id, revision: 0, deleted: false, guide: null, updatedAt: null };
async function chapter(tx, c, jobId, id) {
  const record = (
    await readWorkMetadata(tx, entry(c, 'Chapters', jobId, id), [
      'jobId',
      'chapterId',
      'index',
      'compiled',
      'projectionHash',
    ])
  ).data();
  if (!record || record.jobId !== jobId || record.chapterId !== id || !record.compiled)
    workFail('failed-precondition', 'Escolha um capítulo desta edição preparada.');
  return record;
}
export function createLiteraryPublicationGuideService({ db, now = Date.now }) {
  return {
    async getLiteraryPublicationChapter(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'chapterId']),
        jobId = validateId(data.jobId),
        chapterId = workId(data.chapterId);
      return db.runTransaction(async (tx) => {
        await readJob(tx, c, jobId);
        const captured = await chapter(tx, c, jobId, chapterId),
          actual = (
            await tx.get(db.doc(publicRef(c, jobId).path + '/chapters/' + chapterId))
          ).data();
        if (!actual || digest(actual) !== captured.projectionHash)
          workFail('failed-precondition', 'O texto preparado mudou.');
        return {
          chapterId,
          ...actual,
          projectionHash: captured.projectionHash,
          text: literaryProseText(actual.content),
        };
      });
    },
    async listLiteraryPublicationGuide(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'afterId']),
        jobId = validateId(data.jobId),
        after = data.afterId == null ? null : workId(data.afterId);
      return db.runTransaction(async (tx) => {
        const { job } = await readJob(tx, c, jobId);
        let query = db
          .collection(c.path + '/literaryPublicationGuide')
          .where('jobId', '==', jobId)
          .where('deleted', '==', false)
          .orderBy('id')
          .limit(12);
        if (after) query = query.startAfter(after);
        const page = await tx.get(query);
        return {
          items: page.docs.map((row) => view(row.data(), row.data().id)),
          guideRevision: job.guideRevision ?? 0,
          guideCount: job.guideCount ?? 0,
          nextAfterId: page.docs.length === 12 ? page.docs.at(-1).data().id : null,
        };
      });
    },
    async getLiteraryPublicationGuideEntry(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'id']),
        jobId = validateId(data.jobId),
        id = workId(data.id);
      return db.runTransaction(async (tx) => {
        await readJob(tx, c, jobId);
        return view((await tx.get(entry(c, 'Guide', jobId, id))).data(), id);
      });
    },
    async getLiteraryPublicationGuideVersion(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'id', 'revision']),
        jobId = validateId(data.jobId),
        id = workId(data.id),
        revision = workRevision(data.revision);
      return db.runTransaction(async (tx) => {
        const { job } = await readJob(tx, c, jobId),
          saved = (
            await tx.get(
              ref(c, 'literaryPublicationGuideVersions', digest({ jobId, id, revision })),
            )
          ).data();
        if (
          !saved ||
          saved.bookToken !== job.bookToken ||
          saved.jobId !== jobId ||
          saved.id !== id ||
          saved.revision !== revision
        )
          workFail('not-found', 'Versão do guia indisponível.');
        return view(saved, id);
      });
    },
    async saveLiteraryPublicationGuideEntry(uid, data) {
      const c = scope(db, uid, data, [
          'jobId',
          'id',
          'operationId',
          'expectedRevision',
          'expectedManifestHash',
          'guide',
        ]),
        jobId = validateId(data.jobId),
        id = workId(data.id),
        operationId = validateId(data.operationId),
        expectedRevision = workRevision(data.expectedRevision),
        expectedManifestHash = publicationHash(data.expectedManifestHash),
        guide = data.guide === null ? null : normalizeLiteraryReaderGuide(data.guide),
        fingerprint = digest({
          method: 'saveLiteraryPublicationGuideEntry',
          jobId,
          id,
          expectedRevision,
          expectedManifestHash,
          guide,
        });
      return db.runTransaction(async (tx) => {
        const { job, root } = await readJob(tx, c, jobId),
          operationRef = ref(c, 'literaryOperations', operationId),
          receipt = (await tx.get(operationRef)).data();
        if (receipt) {
          if (
            receipt.method !== 'saveLiteraryPublicationGuideEntry' ||
            receipt.fingerprint !== fingerprint ||
            receipt.bookToken !== job.bookToken
          )
            workFail('invalid-argument', 'Pedido usado com outra edição ou entrada.');
          const saved = (
            await tx.get(ref(c, 'literaryPublicationGuideVersions', receipt.versionId))
          ).data();
          if (!saved) workFail('failed-precondition', 'Versão confirmada indisponível.');
          return view(saved, id);
        }
        if (job.state !== 'prepared' || job.manifestHash !== expectedManifestHash)
          workFail('failed-precondition', 'Reabra o guia desta versão antes de editar.');
        await current(tx, c, job);
        const guideRef = entry(c, 'Guide', jobId, id),
          previous = (await tx.get(guideRef)).data(),
          actual = previous?.revision ?? 0;
        if (actual !== expectedRevision)
          workFail('failed-precondition', 'A entrada mudou. Compare a versão atual.');
        const revision = workRevision(actual + 1),
          updatedAt = workDate(now, Math.max(root.updatedAt ?? 0, previous?.updatedAt ?? 0)),
          value = {
            version: 1,
            jobId,
            id,
            bookToken: job.bookToken,
            revision,
            deleted: guide === null,
            guide,
            entryHash: digest(guide),
            updatedAt,
          },
          versionId = digest({ jobId, id, revision }),
          wasActive = !!previous && !previous.deleted,
          guideCount =
            (job.guideCount ?? 0) +
            (guide !== null && !wasActive ? 1 : 0) -
            (guide === null && wasActive ? 1 : 0),
          guideRevision = workRevision((job.guideRevision ?? 0) + 1),
          clock = await prepareLiteraryDependencyWrite(tx, c);
        const dependencyIndex = createLiteraryGuideDependencyIndex(value);
        value.dependencyIndexHash = dependencyIndex.indexHash;
        tx.set(guideRef, value);
        tx.create(ref(c, 'literaryPublicationGuideVersions', versionId), value);
        tx.create(guideDependencyIndexRef(c, versionId), dependencyIndex);
        tx.create(operationRef, {
          method: 'saveLiteraryPublicationGuideEntry',
          fingerprint,
          id,
          jobId,
          versionId,
          revision,
          updatedAt,
          bookToken: job.bookToken,
        });
        writeLiteraryBackupProcess(
          tx,
          c,
          'publication',
          'update',
          ref(c, 'literaryPublications', jobId),
          {
            guideCount,
            guideRevision,
            guideHash: null,
            progressRevision: workRevision((job.progressRevision ?? 0) + 1),
          },
        );
        clock.commit();
        return view(value, id);
      });
    },
    async reopenLiteraryPublicationGuide(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId);
      return db.runTransaction(async (tx) => {
        const { job } = await readJob(tx, c, jobId);
        await current(tx, c, job);
        if (job.state === 'prepared') return summary(job);
        if (!['checkingGuide', 'verified'].includes(job.state))
          workFail('failed-precondition', 'Esta edição não permite reabrir o guia.');
        const next = {
            ...job,
            state: 'prepared',
            phase: 'prepared',
            guideHash: null,
            verifiedGuideEntries: 0,
          },
          clock = await prepareLiteraryDependencyWrite(tx, c);
        persist(tx, c, ref(c, 'literaryPublications', jobId), job, next);
        clock.commit();
        return summary(next);
      });
    },
    async startLiteraryPublicationGuideVerification(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'expectedGuideRevision', 'expectedManifestHash']),
        jobId = validateId(data.jobId),
        revision = workRevision(data.expectedGuideRevision),
        hash = publicationHash(data.expectedManifestHash);
      return db.runTransaction(async (tx) => {
        const { job } = await readJob(tx, c, jobId);
        await current(tx, c, job);
        if ((job.guideRevision ?? 0) !== revision || job.manifestHash !== hash)
          workFail('failed-precondition', 'O guia ou o manifesto mudou.');
        if (['checkingGuide', 'verified'].includes(job.state)) return summary(job);
        if (job.state !== 'prepared')
          workFail('failed-precondition', 'Conclua a compilação antes de conferir o guia.');
        const next = {
            ...job,
            state: 'checkingGuide',
            phase: 'cleanGuide',
            verifiedGuideRevision: revision,
            verifiedGuideEntries: 0,
            guideCursor: null,
            checkingGuideId: null,
            guideFactIndex: 0,
            guideFactHash: null,
            guideChain: digest({
              domain: 'literary-reader-guide-v1',
              bookId: c.target.id,
              jobId,
              revision,
              manifestHash: hash,
            }),
            guideHash: null,
          },
          clock = await prepareLiteraryDependencyWrite(tx, c);
        persist(tx, c, ref(c, 'literaryPublications', jobId), job, next);
        clock.commit();
        return summary(next);
      });
    },
    async advanceLiteraryPublicationGuide(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId);
      return db.runTransaction(async (tx) => {
        const { job } = await readJob(tx, c, jobId);
        await current(tx, c, job);
        if (job.state === 'verified') return summary(job);
        if (job.state !== 'checkingGuide' || job.verifiedGuideRevision !== (job.guideRevision ?? 0))
          workFail('failed-precondition', 'A conferência do guia não está ativa nesta versão.');
        const jobRef = ref(c, 'literaryPublications', jobId);
        if (job.phase === 'cleanGuide') {
          const page = await tx.get(
              db
                .collection(publicRef(c, jobId).path + '/lore')
                .orderBy('__name__')
                .limit(20)
                .select(),
            ),
            clock = page.docs.length ? await prepareLiteraryDependencyWrite(tx, c) : null;
          page.docs.forEach((row) => tx.delete(row.ref));
          const next = { ...job, phase: page.docs.length ? 'cleanGuide' : 'guideEntries' };
          persist(tx, c, jobRef, job, next);
          clock?.commit();
          return summary(next);
        }
        let query = db
          .collection(c.path + '/literaryPublicationGuide')
          .where('jobId', '==', jobId)
          .where('deleted', '==', false)
          .orderBy('id')
          .limit(1);
        if (job.guideCursor) query = query.startAfter(job.guideCursor);
        const row = (await tx.get(query)).docs[0];
        if (!row) {
          if (job.verifiedGuideEntries !== (job.guideCount ?? 0))
            workFail('failed-precondition', 'A contagem do guia mudou.');
          const next = {
              ...job,
              state: 'verified',
              phase: 'verified',
              guideHash: digest({
                chain: job.guideChain,
                revision: job.verifiedGuideRevision,
                count: job.verifiedGuideEntries,
              }),
            },
            clock = await prepareLiteraryDependencyWrite(tx, c);
          persist(tx, c, jobRef, job, next);
          clock.commit();
          return summary(next);
        }
        const data = row.data(),
          guide = normalizeLiteraryReaderGuide(data.guide),
          entries = facts(guide);
        if (
          data.jobId !== jobId ||
          data.bookToken !== job.bookToken ||
          data.entryHash !== digest(guide) ||
          (job.checkingGuideId !== null && job.checkingGuideId !== data.id)
        )
          workFail('failed-precondition', 'A identidade da entrada mudou durante a conferência.');
        const fact = entries[job.guideFactIndex];
        if (!fact) workFail('failed-precondition', 'Há uma evidência ausente.');
        const rootChapter = await chapter(tx, c, jobId, guide.revealAfterChapterId),
          sourceChapter = await chapter(tx, c, jobId, fact.chapterId),
          actual = (
            await tx.get(db.doc(publicRef(c, jobId).path + '/chapters/' + fact.chapterId))
          ).data();
        if (
          !actual ||
          digest(actual) !== sourceChapter.projectionHash ||
          !literaryProseText(actual.content).includes(fact.quote)
        )
          workFail(
            'failed-precondition',
            'A citação não corresponde ao texto integral desta edição.',
          );
        if (fact.kind === 'summary' && sourceChapter.index > rootChapter.index)
          workFail(
            'failed-precondition',
            'O resumo usa informação posterior ao seu limite de revelação.',
          );
        let targetHash = null;
        if (fact.kind === 'relationship') {
          const target = (await tx.get(entry(c, 'Guide', jobId, fact.targetId))).data();
          if (
            !target ||
            target.deleted ||
            target.jobId !== jobId ||
            target.bookToken !== job.bookToken
          )
            workFail(
              'failed-precondition',
              'A relação aponta para uma identidade ausente deste guia.',
            );
          const targetGuide = normalizeLiteraryReaderGuide(target.guide),
            targetChapter = await chapter(tx, c, jobId, targetGuide.revealAfterChapterId);
          if (sourceChapter.index < Math.max(rootChapter.index, targetChapter.index))
            workFail(
              'failed-precondition',
              'A relação revela uma identidade antes do limite escolhido.',
            );
          targetHash = target.entryHash;
        }
        const proofHash = digest({
            previous: job.guideFactHash,
            entryHash: data.entryHash,
            index: job.guideFactIndex,
            factHash: digest(fact),
            chapterHash: sourceChapter.projectionHash,
            targetHash,
          }),
          done = job.guideFactIndex + 1 === entries.length,
          next = {
            ...job,
            checkingGuideId: done ? null : data.id,
            guideFactIndex: done ? 0 : job.guideFactIndex + 1,
            guideFactHash: done ? null : proofHash,
          };
        const clock = await prepareLiteraryDependencyWrite(tx, c);
        if (done) {
          const published = projection(c, jobId, guide),
            projectionHash = digest(published);
          tx.create(db.doc(publicRef(c, jobId).path + '/lore/' + data.id), published);
          tx.set(entry(c, 'GuideProofs', jobId, data.id), {
            version: 1,
            jobId,
            id: data.id,
            revision: data.revision,
            guideRevision: job.verifiedGuideRevision,
            entryHash: data.entryHash,
            proofHash,
            projectionHash,
            literalEvidenceVerified: true,
            qualityCertified: false,
          });
          next.guideCursor = data.id;
          next.verifiedGuideEntries = workRevision(job.verifiedGuideEntries + 1);
          next.guideChain = digest({
            previous: job.guideChain,
            id: data.id,
            entryHash: data.entryHash,
            proofHash,
            projectionHash,
          });
        }
        persist(tx, c, jobRef, job, next);
        clock.commit();
        return summary(next);
      });
    },
  };
}
