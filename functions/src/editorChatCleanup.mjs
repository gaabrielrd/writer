import {
  editorChatClosed,
  editorChatFail,
  editorChatCleanupToken,
  normalizeEditorChatDTO,
  nextEditorChatRevision,
  editorChatSourceId,
  editorChatRevision,
} from './editorChatContracts.mjs';
import { readWorkMetadata } from './workProgressContracts.mjs';

export const editorChatCleanupRef = (db, uid, id) => db.doc(`users/${uid}/editorChatCleanup/${id}`);
export async function readEditorChatCleanup(tx, db, uid, id, token) {
  const ref = editorChatCleanupRef(db, uid, id),
    record = (await tx.get(ref)).data();
  if (!record || record.ownerId !== uid) editorChatFail('context-unavailable');
  try {
    const conversation = record.summary?.subject?.kind === 'conversation';
    editorChatClosed(record, [
      'schemaVersion',
      'ownerId',
      'birthNonce',
      'summary',
      ...(conversation ? ['cursor'] : []),
    ]);
    if (conversation && record.cursor !== null) editorChatSourceId(record.cursor);
    if (record.schemaVersion !== 1 || record.summary.cleanupId !== id)
      editorChatFail('inconsistent');
    const summary = normalizeEditorChatDTO('cleanup', record.summary);
    const expected = await editorChatCleanupToken({
      ownerId: uid,
      cleanupId: id,
      birthNonce: record.birthNonce,
      subject: summary.subject,
    });
    if (expected !== summary.cleanupToken) editorChatFail('inconsistent');
    if (token !== expected) editorChatFail('identity-changed');
    return { ref, record, summary };
  } catch (error) {
    editorChatFail(
      error.details?.reason === 'identity-changed' ? 'identity-changed' : 'inconsistent',
    );
  }
}

export async function prepareEditorChatConversationDeletion(
  tx,
  db,
  uid,
  conversation,
  id,
  birthNonce,
  now,
) {
  const ref = editorChatCleanupRef(db, uid, id);
  if ((await tx.get(ref)).exists) editorChatFail('operation-conflict');
  const subject = {
    kind: 'conversation',
    id: conversation.summary.conversationId,
    token: conversation.summary.conversationToken,
  };
  const cleanupToken = await editorChatCleanupToken({
    ownerId: uid,
    cleanupId: id,
    birthNonce,
    subject,
  });
  const summary = normalizeEditorChatDTO('cleanup', {
    schemaVersion: 1,
    cleanupId: id,
    cleanupToken,
    revision: 1,
    subject,
    state: 'deleting',
    phase: 'turn-bodies',
    deletedDocuments: 0,
    createdAt: now,
    updatedAt: now,
  });
  return {
    summary,
    commit() {
      tx.create(ref, { schemaVersion: 1, ownerId: uid, birthNonce, summary, cursor: null });
    },
  };
}

