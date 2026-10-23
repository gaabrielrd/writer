import { readAvailablePersonaMetadata } from './personaAvailability.mjs';
import {
  digest,
  workClosed,
  workFail,
  workId,
  workLimit,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import {
  bookBackupScope,
  bookBackupToken,
  bookBackupIdentity,
  bookBackupChanged,
  readBookBackupSource,
} from './bookBackupContext.mjs';
import { BOOK_STRUCTURE_LIMITS } from './bookBackupStructure.mjs';
import { BOOK_PERSONA_SCOPES, serializeBookBackupPersona } from './bookBackupPersonas.mjs';
import { DEFAULT_PERSONAS, validateComplement } from './personaProfile.mjs';

const definitions = {
  book: { fields: ['personaId', 'deleting', 'rebalancing'] },
  chapter: { path: 'chapters', fields: ['personaComplement', 'deleting', 'rebalancing'] },
  'scene-source': {
    path: 'sceneSources',
    fields: ['original.personaComplement', 'deleting', 'rebalancing'],
  },
};
function unavailable() {
  workFail(
    'failed-precondition',
    'Uma persona usada ou seu vínculo está indisponível para backup.',
  );
}
function kind(value) {
  if (!BOOK_PERSONA_SCOPES.includes(value)) workFail('invalid-argument', 'Vínculo inválido.');
  return value;
}
function binding(type, value) {
  if (!value || value.deleting || value.rebalancing) unavailable();
  let id = null;
  try {
    id =
      type === 'book'
        ? (value.personaId ?? null)
        : (validateComplement((type === 'chapter' ? value : value.original)?.personaComplement)
            ?.personaId ?? null);
  } catch {
    unavailable();
  }
  if (id !== null && (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id))) unavailable();
  return id;
}
export async function readBookBackupPersonaIdentity(tx, context, id) {
  if (id === null) return { identity: null, preset: null, snapshot: null };
  const preset = DEFAULT_PERSONAS.find((value) => value.id === id);
  if (preset) return { identity: { presetHash: digest(preset) }, preset, snapshot: null };
  if (!/^custom-[a-zA-Z0-9-]{1,93}$/.test(id)) unavailable();
  const snapshot = await readAvailablePersonaMetadata(tx, context.db, context.uid, id);
  if (!snapshot) unavailable();
  return { identity: bookBackupIdentity(snapshot), preset: null, snapshot };
}
async function item(tx, context, sourceToken, type, snapshot) {
  if (!snapshot.exists) bookBackupChanged(true);
  const id = binding(type, snapshot.data()),
    profile = await readBookBackupPersonaIdentity(tx, context, id);
  return {
    row: {
      id: snapshot.id,
      personaId: id,
      itemToken: digest({
        version: 1,
        uid: context.uid,
        bookId: context.target.id,
        sourceToken,
        kind: type,
        id: snapshot.id,
        native: bookBackupIdentity(snapshot),
        personaId: id,
        profile: profile.identity,
      }),
    },
    profile,
  };
}
function cursor(value, context, type, token) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 16000 || !/^[A-Za-z0-9_-]+$/.test(value))
    workFail('invalid-argument', 'Página inválida.');
  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    workFail('invalid-argument', 'Página inválida.');
  }
  workClosed(parsed, ['version', 'bookId', 'kind', 'sourceToken', 'id']);
  if (
    Buffer.from(JSON.stringify(parsed)).toString('base64url') !== value ||
    parsed.version !== 1 ||
    parsed.bookId !== context.target.id ||
    parsed.kind !== type ||
    parsed.sourceToken !== token
  )
    workFail('invalid-argument', 'Página de outro vínculo.');
  return workId(parsed.id);
}
export function createBookBackupPersonaService({ db }) {
  const scope = (uid, data, keys) => bookBackupScope(db, uid, data, ['kind', ...keys]);
  return {
    async listBookBackupPersonaBindings(uid, data) {
      const context = scope(uid, data, ['sourceToken', 'cursor', 'limit']),
        type = kind(data.kind),
        expected = bookBackupToken(data.sourceToken),
        limit = workLimit(data.limit),
        after = cursor(data.cursor, context, type, expected);
      if (type === 'book' && after !== null)
        workFail('invalid-argument', 'Livro não recebe página.');
      return db.runTransaction(async (tx) => {
        const current = await readBookBackupSource(tx, context, expected),
          definition = definitions[type];
        let selected,
          hasMore = false;
        if (type === 'book')
          selected = [await readWorkMetadata(tx, context.ref, definition.fields)];
        else {
          let query = db
            .collection(context.path + '/' + definition.path)
            .orderBy('__name__')
            .limit(limit + 1)
            .select(...definition.fields);
          if (after !== null) query = query.startAfter(after);
          const page = await tx.get(query);
          selected = page.docs.slice(0, limit);
          hasMore = page.docs.length > limit;
        }
        const items = [];
        for (const snapshot of selected)
          items.push((await item(tx, context, expected, type, snapshot)).row);
        return {
          ...current.result,
          kind: type,
          items,
          nextCursor: hasMore
            ? Buffer.from(
                JSON.stringify({
                  version: 1,
                  bookId: context.target.id,
                  kind: type,
                  sourceToken: expected,
                  id: selected.at(-1).id,
                }),
              ).toString('base64url')
            : null,
        };
      });
    },
    async readBookBackupPersona(uid, data) {
      const context = scope(uid, data, ['sourceToken', 'id', 'itemToken', 'index']),
        type = kind(data.kind),
        expected = bookBackupToken(data.sourceToken),
        expectedItem = bookBackupToken(data.itemToken),
        id = workId(data.id);
      if (
        !Number.isSafeInteger(data.index) ||
        data.index < 0 ||
        (type === 'book' && id !== context.target.id)
      )
        workFail('invalid-argument', 'Parte ou vínculo inválido.');
      return db.runTransaction(async (tx) => {
        const current = await readBookBackupSource(tx, context, expected),
          definition = definitions[type],
          ref =
            type === 'book' ? context.ref : db.doc(context.path + '/' + definition.path + '/' + id),
          snapshot = await readWorkMetadata(tx, ref, definition.fields),
          captured = await item(tx, context, expected, type, snapshot);
        if (captured.row.itemToken !== expectedItem) bookBackupChanged(true);
        if (captured.row.personaId === null)
          workFail('failed-precondition', 'Este recurso não usa persona.');
        const profile =
          captured.profile.preset ?? (await tx.get(captured.profile.snapshot.ref)).data();
        let encoded;
        try {
          if (profile.id !== captured.row.personaId) unavailable();
          encoded = serializeBookBackupPersona(type, id, captured.row.personaId, profile);
        } catch {
          unavailable();
        }
        const chunkCount = Math.ceil(encoded.bytes.length / BOOK_STRUCTURE_LIMITS.chunkBytes);
        if (data.index >= chunkCount) workFail('invalid-argument', 'Parte fora do perfil.');
        const offset = data.index * BOOK_STRUCTURE_LIMITS.chunkBytes;
        return {
          ...current.result,
          kind: type,
          id,
          itemToken: captured.row.itemToken,
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
