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
import { readAdventureLoreContext } from './adventureLore.mjs';
import {
  ownRecord,
  storedMetadata,
  storedBody,
  metadataFields,
  bodyFields,
} from './adventureLoreContracts.mjs';
import { ADVENTURE_STRUCTURE_LIMITS } from './adventureBackupStructure.mjs';

const kinds = ['lore', 'lore-body'];
const external = ['contentStorage', 'payloadStorage', 'bodyStorage'];
const metadata = [
  'schemaVersion',
  'ownerId',
  'adventureId',
  'adventureToken',
  'entityId',
  'revision',
  'deleted',
  ...external,
];
const unavailable = () =>
  workFail(
    'failed-precondition',
    'O lore salvo está inconsistente ou em alteração.',
    'adventure-backup-lore-inconsistent',
  );
const invalid = () => workFail('invalid-argument', 'Pedido de lore portátil inválido.');
const own = (value, keys) =>
  Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
  );
const collection = (context, kind) =>
  context.path + '/' + (kind === 'lore' ? 'lore' : 'loreBodies');
function type(value) {
  if (!kinds.includes(value)) invalid();
  return value;
}
function check(snapshot, context, id) {
  if (!snapshot.exists) unavailable();
  const value = snapshot.data();
  ownRecord(value, context);
  if (
    value.entityId !== id ||
    !Number.isSafeInteger(value.revision) ||
    value.revision < 1 ||
    value.revision > context.collectionRevision ||
    external.some((key) => Object.hasOwn(value, key))
  )
    unavailable();
  return value;
}
async function paired(tx, context, kind, id, { snapshot = null, content = false } = {}) {
  const head =
    kind === 'lore' && snapshot
      ? snapshot
      : await readWorkMetadata(
          tx,
          context.db.doc(context.path + '/lore/' + id),
          content ? [...metadataFields, ...external] : metadata,
        );
  const body =
    kind === 'lore-body' && snapshot
      ? snapshot
      : await readWorkMetadata(
          tx,
          context.db.doc(context.path + '/loreBodies/' + id),
          content && kind === 'lore-body' ? [...bodyFields, ...external] : metadata,
        );
  const headValue = check(head, context, id);
  if (typeof headValue.deleted !== 'boolean') unavailable();
  if (headValue.deleted) {
    if (body.exists || kind === 'lore-body') unavailable();
  } else {
    const bodyValue = check(body, context, id);
    if (bodyValue.revision !== headValue.revision) unavailable();
  }
  let data;
  if (content) {
    const full = storedMetadata(own(headValue, metadataFields), context, id);
    data =
      kind === 'lore'
        ? own(
            full,
            full.deleted
              ? ['deleted', 'createdAt', 'updatedAt']
              : [
                  'name',
                  'aliases',
                  'category',
                  'summary',
                  'isPublic',
                  'deleted',
                  'createdAt',
                  'updatedAt',
                ],
          )
        : storedBody(own(body.data(), bodyFields), context, full);
  }
  return { head, body, data };
}
const itemToken = (context, sourceToken, kind, id, pair) =>
  digest({
    version: 1,
    uid: context.uid,
    adventureId: context.adventureId,
    sourceToken,
    kind,
    id,
    head: identity(pair.head),
    body: identity(pair.body),
  });
function cursor(input, context, kind, sourceToken) {
  if (input == null) return null;
  if (typeof input !== 'string' || input.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(input))
    invalid();
  let value;
  try {
    value = JSON.parse(Buffer.from(input, 'base64url').toString('utf8'));
  } catch {
    invalid();
  }
  workClosed(value, ['version', 'adventureId', 'kind', 'sourceToken', 'id']);
  if (
    Buffer.from(JSON.stringify(value)).toString('base64url') !== input ||
    value.version !== 1 ||
    value.adventureId !== context.adventureId ||
    value.kind !== kind ||
    value.sourceToken !== sourceToken
  )
    invalid();
  return workId(value.id);
}
async function origin(tx, context, expected) {
  const pin = await readAdventureBackupSource(tx, context, expected),
    lore = await readAdventureLoreContext(
      tx,
      context.db,
      context.uid,
      { adventureId: context.adventureId },
      true,
      false,
    );
  return { result: pin.result, context: { ...lore, db: context.db } };
}
export function createAdventureBackupLoreService({ db }) {
  const scope = (uid, data, keys) =>
    adventureBackupScope(db, uid, data, ['kind', 'sourceToken', ...keys]);
  return {
    async listAdventureBackupLore(uid, data) {
      const context = scope(uid, data, ['limit', 'cursor']),
        kind = type(data.kind),
        sourceToken = token(data.sourceToken),
        limit = workLimit(data.limit),
        after = cursor(data.cursor, context, kind, sourceToken);
      return db.runTransaction(async (tx) => {
        const current = await origin(tx, context, sourceToken);
        let query = db
          .collection(collection(context, kind))
          .orderBy('__name__')
          .limit(limit + 1)
          .select(...metadata);
        if (after !== null) query = query.startAfter(after);
        const page = await tx.get(query),
          selected = page.docs.slice(0, limit),
          items = [];
        for (const snapshot of selected) {
          const pair = await paired(tx, current.context, kind, snapshot.id, { snapshot });
          items.push({
            id: snapshot.id,
            deleted: pair.head.data().deleted,
            itemToken: itemToken(context, sourceToken, kind, snapshot.id, pair),
          });
        }
        return {
          ...current.result,
          kind,
          items,
          nextCursor:
            page.docs.length > limit
              ? Buffer.from(
                  JSON.stringify({
                    version: 1,
                    adventureId: context.adventureId,
                    kind,
                    sourceToken,
                    id: selected.at(-1).id,
                  }),
                ).toString('base64url')
              : null,
        };
      });
    },
    async readAdventureBackupLore(uid, data) {
      const context = scope(uid, data, ['id', 'itemToken', 'index']),
        kind = type(data.kind),
        sourceToken = token(data.sourceToken),
        id = workId(data.id),
        expectedItem = token(data.itemToken),
        index = data.index;
      if (!Number.isSafeInteger(index) || index < 0) invalid();
      return db.runTransaction(async (tx) => {
        const current = await origin(tx, context, sourceToken),
          pair = await paired(tx, current.context, kind, id, { content: true }),
          actual = itemToken(context, sourceToken, kind, id, pair);
        if (actual !== expectedItem) changed(true);
        const json = JSON.stringify({ schemaVersion: 1, kind, id, data: pair.data }),
          bytes = Buffer.from(json, 'utf8'),
          chunkCount = Math.ceil(bytes.length / ADVENTURE_STRUCTURE_LIMITS.chunkBytes);
        if (index >= chunkCount) invalid();
        return {
          ...current.result,
          kind,
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
