import {
  workScope,
  workProject,
  workId,
  workFail,
  workRevision,
  workClosed,
  digest,
} from './workProgressContracts.mjs';
import { editorialStored } from './literaryContracts.mjs';
import { literaryPlan } from './literaryPlanningSchema.mjs';
import { createLiteraryReferenceReader, mergeLiteraryReferences } from './literaryReferences.mjs';
import { captureLiteraryAIContext } from './literaryAIContext.mjs';
import { composeEditorialContract } from './literaryEditorialComposition.mjs';
import {
  normalizeLiteraryWritingManifest,
  normalizeLiteraryWritingSnapshot,
} from './literaryWritingProtocol.mjs';

const birth = (snapshot) => {
  const stamp = snapshot.createTime;
  if (!Number.isSafeInteger(stamp?.seconds) || !Number.isSafeInteger(stamp?.nanoseconds))
    workFail('failed-precondition', 'Identidade editorial indisponível.');
  return [stamp.seconds, stamp.nanoseconds];
};
const planIdentity = (context, snapshot, bookToken) =>
  digest({
    domain: 'literary-plan-identity-v1',
    uid: context.uid,
    bookToken,
    id: snapshot.id,
    birth: birth(snapshot),
  });
const subjectKinds = ['act', 'chapter', 'scene'];
const compactFields = {
  scenePreparation: ['perception', 'reservations', 'sources'],
  localWorldbuilding: ['constraints', 'invariants'],
  chapterBrief: [
    'function',
    'pointOfView',
    'initialKnowledge',
    'allowedRevelations',
    'reservations',
    'invariants',
  ],
  actTreatment: ['function', 'initialState', 'reservations'],
  knowledgeState: ['known', 'unknown', 'belief', 'narrator', 'reader'],
  planting: ['element', 'reservation'],
  bookOverview: ['question'],
  seriesBridge: ['allowed', 'reserved'],
};
function selectedIds(value) {
  if (value === undefined) return undefined;
  if (!Array.isArray(value) || value.length > 8)
    workFail('invalid-argument', 'Escolha até oito planejamentos.');
  const ids = value.map(workId);
  if (new Set(ids).size !== ids.length) workFail('invalid-argument', 'Planejamento repetido.');
  return ids.sort();
}
export function literaryWritingScope(db, uid, target) {
  const context = workScope(db, uid, { target }, []);
  if (context.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
  return context;
}
async function units(tx, context, resource) {
  workClosed(resource, ['kind', 'id']);
  if (!resource || !['chapter', 'scene'].includes(resource.kind))
    workFail('invalid-argument', 'Unidade editorial inválida.');
  const id = workId(resource.id),
    result = [{ kind: resource.kind, id }];
  let chapter;
  if (resource.kind === 'scene') {
    const scene = (await tx.get(context.db.doc(context.path + '/scenes/' + id))).data();
    if (!scene || scene.ownerId !== context.uid || scene.deleting || scene.archived)
      workFail('not-found', 'Cena indisponível.');
    if (scene.parentId != null) {
      chapter = (
        await tx.get(context.db.doc(context.path + '/chapters/' + workId(scene.parentId)))
      ).data();
      if (!chapter || chapter.deleting || chapter.contentMode !== 'scenes')
        workFail('not-found', 'Capítulo da cena indisponível.');
      result.push({ kind: 'chapter', id: scene.parentId });
    }
  } else chapter = (await tx.get(context.db.doc(context.path + '/chapters/' + id))).data();
  if (
    resource.kind === 'chapter' &&
    (!chapter || chapter.deleting || (chapter.bookId && chapter.bookId !== context.target.id))
  )
    workFail('not-found', 'Capítulo indisponível.');
  if (chapter?.actId) result.push({ kind: 'act', id: workId(chapter.actId) });
  return result;
}
async function automaticPlans(tx, context, resource) {
  const scope = await units(tx, context, resource);
  const ids = new Set();
  const overview = await tx.get(
    context.db
      .collection(context.path + '/literaryPlans')
      .where('plan.kind', '==', 'bookOverview')
      .limit(9)
      .select('plan.status'),
  );
  for (const row of overview.docs) if (row.data().plan.status !== 'gap') ids.add(row.id);
  for (const subject of scope) {
    const page = await tx.get(
      context.db
        .collection(context.path + '/literaryPlanLinks')
        .where('kind', '==', subject.kind)
        .where('refId', '==', subject.id)
        .where('purpose', '==', 'subject')
        .limit(9)
        .select('planId'),
    );
    if (page.docs.length === 9)
      workFail(
        'resource-exhausted',
        'Há muitas fichas vinculadas. Escolha as fontes de contexto explicitamente.',
      );
    for (const row of page.docs) ids.add(row.data().planId);
  }
  if (overview.docs.length === 9 || ids.size > 8)
    workFail('resource-exhausted', 'Escolha até oito planejamentos para esta operação.');
  return [...ids].sort();
}
export async function readLiteraryWritingEnvironment(tx, context, resource, planIds) {
  const root = await workProject(tx, context);
  await units(tx, context, resource);
  const bookSnapshot = await tx.get(context.ref);
  const bookToken = digest({
    domain: 'literary-writing-book-v1',
    uid: context.uid,
    target: context.target,
    birth: birth(bookSnapshot),
  });
  const explicit = selectedIds(planIds),
    ids = explicit ?? (await automaticPlans(tx, context, resource));
  const editorial = editorialStored(
    (await tx.get(context.db.doc(context.path + '/literaryProduction/current'))).data(),
  );
  const plans = [],
    linked = [];
  for (const id of ids) {
    const snapshot = await tx.get(context.db.doc(context.path + '/literaryPlans/' + id)),
      stored = snapshot.data();
    if (!stored) workFail('failed-precondition', 'Um planejamento do contexto ficou indisponível.');
    const plan = literaryPlan(stored.plan),
      revision = workRevision(stored.revision);
    plans.push({ id, identityToken: planIdentity(context, snapshot, bookToken), revision });
    linked.push(...plan.references);
  }
  const distinct = mergeLiteraryReferences(context, root, linked);
  if (distinct.length > 24)
    workFail(
      'resource-exhausted',
      'Escolha menos planejamentos; o contexto admite até 24 vínculos.',
    );
  const read = await createLiteraryReferenceReader(tx, context, root),
    references = [];
  for (const reference of distinct) {
    const current = await read(reference);
    if (
      !current ||
      current.reference.sourceToken !== reference.sourceToken ||
      (reference.purpose !== 'subject' && current.reference.revision !== reference.revision)
    )
      workFail(
        'failed-precondition',
        'Uma fonte do planejamento mudou. Confira os vínculos antes de usar IA.',
      );
    references.push({
      reference,
      identityToken: current.identityToken,
      versionToken:
        reference.purpose === 'subject' && subjectKinds.includes(reference.kind)
          ? current.identityToken
          : current.versionToken,
    });
  }
  const manifest = normalizeLiteraryWritingManifest({
    version: 1,
    target: context.target,
    resource: { kind: resource.kind, id: resource.id },
    bookToken,
    selection: explicit === undefined ? 'automatic' : 'explicit',
    contractRevision: editorial.revision,
    planIds: ids,
    plans,
    references,
  });
  return { root, editorial, manifest, stateToken: digest(manifest) };
}
export async function captureLiteraryWritingSnapshot(
  tx,
  context,
  resource,
  { planIds, mode = 'chat' } = {},
) {
  if (!['chat', 'autocomplete'].includes(mode))
    workFail('invalid-argument', 'Modo de contexto inválido.');
  const root = await workProject(tx, context);
  if (root.hasLiteraryResources !== true) return null;
  const environment = await readLiteraryWritingEnvironment(tx, context, resource, planIds);
  if (environment.editorial.revision === 0 && environment.manifest.planIds.length === 0)
    return null;
  const request = {
    expectedRevision: environment.editorial.revision,
    sourcePlanIds: environment.manifest.planIds,
    plan: {
      kind: 'chapterBrief',
      title: 'Contexto da unidade em escrita',
      status: 'working',
      fields: {},
      references: [],
    },
  };
  const omittedFields = [];
  let documents;
  if (mode === 'chat') {
    const captured = await captureLiteraryAIContext(tx, context, request);
    documents = captured.documents.filter(
      (document) => !['contract', 'draft'].includes(document.id),
    );
  } else {
    documents = [];
    for (const id of environment.manifest.planIds) {
      const value = (await tx.get(context.db.doc(context.path + '/literaryPlans/' + id))).data();
      const plan = literaryPlan(value.plan),
        keep = compactFields[plan.kind] ?? [];
      for (const key of Object.keys(plan.fields))
        if (!keep.includes(key) && plan.fields[key]) omittedFields.push('plan:' + id + ':' + key);
      documents.push({
        id: 'plan:' + id,
        label: plan.title,
        revision: value.revision,
        text: JSON.stringify({
          ...plan,
          fields: Object.fromEntries(
            keep
              .filter((key) => Object.hasOwn(plan.fields, key))
              .map((key) => [key, plan.fields[key]]),
          ),
        }),
      });
    }
    for (const reference of environment.manifest.references)
      if (reference.reference.purpose === 'source')
        omittedFields.push(
          reference.reference.kind + ':' + reference.reference.id + ':conteúdo de fonte',
        );
  }
  const snapshot = {
    version: 1,
    manifest: environment.manifest,
    stateToken: environment.stateToken,
    mode,
    instruction: composeEditorialContract(environment.editorial.contract).instruction,
    documents,
    coverage: {
      scope: 'selected-editorial-sources',
      completeForSelection: mode === 'chat',
      wholeBook: false,
      omittedFields,
    },
  };
  try {
    return normalizeLiteraryWritingSnapshot(snapshot);
  } catch {
    workFail(
      'resource-exhausted',
      'O contexto editorial excede o orçamento desta operação. Reduza as fontes ou o guia; restrições essenciais não foram truncadas.',
    );
  }
}
export async function authorizeLiteraryWritingManifest(tx, context, value) {
  const manifest = normalizeLiteraryWritingManifest(value),
    root = await workProject(tx, context);
  if (digest(manifest.target) !== digest(context.target))
    workFail('permission-denied', 'Contexto de outro livro.');
  const book = await tx.get(context.ref);
  const token = digest({
    domain: 'literary-writing-book-v1',
    uid: context.uid,
    target: context.target,
    birth: birth(book),
  });
  if (token !== manifest.bookToken) workFail('permission-denied', 'A origem do contexto mudou.');
  for (const plan of manifest.plans) {
    const row = await tx.get(context.db.doc(context.path + '/literaryPlans/' + plan.id));
    if (!row.exists || planIdentity(context, row, token) !== plan.identityToken)
      workFail('permission-denied', 'Um planejamento do contexto foi retirado.');
  }
  const read = await createLiteraryReferenceReader(tx, context, root);
  for (const item of manifest.references) {
    const current = await read(item.reference);
    if (!current || current.identityToken !== item.identityToken)
      workFail('permission-denied', 'Uma origem do contexto foi retirada ou recriada.');
  }
  return manifest;
}
export async function literaryWritingIsCurrent(tx, context, value) {
  const manifest = normalizeLiteraryWritingManifest(value);
  await authorizeLiteraryWritingManifest(tx, context, manifest);
  try {
    const current = await readLiteraryWritingEnvironment(
      tx,
      context,
      manifest.resource,
      manifest.selection === 'automatic' ? undefined : manifest.planIds,
    );
    return current.stateToken === digest(manifest);
  } catch (cause) {
    if (['failed-precondition', 'resource-exhausted', 'not-found'].includes(cause.code))
      return false;
    throw cause;
  }
}
export function createLiteraryWritingService({ db }) {
  return {
    async checkLiteraryWritingContext(uid, data) {
      const context = workScope(db, uid, data, ['manifest']);
      if (context.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
      const manifest = normalizeLiteraryWritingManifest(data.manifest);
      return db.runTransaction(async (tx) => ({
        current: await literaryWritingIsCurrent(tx, context, manifest),
      }));
    },
    async getLiteraryWritingContext(uid, data) {
      const context = workScope(db, uid, data, ['resource', 'planIds', 'mode']);
      if (context.target.kind !== 'book') workFail('invalid-argument', 'Escolha um livro.');
      return db.runTransaction((tx) =>
        captureLiteraryWritingSnapshot(tx, context, data.resource, {
          planIds: data.planIds,
          mode: data.mode ?? 'chat',
        }),
      );
    },
  };
}
