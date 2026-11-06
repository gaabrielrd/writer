import { prepareLiteraryPlanSave } from './literaryPlanWrite.mjs';
import { literaryVolumeUnitId, LITERARY_VOLUME_UNIT_KINDS } from './literaryVolumeProtocol.mjs';
import {
  workScope,
  workProject,
  workFail,
  workId,
  workRevision,
  workLimit,
  digest,
} from './workProgressContracts.mjs';
import { validateId } from './generation.mjs';
import {
  LITERARY_PLAN_SCHEMA,
  LITERARY_REFERENCE_KINDS,
  literaryPlan,
} from './literaryPlanningSchema.mjs';
import {
  createLiteraryReferenceReader,
  literaryReferenceCollection,
} from './literaryReferences.mjs';

function scope(db, uid, data, keys) {
  const context = workScope(db, uid, data, keys);
  if (context.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return context;
}
export async function readLiteraryPlanSourceViews(read, references) {
  const result = [];
  for (const reference of references) {
    const current = await read(reference, true);
    result.push({
      label:
        current !== null && current.reference.sourceToken === reference.sourceToken
          ? current.label
          : null,
      reference,
      currentReference:
        current !== null && current.reference.sourceToken === reference.sourceToken
          ? current.reference
          : null,
      available: current !== null && current.reference.sourceToken === reference.sourceToken,
      changed:
        current !== null &&
        (current.reference.sourceToken !== reference.sourceToken ||
          (reference.purpose !== 'subject' && current.reference.revision !== reference.revision)),
    });
  }
  return result;
}
export function createLiteraryPlanningService({ db, now = Date.now }) {
  return {
    async listLiteraryPlanVersions(uid, data) {
      const context = scope(db, uid, data, ['id', 'beforeRevision', 'limit']);
      const id = workId(data.id);
      const limit = workLimit(data.limit);
      const before = data.beforeRevision == null ? null : workRevision(data.beforeRevision);
      return db.runTransaction(async (tx) => {
        await workProject(tx, context);
        let query = db
          .collection(context.path + '/literaryPlanVersions')
          .where('id', '==', id)
          .orderBy('revision', 'desc')
          .limit(limit)
          .select('id', 'revision', 'updatedAt');
        if (before !== null) query = query.startAfter(before);
        const page = await tx.get(query);
        return {
          items: page.docs.map((row) => row.data()),
          nextBeforeRevision: page.docs.length === limit ? page.docs.at(-1).data().revision : null,
        };
      });
    },
    async getLiteraryPlanVersion(uid, data) {
      const context = scope(db, uid, data, ['id', 'revision']);
      const id = workId(data.id),
        revision = workRevision(data.revision);
      return db.runTransaction(async (tx) => {
        const root = await workProject(tx, context);
        const value = (
          await tx.get(db.doc(context.path + '/literaryPlanVersions/' + digest({ id, revision })))
        ).data();
        if (!value) workFail('not-found', 'Versão do planejamento indisponível.');
        const read = await createLiteraryReferenceReader(tx, context, root);
        return {
          ...value,
          sources: await readLiteraryPlanSourceViews(read, value.plan.references),
        };
      });
    },
    async listLiteraryPlans(uid, data) {
      const context = scope(db, uid, data, ['afterId', 'limit']);
      const limit = workLimit(data.limit);
      const afterId = data.afterId == null ? null : workId(data.afterId);
      return db.runTransaction(async (tx) => {
        const root = await workProject(tx, context);
        let query = db
          .collection(context.path + '/literaryPlans')
          .orderBy('__name__')
          .limit(limit)
          .select('plan.title', 'plan.kind', 'plan.status', 'revision');
        if (afterId !== null) query = query.startAfter(afterId);
        const page = await tx.get(query);
        return {
          schema: LITERARY_PLAN_SCHEMA,
          items: page.docs.map((row) => ({
            id: row.id,
            title: row.data().plan.title,
            kind: row.data().plan.kind,
            status: row.data().plan.status,
            revision: row.data().revision,
          })),
          nextAfterId: page.docs.length === limit ? page.docs.at(-1).id : null,
          projectUpdatedAt: root.updatedAt,
        };
      });
    },
    async getLiteraryPlan(uid, data) {
      const context = scope(db, uid, data, ['id']);
      const id = workId(data.id);
      return db.runTransaction(async (tx) => {
        const root = await workProject(tx, context);
        const value = (await tx.get(db.doc(context.path + '/literaryPlans/' + id))).data();
        if (!value) workFail('not-found', 'Documento editorial indisponível.');
        const read = await createLiteraryReferenceReader(tx, context, root);
        return {
          ...value,
          id,
          sources: await readLiteraryPlanSourceViews(read, value.plan.references),
        };
      });
    },
    async saveLiteraryPlan(uid, data) {
      const context = scope(db, uid, data, ['id', 'operationId', 'expectedRevision', 'plan']);
      const id = workId(data.id);
      const operationId = validateId(data.operationId);
      const expectedRevision = workRevision(data.expectedRevision);
      const plan = literaryPlan(data.plan);
      const fingerprint = digest({ method: 'saveLiteraryPlan', id, expectedRevision, plan });
      const receiptRef = db.doc(context.path + '/literaryOperations/' + operationId);
      const ref = db.doc(context.path + '/literaryPlans/' + id);
      return db.runTransaction(async (tx) => {
        const root = await workProject(tx, context);
        const previous = (await tx.get(receiptRef)).data();
        const current = (await tx.get(ref)).data();
        if (previous) {
          if (previous.fingerprint !== fingerprint)
            workFail('invalid-argument', 'Operação usada por outro documento.');
          return { id, revision: previous.revision, updatedAt: previous.updatedAt };
        }
        const prepared = await prepareLiteraryPlanSave(tx, {
          context,
          root,
          current,
          id,
          expectedRevision,
          plan,
          now,
        });
        prepared.commit();
        tx.create(receiptRef, {
          method: 'saveLiteraryPlan',
          fingerprint,
          ...prepared.result,
          ...(!prepared.changed ? { noOp: true } : {}),
        });
        return prepared.result;
      });
    },
    async listLiteraryVolumeBooks(uid, data) {
      const context = scope(db, uid, data, ['afterId', 'limit']);
      const limit = workLimit(data.limit),
        afterId = data.afterId == null ? null : workId(data.afterId);
      return db.runTransaction(async (tx) => {
        await workProject(tx, context);
        let query = db
          .collection('books')
          .where('authorId', '==', uid)
          .orderBy('__name__')
          .limit(limit)
          .select('title', 'authorId', 'deleting');
        if (afterId !== null) query = query.startAfter(afterId);
        const page = await tx.get(query);
        return {
          items: page.docs
            .filter(
              (row) =>
                row.id !== context.target.id && row.data().authorId === uid && !row.data().deleting,
            )
            .map((row) => ({ id: row.id, title: row.data().title ?? row.id })),
          nextAfterId: page.docs.length === limit ? page.docs.at(-1).id : null,
        };
      });
    },
    async listLiteraryReferences(uid, data) {
      const context = scope(db, uid, data, [
        'kind',
        'afterId',
        'limit',
        'purpose',
        'sourceBookId',
        'unitKind',
      ]);
      if (!LITERARY_REFERENCE_KINDS.includes(data.kind))
        workFail('invalid-argument', 'Tipo de referência inválido.');
      const limit = workLimit(data.limit);
      const purpose = data.purpose ?? 'source';
      if (!['source', 'subject'].includes(purpose))
        workFail('invalid-argument', 'Finalidade inválida.');
      const afterId = data.afterId == null ? null : workId(data.afterId);
      return db.runTransaction(async (tx) => {
        const root = await workProject(tx, context);
        let referenceContext = context;
        if (data.kind === 'volumeUnit') {
          if (purpose !== 'source' || !LITERARY_VOLUME_UNIT_KINDS.includes(data.unitKind))
            workFail('invalid-argument', 'Escolha o tipo de unidade de origem como fonte.');
          const sourceBookId = workId(data.sourceBookId);
          if (sourceBookId === context.target.id)
            workFail('invalid-argument', 'Escolha outro volume.');
          referenceContext = workScope(db, uid, { target: { kind: 'book', id: sourceBookId } }, []);
          await workProject(tx, referenceContext);
        } else if (data.sourceBookId != null || data.unitKind != null)
          workFail('invalid-argument', 'Origem de volume só se aplica a vínculo entre volumes.');
        const path = literaryReferenceCollection(
          referenceContext,
          root,
          data.kind === 'volumeUnit' ? data.unitKind : data.kind,
        );
        if (!path) return { items: [], nextAfterId: null };
        const read = await createLiteraryReferenceReader(tx, context, root);
        let query = db.collection(path).orderBy('__name__').limit(limit).select();
        if (afterId !== null) query = query.startAfter(afterId);
        const page = await tx.get(query);
        const items = [];
        for (const row of page.docs) {
          const current = await read(
            data.kind === 'volumeUnit'
              ? {
                  kind: 'volumeUnit',
                  id: literaryVolumeUnitId({
                    bookId: data.sourceBookId,
                    kind: data.unitKind,
                    id: row.id,
                  }),
                  scopeId: data.sourceBookId,
                  purpose,
                }
              : { kind: data.kind, id: row.id, purpose },
            true,
          );
          if (current) items.push(current);
        }
        return { items, nextAfterId: page.docs.length === limit ? page.docs.at(-1).id : null };
      });
    },
  };
}
