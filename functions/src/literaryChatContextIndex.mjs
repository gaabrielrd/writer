import { workId, workFail, digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  verifyEditorChatClosure,
  editorChatHashToken,
  canonicalEditorChatJSON,
} from './editorChatContracts.mjs';
import { captureLiteraryPersonaDependencies } from './literaryPersonaDependencies.mjs';
import { literaryWritingScope } from './literaryWritingContext.mjs';
import { captureLiteraryChatLoreDependencies } from './literaryChatLoreDependencies.mjs';
import {
  prepareLiteraryDependencyWrite,
  prepareLiteraryDependencyCleanup,
} from './literaryDependencyClock.mjs';

export const literaryChatContextIndexId = (uid, contextId) =>
  digest({
    domain: 'literary-native-chat-context-index-v1',
    uid: workId(uid),
    contextId: workId(contextId),
  });
const same = (left, right) => canonicalEditorChatJSON(left) === canonicalEditorChatJSON(right);
const indexRef = (db, bookId, uid, contextId) =>
  db.doc(
    'books/' +
      workId(bookId) +
      '/literaryChatContexts/' +
      literaryChatContextIndexId(uid, contextId),
  );
const noop = () => ({ commit() {} });
// Internal transaction plans, never callable DTOs or authorization grants. A ready
// context is an input capture, not proof of a generated/accepted assistant answer.
export async function prepareLiteraryChatContextIndex(
  tx,
  db,
  uid,
  { contextId, contextToken, source, closure, persona, lore },
) {
  if (source.target.kind !== 'book') return noop();
  const c = literaryWritingScope(db, uid, source.target),
    resource = source.scope.resource;
  if (resource.kind !== 'scene')
    workFail('failed-precondition', 'Origem nativa de chat não suportada.');
  const normalized = await verifyEditorChatClosure(closure, {
    ownerId: uid,
    target: c.target,
    resource,
  });
  const target = normalized.leaves.filter((leaf) => leaf.kind === 'target');
  if (
    target.length !== 1 ||
    !same(target[0].resource, resource) ||
    target[0].projectToken !== source.source.projectToken ||
    target[0].resourceToken !== source.source.resourceToken
  )
    workFail('failed-precondition', 'O fechamento não corresponde à origem do chat.');
  const record = {
    version: 1,
    ownerId: workId(uid),
    target: c.target,
    resource: { kind: 'scene', id: workId(resource.id) },
    contextId: workId(contextId),
    contextToken: editorChatHashToken(contextToken),
    sourceToken: editorChatHashToken(source.source.sourceToken),
    closureHash: normalized.closureHash,
    closureManifest: { version: 1, leaves: normalized.leaves },
    loreDependencies: captureLiteraryChatLoreDependencies(lore, normalized),
    personaDependencies: captureLiteraryPersonaDependencies(c, resource, persona),
  };
  const ref = indexRef(db, c.target.id, uid, contextId);
  const existing = await readWorkMetadata(tx, ref, [
    'version',
    'ownerId',
    'target',
    'contextId',
    'contextToken',
    'sourceToken',
    'closureHash',
    'personaDependencies',
    'loreDependencies',
  ]);
  if (existing.exists) {
    const value = existing.data();
    if (
      value.version !== 1 ||
      value.ownerId !== uid ||
      value.contextId !== contextId ||
      !same(value.target, c.target)
    )
      workFail('failed-precondition', 'O índice privado de contexto está inconsistente.');
    if (
      value.contextToken === record.contextToken &&
      value.sourceToken === record.sourceToken &&
      value.closureHash === record.closureHash &&
      same(value.personaDependencies, record.personaDependencies) &&
      same(value.loreDependencies, record.loreDependencies)
    )
      return noop();
  }
  const clock = await prepareLiteraryDependencyWrite(tx, c);
  return {
    commit() {
      tx.set(ref, record);
      clock.commit();
    },
  };
}
// Deletion must work even after a book grant is revoked. It reads metadata only;
// a late deletion cannot erase a new incarnation with the same context ID.
export async function prepareLiteraryChatContextIndexDeletion(tx, db, uid, summary) {
  if (summary.target.kind !== 'book') return noop();
  const ref = indexRef(db, summary.target.id, uid, summary.contextId);
  const row = await readWorkMetadata(tx, ref, [
    'version',
    'ownerId',
    'target',
    'contextId',
    'contextToken',
  ]);
  if (!row.exists) return noop();
  const value = row.data();
  if (
    value.version !== 1 ||
    value.ownerId !== uid ||
    value.contextId !== summary.contextId ||
    !same(value.target, summary.target)
  )
    workFail('failed-precondition', 'O índice privado de contexto está inconsistente.');
  if (value.contextToken !== summary.contextToken) return noop();
  const root = await readWorkMetadata(tx, db.doc('books/' + workId(summary.target.id)), [
    'authorId',
  ]);
  const clock =
    root.data()?.authorId === uid
      ? await prepareLiteraryDependencyCleanup(tx, db, 'books/' + workId(summary.target.id))
      : noop();
  return {
    commit() {
      tx.delete(ref);
      clock.commit();
    },
  };
}
