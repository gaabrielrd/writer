import {
  digest,
  workClosed,
  workFail,
  workId,
  workLimit,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { resource, loreReference, reference } from './narrativeContracts.mjs';
import { validSceneRank } from './sceneRanks.mjs';
import { BOOK_STRUCTURE_LIMITS } from './bookBackupStructure.mjs';
import {
  BOOK_RESOURCE_KINDS,
  serializeBookBackupResource,
  projectBookBackupResource,
} from './bookBackupResources.mjs';
import {
  bookBackupScope,
  bookBackupToken,
  bookBackupIdentity,
  bookBackupChanged,
  readBookBackupSource,
} from './bookBackupContext.mjs';

const definitions = {
  'scene-control': { path: 'sceneControls', singleton: 'unassigned' },
  'scene-source': { path: 'sceneSources' },
  scene: { path: 'scenes', owner: true },
  'scene-body': { path: 'body', parent: 'scenes', singleton: 'current', required: true },
  'scene-planning': { path: 'planning', parent: 'scenes', singleton: 'current' },
  'scene-reference': { path: 'references', parent: 'scenes' },
  'narrative-control': { path: 'narrativeControls' },
  arc: { path: 'arcs', owner: true },
  milestone: { path: 'milestones', parent: 'arcs', owner: true },
  event: { path: 'timelineEvents', owner: true },
  'narrative-link': { path: 'narrativeLinks' },
};
function unavailable() {
  workFail('failed-precondition', 'O conteúdo salvo está inconsistente ou em alteração.');
}
function descriptor(data) {
  if (!BOOK_RESOURCE_KINDS.includes(data.kind))
    workFail('invalid-argument', 'Tipo de recurso inválido.');
  const definition = definitions[data.kind];
  const parentId = data.parentId ?? null;
  if (definition.parent) workId(parentId);
  else if (parentId !== null) workFail('invalid-argument', 'Este recurso não recebe pai.');
  return { kind: data.kind, parentId, definition };
}
const path = (context, value) =>
  context.path +
  '/' +
  (value.definition.parent ? value.definition.parent + '/' + value.parentId + '/' : '') +
  value.definition.path;
function itemToken(context, source, value, item, parent) {
  return digest({
    version: 1,
    uid: context.uid,
    bookId: context.target.id,
    sourceToken: source,
    kind: value.kind,
    parentId: value.parentId,
    id: item.id,
    native: bookBackupIdentity(item),
    parent: parent ? bookBackupIdentity(parent) : null,
  });
}
async function parentSnapshot(tx, context, value) {
  if (!value.definition.parent) return null;
  const snapshot = await readWorkMetadata(
    tx,
    context.db.doc(context.path + '/' + value.definition.parent + '/' + value.parentId),
    ['ownerId', 'deleting', 'bodyHash', 'bodyBytes'],
  );
  const data = snapshot.data();
  if (!data || data.ownerId !== context.uid) workFail('not-found', 'Pai indisponível.');
  if (data.deleting) unavailable();
  return snapshot;
}
function readCursor(value, context, descriptor, token) {
  if (value == null) return null;
  let parsed;
  if (typeof value !== 'string' || value.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(value))
    workFail('invalid-argument', 'Página inválida.');
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    workFail('invalid-argument', 'Página inválida.');
  }
  workClosed(parsed, ['version', 'bookId', 'kind', 'parentId', 'sourceToken', 'id']);
  if (
    Buffer.from(JSON.stringify(parsed)).toString('base64url') !== value ||
    parsed.version !== 1 ||
    parsed.bookId !== context.target.id ||
    parsed.kind !== descriptor.kind ||
    parsed.parentId !== descriptor.parentId ||
    parsed.sourceToken !== token
  )
    workFail('invalid-argument', 'Página de outro escopo.');
  return workId(parsed.id);
}
function validateValue(context, value, snapshot, parent) {
  const data = snapshot.data();
  if (!data) bookBackupChanged(true);
  if (data.deleting || data.rebalancing) unavailable();
  if (value.definition.owner && data.ownerId !== context.uid)
    workFail('not-found', 'Recurso indisponível.');
  if (
    value.definition.owner &&
    (data.schemaVersion !== 1 || (data.id !== undefined && data.id !== snapshot.id))
  )
    unavailable();
  if (Object.hasOwn(data, 'rankSlot') && !['A', 'B'].includes(data.rankSlot)) unavailable();
  for (const field of ['rankA', 'rankB'])
    if (Object.hasOwn(data, field) && !validSceneRank(data[field])) unavailable();
  if (value.kind === 'scene') {
    if (
      !['planned', 'writing', 'review', 'done'].includes(data.stage) ||
      typeof data.archived !== 'boolean'
    )
      unavailable();
    if (data.parentId !== null) workId(data.parentId);
  }
  if (['arc', 'milestone', 'event'].includes(value.kind) && data.kind !== value.kind) unavailable();
  if (value.kind === 'milestone' && data.arcId !== value.parentId) unavailable();
  if (value.kind === 'scene-body') {
    const metadata = parent.data();
    if (
      typeof data.content !== 'string' ||
      data.hash !== metadata.bodyHash ||
      digest(data.content) !== data.hash ||
      Buffer.byteLength(data.content) !== metadata.bodyBytes
    )
      unavailable();
  }
  if (value.kind === 'scene-source') {
    if (!data.original || typeof data.original !== 'object' || Array.isArray(data.original))
      unavailable();
    const text = data.original.content ?? '';
    if (typeof text !== 'string' || digest(text) !== data.hash) unavailable();
  }
  try {
    if (value.kind === 'scene-reference')
      loreReference(projectBookBackupResource(value.kind, data));
    if (value.kind === 'narrative-control') {
      const sequence = resource(projectBookBackupResource(value.kind, data).resource);
      if (digest(sequence) !== snapshot.id) unavailable();
    }
    if (value.kind === 'narrative-link') {
      const link = projectBookBackupResource(value.kind, data);
      resource(link.source, true);
      reference(link.reference);
    }
  } catch {
    unavailable();
  }
  return data;
}
export function createBookBackupResourceService({ db }) {
  const scope = (uid, data, keys) => bookBackupScope(db, uid, data, ['kind', 'parentId', ...keys]);
  return {
    async listBookBackupResources(uid, data) {
      const context = scope(uid, data, ['sourceToken', 'cursor', 'limit']),
        value = descriptor(data),
        token = bookBackupToken(data.sourceToken),
        limit = workLimit(data.limit),
        after = readCursor(data.cursor, context, value, token);
      if (value.definition.singleton && after !== null)
        workFail('invalid-argument', 'Recurso único não recebe página.');
      return db.runTransaction(async (tx) => {
        const current = await readBookBackupSource(tx, context, token),
          parent = await parentSnapshot(tx, context, value);
        let selected,
          hasMore = false;
        if (value.definition.singleton) {
          const snapshot = await readWorkMetadata(
            tx,
            db.doc(path(context, value) + '/' + value.definition.singleton),
            [],
          );
          if (!snapshot.exists && value.definition.required) unavailable();
          selected = snapshot.exists ? [snapshot] : [];
        } else {
          let query = db
            .collection(path(context, value))
            .orderBy('__name__')
            .limit(limit + 1)
            .select();
          if (after !== null) query = query.startAfter(after);
          const page = await tx.get(query);
          selected = page.docs.slice(0, limit);
          hasMore = page.docs.length > limit;
        }
        return {
          ...current.result,
          kind: value.kind,
          parentId: value.parentId,
          items: selected.map((snapshot) => ({
            id: snapshot.id,
            itemToken: itemToken(context, token, value, snapshot, parent),
          })),
          nextCursor: hasMore
            ? Buffer.from(
                JSON.stringify({
                  version: 1,
                  bookId: context.target.id,
                  kind: value.kind,
                  parentId: value.parentId,
                  sourceToken: token,
                  id: selected.at(-1).id,
                }),
              ).toString('base64url')
            : null,
        };
      });
    },
    async readBookBackupResource(uid, data) {
      const context = scope(uid, data, ['sourceToken', 'id', 'itemToken', 'index']),
        value = descriptor(data),
        token = bookBackupToken(data.sourceToken),
        expected = bookBackupToken(data.itemToken),
        id = workId(data.id);
      if (
        !Number.isSafeInteger(data.index) ||
        data.index < 0 ||
        (value.definition.singleton && id !== value.definition.singleton)
      )
        workFail('invalid-argument', 'Parte ou recurso inválido.');
      return db.runTransaction(async (tx) => {
        const current = await readBookBackupSource(tx, context, token),
          parent = await parentSnapshot(tx, context, value),
          snapshot = await tx.get(db.doc(path(context, value) + '/' + id));
        const actual = itemToken(context, token, value, snapshot, parent);
        if (!snapshot.exists || actual !== expected) bookBackupChanged(true);
        const record = validateValue(context, value, snapshot, parent);
        let encoded;
        try {
          encoded = serializeBookBackupResource(value.kind, value.parentId, id, record);
        } catch {
          unavailable();
        }
        const chunkCount = Math.ceil(encoded.bytes.length / BOOK_STRUCTURE_LIMITS.chunkBytes);
        if (data.index >= chunkCount) workFail('invalid-argument', 'Parte fora do recurso.');
        const offset = data.index * BOOK_STRUCTURE_LIMITS.chunkBytes;
        return {
          ...current.result,
          kind: value.kind,
          parentId: value.parentId,
          id,
          itemToken: actual,
          index: data.index,
          chunkCount,
          byteLength: encoded.bytes.length,
          contentHash: digest(encoded.json),
          chunkBase64: Buffer.from(
            encoded.bytes.subarray(offset, offset + BOOK_STRUCTURE_LIMITS.chunkBytes),
          ).toString('base64'),
        };
      });
    },
  };
}
