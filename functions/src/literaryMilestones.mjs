import { literaryNativeBirth } from './literarySourceOrigins.mjs';
import { writeLiteraryBackupProcess, touchLiteraryBackupWrite } from './literaryBackupFence.mjs';
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
import { validateId } from './generation.mjs';
import { createWorkHistoryService } from './workHistory.mjs';
import { readHistorySource, readHistoryVersion, versionSummary } from './workHistoryContracts.mjs';
import { readWorkHistoryRevision } from './workHistorySnapshot.mjs';

const chapterFields = [
  'title',
  'bookId',
  'deleting',
  'contentMode',
  'assemblyRevision',
  'structureRevision',
  'rankSlot',
];
const stamp = (snapshot) => {
  const birth = snapshot.createTime,
    changed = snapshot.updateTime;
  if (
    !Number.isSafeInteger(birth?.seconds) ||
    !Number.isSafeInteger(birth?.nanoseconds) ||
    !Number.isSafeInteger(changed?.seconds) ||
    !Number.isSafeInteger(changed?.nanoseconds)
  )
    workFail('failed-precondition', 'A identidade da unidade não pôde ser conferida.');
  return {
    birth: [birth.seconds, birth.nanoseconds],
    changed: [changed.seconds, changed.nanoseconds],
  };
};
function scope(db, uid, data, keys) {
  const context = workScope(db, uid, data, keys);
  if (context.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return context;
}
export async function readLiteraryMilestoneEnvelope(tx, context, chapterId) {
  const root = await workProject(tx, context);
  const book = await tx.get(context.ref);
  const chapter = await readWorkMetadata(
    tx,
    context.db.doc(context.path + '/chapters/' + chapterId),
    chapterFields,
  );
  const value = chapter.data();
  if (!value || value.deleting || (value.bookId && value.bookId !== context.target.id))
    workFail('not-found', 'Capítulo indisponível.');
  return {
    root,
    chapter: value,
    token: digest({
      domain: 'literary-milestone-source-v1',
      uid: context.uid,
      target: context.target,
      bookBirth: stamp(book).birth,
      chapterId,
      chapter: stamp(chapter),
      mode: value.contentMode ?? 'legacy',
    }),
  };
}
const envelope = readLiteraryMilestoneEnvelope;
const terminal = ['done', 'stale', 'canceled'];
const summary = (job) => ({
  jobId: job.jobId,
  chapterId: job.chapterId,
  kind: job.kind,
  state: job.state,
  planned: job.planned,
  captured: job.captured,
  verified: job.verified,
  createdAt: job.createdAt,
  completedAt: job.completedAt ?? null,
  wordCount: job.wordCount ?? 0,
  note: 'Preservação de versões; não comprova redação integral nem revisão literária.',
});
export function createLiteraryMilestoneService({
  db,
  now = Date.now,
  history = createWorkHistoryService({ db, now }),
}) {
  const jobRef = (c, id) => db.doc(c.path + '/literaryMilestones/' + id);
  const unitRef = (c, id, index) =>
    db.doc(c.path + '/literaryMilestoneUnits/' + digest({ jobId: id, index }));
  async function current(tx, c, ref, job) {
    if (terminal.includes(job.state)) {
      await workProject(tx, c);
      return false;
    }
    let actual;
    try {
      actual = await envelope(tx, c, job.chapterId);
    } catch (cause) {
      if (cause.code !== 'not-found') throw cause;
      await workProject(tx, c);
    }
    if (!actual || actual.token !== job.sourceToken) {
      writeLiteraryBackupProcess(tx, c, 'milestone', 'update', ref, { state: 'stale' });
      job.state = 'stale';
      return false;
    }
    return true;
  }
  return {
    async startLiteraryMilestone(uid, data, internal) {
      const c = scope(db, uid, data, ['jobId', 'chapterId', 'kind']);
      const jobId = validateId(data.jobId),
        chapterId = workId(data.chapterId);
      if (!['firstDraft', 'revised'].includes(data.kind))
        workFail('invalid-argument', 'Escolha primeira versão ou versão revisada.');
      const fingerprint = digest({ method: 'startLiteraryMilestone', chapterId, kind: data.kind });
      return db.runTransaction(async (tx) => {
        const source = await envelope(tx, c, chapterId),
          ref = jobRef(c, jobId);
        const previous = (await tx.get(ref)).data();
        const receiptRef = db.doc(c.path + '/literaryOperations/' + jobId);
        const receipt = (await tx.get(receiptRef)).data();
        if (receipt && receipt.fingerprint !== fingerprint)
          workFail('invalid-argument', 'Operação usada por outro pedido.');
        const confirm = (createdAt) => {
          if (!receipt)
            tx.create(receiptRef, {
              method: 'startLiteraryMilestone',
              fingerprint,
              id: jobId,
              revision: 1,
              updatedAt: createdAt,
            });
        };
        if (previous) {
          if (previous.state === 'canceled' && !previous.fingerprint) {
            confirm(previous.createdAt);
            return summary({ ...previous, chapterId, kind: data.kind });
          }
          if (previous.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Captura usada por outra unidade.');
          confirm(previous.createdAt);
          return summary(previous);
        }
        await internal?.beforeStart?.(tx, c, source);
        const chapterBirth = literaryNativeBirth(
          await readWorkMetadata(tx, db.doc(c.path + '/chapters/' + chapterId), []),
        );
        const value = {
          schemaVersion: 1,
          captureBinding: { version: 1, chapterBirth },
          jobId,
          chapterId,
          kind: data.kind,
          fingerprint,
          sourceToken: source.token,
          mode: source.chapter.contentMode === 'scenes' ? 'scenes' : 'legacy',
          slot: source.chapter.rankSlot === 'B' ? 'rankB' : 'rankA',
          state: source.chapter.contentMode === 'scenes' ? 'planning' : 'capturing',
          cursor: null,
          planned: 0,
          captured: 0,
          verified: 0,
          wordCount: 0,
          createdAt: workDate(now, source.root.updatedAt ?? 0),
        };
        if (value.mode === 'legacy') {
          value.planned = 1;
          tx.create(unitRef(c, jobId, 0), {
            jobId,
            index: 0,
            resource: { kind: 'chapter', id: chapterId },
            state: 'pending',
          });
        }
        writeLiteraryBackupProcess(tx, c, 'milestone', 'create', ref, value);
        confirm(value.createdAt);
        tx.update(c.ref, {
          hasLiteraryResources: true,
          literaryRevision: workRevision((source.root.literaryRevision ?? 0) + 1),
        });
        return summary(value);
      });
    },
    async listLiteraryMilestones(uid, data) {
      const c = scope(db, uid, data, ['chapterId', 'afterId']),
        chapterId = workId(data.chapterId);
      const after = data.afterId == null ? null : workId(data.afterId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        let query = db
          .collection(c.path + '/literaryMilestones')
          .where('chapterId', '==', chapterId)
          .orderBy('__name__')
          .limit(20)
          .select(
            'jobId',
            'chapterId',
            'kind',
            'state',
            'planned',
            'captured',
            'verified',
            'createdAt',
            'completedAt',
            'wordCount',
          );
        if (after) query = query.startAfter(after);
        const page = await tx.get(query);
        return {
          items: page.docs.map((row) => summary(row.data())),
          nextAfterId: page.docs.length === 20 ? page.docs.at(-1).id : null,
        };
      });
    },
    async getLiteraryMilestone(uid, data) {
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
    async cancelLiteraryMilestone(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const ref = jobRef(c, jobId),
          job = (await tx.get(ref)).data();
        if (!job) {
          const canceled = {
            schemaVersion: 1,
            jobId,
            chapterId: null,
            kind: null,
            state: 'canceled',
            planned: 0,
            captured: 0,
            verified: 0,
            createdAt: now(),
          };
          writeLiteraryBackupProcess(tx, c, 'milestone', 'create', ref, canceled);
          return summary(canceled);
        }
        if (!terminal.includes(job.state)) {
          writeLiteraryBackupProcess(tx, c, 'milestone', 'update', ref, { state: 'canceled' });
          job.state = 'canceled';
        }
        return summary(job);
      });
    },
    async advanceLiteraryMilestone(uid, data, internal) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId),
        ref = jobRef(c, jobId);
      const action = await db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const job = (await tx.get(ref)).data();
        if (!job) workFail('not-found', 'Captura indisponível.');
        await internal?.beforeAdvance?.(tx, c, job);
        if (!(await current(tx, c, ref, job))) return { result: summary(job) };
        if (job.state === 'planning') {
          let query = db
            .collection(c.path + '/scenes')
            .where('parentId', '==', job.chapterId)
            .where('archived', '==', false)
            .orderBy(job.slot)
            .orderBy('__name__')
            .limit(25)
            .select('id', 'parentId', 'archived', 'ownerId', job.slot);
          if (job.cursor) query = query.startAfter(job.cursor.rank, job.cursor.id);
          const page = await tx.get(query);
          const units = page.docs.map((row, index) => {
            const value = row.data();
            if (
              value.ownerId !== uid ||
              value.parentId !== job.chapterId ||
              value.archived !== false ||
              typeof value[job.slot] !== 'string'
            )
              workFail('failed-precondition', 'A composição contém uma cena incompatível.');
            return {
              ref: unitRef(c, jobId, job.planned + index),
              value: {
                jobId,
                index: job.planned + index,
                resource: { kind: 'scene', id: row.id },
                state: 'pending',
              },
            };
          });
          const last = page.docs.at(-1);
          const updated = {
            ...job,
            planned: workRevision(job.planned + page.docs.length),
            cursor: last ? { id: last.id, rank: last.data()[job.slot] } : job.cursor,
            state:
              page.docs.length === 25
                ? 'planning'
                : job.planned + page.docs.length
                  ? 'capturing'
                  : 'stale',
          };
          for (const unit of units) tx.create(unit.ref, unit.value);
          writeLiteraryBackupProcess(tx, c, 'milestone', 'set', ref, updated);
          return { result: summary(updated) };
        }
        if (job.state === 'capturing') {
          const unit = unitRef(c, jobId, job.captured),
            stored = (await tx.get(unit)).data();
          if (!stored) workFail('failed-precondition', 'Unidade da captura indisponível.');
          let sourceToken = stored.sourceToken;
          if (!sourceToken) {
            const source = await readHistorySource(tx, db, c, stored.resource);
            if (!source) workFail('failed-precondition', 'Fonte da versão indisponível.');
            sourceToken = source.source.sourceToken;
            tx.update(unit, {
              sourceToken,
              contentHash: source.source.contentHash,
              state: 'reserved',
            });
            touchLiteraryBackupWrite(tx, c);
          }
          return {
            capture: {
              index: job.captured,
              resource: stored.resource,
              sourceToken,
              operationId:
                'literary-' + digest({ uid, target: c.target, jobId, index: job.captured }),
              label:
                (job.kind === 'firstDraft' ? 'Primeira versão' : 'Versão revisada') +
                ' · ' +
                job.chapterId,
            },
          };
        }
        if (job.state === 'verifying') {
          const source = await envelope(tx, c, job.chapterId);
          if (readWorkHistoryRevision(source.root) !== job.verifyHistoryRevision) {
            const updated = {
              ...job,
              verified: 0,
              verifyHistoryRevision: readWorkHistoryRevision(source.root),
            };
            writeLiteraryBackupProcess(tx, c, 'milestone', 'set', ref, updated);
            return { result: summary(updated) };
          }
          if (job.verified < job.planned) {
            const unit = (await tx.get(unitRef(c, jobId, job.verified))).data();
            if (!unit || unit.state !== 'captured')
              workFail('failed-precondition', 'Versão ainda não confirmada.');
            let version;
            try {
              version = await readHistoryVersion(tx, db, c, unit.versionId);
            } catch (cause) {
              if (!['not-found', 'failed-precondition', 'permission-denied'].includes(cause.code))
                throw cause;
              writeLiteraryBackupProcess(tx, c, 'milestone', 'update', ref, { state: 'stale' });
              return { result: summary({ ...job, state: 'stale' }) };
            }
            const live = await readHistorySource(tx, db, c, unit.resource);
            if (
              !live ||
              live.source.sourceToken !== unit.sourceToken ||
              version.contentHash !== unit.contentHash
            ) {
              writeLiteraryBackupProcess(tx, c, 'milestone', 'update', ref, { state: 'stale' });
              return { result: summary({ ...job, state: 'stale' }) };
            }
            writeLiteraryBackupProcess(tx, c, 'milestone', 'update', ref, {
              verified: job.verified + 1,
            });
            return { result: summary({ ...job, verified: job.verified + 1 }) };
          }
          const updated = { ...job, state: 'done', completedAt: workDate(now, job.createdAt) };
          writeLiteraryBackupProcess(tx, c, 'milestone', 'set', ref, updated);
          return { result: summary(updated) };
        }
        workFail('failed-precondition', 'Etapa de captura inválida.');
      });
      if (action.result) return action.result;
      const task = action.capture;
      // Native history owns body chunks/pins and idempotent receipts.
      const captured = await history.createWorkVersion(uid, {
        target: c.target,
        resource: task.resource,
        operationId: task.operationId,
        expectedSourceToken: task.sourceToken,
        label: task.label,
      });
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const job = (await tx.get(ref)).data();
        if (!job) workFail('not-found', 'Captura indisponível.');
        if (!(await current(tx, c, ref, job)) || job.captured !== task.index) return summary(job);
        const unit = unitRef(c, jobId, task.index),
          stored = (await tx.get(unit)).data();
        if (stored?.sourceToken !== task.sourceToken)
          workFail('failed-precondition', 'A reserva de versão mudou.');
        const version = await readHistoryVersion(tx, db, c, captured.version.id);
        if (version.contentHash !== stored.contentHash)
          workFail('failed-precondition', 'A versão não corresponde à reserva.');
        const source = await envelope(tx, c, job.chapterId),
          count = job.captured + 1;
        const updated = {
          ...job,
          captured: count,
          wordCount: job.wordCount + version.wordCount,
          state: count === job.planned ? 'verifying' : 'capturing',
          ...(count === job.planned
            ? { verifyHistoryRevision: readWorkHistoryRevision(source.root) }
            : {}),
        };
        const jobBirth = literaryNativeBirth(await readWorkMetadata(tx, ref, []));
        const historyRow = await readWorkMetadata(
          tx,
          db.doc(c.path + '/workVersions/' + version.id),
          [],
        );
        tx.update(unit, {
          state: 'captured',
          versionId: version.id,
          captureBinding: {
            version: 1,
            jobBirth,
            history: { id: version.id, birth: literaryNativeBirth(historyRow) },
          },
        });
        writeLiteraryBackupProcess(tx, c, 'milestone', 'set', ref, updated);
        return summary(updated);
      });
    },
    async recheckLiteraryMilestone(uid, data) {
      const c = scope(db, uid, data, ['jobId']),
        jobId = validateId(data.jobId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const ref = jobRef(c, jobId),
          job = (await tx.get(ref)).data();
        if (!job) workFail('not-found', 'Captura indisponível.');
        if (job.state === 'canceled' || job.state === 'stale') return summary(job);
        const actual = await envelope(tx, c, job.chapterId);
        if (actual.token !== job.sourceToken) {
          writeLiteraryBackupProcess(tx, c, 'milestone', 'update', ref, { state: 'stale' });
          return summary({ ...job, state: 'stale' });
        }
        if (
          job.state === 'done' &&
          readWorkHistoryRevision(actual.root) !== job.verifyHistoryRevision
        ) {
          const next = {
            ...job,
            state: 'verifying',
            verified: 0,
            verifyHistoryRevision: readWorkHistoryRevision(actual.root),
          };
          writeLiteraryBackupProcess(tx, c, 'milestone', 'set', ref, next);
          return summary(next);
        }
        return summary(job);
      });
    },
    async listLiteraryMilestoneVersions(uid, data) {
      const c = scope(db, uid, data, ['jobId', 'afterIndex']),
        jobId = validateId(data.jobId);
      const after = data.afterIndex == null ? -1 : workRevision(data.afterIndex);
      return db.runTransaction(async (tx) => {
        await workProject(tx, c);
        const job = (await tx.get(jobRef(c, jobId))).data();
        if (!job) workFail('not-found', 'Captura indisponível.');
        let query = db
          .collection(c.path + '/literaryMilestoneUnits')
          .where('jobId', '==', jobId)
          .orderBy('index')
          .limit(20);
        if (after >= 0) query = query.startAfter(after);
        const page = await tx.get(query),
          items = [];
        for (const row of page.docs) {
          const value = row.data();
          items.push({
            index: value.index,
            resource: value.resource,
            version: value.versionId
              ? versionSummary(await readHistoryVersion(tx, db, c, value.versionId))
              : null,
          });
        }
        return {
          items,
          nextAfterIndex: page.docs.length === 20 ? page.docs.at(-1).data().index : null,
        };
      });
    },
  };
}
