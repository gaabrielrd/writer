import { GenerationError, validateId } from './generation.mjs';
import { prepareUniverseLink } from './universes.mjs';

export const imageRef = (db, uid, id) => db.doc(`users/${uid}/imageLibrary/${validateId(id)}`);
export function libraryImage(id, record, now) {
  return {
    id,
    name: record.title,
    url: record.coverUrl,
    path: record.path,
    createdAt: record.acceptedAt ?? now,
    updatedAt: now,
    useCount: 0,
    state: 'active',
  };
}
function fail(code, message) {
  throw new GenerationError(code, message);
}
function authorize(uid) {
  if (!uid) fail('unauthenticated', 'Entre na sua conta.');
}
function active(record) {
  if (!record || record.state !== 'active') fail('not-found', 'Imagem indisponível.');
}

export function createImageLibraryService({ db, assets, now = Date.now }) {
  const useRef = (uid, id, bookId) => db.doc(`${imageRef(db, uid, id).path}/uses/${bookId}`);
  const service = {
    async rename(uid, data) {
      authorize(uid);
      if (typeof data.name !== 'string' || !data.name.trim() || data.name.trim().length > 300)
        fail('invalid-argument', 'Informe um nome de até 300 caracteres.');
      const ref = imageRef(db, uid, data.id);
      await db.runTransaction(async (tx) => {
        active((await tx.get(ref)).data());
        tx.update(ref, { name: data.name.trim(), updatedAt: now() });
      });
      return { saved: true };
    },
    async remove(uid, data) {
      authorize(uid);
      const ref = imageRef(db, uid, data.id);
      const path = await db.runTransaction(async (tx) => {
        const record = (await tx.get(ref)).data();
        if (!record || record.state === 'deleted') return null;
        if (record.useCount > 0)
          fail(
            'failed-precondition',
            'A imagem está em uso. Remova-a dos livros antes de excluir.',
          );
        tx.update(ref, { state: 'deleting', updatedAt: now() });
        return record.path;
      });
      if (path) {
        await assets.remove(path);
        await ref.update({ state: 'deleted', updatedAt: now() });
      }
      return { deleted: true };
    },
    async saveBook(uid, data) {
      authorize(uid);
      const bookId = validateId(data.bookId ?? data.creationId);
      const bookRef = db.doc(`books/${bookId}`);
      if (
        (!data.bookId || data.title !== undefined) &&
        (typeof data.title !== 'string' || !data.title.trim() || data.title.trim().length > 300)
      )
        fail('invalid-argument', 'Título inválido.');
      for (const [field, limit] of [
        ['genre', 120],
        ['synopsis', 4000],
      ]) {
        if (data[field] != null && (typeof data[field] !== 'string' || data[field].length > limit))
          fail('invalid-argument', 'Dados do livro inválidos.');
      }
      if (
        !data.coverImageId &&
        !data.coverGenerationId &&
        data.coverUrl != null &&
        (typeof data.coverUrl !== 'string' ||
          data.coverUrl.length > 4000 ||
          !/^https?:\/\//i.test(data.coverUrl))
      )
        fail('invalid-argument', 'URL da capa inválida.');
      return db.runTransaction(async (tx) => {
        const [snapshot, deleted] = await Promise.all([
          tx.get(bookRef),
          tx.get(db.doc(`deletedBooks/${bookId}`)),
        ]);
        const book = snapshot.data();
        const id =
          data.coverImageId === undefined && data.coverGenerationId === undefined && data.bookId
            ? (book?.coverImageId ?? null)
            : (data.coverImageId ?? data.coverGenerationId ?? null);
        const selectedRef = id ? imageRef(db, uid, id) : null;
        const image = selectedRef ? await tx.get(selectedRef) : null;
        const universeId =
          data.universeId === undefined ? (book?.universeId ?? null) : data.universeId;
        if (deleted.exists || book?.deleting)
          fail('failed-precondition', 'Livro removido ou em exclusão.');
        if (book && book.authorId !== uid) fail('permission-denied', 'Livro indisponível.');
        if (data.bookId && !book) fail('not-found', 'Livro indisponível.');
        if (!data.bookId && book) {
          if (book.coverImageId !== id || (book.universeId ?? null) !== universeId)
            fail('failed-precondition', 'Identificador já utilizado.');
          return book;
        }
        const universeLink = await prepareUniverseLink(
          tx,
          db,
          uid,
          bookId,
          book?.universeId,
          universeId,
          now,
        );
        if (selectedRef) active(image.data());
        const previousId = book?.coverImageId;
        const changed = previousId !== id;
        const oldRef = previousId && changed ? imageRef(db, uid, previousId) : null;
        const [oldImage, oldUse, newUse] = await Promise.all([
          oldRef ? tx.get(oldRef) : null,
          oldRef ? tx.get(useRef(uid, previousId, bookId)) : null,
          selectedRef && changed ? tx.get(useRef(uid, id, bookId)) : null,
        ]);
        universeLink.commit();
        if (oldUse?.exists) {
          tx.delete(useRef(uid, previousId, bookId));
          tx.update(oldRef, { useCount: Math.max(0, oldImage.data().useCount - 1) });
        }
        if (selectedRef && changed && !newUse.exists) {
          tx.set(useRef(uid, id, bookId), { bookId });
          tx.update(selectedRef, { useCount: image.data().useCount + 1 });
        }
        const value = {
          ...(book ?? {
            id: bookId,
            authorId: uid,
            status: 'draft',
            wordCount: 0,
            createdAt: now(),
          }),
          title: data.title?.trim() ?? book.title,
          genre: data.genre?.trim() ?? book?.genre ?? '',
          synopsis: data.synopsis?.trim() ?? book?.synopsis ?? '',
          ...(universeId || book?.universeId || data.universeId !== undefined
            ? { universeId }
            : {}),
          coverImageId: id,
          coverUrl: selectedRef
            ? image.data().url
            : data.coverUrl === undefined
              ? (book?.coverUrl ?? null)
              : data.coverUrl,
          updatedAt: now(),
        };
        if (book && (book.universeId ?? null) !== universeId) {
          value.status = 'draft';
          value.publicationPrivacyVersion = (book.publicationPrivacyVersion ?? 0) + 1;
          tx.delete(db.doc(`publicBooks/${bookId}`));
        }
        tx.set(bookRef, value);
        return value;
      });
    },
    async detach(uid, bookId, id) {
      if (!uid || !id) return;
      const ref = imageRef(db, uid, id);
      const usage = useRef(uid, id, bookId);
      await db.runTransaction(async (tx) => {
        const [image, use] = await Promise.all([tx.get(ref), tx.get(usage)]);
        if (!use.exists) return;
        tx.delete(usage);
        if (image.exists) tx.update(ref, { useCount: Math.max(0, image.data().useCount - 1) });
      });
    },
    async importAccepted(uid, id) {
      const generationRef = db.doc(`users/${uid}/bookGenerations/${validateId(id)}`);
      const initial = (await generationRef.get()).data();
      if (!initial || initial.kind !== 'cover' || !['accepted', 'attached'].includes(initial.state))
        return;
      const ref = imageRef(db, uid, id);
      if ((await ref.get()).exists) return;
      if (!(await assets.exists(initial.path))) {
        await generationRef.update({ state: 'expired', expiresAt: Number.MAX_SAFE_INTEGER });
        return;
      }
      await assets.publish(initial.path);
      await db.runTransaction(async (tx) => {
        const [image, generation, book] = await Promise.all([
          tx.get(ref),
          tx.get(generationRef),
          initial.bookId ? tx.get(db.doc(`books/${initial.bookId}`)) : null,
        ]);
        if (image.exists) return;
        const record = generation.data();
        if (!record || !['accepted', 'attached'].includes(record.state)) return;
        const linked =
          book?.exists &&
          book.data().authorId === uid &&
          book.data().coverUrl === record.coverUrl &&
          !book.data().coverImageId;
        tx.create(ref, { ...libraryImage(id, record, now()), useCount: linked ? 1 : 0 });
        tx.update(generationRef, { expiresAt: Number.MAX_SAFE_INTEGER, imageId: id });
        if (linked) {
          tx.update(db.doc(`books/${initial.bookId}`), { coverImageId: id });
          tx.set(useRef(uid, id, initial.bookId), { bookId: initial.bookId });
        }
      });
    },
    async migrate(uid) {
      authorize(uid);
      const marker = db.doc(`users/${uid}/imageLibraryMigration/current`);
      const state = (await marker.get()).data();
      if (state?.complete) return { complete: true };
      let query = db.collection(`users/${uid}/bookGenerations`).orderBy('__name__').limit(25);
      if (state?.cursor) query = query.startAfter(state.cursor);
      const records = await query.get();
      for (const record of records.docs) await service.importAccepted(uid, record.id);
      const complete = records.docs.length < 25;
      await marker.set({ complete, cursor: records.docs.at(-1)?.id ?? state?.cursor ?? null });
      return { complete };
    },
    async list(uid, data) {
      authorize(uid);
      // Migrate in bounded batches; subsequent visits read the completion marker.
      let migrationPending = true;
      for (let batch = 0; batch < 4; batch++) {
        if ((await service.migrate(uid)).complete) {
          migrationPending = false;
          break;
        }
      }
      let query = db
        .collection(`users/${uid}/imageLibrary`)
        .where('state', 'in', ['active', 'deleting'])
        .orderBy('createdAt', 'desc')
        .orderBy('__name__', 'desc')
        .limit(25);
      if (data?.cursor) {
        const cursor = await imageRef(db, uid, data.cursor).get();
        if (!cursor.exists) fail('invalid-argument', 'Página indisponível. Reabra a biblioteca.');
        query = query.startAfter(cursor);
      }
      const page = await query.get();
      return {
        images: page.docs.map((doc) => {
          const { name, url, createdAt, useCount, state } = doc.data();
          return { id: doc.id, name, url, createdAt, useCount, state };
        }),
        migrationPending,
        cursor: page.docs.length === 25 ? page.docs.at(-1).id : null,
      };
    },
  };
  return service;
}