export async function advanceEditorChatConversationCleanup(
  tx,
  db,
  uid,
  cleanup,
  conversation,
  now,
) {
  const { summary } = cleanup;
  if (summary.subject.kind !== 'conversation') editorChatFail('invalid-request');
  if (
    summary.subject.id !== conversation.summary.conversationId ||
    summary.subject.token !== conversation.summary.conversationToken ||
    conversation.record.cleanupId !== summary.cleanupId ||
    !['deleting', 'deleted'].includes(conversation.summary.state)
  )
    editorChatFail('inconsistent');
  if (summary.state === 'deleted') {
    if (conversation.summary.state !== 'deleted' || cleanup.record.cursor !== null)
      editorChatFail('inconsistent');
    return { summary, commit() {} };
  }
  if (conversation.summary.state !== 'deleting') editorChatFail('inconsistent');
  const phases = ['turn-bodies', 'turn-questions', 'turns', 'complete'];
  const index = phases.indexOf(summary.phase);
  if (index < 0 || index === 3) editorChatFail('inconsistent');
  const namespaces = ['turnBodies', 'turnQuestions', 'turns'];
  let query = db
    .collection(`${conversation.ref.path}/${namespaces[index]}`)
    .orderBy('__name__')
    .limit(47)
    .select();
  if (cleanup.record.cursor !== null) query = query.startAfter(cleanup.record.cursor);
  const docs = (await tx.get(query)).docs;
  const nextPhase = docs.length < 47 ? phases[index + 1] : summary.phase;
  const cursor = docs.length < 47 ? null : docs.at(-1).id;
  const deletedDocuments = editorChatRevision(summary.deletedDocuments + docs.length);
  const next = normalizeEditorChatDTO('cleanup', {
    ...summary,
    revision: nextEditorChatRevision(summary.revision),
    phase: nextPhase,
    state: nextPhase === 'complete' ? 'deleted' : 'deleting',
    deletedDocuments,
    updatedAt: now,
  });
  return {
    summary: next,
    commit() {
      docs.forEach((doc) => tx.delete(doc.ref));
      tx.set(cleanup.ref, { ...cleanup.record, summary: next, cursor });
      if (next.state === 'deleted')
        tx.set(conversation.ref, {
          ...conversation.record,
          summary: {
            ...conversation.summary,
            state: 'deleted',
            title: '',
            activeTurnId: null,
            revision: nextEditorChatRevision(conversation.summary.revision),
            updatedAt: now,
          },
        });
    },
  };
}

// Returns a write plan, so the caller can atomize its receipt after all reads.
export async function prepareEditorChatContextDeletion(tx, db, uid, context, id, birthNonce, now) {
  const ref = editorChatCleanupRef(db, uid, id);
  if ((await tx.get(ref)).exists) editorChatFail('operation-conflict');
  const subject = {
    kind: 'context',
    id: context.summary.contextId,
    token: context.summary.contextToken,
  };
  const cleanupToken = await editorChatCleanupToken({
    ownerId: uid,
    cleanupId: id,
    birthNonce,
    subject,
  });
  const summary = normalizeEditorChatDTO('cleanup', {
    schemaVersion: 1,
    cleanupId: id,
    cleanupToken,
    revision: 1,
    subject,
    state: 'deleting',
    phase: 'context-body',
    deletedDocuments: 0,
    createdAt: now,
    updatedAt: now,
  });
  const record = { schemaVersion: 1, ownerId: uid, birthNonce, summary };
  return {
    summary,
    commit() {
      tx.create(ref, record);
    },
  };
}

export async function advanceEditorChatCleanup(tx, db, uid, cleanup, context, now) {
  const { summary } = cleanup;
  if (summary.subject.kind !== 'context') editorChatFail('invalid-request');
  if (
    context.summary.contextToken !== summary.subject.token ||
    context.summary.contextId !== summary.subject.id ||
    context.record.cleanupId !== summary.cleanupId
  )
    editorChatFail('inconsistent');
  if (summary.state === 'deleted') return { summary, commit() {} };
  const bodyRef = db.doc(`users/${uid}/editorChatContextBodies/${summary.subject.id}`);
  // Existence only: even revoked derived prose is never read during cleanup.
  const body = await readWorkMetadata(tx, bodyRef, ['schemaVersion']);
  const next = normalizeEditorChatDTO('cleanup', {
    ...summary,
    revision: nextEditorChatRevision(summary.revision),
    state: 'deleted',
    phase: 'complete',
    deletedDocuments: summary.deletedDocuments + Number(body.exists),
    updatedAt: now,
  });
  const terminal = {
    ...context.record,
    summary: {
      ...context.summary,
      phase: 'deleted',
      revision: nextEditorChatRevision(context.summary.revision),
      updatedAt: now,
    },
    source: null,
    proofCoverage: null,
    closureManifest: null,
    closureHash: null,
    cursor: null,
  };
  return {
    summary: next,
    commit() {
      if (body.exists) tx.delete(bodyRef);
      tx.set(context.ref, terminal);
      tx.set(cleanup.ref, { ...cleanup.record, summary: next });
    },
  };
}
