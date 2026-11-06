import {
  workProject,
  workId,
  workClosed,
  workFail,
  digest,
  readWorkMetadata,
} from './workProgressContracts.mjs';
import { readEditorChatPersona } from './editorChatContextRead.mjs';
import { captureLiteraryPersonaDependencies } from './literaryPersonaDependencies.mjs';

async function personaSource(tx, c, resource, selection) {
  workClosed(resource, ['kind', 'id']);
  if (!['chapter', 'scene'].includes(resource.kind))
    workFail('invalid-argument', 'Unidade de persona inválida.');
  const root = await workProject(tx, c),
    snapshot = await tx.get(c.ref);
  let scene,
    chapter = null;
  if (resource.kind === 'scene') {
    const row = await readWorkMetadata(tx, c.db.doc(c.path + '/scenes/' + workId(resource.id)), [
      'ownerId',
      'parentId',
      'archived',
      'deleting',
    ]);
    const value = row.data();
    if (!value || value.ownerId !== c.uid || value.archived || value.deleting)
      workFail('permission-denied', 'A origem da persona da cena não está disponível.');
    scene = { snapshot: row, record: value, parent: null };
    if (value.parentId !== null) {
      const chapterId = workId(value.parentId);
      const parent = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + chapterId), [
        'bookId',
        'deleting',
        'personaComplement',
        'personaRevision',
      ]);
      const record = parent.data();
      if (!record || record.deleting || (record.bookId && record.bookId !== c.target.id))
        workFail('permission-denied', 'A origem da persona do capítulo não está disponível.');
      chapter = { id: chapterId, snapshot: parent, record };
      scene.parent = chapter;
    }
  } else {
    const chapterId = workId(resource.id),
      row = await readWorkMetadata(tx, c.db.doc(c.path + '/chapters/' + chapterId), [
        'bookId',
        'deleting',
        'personaComplement',
        'personaRevision',
      ]);
    const value = row.data();
    if (!value || value.deleting || (value.bookId && value.bookId !== c.target.id))
      workFail('permission-denied', 'A origem da persona do capítulo não está disponível.');
    chapter = { id: chapterId, snapshot: row, record: value };
    // The native compiler only needs the book and chapter binding here.
    scene = { parent: chapter };
  }
  const currentSelection = {
    baseId: root.personaId ?? null,
    complement: chapter?.record.personaComplement ?? null,
  };
  if (selection) {
    // Historical profile IDs are reauthorized through their current native library grants.
    // Binding births still come from the real book/chapter snapshots.
    workClosed(selection, ['baseId', 'complement']);
    if (chapter) chapter.record = { ...chapter.record, personaComplement: selection.complement };
    if (scene?.parent) scene.parent = chapter;
  }
  return {
    source: {
      uid: c.uid,
      target: c.target,
      root: selection ? { ...root, personaId: selection.baseId } : root,
      snapshot,
      scene,
    },
    selection: selection ?? currentSelection,
  };
}
export async function readLiteraryPersona(tx, c, resource, { full = false, selection } = {}) {
  const native = await personaSource(tx, c, resource, selection);
  let value;
  try {
    value = await readEditorChatPersona(tx, c.db, native.source, { full });
  } catch (cause) {
    if (
      cause.details?.reason === 'provenance-revoked' ||
      cause.code === 'permission-denied' ||
      cause.code === 'not-found'
    )
      workFail('permission-denied', 'Uma persona usada nesta operação foi retirada ou recriada.');
    workFail('failed-precondition', 'A persona nativa precisa ser conferida antes de usar IA.');
  }
  return {
    metadata: {
      schemaVersion: 1,
      identityToken: digest(value.leaves),
      versionToken: digest(value.proof),
      selection: native.selection,
    },
    instruction: full ? value.snapshot.instruction : null,
    dependencies: captureLiteraryPersonaDependencies(c, resource, value),
  };
}
export async function authorizeLiteraryPersona(tx, c, resource, metadata) {
  workClosed(metadata, ['schemaVersion', 'identityToken', 'versionToken', 'selection']);
  if (metadata.schemaVersion !== 1) workFail('permission-denied', 'Origem da persona inválida.');
  let current;
  try {
    current = await readLiteraryPersona(tx, c, resource, { selection: metadata.selection });
  } catch (cause) {
    if (
      ['permission-denied', 'not-found', 'failed-precondition', 'resource-exhausted'].includes(
        cause.code,
      )
    )
      workFail('permission-denied', 'A origem histórica da persona não pôde ser autorizada.');
    throw cause;
  }
  if (current.metadata.identityToken !== metadata.identityToken)
    workFail('permission-denied', 'Uma origem da persona foi retirada ou recriada.');
}
export async function literaryPersonaIsCurrent(tx, c, resource, metadata) {
  await authorizeLiteraryPersona(tx, c, resource, metadata);
  try {
    const current = await readLiteraryPersona(tx, c, resource);
    return current.metadata.versionToken === metadata.versionToken;
  } catch (cause) {
    if (
      ['permission-denied', 'not-found', 'failed-precondition', 'resource-exhausted'].includes(
        cause.code,
      )
    )
      return false;
    throw cause;
  }
}
