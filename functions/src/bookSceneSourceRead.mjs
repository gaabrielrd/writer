import { openBookChapterText, readBookChapterTextPart } from './bookChapterText.mjs';
import { readBookSceneSource } from './bookSceneSourceText.mjs';
import { bookBackupIdentity } from './bookBackupContext.mjs';
import { digest, conflict, sceneFail, sceneId, sceneRevision } from './sceneContracts.mjs';

/** Own project must already be authorized. External originals stay out of list responses. */
export async function bookSceneSourceView(tx, db, { uid, bookId, bookSnapshot, snapshot }) {
  const source = snapshot.data();
  if (!source?.original || typeof source.original !== 'object' || Array.isArray(source.original))
    sceneFail('failed-precondition', 'Fonte congelada inconsistente.');
  const { content = '', contentStorage, ...original } = source.original;
  if (contentStorage == null) {
    await readBookSceneSource(tx, db, { uid, bookId, sourceId: snapshot.id, source });
    return { id: snapshot.id, content, hash: source.hash, original };
  }
  const opened = await openBookChapterText(tx, db, {
    uid,
    bookId,
    chapterId: snapshot.id,
    chapter: source.original,
  });
  if ('inline' in opened || opened.manifest.contentHash !== source.hash)
    sceneFail('failed-precondition', 'Fonte congelada inconsistente.');
  const sourceToken = digest({
    version: 1,
    kind: 'scene-source',
    uid,
    bookId,
    sourceId: snapshot.id,
    bookCreated: bookBackupIdentity(bookSnapshot)?.created,
    source: bookBackupIdentity(snapshot),
    bodyCreated: bookBackupIdentity(opened.body)?.created,
    manifest: opened.manifest,
  });
  if (
    !bookBackupIdentity(bookSnapshot) ||
    !bookBackupIdentity(snapshot) ||
    !bookBackupIdentity(opened.body)
  )
    sceneFail('failed-precondition', 'Origem da fonte indisponível.');
  return {
    id: snapshot.id,
    content: null,
    hash: source.hash,
    original,
    contentStorage: opened.manifest,
    sourceToken,
  };
}
export function addBookSceneSourceRead(api, { db, scope, project }) {
  api.readSceneSourceText = async (uid, data) => {
    const context = scope(uid, data, [
        'sourceId',
        'expectedProjectRevision',
        'sourceToken',
        'index',
      ]),
      sourceId = sceneId(data.sourceId),
      expected = sceneRevision(data.expectedProjectRevision);
    if (
      context.target.kind !== 'book' ||
      typeof data.sourceToken !== 'string' ||
      !/^[a-f0-9]{64}$/.test(data.sourceToken) ||
      !Number.isSafeInteger(data.index) ||
      data.index < 0 ||
      data.index >= 128
    )
      sceneFail('invalid-argument', 'Parte de fonte inválida.');
    return db.runTransaction(async (tx) => {
      const root = await project(context, tx);
      if ((root.sceneRevision ?? 0) !== expected) conflict();
      const snapshot = await tx.get(db.doc(context.path + '/sceneSources/' + sourceId));
      if (!snapshot.exists) sceneFail('not-found', 'Fonte indisponível.');
      const input = { uid, bookId: context.target.id, bookSnapshot: root.snapshot, snapshot },
        view = await bookSceneSourceView(tx, db, input);
      if (view.content !== null || view.sourceToken !== data.sourceToken) conflict();
      const opened = await openBookChapterText(tx, db, {
        uid,
        bookId: context.target.id,
        chapterId: sourceId,
        chapter: snapshot.data().original,
      });
      const bytes = await readBookChapterTextPart(tx, db, opened, data.index);
      return {
        sourceId,
        projectRevision: expected,
        sourceToken: view.sourceToken,
        manifest: opened.manifest,
        index: data.index,
        chunkBase64: Buffer.from(bytes).toString('base64'),
      };
    });
  };
}
