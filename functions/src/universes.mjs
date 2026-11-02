import { GenerationError } from './generation.mjs';
import { prepareCampaignAuthorization } from './campaignAuthorization.mjs';

function fail(code, message) {
  throw new GenerationError(code, message);
}
function authorize(uid) {
  if (!uid) fail('unauthenticated', 'Entre na sua conta.');
}
export function universeDocumentId(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,128}$/.test(value))
    fail('invalid-argument', 'Identificador de universo ou entidade inválido.');
  return value;
}
function owned(record, uid, allowDeleting = false) {
  if (!record || record.authorId !== uid) fail('permission-denied', 'Universo indisponível.');
  if (record.deleting && !allowDeleting)
    fail('failed-precondition', 'A exclusão deste universo já foi iniciada.');
}
function text(value, label, max, required = false) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim()))
    fail('invalid-argument', `${label} inválido.`);
  return value.trim();
}

/** Read everything before returning the write phase, so callers can compose cover transactions. */
export async function prepareUniverseLink(tx, db, uid, bookId, before, after, now = Date.now) {
  return prepareUniverseProjectLink(tx, db, uid, { kind: 'book', id: bookId }, before, after, now);
}

export async function prepareUniverseProjectLink(
  tx,
  db,
  uid,
  project,
  before,
  after,
  now = Date.now,
  { strict = false } = {},
) {
  const types = {
    book: { collection: 'books', counter: 'bookCount', field: 'bookId' },
    adventure: { collection: 'adventures', counter: 'adventureCount', field: 'adventureId' },
    campaign: { collection: 'campaigns', counter: 'campaignCount', field: 'campaignId' },
  };
  const type = Object.hasOwn(types, project.kind) ? types[project.kind] : null;
  if (!type || typeof project.id !== 'string' || !project.id || project.id.includes('/'))
    fail('invalid-argument', 'Vínculo de projeto inválido.');
  const previous = before ?? null;
  const next = after ?? null;
  if (strict && before != null) universeDocumentId(before);
  if (after != null) universeDocumentId(after);
  if (previous === next && !strict) return { commit() {} };
  const refs = [...new Set([previous, next].filter(Boolean))].map((id) => ({
    id,
    ref: db.doc(`universes/${id}`),
    use: db.doc(`universes/${id}/${type.collection}/${project.id}`),
  }));
  const records = await Promise.all(
    refs.map(async (item) => ({
      ...item,
      record: (await tx.get(item.ref)).data(),
      usage: await tx.get(item.use),
    })),
  );
  for (const item of records) {
    if (item.id === next) owned(item.record, uid);
    if (strict) {
      if (item.record) {
        owned(item.record, uid, item.id !== next);
        let count = item.record[type.counter];
        if (count === undefined && item.id === next && item.id !== previous && !item.usage.exists) {
          const uses = await tx.get(db.collection(`${item.ref.path}/${type.collection}`).limit(1));
          if (!uses.docs.length) count = 0;
        }
        if (
          !Number.isSafeInteger(count) ||
          count < 0 ||
          (item.id === previous && count < 1) ||
          (item.id === next && item.id !== previous && !Number.isSafeInteger(count + 1))
        )
          fail('failed-precondition', 'O contador de vínculos do universo está inconsistente.');
        item.count = count;
        const previousDate = item.record.updatedAt ?? 0;
        if (!Number.isFinite(previousDate) || previousDate < 0)
          fail('failed-precondition', 'A data do universo está inconsistente.');
        item.timestamp = Math.max(now(), previousDate + 1);
        if (
          !Number.isFinite(item.timestamp) ||
          !Number.isFinite(new Date(item.timestamp).getTime())
        )
          fail('failed-precondition', 'A data do universo está inconsistente.');
      }
      if (
        (item.id === previous && item.record && !item.usage.exists) ||
        (item.usage.exists && item.usage.data()?.[type.field] !== project.id) ||
        (item.id === next && item.id !== previous && item.usage.exists)
      )
        fail('failed-precondition', 'O vínculo do universo está inconsistente.');
    }
  }
  if (previous === next) return { commit() {} };
  return {
    commit() {
      for (const item of records) {
        if (item.id === next && !item.usage.exists) {
          tx.set(item.use, { [type.field]: project.id });
          tx.update(item.ref, {
            [type.counter]: (strict ? item.count : (item.record[type.counter] ?? 0)) + 1,
            updatedAt: strict ? item.timestamp : now(),
          });
        } else if (item.id === previous && item.usage.exists) {
          tx.delete(item.use);
          if (item.record)
            tx.update(item.ref, {
              [type.counter]: strict
                ? item.count - 1
                : Math.max(0, (item.record[type.counter] ?? 0) - 1),
              updatedAt: strict ? item.timestamp : now(),
            });
        }
      }
    },
  };
}

