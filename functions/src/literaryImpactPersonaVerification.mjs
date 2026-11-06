import {
  workProject,
  workId,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import {
  readEditorChatPersonaProfileMetadata,
  editorChatBindingIdentity,
} from './editorChatContextRead.mjs';
import {
  normalizeEditorChatPersonaId,
  normalizeEditorChatPersonaComplement,
} from './editorChatContracts.mjs';
import { readLiteraryImpactPersonaBindingId } from './literaryImpactProtocol.mjs';
export async function verifyLiteraryImpactPersonaSource(tx, c, link) {
  const { from, capture } = link;
  if (
    !capture ||
    !['persona-profile', 'persona-binding'].includes(capture.scheme) ||
    capture.originToken !== null ||
    capture.identityToken === null ||
    capture.versionToken === null
  )
    return null;
  await workProject(tx, c);
  if (capture.scheme === 'persona-profile') {
    if (from.kind !== 'persona' || from.scopeKind !== 'user' || from.scopeId !== c.uid)
      workFail('permission-denied', 'A persona pertence a outro usuário.');
    let current;
    try {
      current = await readEditorChatPersonaProfileMetadata(tx, c.db, c.uid, from.id);
    } catch (cause) {
      if (cause.code === 'invalid-argument')
        workFail('failed-precondition', 'A origem de persona registrada é inválida.');
      throw cause;
    }
    const profile = { ...current.metadata, capturedStamp: current.capturedStamp };
    return {
      sourceAvailable: true,
      identityMatches: capture.identityToken === profile.identityToken,
      versionMatches:
        capture.versionToken === digest(profile) &&
        (capture.revision === null || capture.revision === profile.revision),
      personaKind: profile.kind,
      manuscriptRead: false,
      editorialReview: false,
    };
  }
  if (
    from.kind !== 'personaBinding' ||
    from.scopeKind !== 'book' ||
    from.scopeId !== c.target.id ||
    c.target.kind !== 'book'
  )
    workFail('permission-denied', 'O vínculo de persona pertence a outro livro.');
  const scope = readLiteraryImpactPersonaBindingId(from.id);
  let snapshot, value, personaRevision;
  if (scope.scopeKind === 'book') {
    if (scope.scopeId !== c.target.id) workFail('permission-denied', 'Vínculo de outro livro.');
    snapshot = await readWorkMetadata(tx, c.ref, [
      'authorId',
      'deleting',
      'personaId',
      'personaRevision',
    ]);
    const root = snapshot.data();
    if (!root || root.authorId !== c.uid || root.deleting) return { sourceAvailable: false };
    value = root.personaId ?? null;
    personaRevision = root.personaRevision ?? 0;
    try {
      if (value !== null) value = normalizeEditorChatPersonaId(value);
    } catch {
      workFail('failed-precondition', 'Vínculo de persona do livro inconsistente.');
    }
  } else {
    snapshot = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + workId(scope.scopeId)), [
      'bookId',
      'ownerId',
      'deleting',
      'personaComplement',
      'personaRevision',
    ]);
    const chapter = snapshot.data();
    if (
      !chapter ||
      chapter.deleting ||
      (chapter.bookId != null && chapter.bookId !== c.target.id) ||
      (chapter.ownerId != null && chapter.ownerId !== c.uid)
    )
      return { sourceAvailable: false };
    value = chapter.personaComplement ?? null;
    personaRevision = chapter.personaRevision ?? 0;
    try {
      if (value !== null) value = normalizeEditorChatPersonaComplement(value);
    } catch {
      workFail('failed-precondition', 'Vínculo de persona do capítulo inconsistente.');
    }
  }
  if (!Number.isSafeInteger(personaRevision) || personaRevision < 0)
    workFail('failed-precondition', 'Revisão do vínculo de persona inválida.');
  const identityToken = await editorChatBindingIdentity(
    c.uid,
    c.target,
    scope.scopeKind,
    scope.scopeId,
    snapshot,
  );
  const binding = {
    scopeKind: scope.scopeKind,
    scopeId: scope.scopeId,
    identityToken,
    value,
    personaRevision,
  };
  return {
    sourceAvailable: true,
    identityMatches: identityToken === capture.identityToken,
    versionMatches:
      digest(binding) === capture.versionToken &&
      (capture.revision === null || capture.revision === personaRevision),
    manuscriptRead: false,
    editorialReview: false,
  };
}
