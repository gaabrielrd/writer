import { readAvailablePersonaMetadata } from './personaAvailability.mjs';
import { DEFAULT_PERSONAS, validateComplement } from './personaProfile.mjs';
import { projectPortablePersonaProfile } from './portablePersonaProfile.mjs';
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
import { ADVENTURE_STRUCTURE_LIMITS } from './adventureBackupStructure.mjs';

const profileFields = [
  'id',
  'schemaVersion',
  'name',
  'description',
  'instructions',
  'traits',
  'revision',
  'archived',
  'createdAt',
  'updatedAt',
];
const bindingFields = ['ownerId', 'schemaVersion', 'deleting', 'rebalancing'];
const bad = () =>
  workFail(
    'failed-precondition',
    'Vínculo ou perfil da persona indisponível para backup.',
    'adventure-backup-persona-unavailable',
  );
const invalid = () => workFail('invalid-argument', 'Pedido de persona portátil inválido.');
function scope(value) {
  if (!['adventure', 'scene'].includes(value)) invalid();
  return value;
}
function binding(snapshot, context, kind) {
  if (!snapshot.exists) changed(true);
  const value = snapshot.data();
  if (
    !value ||
    value.ownerId !== context.uid ||
    value.schemaVersion !== 1 ||
    value.deleting ||
    value.rebalancing
  )
    bad();
  let id;
  try {
    id =
      kind === 'adventure'
        ? (value.personaId ?? null)
        : (validateComplement(value.personaComplement)?.personaId ?? null);
  } catch {
    bad();
  }
  if (id !== null && (typeof id !== 'string' || !/^[a-zA-Z0-9-]{1,100}$/.test(id))) bad();
  return id;
}
async function item(tx, context, sourceToken, kind, snapshot) {
  const id = binding(snapshot, context, kind);
  let profile = { identity: null, preset: null, snapshot: null };
  if (id !== null) {
    const preset = DEFAULT_PERSONAS.find((p) => p.id === id);
    if (preset) profile = { identity: { presetHash: digest(preset) }, preset, snapshot: null };
    else {
      const available = await readAvailablePersonaMetadata(tx, context.db, context.uid, id);
      if (!available) bad();
      profile = { identity: identity(available), preset: null, snapshot: available };
    }
  }
  return {
    row: {
      id: snapshot.id,
      personaId: id,
      itemToken: digest({
        version: 1,
        uid: context.uid,
        adventureId: context.adventureId,
        sourceToken,
        scope: kind,
        id: snapshot.id,
        native: identity(snapshot),
        personaId: id,
        profile: profile.identity,
      }),
    },
    profile,
  };
}
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
  workClosed(value, ['version', 'adventureId', 'scope', 'sourceToken', 'id']);
  if (
    Buffer.from(JSON.stringify(value)).toString('base64url') !== input ||
    value.version !== 1 ||
    value.adventureId !== context.adventureId ||
    value.scope !== kind ||
    value.sourceToken !== sourceToken
  )
    invalid();
  return workId(value.id);
}
export function createAdventureBackupPersonaService({ db }) {
  const context = (uid, data, fields) =>
    adventureBackupScope(db, uid, data, ['scope', 'sourceToken', ...fields]);
  const fields = (kind) => [
    ...bindingFields,
    kind === 'adventure' ? 'personaId' : 'personaComplement',
  ];
  return {
    async listAdventureBackupPersonaBindings(uid, data) {
      const c = context(uid, data, ['cursor', 'limit']),
        kind = scope(data.scope),
        sourceToken = token(data.sourceToken),
        limit = workLimit(data.limit),
        after = cursor(data.cursor, c, kind, sourceToken);
      if (kind === 'adventure' && after !== null) invalid();
      return db.runTransaction(async (tx) => {
        const current = await readAdventureBackupSource(tx, c, sourceToken);
        let selected,
          hasMore = false;
        if (kind === 'adventure') selected = [await readWorkMetadata(tx, c.ref, fields(kind))];
        else {
          let query = db
            .collection(c.path + '/scenes')
            .orderBy('__name__')
            .limit(limit + 1)
            .select(...fields(kind));
          if (after !== null) query = query.startAfter(after);
          const page = await tx.get(query);
          selected = page.docs.slice(0, limit);
          hasMore = page.docs.length > limit;
        }
        const items = [];
        for (const snapshot of selected)
          items.push((await item(tx, c, sourceToken, kind, snapshot)).row);
        return {
          ...current.result,
          scope: kind,
          items,
          nextCursor: hasMore
            ? Buffer.from(
                JSON.stringify({
                  version: 1,
                  adventureId: c.adventureId,
                  scope: kind,
                  sourceToken,
                  id: selected.at(-1).id,
                }),
              ).toString('base64url')
            : null,
        };
      });
    },
    async readAdventureBackupPersona(uid, data) {
      const c = context(uid, data, ['id', 'itemToken', 'index']),
        kind = scope(data.scope),
        sourceToken = token(data.sourceToken),
        id = workId(data.id),
        expected = token(data.itemToken),
        index = data.index;
      if (
        !Number.isSafeInteger(index) ||
        index < 0 ||
        (kind === 'adventure' && id !== c.adventureId)
      )
        invalid();
      return db.runTransaction(async (tx) => {
        const current = await readAdventureBackupSource(tx, c, sourceToken),
          ref = kind === 'adventure' ? c.ref : db.doc(c.path + '/scenes/' + id),
          snapshot = await readWorkMetadata(tx, ref, fields(kind)),
          captured = await item(tx, c, sourceToken, kind, snapshot);
        if (captured.row.itemToken !== expected) changed(true);
        const personaId = captured.row.personaId;
        if (personaId === null) bad();
        let raw = captured.profile.preset;
        if (!raw) {
          const full = await readWorkMetadata(tx, captured.profile.snapshot.ref, profileFields);
          if (digest(identity(full)) !== digest(captured.profile.identity)) changed(true);
          raw = full.data();
        }
        let profile;
        try {
          profile = projectPortablePersonaProfile(raw);
        } catch {
          bad();
        }
        if (profile.id !== personaId) bad();
        const json = JSON.stringify({
            schemaVersion: 1,
            kind: 'persona',
            scope: kind,
            bindingId: id,
            personaId,
            profile,
          }),
          bytes = Buffer.from(json, 'utf8'),
          chunkCount = Math.ceil(bytes.length / ADVENTURE_STRUCTURE_LIMITS.chunkBytes);
        if (index >= chunkCount) invalid();
        return {
          ...current.result,
          scope: kind,
          id,
          itemToken: captured.row.itemToken,
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
