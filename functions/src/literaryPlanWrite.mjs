import {
  workRevision,
  workConflict,
  workFail,
  workDate,
  digest,
} from './workProgressContracts.mjs';
import { literaryPlan } from './literaryPlanningSchema.mjs';
import { createLiteraryReferenceReader } from './literaryReferences.mjs';

/** Prepare the normal native plan writer. Caller finishes all reads before commit. */
export async function prepareLiteraryPlanSave(
  tx,
  { context, root, current, id, expectedRevision, plan: input, now },
) {
  const plan = literaryPlan(input),
    db = context.db;
  if ((current?.revision ?? 0) !== expectedRevision) workConflict();
  if (current && current.plan.kind !== plan.kind)
    workFail('failed-precondition', 'O tipo do documento não pode ser alterado.');
  const read = await createLiteraryReferenceReader(tx, context, root);
  for (const reference of plan.references) {
    const actual = await read(reference);
    if (
      !actual ||
      actual.reference.sourceToken !== reference.sourceToken ||
      (reference.purpose !== 'subject' && actual.reference.revision !== reference.revision)
    )
      workFail(
        'failed-precondition',
        'Uma referência mudou ou ficou indisponível. Confira novamente antes de salvar.',
      );
  }
  if (current && digest(current.plan) === digest(plan)) {
    const result = { id, revision: current.revision, updatedAt: current.updatedAt };
    const rootPatch = root.hasLiteraryResources !== true ? { hasLiteraryResources: true } : null;
    return {
      changed: false,
      value: current,
      result,
      rootPatch,
      commit({ writeRoot = true } = {}) {
        if (writeRoot && rootPatch) tx.update(context.ref, rootPatch);
      },
    };
  }
  const revision = workRevision(expectedRevision + 1);
  const updatedAt = workDate(now, Math.max(root.updatedAt ?? 0, current?.updatedAt ?? 0));
  const result = { id, revision, updatedAt };
  const value = { schemaVersion: 1, ...result, plan, createdAt: current?.createdAt ?? updatedAt };
  const linkKey = (reference) =>
    digest({
      planId: id,
      kind: reference.kind,
      scopeId: reference.scopeId,
      id: reference.id,
      purpose: reference.purpose ?? 'source',
    });
  const oldLinks = new Map(
    (current?.plan.references ?? []).map((reference) => [linkKey(reference), reference]),
  );
  const newLinks = new Map(plan.references.map((reference) => [linkKey(reference), reference]));
  const rootPatch = {
    updatedAt,
    hasLiteraryResources: true,
    literaryRevision: workRevision((root.literaryRevision ?? 0) + 1),
    literaryContextRevision: workRevision((root.literaryContextRevision ?? 0) + 1),
  };
  return {
    changed: true,
    value,
    result,
    rootPatch,
    commit({ writeRoot = true } = {}) {
      for (const [key] of oldLinks)
        if (!newLinks.has(key)) tx.delete(db.doc(context.path + '/literaryPlanLinks/' + key));
      for (const [key, reference] of newLinks)
        tx.set(db.doc(context.path + '/literaryPlanLinks/' + key), {
          planId: id,
          kind: reference.kind,
          refId: reference.id,
          scopeId: reference.scopeId,
          purpose: reference.purpose,
        });
      tx.set(db.doc(context.path + '/literaryPlans/' + id), value);
      tx.create(db.doc(context.path + '/literaryPlanVersions/' + digest({ id, revision })), value);
      if (writeRoot) tx.update(context.ref, rootPatch);
    },
  };
}
