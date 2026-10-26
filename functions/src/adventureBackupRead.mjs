import {
  adventureBackupScope as scope,
  adventureBackupToken as token,
  adventureBackupIdentity as identity,
  adventureBackupChanged as changed,
  readAdventureBackupSource as source,
  createAdventureBackupSourceService,
} from './adventureBackupSource.mjs';
import {
  workClosed,
  workFail,
  workId,
  workLimit,
  readWorkMetadata,
  digest,
} from './workProgressContracts.mjs';
import {
  ADVENTURE_STRUCTURE_LIMITS as limits,
  ADVENTURE_STRUCTURE_FIELDS as fields,
  serializeAdventureBackupStructure,
} from './adventureBackupStructure.mjs';

const invalid = () => workFail('invalid-argument', 'Leitura de estrutura inválida.');
const inconsistent = () =>
  workFail(
    'failed-precondition',
    'Dados da estrutura não podem ser representados no backup.',
    'adventure-backup-item-inconsistent',
  );
const metadata = ['ownerId', 'schemaVersion', 'deleting', 'rebalancing'];
function kind(value, root = false) {
  if (!(root ? ['adventure', 'part'] : ['part']).includes(value)) invalid();
  return value;
}
function available(snapshot, uid) {
  const value = snapshot.data();
  if (!snapshot.exists || !value || (Object.hasOwn(value, 'ownerId') && value.ownerId !== uid))
    workFail('not-found', 'Parte indisponível.');
  if (Object.hasOwn(value, 'schemaVersion') && value.schemaVersion !== 1) inconsistent();
  if (value.deleting || value.rebalancing)
    workFail('failed-precondition', 'Estrutura em alteração. Retome a operação antes do backup.');
  return value;
}
function itemToken(context, sourceToken, type, snapshot) {
  return digest({
    version: 1,
    uid: context.uid,
    adventureId: context.adventureId,
    sourceToken,
    kind: type,
    id: snapshot.id,
    native: identity(snapshot),
  });
}
function cursor(value, context, sourceToken) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(value))
    invalid();
  let data;
  try {
    data = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    invalid();
  }
  workClosed(data, ['version', 'kind', 'adventureId', 'sourceToken', 'id']);
  if (
    Buffer.from(JSON.stringify(data)).toString('base64url') !== value ||
    data.version !== 1 ||
    data.kind !== 'part' ||
    data.adventureId !== context.adventureId ||
    data.sourceToken !== sourceToken
  )
    invalid();
  return workId(data.id);
}
export function createAdventureBackupReadService({ db }) {
  return {
    ...createAdventureBackupSourceService({ db }),
    async listAdventureBackupStructure(uid, data) {
      const context = scope(db, uid, data, ['kind', 'sourceToken', 'cursor', 'limit']),
        type = kind(data.kind),
        expected = token(data.sourceToken),
        limit = workLimit(data.limit),
        after = cursor(data.cursor, context, expected);
      return db.runTransaction(async (tx) => {
        const current = await source(tx, context, expected);
        let query = db
          .collection(context.path + '/parts')
          .orderBy('__name__')
          .limit(limit + 1)
          .select(...metadata);
        if (after !== null) query = query.startAfter(after);
        const page = await tx.get(query),
          selected = page.docs.slice(0, limit);
        for (const snapshot of selected) available(snapshot, uid);
        return {
          ...current.result,
          kind: type,
          items: selected.map((snapshot) => ({
            id: snapshot.id,
            itemToken: itemToken(context, expected, type, snapshot),
          })),
          nextCursor:
            page.docs.length > limit
              ? Buffer.from(
                  JSON.stringify({
                    version: 1,
                    kind: type,
                    adventureId: context.adventureId,
                    sourceToken: expected,
                    id: selected.at(-1).id,
                  }),
                ).toString('base64url')
              : null,
        };
      });
    },
    async readAdventureBackupStructure(uid, data) {
      const context = scope(db, uid, data, ['kind', 'sourceToken', 'id', 'itemToken', 'index']),
        type = kind(data.kind, true),
        expected = token(data.sourceToken),
        id = workId(data.id),
        expectedItem = token(data.itemToken),
        index = data.index;
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        (type === 'adventure' && id !== context.adventureId)
      )
        invalid();
      return db.runTransaction(async (tx) => {
        const current = await source(tx, context, expected),
          path = type === 'adventure' ? context.path : context.path + '/parts/' + id,
          snapshot = await readWorkMetadata(tx, db.doc(path), [
            ...metadata,
            ...fields[type],
            'contentStorage',
            'payloadStorage',
          ]),
          value = type === 'part' ? available(snapshot, uid) : snapshot.data(),
          actualToken = type === 'part' ? itemToken(context, expected, type, snapshot) : expected;
        if (
          !value ||
          !snapshot.exists ||
          actualToken !== expectedItem ||
          (type === 'adventure' &&
            digest(identity(snapshot)) !== digest(identity(current.snapshot)))
        )
          changed(true);
        if (type === 'adventure') {
          if (value.ownerId !== uid || value.deleting)
            workFail('not-found', 'Aventura indisponível.');
          if (value.schemaVersion !== 1) inconsistent();
        }
        if (Object.hasOwn(value, 'contentStorage') || Object.hasOwn(value, 'payloadStorage'))
          inconsistent();
        let encoded;
        try {
          encoded = serializeAdventureBackupStructure(type, value);
        } catch (error) {
          if (error instanceof TypeError) inconsistent();
          throw error;
        }
        const byteLength = encoded.bytes.length,
          chunkCount = Math.ceil(byteLength / limits.chunkBytes);
        if (index >= chunkCount) invalid();
        return {
          ...current.result,
          kind: type,
          id,
          itemToken: actualToken,
          index: index,
          chunkCount,
          byteLength,
          contentHash: digest(encoded.json),
          chunkBase64: Buffer.from(
            encoded.bytes.subarray(index * limits.chunkBytes, (index + 1) * limits.chunkBytes),
          ).toString('base64'),
        };
      });
    },
  };
}
