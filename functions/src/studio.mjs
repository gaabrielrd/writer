import { createHash } from 'node:crypto';
import {
  assertCampaignNotDeleted,
  readCampaignDeletionReservation,
} from './campaignDeletionGuard.mjs';
import { GenerationError, validateId } from './generation.mjs';
import { prepareUniverseProjectLink, universeDocumentId } from './universes.mjs';

const domains = {
  book: { collection: 'books', owner: 'authorId', statuses: ['draft', 'published'] },
  adventure: {
    collection: 'adventures',
    owner: 'ownerId',
    statuses: ['draft', 'ready', 'archived'],
  },
  campaign: {
    collection: 'campaigns',
    owner: 'ownerId',
    statuses: ['planning', 'active', 'completed', 'archived'],
  },
};
const editorialStates = ['draft', 'review', 'ready'];
const summaryFields = [
  'title',
  'status',
  'editorialState',
  'universeId',
  'createdAt',
  'updatedAt',
  'revision',
];
const fail = (code, message) => {
  throw new GenerationError(code, message);
};
function authorize(uid) {
  if (!uid) fail('unauthenticated', 'Entre na sua conta.');
}
function input(data, keys) {
  if (
    !data ||
    typeof data !== 'object' ||
    Array.isArray(data) ||
    Object.keys(data).some((key) => !keys.includes(key))
  )
    fail('invalid-argument', 'Dados do projeto inválidos.');
  return data;
}
function text(value, limit, required = false) {
  if (value === undefined && !required) return '';
  if (typeof value !== 'string' || value.length > limit || (required && !value.trim()))
    fail('invalid-argument', 'Preencha os campos com valores válidos.');
  return value.trim();
}
function pageLimit(value = 25) {
  if (!Number.isInteger(value) || value < 1 || value > 50)
    fail('invalid-argument', 'O tamanho da página deve estar entre 1 e 50.');
  return value;
}
function date(value) {
  return (
    typeof value === 'number' &&
    Number.isFinite(value) &&
    value >= 0 &&
    value <= 8_640_000_000_000_000
  );
}
function metadataDate(timestamp) {
  const value = timestamp?.toMillis?.();
  if (!date(value)) fail('failed-precondition', 'Não foi possível preparar as datas do livro.');
  return value;
}
function documentId(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('/') ||
    value === '.' ||
    value === '..' ||
    Buffer.byteLength(value, 'utf8') > 1500
  )
    fail('invalid-argument', 'Identificador inválido.');
  return value;
}
function projectView(kind, id, record) {
  return {
    id,
    ownerId: record.ownerId,
    schemaVersion: record.schemaVersion,
    revision: record.revision,
    title: record.title,
    status: record.status,
    ...(['draft', 'review', 'ready'].includes(record.editorialState)
      ? { editorialState: record.editorialState }
      : {}),
    universeId: record.universeId ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    ...(kind === 'adventure'
      ? { synopsis: record.synopsis, language: record.language, origin: record.origin }
      : {
          description: record.description,
          provenance: record.provenance,
          ...(record.provenance?.kind === 'original' ? { activeBaseId: record.activeBaseId } : {}),
        }),
  };
}
function effectiveEditorialState(kind, record) {
  return editorialStates.includes(record.editorialState)
    ? record.editorialState
    : kind === 'adventure' && record.status === 'ready'
      ? 'ready'
      : 'draft';
}
function summary(kind, snapshot) {
  const record = snapshot.data();
  return {
    id: snapshot.id,
    kind,
    title: record.title,
    status: record.status,
    ...(kind !== 'campaign' ? { editorialState: effectiveEditorialState(kind, record) } : {}),
    universeId: record.universeId ?? null,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    revision: Number.isSafeInteger(record.revision) && record.revision > 0 ? record.revision : 0,
    ...(kind === 'book'
      ? {
          coverUrl: record.coverUrl ?? null,
          wordCount: record.wordCount ?? 0,
          ...(typeof record.genre === 'string' ? { genre: record.genre } : {}),
          ...(typeof record.synopsis === 'string' ? { synopsis: record.synopsis } : {}),
        }
      : {}),
  };
}
function readCursor(value, uid, kind, status, editorialState) {
  if (value == null) return null;
  if (typeof value !== 'string' || value.length > 4096 || !/^[A-Za-z0-9_-]+$/.test(value))
    fail('invalid-argument', 'Página inválida. Reabra o Estúdio.');
  let cursor;
  try {
    cursor = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'));
  } catch {
    fail('invalid-argument', 'Página inválida. Reabra o Estúdio.');
  }
  input(cursor, ['version', 'uid', 'kind', 'status', 'editorialState', 'updatedAt', 'id']);
  if (
    cursor.version !== 1 ||
    cursor.uid !== uid ||
    cursor.kind !== kind ||
    cursor.status !== status ||
    (Object.hasOwn(cursor, 'editorialState') ? cursor.editorialState : 'all') !== editorialState ||
    !date(cursor.updatedAt)
  )
    fail('invalid-argument', 'Página inválida. Reabra o Estúdio.');
  documentId(cursor.id);
  return cursor;
}

