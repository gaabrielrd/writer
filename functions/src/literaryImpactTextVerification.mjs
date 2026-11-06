import {
  workProject,
  workId,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { openBookChapterText } from './bookChapterText.mjs';
import {
  literaryProseOriginToken,
  literaryAutocompleteChapterIdentity,
} from './literarySourceOrigins.mjs';
const validHash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function changed(row) {
  const value = row.updateTime;
  if (
    !Number.isSafeInteger(value?.seconds) ||
    !Number.isSafeInteger(value?.nanoseconds) ||
    value.nanoseconds < 0 ||
    value.nanoseconds >= 1e9
  )
    workFail('failed-precondition', 'A versão nativa do texto está indisponível.');
  return { seconds: value.seconds, nanoseconds: value.nanoseconds };
}
// Internal fact reader. A body token and a native origin are distinct proofs.
// Metadata/hash checks do not certify a literary reading or editorial approval.
export async function verifyLiteraryImpactTextSource(tx, c, link) {
  const { from, capture } = link;
  if (!capture) return null;
  if (
    capture.scheme === 'history-source' &&
    (from.kind !== 'scene' || capture.identityToken !== null)
  )
    return null;
  if (
    capture.scheme === 'content-hash' &&
    (from.kind !== 'chapter' || capture.originToken !== null || capture.revision !== null)
  )
    return null;
  if (!['history-source', 'content-hash', 'prose-assembly'].includes(capture.scheme)) return null;
  if (c.target.kind !== 'book' || from.scopeKind !== 'book' || from.scopeId !== c.target.id)
    workFail('permission-denied', 'A origem textual pertence a outro livro.');
  await workProject(tx, c);
  const book = await readWorkMetadata(tx, c.ref, []);
  if (capture.scheme === 'prose-assembly') {
    if (
      from.kind !== 'chapter' ||
      capture.identityToken !== null ||
      capture.revision !== null ||
      capture.originToken === null ||
      capture.versionToken === null ||
      !['literaryProseRequests', 'literaryApplications'].includes(link.record.collection)
    )
      return null;
    let header;
    if (link.record.collection === 'literaryProseRequests')
      header = (
        await readWorkMetadata(
          tx,
          c.db.doc(c.path + '/literaryProseRequests/' + workId(link.record.id)),
          ['chapterId', 'sceneId', 'originToken', 'assemblyToken'],
        )
      ).data();
    else {
      const retained = (
        await readWorkMetadata(
          tx,
          c.db.doc(c.path + '/literaryApplications/' + workId(link.record.id)),
          [
            'ownerId',
            'target',
            'kind',
            'destination',
            'dependencies.chapterId',
            'dependencies.originToken',
            'dependencies.assemblyToken',
          ],
        )
      ).data();
      if (
        retained?.ownerId !== c.uid ||
        retained.target?.kind !== 'book' ||
        retained.target.id !== c.target.id ||
        retained.kind !== 'prose' ||
        retained.destination?.kind !== 'scene'
      )
        return { sourceAvailable: false };
      header = {
        chapterId: retained.dependencies?.chapterId,
        sceneId: retained.destination.id,
        originToken: retained.dependencies?.originToken,
        assemblyToken: retained.dependencies?.assemblyToken,
      };
    }
    if (
      !header ||
      header.chapterId !== from.id ||
      header.originToken !== capture.originToken ||
      header.assemblyToken !== capture.versionToken
    )
      return { sourceAvailable: false };
    const scene = await readWorkMetadata(
      tx,
      c.db.doc(c.path + '/scenes/' + workId(header.sceneId)),
      ['ownerId', 'parentId', 'archived', 'deleting'],
    );
    const sceneValue = scene.data(),
      chapter = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + from.id), [
        'ownerId',
        'bookId',
        'contentMode',
        'deleting',
        'assemblyRevision',
      ]);
    const value = chapter.data();
    if (
      !sceneValue ||
      sceneValue.ownerId !== c.uid ||
      sceneValue.parentId !== from.id ||
      sceneValue.archived ||
      sceneValue.deleting ||
      !value ||
      value.deleting ||
      value.contentMode !== 'scenes' ||
      (value.bookId != null && value.bookId !== c.target.id) ||
      (value.ownerId != null && value.ownerId !== c.uid)
    )
      return { sourceAvailable: false };
    if (!Number.isSafeInteger(value.assemblyRevision ?? 0) || (value.assemblyRevision ?? 0) < 0)
      workFail('failed-precondition', 'Revisão da composição inconsistente.');
    const origin = literaryProseOriginToken(c, {
      book,
      chapterId: from.id,
      chapter,
      sceneId: header.sceneId,
      scene,
    });
    const grant = origin === capture.originToken;
    const timestamp = changed(chapter);
    const version = digest({
      assemblyRevision: value.assemblyRevision ?? 0,
      updated: [timestamp.seconds, timestamp.nanoseconds],
    });
    return {
      sourceAvailable: true,
      capturedGrantMatches: grant,
      identityMatches: grant ? true : null,
      versionMatches: grant ? version === capture.versionToken : null,
      manuscriptRead: false,
      contentVerification: 'prose-assembly',
    };
  }
  if (capture.scheme === 'history-source') {
    const row = await readWorkMetadata(tx, c.db.doc(c.path + '/scenes/' + workId(from.id)), [
      'ownerId',
      'bookId',
      'parentId',
      'archived',
      'deleting',
      'bodyHash',
      'revision',
    ]);
    const value = row.data();
    if (
      !value ||
      value.ownerId !== c.uid ||
      (value.bookId != null && value.bookId !== c.target.id) ||
      value.archived ||
      value.deleting ||
      !value.parentId
    )
      return { sourceAvailable: false };
    const chapterId = workId(value.parentId),
      parent = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + chapterId), [
        'bookId',
        'ownerId',
        'deleting',
        'contentMode',
      ]);
    const chapter = parent.data();
    if (
      !chapter ||
      chapter.deleting ||
      chapter.contentMode !== 'scenes' ||
      (chapter.bookId != null && chapter.bookId !== c.target.id) ||
      (chapter.ownerId != null && chapter.ownerId !== c.uid)
    )
      return { sourceAvailable: false };
    const origin = literaryProseOriginToken(c, {
      book,
      chapterId,
      chapter: parent,
      sceneId: from.id,
      scene: row,
    });
    const grant = capture.originToken === null ? null : capture.originToken === origin;
    if (grant === false)
      return {
        sourceAvailable: true,
        identityMatches: null,
        capturedGrantMatches: false,
        versionMatches: null,
      };
    const body = await readWorkMetadata(tx, c.db.doc(row.ref.path + '/body/current'), ['hash']);
    if (
      !body.exists ||
      !validHash(body.data().hash) ||
      body.data().hash !== value.bodyHash ||
      !Number.isSafeInteger(value.revision) ||
      value.revision < 0
    )
      workFail('failed-precondition', 'O cabeçalho do texto da cena está inconsistente.');
    const token = digest({
      version: 1,
      uid: c.uid,
      target: c.target,
      resource: { kind: 'scene', id: from.id },
      metadata: changed(row),
      contentHash: body.data().hash,
      body: changed(body),
      revision: value.revision,
    });
    const matches =
      capture.versionToken === null
        ? null
        : capture.versionToken === token &&
          (capture.revision === null || capture.revision === value.revision);
    return {
      sourceAvailable: true,
      capturedGrantMatches: grant,
      identityMatches: grant === true || (grant === null && matches === true) ? true : null,
      versionMatches: matches,
      contentVerification: 'native-scene-header',
      manuscriptRead: false,
      byteIntegrityChecked: false,
    };
  }
  const row = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + workId(from.id)), [
    'ownerId',
    'bookId',
    'contentMode',
    'deleting',
  ]);
  const value = row.data();
  if (
    !value ||
    value.deleting ||
    value.contentMode === 'scenes' ||
    (value.bookId != null && value.bookId !== c.target.id) ||
    (value.ownerId != null && value.ownerId !== c.uid)
  )
    return { sourceAvailable: false };
  const identity = literaryAutocompleteChapterIdentity(c, {
    book,
    chapterId: from.id,
    chapter: row,
  });
  const identityMatches =
    capture.identityToken === null ? null : capture.identityToken === identity;
  if (identityMatches !== true || capture.versionToken === null)
    return { sourceAvailable: true, identityMatches, versionMatches: null };
  // Native incarnation is checked BEFORE loading an inline manuscript. The
  // canonical opener validates actual inline/descriptor shape and body binding.
  const full = await tx.get(row.ref);
  const opened = await openBookChapterText(tx, c.db, {
    uid: c.uid,
    bookId: c.target.id,
    chapterId: from.id,
    chapter: full.data(),
  });
  if (Object.hasOwn(opened, 'inline'))
    return {
      sourceAvailable: true,
      identityMatches,
      versionMatches: digest(opened.inline) === capture.versionToken,
      manuscriptRead: true,
      contentVerification: 'inline-hash',
      byteIntegrityChecked: true,
      editorialReview: false,
    };
  return {
    sourceAvailable: true,
    identityMatches,
    versionMatches: opened.manifest.contentHash === capture.versionToken,
    manuscriptRead: false,
    contentVerification: 'native-chapter-manifest',
    byteIntegrityChecked: false,
    editorialReview: false,
  };
}
