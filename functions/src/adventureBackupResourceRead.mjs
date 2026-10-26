import {
  workClosed,
  workFail,
  workId,
  workLimit,
  readWorkMetadata,
  digest,
} from './workProgressContracts.mjs';
import {
  adventureBackupScope,
  adventureBackupToken as token,
  adventureBackupIdentity as identity,
  adventureBackupChanged as changed,
  readAdventureBackupSource,
} from './adventureBackupSource.mjs';
import { adventureBackupPartData } from './adventureBackupRead.mjs';
import { ADVENTURE_STRUCTURE_LIMITS } from './adventureBackupStructure.mjs';
import {
  ADVENTURE_RESOURCE_KINDS as kinds,
  ADVENTURE_RESOURCE_DEFINITIONS as definitions,
  ADVENTURE_RESOURCE_FIELDS as fields,
  serializeAdventureBackupResource,
  adventureResourceSingleton,
} from './adventureBackupResources.mjs';

const external = ['contentStorage', 'payloadStorage', 'bodyStorage'];
const metadata = [
  'ownerId',
  'schemaVersion',
  'deleting',
  'rebalancing',
  'sceneId',
  'kind',
  'arcId',
  'source.kind',
  'source.id',
  'source.arcId',
  'bodyHash',
  'hash',
  ...external,
];
const invalid = () => workFail('invalid-argument', 'Pedido de recurso inválido.');
const unavailable = () =>
  workFail(
    'failed-precondition',
    'O recurso salvo está inconsistente ou em alteração.',
    'adventure-backup-resource-inconsistent',
  );
function descriptor(data) {
  const kind = data.kind;
  if (!kinds.includes(kind)) invalid();
  const definition = definitions[kind],
    parentId = data.parentId ?? null;
  if (definition.parent) workId(parentId);
  else if (parentId !== null) invalid();
  return { kind, parentId, definition, singleton: adventureResourceSingleton(kind, parentId) };
}
const collectionPath = (context, value) =>
  context.path +
  '/' +
  (value.definition.parent && !value.definition.rootCollection
    ? value.definition.parent + '/' + value.parentId + '/'
    : '') +
  value.definition.path;
function nativeId(value) {
  try {
    return workId(value);
  } catch {
    unavailable();
  }
}
function check(snapshot, uid, required = true, owner = true) {
  if (!snapshot.exists) {
    if (required) unavailable();
    return null;
  }
  const value = snapshot.data();
  if (!value || (owner && (value.ownerId !== uid || value.schemaVersion !== 1))) unavailable();
  if (
    value.deleting ||
    value.rebalancing ||
    (Object.hasOwn(value, 'schemaVersion') && value.schemaVersion !== 1) ||
    external.some((key) => Object.hasOwn(value, key))
  )
    unavailable();
  return value;
}
async function parentContext(tx, context, value, cache = new Map()) {
  const read = async (path) => {
    if (!cache.has(path))
      cache.set(path, await readWorkMetadata(tx, context.db.doc(path), metadata));
    const snapshot = cache.get(path);
    return { snapshot, data: check(snapshot, context.uid) };
  };
  let parent = null,
    ancestor = null;
  if (value.definition.parent) {
    parent = await read(context.path + '/' + value.definition.parent + '/' + value.parentId);
    if (value.definition.parent === 'arcs' && parent.data.kind !== 'arc') unavailable();
    if (value.definition.parent === 'sceneBlocks')
      ancestor = await read(context.path + '/scenes/' + nativeId(parent.data.sceneId));
  }
  return { parent, ancestor, read };
}
async function itemContext(
  tx,
  context,
  value,
  id,
  parents,
  { content = false, snapshot = null } = {},
) {
  const ref = context.db.doc(collectionPath(context, value) + '/' + id),
    item =
      snapshot ??
      (await readWorkMetadata(
        tx,
        ref,
        content ? [...new Set([...metadata, ...fields[value.kind]])] : metadata,
      ));
  let data,
    parent = parents.parent,
    ancestor = parents.ancestor;
  if (value.definition.control) {
    data = item.exists ? adventureBackupPartData(item, context.uid) : null;
    if (!data && !value.definition.optional) unavailable();
    if (data && external.some((key) => Object.hasOwn(data, key))) unavailable();
  } else
    data = check(item, context.uid, !value.definition.optional, Boolean(value.definition.owner));
  if (
    value.definition.nativeKind &&
    (data.kind !== value.definition.nativeKind ||
      (value.kind === 'milestone' && data.arcId !== value.parentId))
  )
    unavailable();
  if (value.definition.narrativeSource) {
    const source = data.source;
    if (!source || !['arc', 'event', 'milestone'].includes(source.kind)) unavailable();
    const id = nativeId(source.id);
    if (source.kind === 'milestone') {
      const arcId = nativeId(source.arcId);
      ancestor = await parents.read(context.path + '/arcs/' + arcId);
      if (ancestor.data.kind !== 'arc') unavailable();
      parent = await parents.read(context.path + '/arcs/' + arcId + '/milestones/' + id);
      if (parent.data.arcId !== arcId) unavailable();
    } else
      parent = await parents.read(
        context.path + '/' + (source.kind === 'arc' ? 'arcs' : 'timelineEvents') + '/' + id,
      );
    if (parent.data.kind !== source.kind) unavailable();
  }
  if (value.definition.scene)
    ancestor = await parents.read(context.path + '/scenes/' + nativeId(data.sceneId));
  if (value.definition.body) {
    if (
      !parents.parent ||
      !data ||
      data.hash !== parents.parent.data.bodyHash ||
      typeof data.hash !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.hash)
    )
      unavailable();
    if (content && (typeof data.content !== 'string' || digest(data.content) !== data.hash))
      unavailable();
  }
  return {
    item,
    data,
    parent: parent?.snapshot ?? null,
    ancestor: ancestor?.snapshot ?? null,
  };
}
const itemToken = (context, sourceToken, value, id, item) =>
  digest({
    version: 1,
    uid: context.uid,
    adventureId: context.adventureId,
    sourceToken,
    kind: value.kind,
    parentId: value.parentId,
    id,
    item: identity(item.item),
    parent: item.parent ? identity(item.parent) : null,
    ancestor: item.ancestor ? identity(item.ancestor) : null,
  });
