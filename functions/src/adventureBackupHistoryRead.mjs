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
import { CHUNK_BYTES } from './workHistoryContracts.mjs';
import { utf8 } from './campaignSessionsContracts.mjs';
import { ADVENTURE_STRUCTURE_LIMITS } from './adventureBackupStructure.mjs';

const external = ['contentStorage', 'payloadStorage', 'bodyStorage'];
const metadata = [
  'id',
  'target.kind',
  'target.id',
  'resource.kind',
  'resource.id',
  'schemaVersion',
  'deleting',
  'chunkCount',
  'byteLength',
  'contentHash',
  ...external,
];
const bodyMetadata = ['versionId', 'index', ...external];
const contentFields = [...metadata, 'createdAt', 'reason', 'label', 'wordCount', 'draft'];
const bad = () =>
  workFail(
    'failed-precondition',
    'Histórico da aventura inconsistente.',
    'adventure-backup-history-inconsistent',
  );
const invalid = () => workFail('invalid-argument', 'Pedido de histórico portátil inválido.');
const own = (value, fields) =>
  Object.fromEntries(fields.filter((k) => Object.hasOwn(value, k)).map((k) => [k, value[k]]));
const validId = (value) =>
  utf8(value) &&
  value.length > 0 &&
  Buffer.byteLength(value) <= 1500 &&
  !value.includes('/') &&
  !['.', '..'].includes(value);
function descriptor(data) {
  const kind = data.kind,
    parentId = data.parentId ?? null,
    parentToken = data.parentToken ?? null;
  if (!['version', 'version-chunk'].includes(kind)) invalid();
  if (kind === 'version') {
    if (parentId !== null || parentToken !== null) invalid();
  } else {
    workId(parentId);
    token(parentToken);
  }
  return { kind, parentId, parentToken };
}
function native(snapshot, root) {
  const stamp = identity(snapshot);
  if (!stamp) bad();
  const born = stamp.created,
    base = identity(root).created;
  if (
    born.seconds < base.seconds ||
    (born.seconds === base.seconds && born.nanoseconds < base.nanoseconds)
  )
    bad();
  return stamp;
}
function headData(snapshot, context, id, root, content = false) {
  native(snapshot, root);
  const value = snapshot.data();
  if (
    !value ||
    value.id !== id ||
    value.deleting ||
    ![undefined, 1].includes(value.schemaVersion) ||
    value.target?.kind !== 'adventure' ||
    value.target.id !== context.adventureId ||
    !['scene', 'block'].includes(value.resource?.kind) ||
    !validId(value.resource?.id) ||
    external.some((k) => Object.hasOwn(value, k)) ||
    !Number.isSafeInteger(value.chunkCount) ||
    value.chunkCount < 1 ||
    !Number.isSafeInteger(value.byteLength) ||
    value.byteLength < 0 ||
    value.chunkCount > Math.max(1, Math.ceil(value.byteLength / (CHUNK_BYTES - 3))) ||
    typeof value.contentHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(value.contentHash)
  )
    bad();
  if (
    content &&
    (Object.hasOwn(value, 'draft') ||
      !['manual', 'before-restore'].includes(value.reason) ||
      !Number.isFinite(value.createdAt) ||
      value.createdAt < 0 ||
      value.createdAt > 8640000000000000 ||
      !Number.isSafeInteger(value.wordCount) ||
      value.wordCount < 0 ||
      (Object.hasOwn(value, 'label') && value.label !== null && !utf8(value.label)))
  )
    bad();
  return value;
}
const headToken = (context, sourceToken, snapshot) =>
  digest({
    version: 1,
    uid: context.uid,
    adventureId: context.adventureId,
    sourceToken,
    id: snapshot.id,
    native: identity(snapshot),
  });
async function parent(tx, context, scope, current, sourceToken) {
  if (scope.kind === 'version') return null;
  const snapshot = await readWorkMetadata(
      tx,
      context.db.doc(context.path + '/workVersions/' + scope.parentId),
      metadata,
    ),
    data = headData(snapshot, context, scope.parentId, current.snapshot),
    actual = headToken(context, sourceToken, snapshot);
  if (actual !== scope.parentToken) changed(true);
  return { snapshot, data };
}
function chunkData(snapshot, scope, ancestor, root, content = false) {
  native(snapshot, root);
  const value = snapshot.data();
  if (
    !value ||
    value.versionId !== scope.parentId ||
    !Number.isSafeInteger(value.index) ||
    value.index < 0 ||
    value.index >= ancestor.data.chunkCount ||
    snapshot.id !== digest({ versionId: value.versionId, index: value.index }) ||
    external.some((k) => Object.hasOwn(value, k)) ||
    (content && (!utf8(value.content) || Buffer.byteLength(value.content) > CHUNK_BYTES))
  )
    bad();
  return value;
}
const chunkToken = (context, sourceToken, scope, snapshot) =>
  digest({
    version: 1,
    uid: context.uid,
    adventureId: context.adventureId,
    sourceToken,
    parentId: scope.parentId,
    parentToken: scope.parentToken,
    id: snapshot.id,
    native: identity(snapshot),
  });
