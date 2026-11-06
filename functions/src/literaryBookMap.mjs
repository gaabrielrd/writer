import { validSceneRank } from './sceneRanks.mjs';
import {
  workScope,
  workProject,
  workFail,
  workId,
  workLimit,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { sequenceKey } from './narrativeContracts.mjs';
import { createLiteraryReferenceReader } from './literaryReferences.mjs';
import { readLiteraryPlanSourceViews } from './literaryPlanning.mjs';
import { literaryPlan, LITERARY_PLAN_SCHEMA } from './literaryPlanningSchema.mjs';

const resources = {
  acts: { collection: 'acts', fields: ['name', 'order'] },
  chapters: { collection: 'chapters', fields: ['title', 'order', 'actId', 'contentMode'] },
  events: {
    collection: 'timelineEvents',
    fields: ['title', 'dateLabel', 'rankA', 'rankB', 'description'],
  },
  plans: { collection: 'literaryPlans', fields: ['plan'] },
};
function stamp(row) {
  if (!row.exists) return null;
  const birth = row.createTime,
    changed = row.updateTime;
  if (
    ![birth?.seconds, birth?.nanoseconds, changed?.seconds, changed?.nanoseconds].every(
      Number.isSafeInteger,
    )
  )
    workFail('failed-precondition', 'A identidade das fontes do mapa não está disponível.');
  return {
    birth: [birth.seconds, birth.nanoseconds],
    changed: [changed.seconds, changed.nanoseconds],
  };
}
const number = (value) => {
  if (!Number.isSafeInteger(value) || value < 0)
    workFail('failed-precondition', 'A ordem da estrutura não está disponível.');
  return value;
};
function label(value, max = 300) {
  if (typeof value !== 'string' || value.length > max)
    workFail('failed-precondition', 'Há metadados inválidos no mapa.');
  return value;
}
/** Read-only, root-fenced metadata census. Never authorizes AI, writes, publication or whole-text claims. */
export function createLiteraryBookMapService({ db }) {
  return {
    async readLiteraryBookMapPage(uid, data) {
      const c = workScope(db, uid, data, ['resource', 'afterId', 'limit', 'fence']);
      if (c.target.kind !== 'book') workFail('invalid-argument', 'O mapa exige um livro.');
      if (!Object.hasOwn(resources, data.resource))
        workFail('invalid-argument', 'Área do mapa inválida.');
      const resource = data.resource,
        definition = resources[resource];
      const limit = workLimit(data.limit ?? (resource === 'plans' ? 3 : 25));
      if (resource === 'plans' && limit > 3)
        workFail('invalid-argument', 'Leia até três fichas por página.');
      const afterId = data.afterId == null ? null : workId(data.afterId);
      const expected = data.fence ?? null;
      if (
        (expected !== null && (typeof expected !== 'string' || !/^[a-f0-9]{64}$/.test(expected))) ||
        (afterId !== null && expected === null)
      )
        workFail('invalid-argument', 'Retome o mapa com a versão capturada.');
      return db.runTransaction(async (tx) => {
        const root = await workProject(tx, c);
        const book = await readWorkMetadata(tx, c.ref, []);
        const control = await tx.get(
          db.doc(c.path + '/narrativeControls/' + sequenceKey({ kind: 'event' })),
        );
        let world = null;
        if (root.universeId) {
          const snapshot = await readWorkMetadata(
            tx,
            db.doc('universes/' + workId(root.universeId)),
            ['authorId', 'deleting'],
          );
          world = {
            version: stamp(snapshot),
            available:
              snapshot.exists && snapshot.data().authorId === uid && !snapshot.data().deleting,
          };
        }
        const fence = digest({
          domain: 'literary-book-map-v1',
          uid,
          target: c.target,
          book: stamp(book),
          universeId: root.universeId ?? null,
          world,
          sequence: stamp(control),
        });
        if (expected !== null && expected !== fence)
          workFail(
            'failed-precondition',
            'As fontes do mapa mudaram. Atualize a leitura para comparar a versão atual.',
            'map-source-changed',
          );
        let query = db
          .collection(c.path + '/' + definition.collection)
          .orderBy('__name__')
          .limit(limit)
          .select(
            'ownerId',
            'bookId',
            'deleting',
            'deleted',
            'archived',
            'revision',
            'updatedAt',
            ...definition.fields,
          );
        if (afterId !== null) query = query.startAfter(afterId);
        const page = await tx.get(query),
          items = [];
        for (const snapshot of page.docs) {
          const value = snapshot.data();
          if (
            value.deleting ||
            value.deleted ||
            value.archived ||
            (value.ownerId != null && value.ownerId !== uid) ||
            (value.bookId != null && value.bookId !== c.target.id)
          )
            continue;
          const base = {
            id: snapshot.id,
            version: digest({ resource, id: snapshot.id, stamp: stamp(snapshot) }),
            revision: number(value.revision ?? value.updatedAt ?? 0),
          };
          if (resource === 'plans') {
            const plan = literaryPlan(value.plan);
            const read = await createLiteraryReferenceReader(tx, c, root);
            items.push({
              ...base,
              resource,
              plan,
              fieldLabels: LITERARY_PLAN_SCHEMA[plan.kind].fields,
              sources: await readLiteraryPlanSourceViews(read, plan.references),
            });
          } else if (resource === 'acts')
            items.push({
              ...base,
              resource,
              name: label(value.name ?? ''),
              order: number(value.order),
            });
          else if (resource === 'chapters')
            items.push({
              ...base,
              resource,
              title: label(value.title),
              order: number(value.order),
              actId: value.actId == null ? null : workId(value.actId),
              contentMode: value.contentMode ?? 'legacy',
            });
          else {
            const slot = control.data()?.rankSlot ?? 'A';
            if (!['A', 'B'].includes(slot))
              workFail('failed-precondition', 'A ordem da cronologia é inválida.');
            const rank = value['rank' + slot];
            if (!validSceneRank(rank))
              workFail('failed-precondition', 'A ordem do evento precisa de reconferência.');
            items.push({
              ...base,
              resource,
              title: label(value.title),
              dateLabel: label(value.dateLabel ?? '', 300),
              rank,
              description: label(value.description ?? '', 6000),
            });
          }
        }
        return {
          fence,
          resource,
          items,
          nextAfterId: page.docs.length === limit ? page.docs.at(-1).id : null,
          coverage: { kind: 'root-fenced-metadata-read', manuscriptRead: false },
        };
      });
    },
  };
}
