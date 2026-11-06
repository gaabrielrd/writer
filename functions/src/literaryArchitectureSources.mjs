import {
  workProject,
  workId,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { editorialStored } from './literaryContracts.mjs';
import { composeEditorialContract } from './literaryEditorialComposition.mjs';
import { literaryPlan } from './literaryPlanningSchema.mjs';
import { createLiteraryReferenceReader } from './literaryReferences.mjs';
import { readLiteraryPlanSourceViews } from './literaryPlanning.mjs';
import {
  reference as narrativeReference,
  resource as narrativeResource,
  sequenceKey,
} from './narrativeContracts.mjs';

// Every family is traversed to exhaustion. Per-request limits are execution budgets, not book quotas.
export const LITERARY_ARCHITECTURE_FAMILIES = Object.freeze([
  'contract',
  'plan',
  'act',
  'chapter',
  'scene',
  'arc',
  'event',
  'arcMilestone',
  'sceneLink',
  'narrativeLink',
  'narrativeControl',
]);
const definitions = {
  contract: { collection: 'literaryProduction', fields: ['revision', 'updatedAt', 'contract'] },
  plan: { collection: 'literaryPlans', fields: ['revision', 'updatedAt', 'plan'] },
  act: { collection: 'acts', fields: ['name', 'order'] },
  chapter: {
    collection: 'chapters',
    fields: ['title', 'order', 'actId', 'contentMode', 'rankSlot'],
  },
  scene: {
    collection: 'scenes',
    fields: [
      'title',
      'parentId',
      'stage',
      'planning.objective',
      'planning.conflict',
      'planning.pointOfView',
      'rankA',
      'rankB',
    ],
  },
  arc: {
    collection: 'arcs',
    fields: ['title', 'initialState', 'objective', 'plannedOutcome', 'rankA', 'rankB'],
  },
  event: {
    collection: 'timelineEvents',
    fields: ['title', 'description', 'dateLabel', 'rankA', 'rankB'],
  },
  arcMilestone: { collection: null, fields: ['title', 'notes', 'rankA', 'rankB'] },
  sceneLink: { collection: 'sceneLoreLinks', fields: ['sceneId', 'reference'] },
  narrativeLink: { collection: 'narrativeLinks', fields: ['source', 'reference'] },
  narrativeControl: {
    collection: 'narrativeControls',
    fields: ['resource', 'rankSlot', 'structureRevision', 'rebalancing'],
  },
};
const ownership = ['ownerId', 'bookId', 'deleting', 'deleted', 'archived'];
function stamp(row) {
  if (!row.exists) return null;
  const born = row.createTime,
    changed = row.updateTime;
  if (
    ![born?.seconds, born?.nanoseconds, changed?.seconds, changed?.nanoseconds].every(
      Number.isSafeInteger,
    )
  )
    workFail(
      'failed-precondition',
      'A identidade nativa de uma fonte arquitetural não está disponível.',
    );
  return {
    born: [born.seconds, born.nanoseconds],
    changed: [changed.seconds, changed.nanoseconds],
  };
}
function eligible(c, value) {
  return (
    !!value &&
    !value.deleting &&
    !value.deleted &&
    !value.archived &&
    (value.ownerId == null || value.ownerId === c.uid) &&
    (value.bookId == null || value.bookId === c.target.id)
  );
}
async function bookIdentity(tx, c) {
  await workProject(tx, c);
  if (c.target.kind !== 'book') workFail('invalid-argument', 'A auditoria exige um livro.');
  const book = await readWorkMetadata(tx, c.ref, []);
  return { uid: c.uid, target: c.target, born: stamp(book).born };
}
function locator(kind, id, arcId = null) {
  if (!Object.hasOwn(definitions, kind))
    workFail('invalid-argument', 'Tipo de fonte arquitetural inválido.');
  if (kind === 'contract' && id !== 'current')
    workFail('invalid-argument', 'Guia editorial inválido.');
  if ((kind === 'arcMilestone') !== (arcId !== null))
    workFail('invalid-argument', 'Origem do marco inválida.');
  return { kind, id: workId(id), arcId: arcId === null ? null : workId(arcId) };
}
function sourcePath(c, source) {
  return source.kind === 'arcMilestone'
    ? c.path + '/arcs/' + source.arcId + '/milestones/' + source.id
    : c.path + '/' + definitions[source.kind].collection + '/' + source.id;
}
function descriptor(c, book, source, row, parent = null) {
  const native = stamp(row),
    origin = {
      domain: 'literary-architecture-origin-v1',
      book,
      source,
      path: sourcePath(c, source),
      birth: native.born,
      parentBirth: parent ? stamp(parent).born : null,
    };
  return {
    source,
    identityToken: digest(origin),
    nativeToken: digest({ origin, changed: native.changed }),
  };
}
const nextFamily = (family) =>
  family + 1 < LITERARY_ARCHITECTURE_FAMILIES.length
    ? { family: family + 1, afterId: null, arcId: null, afterArcId: null }
    : null;
export async function listLiteraryArchitectureSources(tx, c, raw = null) {
  const book = await bookIdentity(tx, c),
    cursor = raw ?? { family: 0, afterId: null, arcId: null, afterArcId: null };
  if (
    !Number.isSafeInteger(cursor.family) ||
    cursor.family < 0 ||
    cursor.family >= LITERARY_ARCHITECTURE_FAMILIES.length
  )
    workFail('failed-precondition', 'O inventário de arquitetura tem um checkpoint inválido.');
  const kind = LITERARY_ARCHITECTURE_FAMILIES[cursor.family],
    definition = definitions[kind];
  if (kind === 'contract') {
    const source = locator(kind, 'current'),
      row = await readWorkMetadata(tx, c.db.doc(sourcePath(c, source)), ownership);
    return {
      items: row.exists && eligible(c, row.data()) ? [descriptor(c, book, source, row)] : [],
      nextCursor: nextFamily(cursor.family),
    };
  }
  let parent = null,
    parentId = null;
  if (kind === 'arcMilestone') {
    parentId = cursor.arcId;
    if (parentId === null) {
      let query = c.db
        .collection(c.path + '/arcs')
        .orderBy('__name__')
        .limit(1)
        .select(...ownership);
      if (cursor.afterArcId !== null) query = query.startAfter(workId(cursor.afterArcId));
      parent = (await tx.get(query)).docs[0];
      if (!parent) return { items: [], nextCursor: nextFamily(cursor.family) };
      parentId = parent.id;
    } else
      parent = await readWorkMetadata(
        tx,
        c.db.doc(c.path + '/arcs/' + workId(parentId)),
        ownership,
      );
    if (!parent.exists || !eligible(c, parent.data()))
      return {
        items: [],
        nextCursor: { family: cursor.family, arcId: null, afterArcId: parentId, afterId: null },
      };
  }
  const path =
    kind === 'arcMilestone'
      ? c.path + '/arcs/' + parentId + '/milestones'
      : c.path + '/' + definition.collection;
  let query = c.db
    .collection(path)
    .orderBy('__name__')
    .limit(10)
    .select(...ownership);
  if (cursor.afterId !== null) query = query.startAfter(workId(cursor.afterId));
  const page = await tx.get(query),
    items = [];
  for (const row of page.docs)
    if (eligible(c, row.data()))
      items.push(descriptor(c, book, locator(kind, row.id, parentId), row, parent));
  const more = page.docs.length === 10;
  const nextCursor = more
    ? { ...cursor, arcId: parentId, afterId: page.docs.at(-1).id }
    : kind === 'arcMilestone'
      ? { family: cursor.family, arcId: null, afterArcId: parentId, afterId: null }
      : nextFamily(cursor.family);
  return { items, nextCursor };
}
export async function captureLiteraryArchitectureGuide(tx, c) {
  const book = await bookIdentity(tx, c),
    row = await tx.get(c.db.doc(c.path + '/literaryProduction/current'));
  if (row.exists && !eligible(c, row.data())) workFail('not-found', 'Guia editorial indisponível.');
  const editorial = editorialStored(row.data());
  const proof = {
    domain: 'literary-architecture-guide-v1',
    book,
    stamp: stamp(row),
    revision: editorial.revision,
    hash: digest(editorial.contract),
  };
  return {
    proof,
    instruction: composeEditorialContract(editorial.contract).instruction,
    documents: [
      {
        id: 'editorial:contract',
        label: 'Contrato editorial vigente',
        text: JSON.stringify(editorial.contract),
      },
    ],
  };
}
export async function authorizeLiteraryArchitectureGuide(tx, c, proof) {
  if (digest((await captureLiteraryArchitectureGuide(tx, c)).proof) !== digest(proof))
    workFail('failed-precondition', 'O guia editorial desta auditoria mudou.');
}
async function readArchitectureRecord(tx, c, entry, selected) {
  const book = await bookIdentity(tx, c),
    source = locator(entry.source.kind, entry.source.id, entry.source.arcId ?? null),
    definition = definitions[source.kind];
  let parent = null;
  if (source.kind === 'arcMilestone') {
    parent = await readWorkMetadata(tx, c.db.doc(c.path + '/arcs/' + source.arcId), ownership);
    if (!parent.exists || !eligible(c, parent.data()))
      workFail('not-found', 'O arco da fonte arquitetural não está disponível.');
  }
  const row = await readWorkMetadata(tx, c.db.doc(sourcePath(c, source)), [
    ...ownership,
    ...selected,
  ]);
  if (!row.exists || !eligible(c, row.data()))
    workFail('not-found', 'Uma fonte arquitetural não está disponível.');
  const actual = descriptor(c, book, source, row, parent);
  if (actual.identityToken !== entry.identityToken || actual.nativeToken !== entry.nativeToken)
    workFail('failed-precondition', 'Uma fonte da arquitetura mudou desde o inventário.');
  return { book, source, definition, row, actual };
}
export async function readLiteraryArchitectureLabel(tx, c, entry) {
  try {
    const { row, source } = await readArchitectureRecord(tx, c, entry, [
      'title',
      'name',
      'plan.title',
    ]);
    const value = row.data(),
      label =
        source.kind === 'contract'
          ? 'Contrato editorial'
          : (value.plan?.title ?? value.title ?? value.name);
    return { available: true, label: typeof label === 'string' ? label : null };
  } catch (cause) {
    if (!['not-found', 'permission-denied', 'failed-precondition'].includes(cause.code))
      throw cause;
    return { available: false, label: null };
  }
}
export async function readLiteraryArchitectureSource(tx, c, entry) {
  const { book, source, definition, row, actual } = await readArchitectureRecord(
    tx,
    c,
    entry,
    definitions[entry.source.kind]?.fields ?? [],
  );
  const value = row.data();
  let data, label;
  if (source.kind === 'plan') {
    const plan = literaryPlan(value.plan),
      root = await workProject(tx, c),
      read = await createLiteraryReferenceReader(tx, c, root);
    const references = await readLiteraryPlanSourceViews(read, plan.references);
    if (references.some((reference) => !reference.available))
      workFail(
        'failed-precondition',
        'Uma ficha tem fonte removida, recriada ou sem acesso. Reconcilie seus vínculos antes de enviar o conteúdo à IA.',
        'architecture-reference-unavailable',
      );
    data = { basis: 'editorial-intent', plan, references };
    label = plan.title;
  } else if (source.kind === 'contract') {
    data = { basis: 'editorial-intent', contract: editorialStored(value).contract };
    label = 'Contrato editorial';
  } else {
    data = {
      basis: 'structural-planning',
      source,
      fields: Object.fromEntries(
        definition.fields
          .filter((key) => !key.includes('.') && value[key] !== undefined)
          .map((key) => [key, value[key]]),
      ),
    };
    if (source.kind === 'scene') data.fields.planning = value.planning ?? {};
    if (source.kind === 'sceneLink') {
      workId(value.sceneId);
      // Only an association is read. This locator never grants the referenced lore body.
      data.basis = 'association-index';
      data.fields.reference = narrativeReference({
        kind: 'lore',
        reference: value.reference,
      }).reference;
    }
    if (source.kind === 'narrativeLink') {
      data.basis = 'association-index';
      data.fields.source = narrativeResource(value.source, true);
      data.fields.reference = narrativeReference(value.reference);
    }
    if (source.kind === 'narrativeControl') {
      const resource = narrativeResource(value.resource);
      if (sequenceKey(resource) !== source.id || !['A', 'B'].includes(value.rankSlot))
        workFail('failed-precondition', 'A ordem da arquitetura não pôde ser conferida.');
      data.fields.resource = resource;
    }
    label = value.title ?? value.name ?? source.kind + ' · ' + source.id;
  }
  let dependency = null;
  const target = { kind: source.kind, id: source.id, scopeId: c.target.id };
  const bookToken = digest({
    domain: 'literary-writing-book-v1',
    uid: c.uid,
    target: c.target,
    birth: book.born,
  });
  if (source.kind === 'plan') {
    if (!Number.isSafeInteger(value.revision) || value.revision < 1)
      workFail('failed-precondition', 'Revisão da ficha inválida.');
    dependency = {
      target,
      proof: {
        scheme: 'writing-plan',
        identityToken: digest({
          domain: 'literary-plan-identity-v1',
          uid: c.uid,
          bookToken,
          id: source.id,
          birth: stamp(row).born,
        }),
        revision: value.revision,
      },
    };
  } else if (source.kind === 'contract')
    dependency = {
      target,
      proof: { scheme: 'editorial-revision', originToken: bookToken, revision: value.revision },
    };
  else if (['act', 'arc', 'event'].includes(source.kind)) {
    const root = await workProject(tx, c),
      read = await createLiteraryReferenceReader(tx, c, root);
    const actual = await read({ ...target, purpose: 'source' });
    if (!actual) workFail('failed-precondition', 'A origem estrutural não está disponível.');
    dependency = {
      target,
      proof: {
        scheme: 'reference',
        originToken: actual.reference.sourceToken,
        identityToken: actual.identityToken,
        versionToken: actual.versionToken,
        revision: actual.reference.revision,
      },
    };
  }
  const text = JSON.stringify(data);
  return {
    ...actual,
    id:
      'architecture:' +
      source.kind +
      ':' +
      (source.arcId ? JSON.stringify([source.arcId, source.id]) : source.id),
    label,
    text,
    token: digest({ nativeToken: actual.nativeToken, text }),
    format: 'canonical-json',
    dependency,
  };
}
export async function authorizeLiteraryArchitectureSource(tx, c, proof) {
  const current = await readLiteraryArchitectureSource(tx, c, proof);
  if (current.token !== proof.token)
    workFail('failed-precondition', 'As fontes vinculadas à arquitetura mudaram.');
  return current;
}

// Read the current authorized native incarnation, then use the same projection as the audit.
export async function readCurrentLiteraryArchitectureSource(tx, c, source) {
  const book = await bookIdentity(tx, c);
  source = locator(source.kind, source.id, source.arcId ?? null);
  let parent = null;
  if (source.kind === 'arcMilestone') {
    parent = await readWorkMetadata(tx, c.db.doc(c.path + '/arcs/' + source.arcId), ownership);
    if (!parent.exists || !eligible(c, parent.data()))
      workFail('not-found', 'O arco da fonte arquitetural não está disponível.');
  }
  const row = await readWorkMetadata(tx, c.db.doc(sourcePath(c, source)), ownership);
  if (!row.exists || !eligible(c, row.data()))
    workFail('not-found', 'Fonte arquitetural indisponível.');
  return readLiteraryArchitectureSource(tx, c, descriptor(c, book, source, row, parent));
}