export function createUniverseService({ db, now = Date.now }) {
  return {
    async createUniverse(uid, data) {
      authorize(uid);
      const id = universeDocumentId(data.creationId);
      const name = text(data.name, 'Nome', 200, true);
      const description = text(data.description ?? '', 'Descrição', 4000);
      const ref = db.doc(`universes/${id}`);
      const marker = db.doc(`publicUniversePrivacy/${id}`);
      return db.runTransaction(async (tx) => {
        const [existing, privacy] = await Promise.all([tx.get(ref), tx.get(marker)]);
        if (existing.exists) {
          owned(existing.data(), uid);
          return { ...existing.data(), id };
        }
        if (privacy.exists) fail('failed-precondition', 'Este universo foi removido.');
        const value = {
          authorId: uid,
          name,
          description,
          bookCount: 0,
          adventureCount: 0,
          campaignCount: 0,
          privacyVersion: 0,
          loreVersion: 0,
          createdAt: now(),
          updatedAt: now(),
        };
        const authorization = await prepareCampaignAuthorization(tx, db, uid, { bump: true });
        authorization.commit();
        tx.create(ref, value);
        tx.create(marker, { version: 0, active: true });
        return { ...value, id };
      });
    },
    async updateUniverse(uid, data) {
      authorize(uid);
      const id = universeDocumentId(data.id);
      const value = {
        name: text(data.name, 'Nome', 200, true),
        description: text(data.description ?? '', 'Descrição', 4000),
        updatedAt: now(),
      };
      const ref = db.doc(`universes/${id}`);
      return db.runTransaction(async (tx) => {
        const previous = (await tx.get(ref)).data();
        owned(previous, uid);
        tx.update(ref, value);
        return { ...previous, ...value, id };
      });
    },
    async deleteUniverse(uid, data) {
      authorize(uid);
      const id = universeDocumentId(data.id);
      const ref = db.doc(`universes/${id}`);
      const cleanup = await db.runTransaction(async (tx) => {
        const record = (await tx.get(ref)).data();
        if (!record) return false;
        owned(record, uid, true);
        const references = await Promise.all(
          ['books', 'adventures', 'campaigns'].map((kind) =>
            tx.get(db.collection(`universes/${id}/${kind}`).limit(1)),
          ),
        );
        if (
          ['bookCount', 'adventureCount', 'campaignCount'].some((key) => (record[key] ?? 0) > 0) ||
          references.some((reference) => reference.docs.length > 0)
        )
          fail(
            'failed-precondition',
            'Desvincule todos os livros, aventuras e campanhas antes de excluir o universo.',
          );
        if (!record.deleting) {
          const authorization = await prepareCampaignAuthorization(tx, db, uid, { bump: true });
          authorization.commit();
          tx.update(ref, {
            deleting: true,
            privacyVersion: record.privacyVersion + 1,
            updatedAt: now(),
          });
          tx.set(db.doc(`publicUniversePrivacy/${id}`), {
            version: record.privacyVersion + 1,
            active: false,
          });
        }
        return true;
      });
      // The tombstone and deletion lock remain even if cleanup fails; retry resumes safely.
      if (cleanup) await db.recursiveDelete(ref);
      return { deleted: true };
    },
    async saveUniverseLore(uid, data) {
      authorize(uid);
      const universeId = universeDocumentId(data.universeId);
      const id = universeDocumentId(data.id);
      const input = data.input;
      if (!input || typeof input !== 'object') fail('invalid-argument', 'Ficha inválida.');
      const value = {
        name: text(input.name, 'Nome', 200, true),
        category: input.category,
        summary: text(input.summary, 'Resumo', 140, true),
        details: text(input.details ?? '', 'Ficha detalhada', 150000),
        aliases: input.aliases ?? [],
        relations: input.relations ?? [],
        structuredDetails: Object.fromEntries(
          ['appearance', 'personality', 'history', 'notes'].map((key) => [
            key,
            text(input.structuredDetails?.[key] ?? '', 'Detalhes', 150000),
          ]),
        ),
        isPublic: input.isPublic ?? true,
        updatedAt: now(),
      };
      if (
        !['character', 'location', 'concept', 'other'].includes(value.category) ||
        typeof value.isPublic !== 'boolean'
      )
        fail('invalid-argument', 'Categoria ou visibilidade inválida.');
      if (!Array.isArray(value.aliases) || value.aliases.length > 20)
        fail('invalid-argument', 'Apelidos inválidos.');
      value.aliases = value.aliases.map((alias) => text(alias, 'Apelido', 200, true));
      if (!Array.isArray(value.relations) || value.relations.length > 50)
        fail('invalid-argument', 'Relações inválidas.');
      value.relations = value.relations.map((relation) => {
        const prefix = `universe:${universeId}:`;
        if (
          typeof relation?.targetEntityId !== 'string' ||
          !relation.targetEntityId.startsWith(prefix)
        )
          fail('invalid-argument', 'Relações globais devem pertencer ao mesmo universo.');
        const target = universeDocumentId(relation.targetEntityId.slice(prefix.length));
        if (target === id)
          fail('invalid-argument', 'Uma entidade não pode se relacionar consigo mesma.');
        return {
          targetEntityId: relation.targetEntityId,
          relationType: text(relation.relationType, 'Tipo de relação', 200, true),
          description: text(relation.description ?? '', 'Descrição da relação', 4000),
        };
      });
      if (Buffer.byteLength(JSON.stringify(value), 'utf8') > 900000)
        fail('invalid-argument', 'A ficha global é grande demais. Reduza os detalhes ou relações.');
      const worldRef = db.doc(`universes/${universeId}`);
      const ref = db.doc(`${worldRef.path}/lore/${id}`);
      return db.runTransaction(async (tx) => {
        const [worldSnapshot, existing] = await Promise.all([tx.get(worldRef), tx.get(ref)]);
        const world = worldSnapshot.data();
        owned(world, uid);
        const targets = await Promise.all(
          value.relations.map((relation) =>
            tx.get(db.doc(`${worldRef.path}/lore/${relation.targetEntityId.split(':')[2]}`)),
          ),
        );
        // Previously stored references may be unavailable after deletion; preserve them until edited.
        if (
          targets.some(
            (target, i) =>
              !target.exists &&
              !(existing.data()?.relations ?? []).some(
                (relation) => relation.targetEntityId === value.relations[i].targetEntityId,
              ),
          )
        )
          fail('failed-precondition', 'Entidade relacionada indisponível.');
        if (data.create === true && existing.exists)
          return { ...existing.data(), id: `universe:${universeId}:${id}`, universeId };
        if (data.create !== true && !existing.exists) fail('not-found', 'Entidade indisponível.');
        const revoke = existing.data()?.isPublic === true && value.isPublic === false;
        const authorization = await prepareCampaignAuthorization(tx, db, uid, { bump: true });
        authorization.commit();
        tx.update(worldRef, {
          loreVersion: world.loreVersion + 1,
          privacyVersion: world.privacyVersion + Number(revoke),
          updatedAt: now(),
        });
        if (revoke)
          tx.update(db.doc(`publicUniversePrivacy/${universeId}`), {
            version: world.privacyVersion + 1,
          });
        const entity = { ...value, createdAt: existing.data()?.createdAt ?? now() };
        tx.set(ref, entity);
        return { ...entity, id: `universe:${universeId}:${id}`, universeId };
      });
    },
    async deleteUniverseLore(uid, data) {
      authorize(uid);
      const universeId = universeDocumentId(data.universeId);
      const id = universeDocumentId(data.id);
      const worldRef = db.doc(`universes/${universeId}`);
      const ref = db.doc(`${worldRef.path}/lore/${id}`);
      await db.runTransaction(async (tx) => {
        const [worldSnapshot, existing] = await Promise.all([tx.get(worldRef), tx.get(ref)]);
        const world = worldSnapshot.data();
        owned(world, uid);
        if (!existing.exists) return;
        const revoke = existing.data().isPublic === true;
        const authorization = await prepareCampaignAuthorization(tx, db, uid, { bump: true });
        authorization.commit();
        tx.update(worldRef, {
          loreVersion: world.loreVersion + 1,
          privacyVersion: world.privacyVersion + Number(revoke),
          updatedAt: now(),
        });
        if (revoke)
          tx.update(db.doc(`publicUniversePrivacy/${universeId}`), {
            version: world.privacyVersion + 1,
          });
        tx.delete(ref);
      });
      return { deleted: true };
    },
    async detachUniverse(uid, universeId, bookId) {
      await db.runTransaction(async (tx) => {
        const operation = await prepareUniverseLink(tx, db, uid, bookId, universeId, null, now);
        operation.commit();
      });
    },
  };
}
