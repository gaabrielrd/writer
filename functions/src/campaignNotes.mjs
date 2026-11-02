import { validateId } from './generation.mjs';
import {
  workTitle,
  workRevision,
  workLimit,
  workDate,
  workConflict,
} from './workProgressContracts.mjs';
import {
  fail,
  digest,
  notesContext,
  notesEnvelope,
  validateStoredNote,
  readNoteMetadata,
  noteView,
  noteSummary,
  tombstoneHash,
  encodeNotesCursor,
  decodeNotesCursor,
  NOTES_BYTES,
  noteMetadata,
  campaignChanged,
  validNoteContent,
  validNoteTitle,
} from './campaignNotesContracts.mjs';

export function createCampaignNotesService({ db, now = Date.now }) {
  async function mutate(uid, data, method) {
    if (!uid) fail('unauthenticated', 'Entre na sua conta.');
    const noteId = validateId(data?.noteId),
      operationId = validateId(data?.operationId);
    workRevision(data.expectedRevision);
    let title, content;
    if (method === 'save') {
      title = workTitle(data.title);
      if (!validNoteTitle(title)) fail('invalid-argument', 'O título deve ser UTF-8 válido.');
      content = data.content;
      if (!validNoteContent(content))
        fail(
          'invalid-argument',
          'O texto deve ser UTF-8 válido, com até 150.000 caracteres e 512 KiB.',
        );
      if (data.expectedRevision === 0 && noteId !== operationId)
        fail('invalid-argument', 'A criação precisa usar o mesmo identificador da operação.');
    }
    const fingerprint = digest({
      method,
      ...data,
      ...(method === 'save' ? { title, content } : {}),
    });
    return db.runTransaction(async (tx) => {
      const context = await notesContext(tx, db, uid, data, [
          'noteId',
          'operationId',
          'expectedRevision',
          ...(method === 'save' ? ['title', 'content'] : []),
        ]),
        ref = db.doc(context.path + '/notes/' + noteId),
        receiptRef = db.doc(`users/${uid}/campaignNoteOperations/${operationId}`),
        previous = (await tx.get(receiptRef)).data();
      if (previous && previous.fingerprint !== fingerprint)
        fail('invalid-argument', 'Operação utilizada com outros dados.');
      if (previous && previous.campaignToken !== context.campaignToken) campaignChanged();
      if (
        previous &&
        (previous.schemaVersion !== 1 ||
          previous.ownerId !== uid ||
          previous.campaignId !== context.campaignId ||
          previous.noteId !== noteId ||
          previous.method !== method)
      )
        fail('failed-precondition', 'O recibo da nota está inconsistente.');
      const current = await readNoteMetadata(tx, ref, context, noteId);
      if (previous) {
        if (!current || current.revision !== previous.revision) workConflict();
        if (method === 'delete') {
          if (!current.deleted || tombstoneHash(current) !== previous.confirmationHash)
            workConflict();
          return { ...notesEnvelope(context), noteId, revision: current.revision, deleted: true };
        }
        if (current.deleted) workConflict();
        const value = noteView(validateStoredNote((await tx.get(ref)).data(), context, noteId));
        if (digest(value) !== previous.confirmationHash) workConflict();
        return { ...notesEnvelope(context), note: value };
      }
      if (method === 'delete' && !current) fail('not-found', 'Nota indisponível.');
      if ((current?.revision ?? 0) !== data.expectedRevision) workConflict();
      if (current?.deleted) fail('not-found', 'Nota indisponível.');
      const revision = (current?.revision ?? 0) + 1,
        collectionRevision = context.collectionRevision + 1;
      if (!Number.isSafeInteger(revision) || !Number.isSafeInteger(collectionRevision))
        fail('failed-precondition', 'As revisões das notas estão inconsistentes.');
      const timestamp = workDate(now, current?.updatedAt ?? 0),
        value = {
          id: noteId,
          schemaVersion: 1,
          ownerId: uid,
          campaignId: context.campaignId,
          campaignToken: context.campaignToken,
          revision,
          createdAt: current?.createdAt ?? timestamp,
          updatedAt: timestamp,
          deleted: method === 'delete',
          ...(method === 'save' ? { title, content } : {}),
        },
        confirmed = method === 'save' ? noteView(value) : null;
      tx.set(ref, value);
      tx.set(context.controlRef, {
        schemaVersion: 1,
        ownerId: uid,
        campaignId: context.campaignId,
        campaignToken: context.campaignToken,
        revision: collectionRevision,
      });
      tx.create(receiptRef, {
        schemaVersion: 1,
        ownerId: uid,
        campaignId: context.campaignId,
        campaignToken: context.campaignToken,
        noteId,
        method,
        fingerprint,
        revision,
        confirmationHash: method === 'save' ? digest(confirmed) : tombstoneHash(value),
      });
      return method === 'save'
        ? { ...notesEnvelope({ ...context, collectionRevision }), note: confirmed }
        : { ...notesEnvelope({ ...context, collectionRevision }), noteId, revision, deleted: true };
    });
  }
  return {
    async listCampaignNotes(uid, data) {
      if (!uid) fail('unauthenticated', 'Entre na sua conta.');
      const size = workLimit(data?.limit);
      return db.runTransaction(async (tx) => {
        const context = await notesContext(tx, db, uid, data, ['cursor', 'limit'], true),
          cursor = decodeNotesCursor(data.cursor, context);
        let query = db
          .collection(context.path + '/notes')
          .where('deleted', '==', false)
          .orderBy('createdAt', 'desc')
          .orderBy('__name__')
          .limit(size + 1)
          .select(...noteMetadata, 'title');
        if (cursor) query = query.startAfter(cursor.createdAt, cursor.id);
        const docs = (await tx.get(query)).docs,
          items = [];
        for (const snapshot of docs.slice(0, size)) {
          const value = validateStoredNote(snapshot.data(), context, snapshot.id);
          if (!validNoteTitle(value.title))
            fail('failed-precondition', 'O título da nota está inconsistente.');
          items.push(noteSummary(value));
        }
        const last = docs[Math.min(size, docs.length) - 1],
          nextCursor =
            docs.length > size
              ? encodeNotesCursor({
                  version: 1,
                  uid,
                  campaignId: context.campaignId,
                  campaignToken: context.campaignToken,
                  collectionRevision: context.collectionRevision,
                  createdAt: last.data().createdAt,
                  id: last.id,
                })
              : null,
          result = { ...notesEnvelope(context), items, nextCursor };
        if (Buffer.byteLength(JSON.stringify(result)) > NOTES_BYTES)
          fail('failed-precondition', 'A lista ultrapassa o orçamento da leitura.');
        return result;
      });
    },
    async getCampaignNote(uid, data) {
      if (!uid) fail('unauthenticated', 'Entre na sua conta.');
      const noteId = validateId(data?.noteId);
      return db.runTransaction(async (tx) => {
        const context = await notesContext(tx, db, uid, data, ['noteId']),
          ref = db.doc(context.path + '/notes/' + noteId),
          current = await readNoteMetadata(tx, ref, context, noteId);
        return {
          ...notesEnvelope(context),
          note:
            !current || current.deleted
              ? null
              : noteView(validateStoredNote((await tx.get(ref)).data(), context, noteId)),
        };
      });
    },
    saveCampaignNote: (uid, data) => mutate(uid, data, 'save'),
    deleteCampaignNote: (uid, data) => mutate(uid, data, 'delete'),
  };
}
