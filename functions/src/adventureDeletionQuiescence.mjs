import { workFail, workDate } from './workProgressContracts.mjs';
import {
  editorChatProjectToken,
  editorChatControlToken,
  normalizeEditorChatDTO,
  nextEditorChatRevision,
} from './editorChatContracts.mjs';
import {
  readEditorChatConversation,
  prepareEditorChatCatalogUpdate,
} from './editorChatConversations.mjs';
import { readEditorChatTurnMetadata } from './editorChatHistoryRead.mjs';
import {
  adventureDeletionSameBirth,
  adventureDeletionInconsistent as invalid,
} from './adventureDeletionContracts.mjs';

const contextFields = [
  'schemaVersion',
  'ownerId',
  'contextId',
  'birthNonce',
  'summary',
  'cleanupId',
];
async function projectToken(p) {
  return editorChatProjectToken({
    ownerId: p.ownerId,
    target: { kind: 'adventure', id: p.adventureId },
    createdAt: p.sourceBirth,
  });
}
async function rows(tx, db, p, collection, fields, size) {
  let q = db
    .collection('users/' + p.ownerId + '/' + collection)
    .where('summary.target.kind', '==', 'adventure')
    .where('summary.target.id', '==', p.adventureId)
    .where('summary.projectToken', '==', await projectToken(p))
    .orderBy('__name__')
    .select(...fields)
    .limit(size);
  if (p.cursor !== null) q = q.startAfter(p.cursor);
  return (await tx.get(q)).docs;
}
function nextPage(p, docs) {
  return docs.length ? { ...p, cursor: docs.at(-1).id } : { ...p, part: p.part + 1, cursor: null };
}
function owned(summary, p, expectedToken) {
  if (
    summary.target.kind !== 'adventure' ||
    summary.target.id !== p.adventureId ||
    summary.projectToken !== expectedToken
  )
    invalid();
}
export async function quiesceAdventureContexts(tx, db, p, now) {
  const docs = await rows(tx, db, p, 'editorChatContexts', contextFields, 10),
    expected = await projectToken(p);
  let removed = 0;
  const changes = [];
  for (const snap of docs) {
    const v = snap.data(),
      s = normalizeEditorChatDTO('context', v?.summary);
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== p.ownerId ||
      v.contextId !== snap.id ||
      s.contextId !== snap.id ||
      s.ownerId !== p.ownerId ||
      !Object.hasOwn(v, 'cleanupId') ||
      (v.cleanupId !== null && typeof v.cleanupId !== 'string')
    )
      invalid();
    owned(s, p, expected);
    const token = await editorChatControlToken('context', {
      ownerId: p.ownerId,
      contextId: s.contextId,
      birthNonce: v.birthNonce,
      projectToken: s.projectToken,
      resourceToken: s.resourceToken,
    });
    if (token !== s.contextToken) invalid();
    const bodyRef = db.doc('users/' + p.ownerId + '/editorChatContextBodies/' + snap.id);
    const body = (
        await tx.getAll(bodyRef, {
          fieldMask: ['schemaVersion', 'ownerId', 'contextId', 'contextToken'],
        })
      )[0],
      b = body.data();
    if (
      body.exists &&
      (!b ||
        b.schemaVersion !== 1 ||
        b.ownerId !== p.ownerId ||
        b.contextId !== snap.id ||
        b.contextToken !== s.contextToken ||
        !adventureDeletionSameBirth(snap, body))
    )
      invalid();
    if (s.phase === 'deleted') {
      if (body.exists) invalid();
      continue;
    }
    const summary = normalizeEditorChatDTO('context', {
      ...s,
      phase: 'deleted',
      revision: nextEditorChatRevision(s.revision),
      updatedAt: workDate(now, s.updatedAt),
    });
    changes.push({
      ref: snap.ref,
      bodyRef: body.exists ? bodyRef : null,
      value: {
        schemaVersion: 1,
        ownerId: p.ownerId,
        contextId: snap.id,
        birthNonce: v.birthNonce,
        summary,
        source: null,
        proofCoverage: null,
        closureManifest: null,
        closureHash: null,
        cursor: null,
        cleanupId: v.cleanupId,
      },
    });
    if (body.exists) removed++;
  }
  // Firestore requires every metadata read in the bounded page before any write.
  for (const change of changes) {
    tx.set(change.ref, change.value);
    if (change.bodyRef) tx.delete(change.bodyRef);
  }
  const value = nextPage(p, docs);
  return { ...value, deletedDocuments: p.deletedDocuments + removed };
}
export async function quiesceAdventureConversations(tx, db, p, now) {
  const docs = await rows(tx, db, p, 'editorChats', ['schemaVersion', 'ownerId'], 1),
    expected = await projectToken(p);
  for (const snap of docs) {
    if (snap.data()?.ownerId !== p.ownerId) invalid();
    const conversation = await readEditorChatConversation(tx, db, p.ownerId, snap.id);
    owned(conversation.summary, p, expected);
    if (conversation.summary.state !== 'open' || conversation.summary.activeTurnId === null)
      continue;
    const turn = await readEditorChatTurnMetadata(
      tx,
      db,
      p.ownerId,
      conversation,
      conversation.summary.activeTurnId,
    );
    const update = await prepareEditorChatCatalogUpdate(
      tx,
      db,
      p.ownerId,
      workDate(now, Math.max(conversation.summary.updatedAt, turn.summary.updatedAt)),
    );
    if (['running', 'awaiting-byok'].includes(turn.summary.state)) {
      const summary = normalizeEditorChatDTO('turn', {
        ...turn.summary,
        state: 'stopped',
        failureReason: 'turn-stopped',
        revision: nextEditorChatRevision(turn.summary.revision),
        updatedAt: update.updatedAt,
      });
      tx.set(turn.ref, { ...turn.record, summary });
    }
    tx.set(conversation.ref, {
      ...conversation.record,
      summary: {
        ...conversation.summary,
        activeTurnId: null,
        revision: nextEditorChatRevision(conversation.summary.revision),
        updatedAt: update.updatedAt,
      },
    });
    update.commit();
  }
  return nextPage(p, docs);
}
export async function advanceAdventureQuiescence(tx, db, p, now) {
  if (p.part === 0) return quiesceAdventureContexts(tx, db, p, now);
  if (p.part === 1) return quiesceAdventureConversations(tx, db, p, now);
  workFail(
    'failed-precondition',
    'O fechamento das fontes da aventura ainda está em implementação.',
    'adventure-deletion-step-unavailable',
  );
}
