import { validateId } from './generation.mjs';
import {
  closed,
  sceneFail,
  sceneId,
  sceneTarget,
  sceneText,
  sceneLimit,
  sceneRevision,
  sceneDate,
  digest,
  conflict,
  assertSceneEnvelope,
} from './sceneContracts.mjs';
export {
  sceneFail as fail,
  sceneId as id,
  sceneText as text,
  sceneLimit as limit,
  sceneRevision as version,
  sceneDate as date,
  digest,
  conflict,
  assertSceneEnvelope as envelope,
};
export const fields = {
  arc: ['initialState', 'objective', 'plannedOutcome'],
  event: ['description', 'dateLabel'],
  milestone: ['notes'],
};
export function resource(value, withId = false) {
  closed(value, [
    'kind',
    ...(withId ? ['id'] : []),
    ...(value?.kind === 'milestone' ? ['arcId'] : []),
  ]);
  if (!Object.hasOwn(fields, value.kind)) sceneFail('invalid-argument', 'Tipo narrativo inválido.');
  return {
    kind: value.kind,
    ...(value.kind === 'milestone' ? { arcId: sceneId(value.arcId) } : {}),
    ...(withId ? { id: sceneId(value.id) } : {}),
  };
}
export const sequenceResource = ({ kind, arcId }) => ({
  kind,
  ...(kind === 'milestone' ? { arcId } : {}),
});
export const sourceKey = (source) => digest(resource(source, true));
export const sequenceKey = (value) => digest(sequenceResource(value));
export function loreReference(value) {
  closed(value, ['kind', 'scopeId', 'entityId']);
  if (!['book', 'universe'].includes(value.kind))
    sceneFail('invalid-argument', 'Referência de lore inválida.');
  return { kind: value.kind, scopeId: sceneId(value.scopeId), entityId: sceneId(value.entityId) };
}
export function reference(value) {
  closed(value, [
    'kind',
    ...(value?.kind === 'scene'
      ? ['sceneId']
      : value?.kind === 'event'
        ? ['eventId']
        : value?.kind === 'lore'
          ? ['reference']
          : []),
  ]);
  if (value.kind === 'scene') return { kind: value.kind, sceneId: sceneId(value.sceneId) };
  if (value.kind === 'event') return { kind: value.kind, eventId: sceneId(value.eventId) };
  if (value.kind === 'lore') return { kind: value.kind, reference: loreReference(value.reference) };
  sceneFail('invalid-argument', 'Referência narrativa inválida.');
}
export function scope(db, uid, data, keys) {
  if (!uid) sceneFail('unauthenticated', 'Entre na sua conta.');
  sceneId(uid);
  closed(data, ['target', ...keys]);
  const target = sceneTarget(data.target),
    path = `${target.kind === 'book' ? 'books' : 'adventures'}/${target.id}`;
  return {
    uid,
    target,
    path,
    ref: db.doc(path),
    owner: target.kind === 'book' ? 'authorId' : 'ownerId',
  };
}
export function itemPath(context, source) {
  return `${context.path}/${source.kind === 'arc' ? 'arcs' : source.kind === 'event' ? 'timelineEvents' : `arcs/${source.arcId}/milestones`}${source.id ? `/${source.id}` : ''}`;
}
export function operation(db, context, data, method, payload) {
  const operationId = validateId(data.operationId);
  return {
    id: operationId,
    ref: db.doc(`users/${context.uid}/narrativeOperations/${operationId}`),
    fingerprint: digest({ target: context.target, method, ...payload }),
  };
}
export const observation = (p) => ({
  narrative: p.narrativeRevision ?? 0,
  scenes: p.sceneRevision ?? 0,
  updatedAt: p.updatedAt ?? 0,
});
export const encodeCursor = (context, observed, key, id) =>
  Buffer.from(JSON.stringify({ version: 1, context, observed, key, id })).toString('base64url');
export function decodeCursor(value, context, observed) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 12000 || !/^[A-Za-z0-9_-]+$/.test(value))
    sceneFail('invalid-argument', 'Página inválida.');
  let token;
  try {
    token = JSON.parse(Buffer.from(value, 'base64url').toString());
  } catch {
    sceneFail('invalid-argument', 'Página inválida.');
  }
  closed(token, ['version', 'context', 'observed', 'key', 'id']);
  if (token.version !== 1 || digest(token.context) !== digest(context))
    sceneFail('invalid-argument', 'Página pertence a outro escopo ou filtro.');
  sceneId(token.id);
  if (typeof token.key !== 'string' || Buffer.byteLength(token.key) > 1500)
    sceneFail('invalid-argument', 'Página inválida.');
  if (digest(token.observed) !== digest(observed)) conflict();
  return token;
}
export function inputText(kind, data, partial = false) {
  closed(data, ['title', ...fields[kind]]);
  return Object.fromEntries(
    ['title', ...fields[kind]]
      .filter((key) => !partial || key in data)
      .map((key) => [
        key,
        sceneText(data[key], key === 'title' || key === 'dateLabel' ? 300 : 4000, key === 'title'),
      ]),
  );
}