function readCursor(input, context, value, sourceToken) {
  if (input == null) return null;
  if (typeof input !== 'string' || input.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(input))
    invalid();
  let cursor;
  try {
    cursor = JSON.parse(Buffer.from(input, 'base64url').toString('utf8'));
  } catch {
    invalid();
  }
  workClosed(cursor, ['version', 'adventureId', 'kind', 'parentId', 'sourceToken', 'id']);
  if (
    Buffer.from(JSON.stringify(cursor)).toString('base64url') !== input ||
    cursor.version !== 1 ||
    cursor.adventureId !== context.adventureId ||
    cursor.kind !== value.kind ||
    cursor.parentId !== value.parentId ||
    cursor.sourceToken !== sourceToken
  )
    invalid();
  return workId(cursor.id);
}
export function createAdventureBackupResourceService({ db }) {
  const scope = (uid, data, keys) =>
    adventureBackupScope(db, uid, data, ['kind', 'parentId', ...keys]);
  return {
    async listAdventureBackupResources(uid, data) {
      const context = scope(uid, data, ['sourceToken', 'cursor', 'limit']),
        value = descriptor(data),
        sourceToken = token(data.sourceToken),
        limit = workLimit(data.limit),
        after = readCursor(data.cursor, context, value, sourceToken);
      if (value.singleton && after !== null) invalid();
      return db.runTransaction(async (tx) => {
        const current = await readAdventureBackupSource(tx, context, sourceToken),
          parents = await parentContext(tx, context, value);
        let selected,
          hasMore = false;
        if (value.singleton)
          selected = [
            await readWorkMetadata(
              tx,
              db.doc(collectionPath(context, value) + '/' + value.singleton),
              metadata,
            ),
          ];
        else {
          let query = db
            .collection(collectionPath(context, value))
            .orderBy('__name__')
            .limit(limit + 1)
            .select(...metadata);
          if (after !== null) query = query.startAfter(after);
          const page = await tx.get(query);
          selected = page.docs.slice(0, limit);
          hasMore = page.docs.length > limit;
        }
        const items = [];
        for (const snapshot of selected) {
          const item = await itemContext(tx, context, value, snapshot.id, parents, { snapshot });
          items.push({
            id: snapshot.id,
            present: snapshot.exists,
            itemToken: itemToken(context, sourceToken, value, snapshot.id, item),
          });
        }
        return {
          ...current.result,
          kind: value.kind,
          parentId: value.parentId,
          items,
          nextCursor: hasMore
            ? Buffer.from(
                JSON.stringify({
                  version: 1,
                  adventureId: context.adventureId,
                  kind: value.kind,
                  parentId: value.parentId,
                  sourceToken,
                  id: selected.at(-1).id,
                }),
              ).toString('base64url')
            : null,
        };
      });
    },
    async readAdventureBackupResource(uid, data) {
      const context = scope(uid, data, ['sourceToken', 'id', 'itemToken', 'index']),
        value = descriptor(data),
        sourceToken = token(data.sourceToken),
        expectedItem = token(data.itemToken),
        id = workId(data.id),
        index = data.index;
      if (!Number.isSafeInteger(index) || index < 0 || (value.singleton && id !== value.singleton))
        invalid();
      return db.runTransaction(async (tx) => {
        const current = await readAdventureBackupSource(tx, context, sourceToken),
          parents = await parentContext(tx, context, value),
          item = await itemContext(tx, context, value, id, parents, { content: true }),
          actual = itemToken(context, sourceToken, value, id, item);
        if (actual !== expectedItem) changed(true);
        let encoded;
        try {
          encoded = serializeAdventureBackupResource(
            value.kind,
            value.parentId,
            id,
            item.data,
            item.item.exists,
          );
        } catch (error) {
          if (error instanceof TypeError) unavailable();
          throw error;
        }
        const chunkCount = Math.ceil(encoded.bytes.length / ADVENTURE_STRUCTURE_LIMITS.chunkBytes);
        if (index >= chunkCount) invalid();
        return {
          ...current.result,
          kind: value.kind,
          parentId: value.parentId,
          id,
          present: item.item.exists,
          itemToken: actual,
          index,
          chunkCount,
          byteLength: encoded.bytes.length,
          contentHash: digest(encoded.json),
          chunkBase64: Buffer.from(
            encoded.bytes.subarray(
              index * ADVENTURE_STRUCTURE_LIMITS.chunkBytes,
              (index + 1) * ADVENTURE_STRUCTURE_LIMITS.chunkBytes,
            ),
          ).toString('base64'),
        };
      });
    },
  };
}
