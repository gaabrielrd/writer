import { readWorkMetadata, workDate } from './workProgressContracts.mjs';
import { readEditorChatConversation } from './editorChatConversations.mjs';
import { nextEditorChatRevision, normalizeEditorChatDTO } from './editorChatContracts.mjs';
import {
  chatScopeFields,
  contextHeader,
  chatScope,
  ownChatScope,
  adventureChatScope,
  assertChatBeforeDeletion,
  assertChatCreatedBefore,
  orphanContextScope,
  orphanConversationScope,
  assertOrphanTurnBirth,
} from './adventureDeletionChatRead.mjs';
import {
  adventureDeletionInconsistent as invalid,
  adventureDeletionSameBirth as sameBirth,
} from './adventureDeletionContracts.mjs';
const id = (v) => typeof v === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(v);
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const move = (p, part) => ({ ...p, part, cursor: null });
function pageEnd(p, docs) {
  return docs.length ? { ...p, cursor: docs.at(-1).id } : move(p, p.part + 1);
}
async function contextBodies(tx, db, p, now) {
  let q = db
    .collection('users/' + p.ownerId + '/editorChatContextBodies')
    .orderBy('__name__')
    .select(
      'schemaVersion',
      'ownerId',
      'contextId',
      'contextToken',
      ...chatScopeFields('frozen.source'),
    )
    .limit(10);
  if (p.cursor !== null) q = q.startAfter(p.cursor);
  const rows = (await tx.get(q)).docs,
    scope = await adventureChatScope(tx, db, p),
    changes = [];
  for (const snapshot of rows) {
    const v = snapshot.data();
    if (
      !id(snapshot.id) ||
      v.schemaVersion !== 1 ||
      v.ownerId !== p.ownerId ||
      v.contextId !== snapshot.id ||
      !hash(v.contextToken)
    )
      invalid();
    const header = await contextHeader(tx, db, p.ownerId, snapshot.id),
      origin = header?.scope ?? (await orphanContextScope(tx, db, p.ownerId, snapshot, v));
    if (
      header &&
      (header.summary.contextToken !== v.contextToken || !sameBirth(snapshot, header.snapshot))
    )
      invalid();
    if (!ownChatScope(origin, p, scope.token)) continue;
    assertChatBeforeDeletion(snapshot, p, scope);
    if (header) {
      const summary = normalizeEditorChatDTO('context', {
        ...header.summary,
        phase: 'deleted',
        revision: nextEditorChatRevision(header.summary.revision),
        updatedAt: workDate(now, header.summary.updatedAt),
      });
      changes.push({
        ref: header.snapshot.ref,
        value: {
          ...header.record,
          summary,
          source: null,
          proofCoverage: null,
          closureManifest: null,
          closureHash: null,
          cursor: null,
        },
      });
    }
    changes.push({ ref: snapshot.ref, value: null });
  }
  for (const change of changes) {
    if (change.value) tx.set(change.ref, change.value);
    else tx.delete(change.ref);
  }
  return {
    ...pageEnd(p, rows),
    deletedDocuments: p.deletedDocuments + changes.filter((c) => c.value === null).length,
  };
}
const bodyFields = [
  'schemaVersion',
  'ownerId',
  'conversationId',
  'conversationToken',
  'turnId',
  'attemptToken',
  ...chatScopeFields('context.source'),
];
function turnAddress(path, uid) {
  const prefix = 'users/' + uid + '/editorChats/';
  if (typeof path !== 'string' || !path.startsWith(prefix)) invalid();
  const parts = path.slice(prefix.length).split('/');
  if (parts.length !== 3 || !id(parts[0]) || parts[1] !== 'turnBodies' || !id(parts[2])) invalid();
  return parts;
}
function decodeCursor(cursor, uid) {
  if (typeof cursor !== 'string' || !/^[A-Za-z0-9_-]+$/.test(cursor)) invalid();
  const bytes = Buffer.from(cursor, 'base64url'),
    path = bytes.toString('utf8');
  if (bytes.toString('base64url') !== cursor || !path.isWellFormed()) invalid();
  turnAddress(path, uid);
  return path;
}
async function turnBodies(tx, db, p) {
  if (typeof db.collectionGroup !== 'function') invalid();
  const root = 'users/' + p.ownerId + '/editorChats';
  let q = db
    .collectionGroup('turnBodies')
    .orderBy('__name__')
    .endBefore(db.doc(root + '/~/turnBodies/~'))
    .select(...bodyFields)
    .limit(10);
  q =
    p.cursor === null
      ? q.startAt(db.doc(root + '/!/turnBodies/!'))
      : q.startAfter(db.doc(decodeCursor(p.cursor, p.ownerId)));
  const rows = (await tx.get(q)).docs,
    scope = await adventureChatScope(tx, db, p),
    remove = [];
  for (const snapshot of rows) {
    const [conversationId, , turnId] = turnAddress(snapshot.ref?.path, p.ownerId);
    const v = snapshot.data(),
      ref = db.doc(root + '/' + conversationId),
      parent = await readWorkMetadata(tx, ref, ['schemaVersion', 'ownerId']);
    if (
      v.schemaVersion !== 1 ||
      v.ownerId !== p.ownerId ||
      v.conversationId !== conversationId ||
      v.turnId !== turnId ||
      snapshot.id !== turnId ||
      !hash(v.conversationToken) ||
      !hash(v.attemptToken)
    )
      invalid();
    let conversation, origin;
    if (parent.exists) {
      conversation = await readEditorChatConversation(tx, db, p.ownerId, conversationId);
      origin = chatScope(conversation.summary);
      if (conversation.summary.conversationToken !== v.conversationToken) invalid();
      assertChatCreatedBefore(parent, snapshot);
    } else {
      const proof = await orphanConversationScope(tx, db, p.ownerId, conversationId, v);
      origin = proof.scope;
      assertChatCreatedBefore(proof.snapshot, snapshot);
    }
    if (!ownChatScope(origin, p, scope.token)) continue;
    const head = await readWorkMetadata(
      tx,
      db.doc(root + '/' + conversationId + '/turns/' + turnId),
      [
        'schemaVersion',
        'ownerId',
        'conversationId',
        'conversationToken',
        'turnId',
        'summary.attemptToken',
      ],
    );
    if (head.exists) {
      const h = head.data();
      if (
        h.schemaVersion !== 1 ||
        h.ownerId !== p.ownerId ||
        h.conversationId !== conversationId ||
        h.conversationToken !== v.conversationToken ||
        h.turnId !== turnId ||
        h.summary?.attemptToken !== v.attemptToken ||
        !sameBirth(snapshot, head)
      )
        invalid();
    } else await assertOrphanTurnBirth(tx, db, p.ownerId, snapshot, v);
    assertChatBeforeDeletion(snapshot, p, scope);
    remove.push(snapshot.ref);
  }
  for (const ref of remove) tx.delete(ref);
  return {
    ...p,
    cursor: rows.length ? Buffer.from(rows.at(-1).ref.path).toString('base64url') : null,
    part: p.part + Number(rows.length === 0),
    deletedDocuments: p.deletedDocuments + remove.length,
  };
}
async function verifyHeaders(tx, db, p, conversation) {
  const token = (await adventureChatScope(tx, db, p)).token;
  let q = db
    .collection('users/' + p.ownerId + '/' + (conversation ? 'editorChats' : 'editorChatContexts'))
    .where('summary.target.kind', '==', 'adventure')
    .where('summary.target.id', '==', p.adventureId)
    .where('summary.projectToken', '==', token)
    .orderBy('__name__')
    .select('schemaVersion', 'ownerId')
    .limit(10);
  if (p.cursor !== null) q = q.startAfter(p.cursor);
  const rows = (await tx.get(q)).docs;
  for (const snapshot of rows) {
    if (snapshot.data()?.ownerId !== p.ownerId) invalid();
    if (conversation) {
      const header = await readEditorChatConversation(tx, db, p.ownerId, snapshot.id);
      if (
        !ownChatScope(chatScope(header.summary), p, token) ||
        header.summary.activeTurnId !== null
      )
        invalid();
      if (
        (
          await tx.get(
            db
              .collection(snapshot.ref.path + '/turnBodies')
              .select()
              .limit(1),
          )
        ).docs.length
      )
        return move(p, 1);
    } else {
      const header = await contextHeader(tx, db, p.ownerId, snapshot.id);
      if (!header || !ownChatScope(header.scope, p, token) || header.summary.phase !== 'deleted')
        invalid();
      const body = await readWorkMetadata(
        tx,
        db.doc('users/' + p.ownerId + '/editorChatContextBodies/' + snapshot.id),
        ['schemaVersion'],
      );
      if (body.exists) return move(p, 0);
    }
  }
  return pageEnd(p, rows);
}
export async function prepareAdventureDeletionControls(tx, db, p, now) {
  if (p.part === 0) return contextBodies(tx, db, p, now);
  if (p.part === 1) return turnBodies(tx, db, p);
  if (p.part === 2) return verifyHeaders(tx, db, p, false);
  if (p.part === 3) return verifyHeaders(tx, db, p, true);
  if (p.part === 4)
    return {
      ...p,
      phase: 'activity',
      part: 0,
      cursor: null,
      certified: [...p.certified, 'controls'],
    };
  invalid();
}
