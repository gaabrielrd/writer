import {
  editorChatClosed,
  editorChatFail,
  editorChatRevision,
  nextEditorChatRevision,
} from './editorChatContracts.mjs';
const at = (timestamp, previous) => {
  const value = Math.max(timestamp, previous + 1);
  if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000)
    editorChatFail('inconsistent');
  return value;
};
export async function readEditorChatCatalog(tx, db, uid) {
  const ref = db.doc('users/' + uid + '/editorChatCatalogs/current'),
    snapshot = await tx.get(ref),
    value = snapshot.data();
  if (!value) {
    if (
      (
        await tx.get(
          db
            .collection('users/' + uid + '/editorChats')
            .orderBy('__name__')
            .limit(1)
            .select(),
        )
      ).docs.length
    )
      editorChatFail('inconsistent');
    return { ref, snapshot, revision: 0, updatedAt: 0 };
  }
  try {
    editorChatClosed(value, ['schemaVersion', 'ownerId', 'revision', 'updatedAt']);
    if (
      value.schemaVersion !== 1 ||
      value.ownerId !== uid ||
      !Number.isSafeInteger(value.updatedAt) ||
      value.updatedAt < 0
    )
      editorChatFail('inconsistent');
    editorChatRevision(value.revision);
    return { ref, snapshot, revision: value.revision, updatedAt: value.updatedAt };
  } catch {
    editorChatFail('inconsistent');
  }
}
export async function prepareEditorChatCatalogUpdate(tx, db, uid, timestamp) {
  const previous = await readEditorChatCatalog(tx, db, uid),
    updatedAt = at(timestamp, previous.updatedAt),
    revision = nextEditorChatRevision(previous.revision);
  return {
    revision,
    updatedAt,
    commit() {
      tx.set(previous.ref, { schemaVersion: 1, ownerId: uid, revision, updatedAt });
    },
  };
}
export async function readEditorChatCatalogFence(tx, db, uid) {
  const value = await readEditorChatCatalog(tx, db, uid);
  const stamp = (field) => {
    const current = value.snapshot[field];
    if (!Number.isSafeInteger(current?.seconds) || !Number.isSafeInteger(current?.nanoseconds))
      editorChatFail('inconsistent');
    return [current.seconds, current.nanoseconds];
  };
  return {
    revision: value.revision,
    updatedAt: value.updatedAt,
    birth: value.snapshot.exists ? stamp('createTime') : null,
    changed: value.snapshot.exists ? stamp('updateTime') : null,
  };
}