function cursor(input, context, scope, sourceToken) {
  if (input == null) return null;
  if (typeof input !== 'string' || input.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(input))
    invalid();
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(input, 'base64url').toString('utf8'));
  } catch {
    invalid();
  }
  workClosed(parsed, [
    'version',
    'adventureId',
    'kind',
    'parentId',
    'parentToken',
    'sourceToken',
    'id',
  ]);
  if (
    Buffer.from(JSON.stringify(parsed)).toString('base64url') !== input ||
    parsed.version !== 1 ||
    parsed.adventureId !== context.adventureId ||
    parsed.kind !== scope.kind ||
    parsed.parentId !== scope.parentId ||
    parsed.parentToken !== scope.parentToken ||
    parsed.sourceToken !== sourceToken
  )
    invalid();
  return workId(parsed.id);
}
export function createAdventureBackupHistoryService({ db }) {
  const scope = (uid, data, keys) =>
    adventureBackupScope(db, uid, data, [
      'kind',
      'parentId',
      'parentToken',
      'sourceToken',
      ...keys,
    ]);
  return {
    async listAdventureBackupHistory(uid, data) {
      const context = scope(uid, data, ['limit', 'cursor']),
        value = descriptor(data),
        sourceToken = token(data.sourceToken),
        limit = workLimit(data.limit),
        after = cursor(data.cursor, context, value, sourceToken);
      return db.runTransaction(async (tx) => {
        const current = await readAdventureBackupSource(tx, context, sourceToken),
          ancestor = await parent(tx, context, value, current, sourceToken);
        let query = db.collection(
          context.path + (value.kind === 'version' ? '/workVersions' : '/workVersionBodies'),
        );
        if (ancestor) query = query.where('versionId', '==', value.parentId);
        query = query
          .orderBy('__name__')
          .limit(limit + 1)
          .select(...(ancestor ? bodyMetadata : metadata));
        if (after !== null) query = query.startAfter(after);
        const page = await tx.get(query),
          selected = page.docs.slice(0, limit),
          items = [];
        for (const snapshot of selected) {
          const raw = ancestor
            ? chunkData(snapshot, value, ancestor, current.snapshot)
            : headData(snapshot, context, snapshot.id, current.snapshot);
          items.push({
            id: snapshot.id,
            ...(ancestor ? { ordinal: raw.index } : {}),
            itemToken: ancestor
              ? chunkToken(context, sourceToken, value, snapshot)
              : headToken(context, sourceToken, snapshot),
          });
        }
        return {
          ...current.result,
          ...value,
          items,
          nextCursor:
            page.docs.length > limit
              ? Buffer.from(
                  JSON.stringify({
                    version: 1,
                    adventureId: context.adventureId,
                    ...value,
                    sourceToken,
                    id: selected.at(-1).id,
                  }),
                ).toString('base64url')
              : null,
        };
      });
    },
    async readAdventureBackupHistory(uid, data) {
      const context = scope(uid, data, ['id', 'itemToken', 'index']),
        value = descriptor(data),
        sourceToken = token(data.sourceToken),
        id = workId(data.id),
        expected = token(data.itemToken),
        index = data.index;
      if (!Number.isSafeInteger(index) || index < 0) invalid();
      return db.runTransaction(async (tx) => {
        const current = await readAdventureBackupSource(tx, context, sourceToken),
          ancestor = await parent(tx, context, value, current, sourceToken),
          snapshot = await readWorkMetadata(
            tx,
            db.doc(context.path + (ancestor ? '/workVersionBodies/' : '/workVersions/') + id),
            ancestor ? [...bodyMetadata, 'content'] : contentFields,
          ),
          raw = ancestor
            ? chunkData(snapshot, value, ancestor, current.snapshot, true)
            : headData(snapshot, context, id, current.snapshot, true),
          actual = ancestor
            ? chunkToken(context, sourceToken, value, snapshot)
            : headToken(context, sourceToken, snapshot);
        if (actual !== expected) changed(true);
        const json = JSON.stringify({
            schemaVersion: 1,
            kind: value.kind,
            parentId: value.parentId,
            id,
            data: ancestor
              ? own(raw, ['index', 'content'])
              : {
                  resource: own(raw.resource, ['kind', 'id']),
                  ...own(raw, [
                    'createdAt',
                    'reason',
                    'label',
                    'wordCount',
                    'byteLength',
                    'contentHash',
                    'chunkCount',
                  ]),
                },
          }),
          bytes = Buffer.from(json, 'utf8'),
          chunkCount = Math.ceil(bytes.length / ADVENTURE_STRUCTURE_LIMITS.chunkBytes);
        if (index >= chunkCount) invalid();
        return {
          ...current.result,
          ...value,
          id,
          itemToken: actual,
          index,
          chunkCount,
          byteLength: bytes.length,
          contentHash: digest(json),
          chunkBase64: bytes
            .subarray(
              index * ADVENTURE_STRUCTURE_LIMITS.chunkBytes,
              (index + 1) * ADVENTURE_STRUCTURE_LIMITS.chunkBytes,
            )
            .toString('base64'),
        };
      });
    },
  };
}
