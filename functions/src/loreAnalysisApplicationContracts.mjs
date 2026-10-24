import { authorize, born, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
import { patch, text } from './loreAnalysisFields.mjs';
import { creationLoreId } from './bookLoreCreationContracts.mjs';
export const applicationConflict = () =>
  workFail(
    'failed-precondition',
    'O lote da análise mudou ou exige reconciliação.',
    'lore-analysis-application-conflict',
  );
const invalid = () => workFail('invalid-argument', 'Alterações inválidas para o lote da análise.');
const fields = ['name', 'category', 'summary', 'details', 'aliases'];
function applicationEntityId(scope, value) {
  if (scope === 'local') return bookContentId(value);
  const match =
    typeof value === 'string' ? /^universe:([a-zA-Z0-9_-]{1,128}):([\s\S]+)$/u.exec(value) : null;
  if (!match) invalid();
  bookContentId(match[2]);
  return value;
}
export function reserveApplicationInput(uid, input) {
  authorize(uid);
  closed(input, ['id', 'text', 'changes']);
  const id = bookContentId(input.id),
    source = text(input.text, 120000);
  if (!Array.isArray(input.changes) || input.changes.length < 1 || input.changes.length > 50)
    invalid();
  for (const change of input.changes) {
    closed(change, ['scope', 'input'], ['entityId']);
    if (!['local', 'global'].includes(change.scope)) invalid();
    if (Object.hasOwn(change, 'entityId')) applicationEntityId(change.scope, change.entityId);
    patch(change.input);
  }
  return { id, source, changes: input.changes, requestHash: digest([source, input.changes]) };
}
export function applicationRequest(uid, input, mutation = false) {
  authorize(uid);
  closed(input, ['id', 'requestHash', ...(mutation ? ['operationId'] : [])], ['jobToken']);
  return {
    id: bookContentId(input.id),
    requestHash: restoreHash(input.requestHash),
    ...(Object.hasOwn(input, 'jobToken') ? { jobToken: restoreHash(input.jobToken) } : {}),
    ...(mutation ? { operationId: bookContentId(input.operationId) } : {}),
  };
}
const normalize = (name) => name.normalize('NFKC').trim().toLocaleLowerCase('pt-BR');
export function createApplicationMembers(uid, request, analysis, context) {
  const result = [],
    seen = new Set(),
    names = [];
  for (const [index, change] of request.changes.entries()) {
    if (change.scope === 'global' && !context.worldRef) invalid();
    const existing = change.entityId
      ? context.entities.find(
          (entity) => entity.id === change.entityId && entity.scope === change.scope,
        )
      : null;
    if (change.entityId && !existing) invalid();
    const input = patch(change.input);
    if (!existing && (!input.name || !input.summary || !input.category)) invalid();
    if (
      existing &&
      Object.entries(input).every(
        ([key, value]) =>
          JSON.stringify(value) ===
          JSON.stringify(existing.data[key] ?? (key === 'aliases' ? [] : '')),
      )
    )
      invalid();
    const name = input.name ?? existing.data.name;
    if (
      context.entities.some(
        (entity) =>
          entity.scope === change.scope &&
          entity.id !== existing?.id &&
          normalize(entity.data.name) === normalize(name),
      ) ||
      names.some((entry) => entry.scope === change.scope && entry.name === normalize(name))
    )
      workFail('failed-precondition', 'Nome duplicado no destino. Revise as correspondências.');
    names.push({ scope: change.scope, name: normalize(name) });
    const seed = digest({
        domain: 'writer-analysis-member',
        uid,
        analysisId: request.id,
        analysisBirth: born(analysis),
        requestHash: request.requestHash,
        index,
      }),
      local = change.scope === 'local',
      creationId = local && !existing ? 'analysis-' + seed : null,
      selected = fields.filter((field) => Object.hasOwn(input, field)),
      plannedFields =
        local && !existing
          ? fields
              .filter(
                (field) => Object.hasOwn(input, field) || ['details', 'aliases'].includes(field),
              )
              .concat('isPublic')
          : selected,
      targetId = existing
        ? existing.path.split('/').at(-1)
        : local
          ? creationLoreId(uid, { bookId: context.bookRef.id, creationId })
          : bookContentId(request.id + '-' + index),
      target = change.scope + ':' + targetId;
    if (seen.has(target)) invalid();
    seen.add(target);
    result.push({
      index,
      scope: change.scope,
      targetId,
      source: existing ? { id: existing.id, origin: existing.origin } : null,
      patchHash: digest(input),
      fields: plannedFields,
      relations: local && !existing ? { present: true, count: 0 } : null,
      children: {
        creationId,
        inspectionId: local && existing ? 'analysis-source-' + seed : null,
        editId: local ? 'analysis-edit-' + seed : null,
        uploads: local
          ? plannedFields.map((field) => ({
              field,
              uploadId:
                'analysis-field-' + digest({ domain: 'writer-analysis-field', seed, field }),
            }))
          : [],
      },
    });
  }
  return result;
}
export function validateApplicationMembers(items) {
  if (!Array.isArray(items) || items.length < 1 || items.length > 50) applicationConflict();
  const targets = new Set(),
    children = new Set();
  for (const [index, member] of items.entries()) {
    closed(member, [
      'index',
      'scope',
      'targetId',
      'source',
      'patchHash',
      'fields',
      'relations',
      'children',
    ]);
    integer(member.index);
    if (member.index !== index || !['local', 'global'].includes(member.scope))
      applicationConflict();
    bookContentId(member.targetId);
    restoreHash(member.patchHash);
    const target = member.scope + ':' + member.targetId;
    if (targets.has(target)) applicationConflict();
    targets.add(target);
    if (member.source !== null) {
      closed(member.source, ['id', 'origin']);
      applicationEntityId(member.scope, member.source.id);
      const origin = member.source.origin;
      closed(origin, ['birth', 'update', 'representationHash']);
      for (const key of ['birth', 'update']) {
        closed(origin[key], ['seconds', 'nanoseconds']);
        born({ createTime: origin[key] });
      }
      restoreHash(origin.representationHash);
    }
    if (
      !Array.isArray(member.fields) ||
      !member.fields.length ||
      new Set(member.fields).size !== member.fields.length ||
      member.fields.some((field) => ![...fields, 'isPublic'].includes(field))
    )
      applicationConflict();
    const c = member.children;
    closed(c, ['creationId', 'inspectionId', 'editId', 'uploads']);
    const local = member.scope === 'local';
    if (local && member.source === null) {
      closed(member.relations, ['present', 'count']);
      if (member.relations.present !== true || member.relations.count !== 0) applicationConflict();
    } else if (member.relations !== null) applicationConflict();
    for (const key of ['creationId', 'inspectionId', 'editId']) {
      if (c[key] !== null) {
        bookContentId(c[key]);
        if (children.has(c[key])) applicationConflict();
        children.add(c[key]);
      }
    }
    if (
      local
        ? !c.editId ||
          Boolean(c.creationId) === Boolean(member.source) ||
          Boolean(c.inspectionId) !== Boolean(member.source)
        : c.creationId !== null || c.inspectionId !== null || c.editId !== null
    )
      applicationConflict();
    if (!Array.isArray(c.uploads) || c.uploads.length !== (local ? member.fields.length : 0))
      applicationConflict();
    for (const [i, upload] of c.uploads.entries()) {
      closed(upload, ['field', 'uploadId']);
      bookContentId(upload.uploadId);
      if (upload.field !== member.fields[i] || children.has(upload.uploadId)) applicationConflict();
      children.add(upload.uploadId);
    }
  }
  return items;
}
export function applicationPaths(db, uid, id) {
  authorize(uid);
  bookContentId(id);
  const path = 'users/' + uid + '/loreAnalysisApplications/' + id;
  return { db, uid, id, path, ref: db.doc(path), stateRef: db.doc(path + '/state/current') };
}
export const applicationView = (l) => ({
  id: l.c.id,
  requestHash: l.context.requestHash,
  jobToken: l.token,
  bookId: l.context.bookId,
  phase: l.state.phase,
  ...(l.state.application ? { application: l.state.application } : {}),
  revision: l.state.revision,
  memberCount: l.context.kind === 'reservation' ? l.context.members.length : 0,
  ...(l.state.schemaVersion === 2
    ? {
        preparedCount: l.state.preparedCount,
        nextMember: l.state.cursor.member,
        nextStage: l.state.cursor.stage,
        cleanupMember: l.state.cleanup.member,
      }
    : {}),
});
export function applicationChildPaths(c, context) {
  return context.members.flatMap((member) => {
    const children = member.children,
      base = 'users/' + c.uid + '/';
    return [
      ...(children.creationId ? [base + 'bookLoreCreations/' + children.creationId] : []),
      ...(children.inspectionId
        ? [base + 'bookLoreSourceInspections/' + children.inspectionId]
        : []),
      ...(children.editId ? [base + 'bookLoreEdits/' + children.editId] : []),
      ...children.uploads.map((u) => base + 'bookLoreFieldUploads/' + u.uploadId),
      ...(children.creationId
        ? [
            'books/' + context.bookId + '/lore/' + member.targetId,
            'books/' + context.bookId + '/bookLoreReservations/' + member.targetId,
          ]
        : []),
    ];
  });
}