export function createStudioService({ db, now = Date.now }) {
  async function create(uid, data, kind) {
    authorize(uid);
    const brief = kind === 'adventure' ? 'synopsis' : 'description';
    input(data, ['operationId', 'title', brief, 'universeId']);
    const id = validateId(data.operationId);
    const normalized = {
      title: text(data.title, 300, true),
      [brief]: text(data[brief], 4000),
      universeId: data.universeId == null ? null : universeDocumentId(data.universeId),
    };
    const fingerprint = createHash('sha256')
      .update(JSON.stringify({ kind, id, ...normalized }))
      .digest('hex');
    const ref = db.doc(`${domains[kind].collection}/${id}`);
    const receipt = db.doc(`users/${uid}/studioOperations/${id}`);
    return db.runTransaction(async (tx) => {
      if (kind === 'campaign') await assertCampaignNotDeleted(tx, db, uid, id);
      const [existing, operation] = await Promise.all([tx.get(ref), tx.get(receipt)]);
      const current = existing.data();
      if (operation.exists) {
        if (operation.data().fingerprint !== fingerprint)
          fail('invalid-argument', 'Operação usada com outro projeto ou conteúdo.');
        if (!current || current.ownerId !== uid || current.deleting)
          fail('failed-precondition', 'Projeto indisponível.');
        return projectView(kind, id, current);
      }
      if (existing.exists) {
        if (current.ownerId !== uid) fail('permission-denied', 'Projeto indisponível.');
        fail('failed-precondition', 'Identificador já utilizado.');
      }
      const link = await prepareUniverseProjectLink(
        tx,
        db,
        uid,
        { kind, id },
        null,
        normalized.universeId,
        now,
      );
      const createdAt = now();
      const value = {
        id,
        ownerId: uid,
        schemaVersion: 1,
        revision: 1,
        ...normalized,
        createdAt,
        updatedAt: createdAt,
        ...(kind === 'adventure'
          ? { language: 'pt-BR', origin: { kind: 'authored' }, status: 'draft' }
          : { provenance: { kind: 'independent' }, status: 'planning' }),
      };
      link.commit();
      tx.create(ref, value);
      tx.create(receipt, { kind, projectId: id, fingerprint, createdAt });
      return projectView(kind, id, value);
    });
  }
  async function get(uid, data, kind) {
    authorize(uid);
    input(data, ['id']);
    const id = validateId(data.id);
    const record =
      kind === 'campaign'
        ? await db.runTransaction(async (tx) => {
            if ((await readCampaignDeletionReservation(tx, db, id)).record) return null;
            return (await tx.get(db.doc('campaigns/' + id))).data();
          })
        : (await db.doc(`${domains[kind].collection}/${id}`).get()).data();
    if (!record || record.ownerId !== uid || record.deleting) return null;
    return projectView(kind, id, record);
  }
  return {
    createAdventure: (uid, data) => create(uid, data, 'adventure'),
    createCampaign: (uid, data) => create(uid, data, 'campaign'),
    getAdventure: (uid, data) => get(uid, data, 'adventure'),
    getCampaign: (uid, data) => get(uid, data, 'campaign'),
    async prepareStudioBooks(uid, data = {}) {
      authorize(uid);
      input(data, ['limit']);
      const limit = pageLimit(data.limit);
      const checkpoint = db.doc(`users/${uid}/studioPreparation/books-v1`);
      return db.runTransaction(async (tx) => {
        const previous = (await tx.get(checkpoint)).data();
        if (previous?.complete) return { complete: true, processed: previous.processed };
        let query = db
          .collection('books')
          .where('authorId', '==', uid)
          .orderBy('__name__')
          .limit(limit);
        if (previous?.cursor) query = query.startAfter(previous.cursor);
        const page = await tx.get(query);
        const patches = page.docs.map((snapshot) => {
          const record = snapshot.data();
          const patch = {};
          if (!date(record.updatedAt)) patch.updatedAt = metadataDate(snapshot.updateTime);
          if (!date(record.createdAt)) patch.createdAt = metadataDate(snapshot.createTime);
          if (record.status == null) patch.status = 'draft';
          else if (!domains.book.statuses.includes(record.status))
            fail(
              'failed-precondition',
              'Um livro possui estado inválido. Corrija-o antes de continuar.',
            );
          return { ref: snapshot.ref, patch };
        });
        for (const { ref, patch } of patches) if (Object.keys(patch).length) tx.update(ref, patch);
        const complete = page.docs.length < limit;
        const processed = (previous?.processed ?? 0) + page.docs.length;
        tx.set(checkpoint, {
          version: 1,
          complete,
          processed,
          cursor: page.docs.at(-1)?.id ?? previous?.cursor ?? null,
          updatedAt: now(),
        });
        return { complete, processed };
      });
    },
    async listStudioProjects(uid, data) {
      authorize(uid);
      input(data, ['kind', 'status', 'editorialState', 'cursor', 'limit']);
      const domain = Object.hasOwn(domains, data.kind) ? domains[data.kind] : null;
      if (!domain) fail('invalid-argument', 'Tipo de projeto inválido.');
      const status = data.status ?? 'all';
      if (status !== 'all' && !domain.statuses.includes(status))
        fail('invalid-argument', 'Estado de projeto inválido.');
      const editorialState = data.editorialState === undefined ? 'all' : data.editorialState;
      if (
        editorialState !== 'all' &&
        (data.kind === 'campaign' || !editorialStates.includes(editorialState))
      )
        fail('invalid-argument', 'Estado editorial inválido.');
      const limit = pageLimit(data.limit);
      const cursor = readCursor(data.cursor, uid, data.kind, status, editorialState);
      if (data.kind === 'book') {
        const prepared = (await db.doc(`users/${uid}/studioPreparation/books-v1`).get()).data();
        if (prepared?.complete !== true)
          fail('failed-precondition', 'Prepare seus livros antes de abrir esta lista.');
      }
      let query = db.collection(domain.collection).where(domain.owner, '==', uid);
      if (status !== 'all') query = query.where('status', '==', status);
      query = query
        .orderBy('updatedAt', 'desc')
        .orderBy('__name__', 'desc')
        .limit(limit + 1)
        .select(
          ...summaryFields,
          ...(data.kind === 'book' ? ['coverUrl', 'wordCount', 'genre', 'synopsis'] : []),
        );
      if (cursor) query = query.startAfter(cursor.updatedAt, cursor.id);
      const page =
        data.kind === 'campaign'
          ? await db.runTransaction(async (tx) => {
              const window = await tx.get(query.select('ownerId', 'updatedAt'));
              const docs = [];
              for (const snapshot of window.docs) {
                const reserved = (await readCampaignDeletionReservation(tx, db, snapshot.id))
                  .record;
                if (reserved)
                  docs.push({
                    id: snapshot.id,
                    ref: snapshot.ref,
                    data: () => ({ ...snapshot.data(), deleting: true }),
                  });
                else docs.push((await tx.getAll(snapshot.ref, { fieldMask: summaryFields }))[0]);
              }
              return { docs };
            })
          : await query.get();
      const scanned = page.docs.slice(0, limit);
      const last = scanned.at(-1);
      return {
        items: scanned
          .filter((snapshot) => !snapshot.data().deleting)
          .map((snapshot) => summary(data.kind, snapshot))
          .filter((item) => editorialState === 'all' || item.editorialState === editorialState),
        nextCursor:
          page.docs.length > limit
            ? Buffer.from(
                JSON.stringify({
                  version: 1,
                  uid,
                  kind: data.kind,
                  status,
                  editorialState,
                  updatedAt: last.data().updatedAt,
                  id: last.id,
                }),
              ).toString('base64url')
            : null,
      };
    },
  };
}
