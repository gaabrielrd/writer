import { randomBytes as secureRandomBytes } from 'node:crypto';
import {
  editorChatClosed,
  editorChatFail,
  editorChatId,
  editorChatSourceId,
  editorChatRevision,
  editorChatHashToken,
  editorChatHash,
  editorChatControlToken,
  canonicalEditorChatJSON,
  normalizeEditorChatDTO,
  nextEditorChatRevision,
  verifyEditorChatRequest,
  assertEditorChatEnvelope,
} from './editorChatContracts.mjs';
import { readEditorChatSource } from './editorChatContextRead.mjs';
import { readEditorChatContext } from './editorChatContext.mjs';
import {
  readEditorChatOperation,
  writeEditorChatReceipt,
  resolveEditorChatOperation,
} from './editorChatOperations.mjs';
import {
  readEditorChatCleanup,
  advanceEditorChatCleanup,
  prepareEditorChatConversationDeletion,
  advanceEditorChatConversationCleanup,
} from './editorChatCleanup.mjs';
import {
  readEditorChatTurnMetadata,
  readEditorChatOwnQuestion,
  readEditorChatAuthorizedTurn,
} from './editorChatHistoryRead.mjs';
export const EDITOR_CHAT_CONVERSATION_ACTIONS = Object.freeze([
  'listConversations',
  'createConversation',
  'renameConversation',
  'listMessages',
  'getTurn',
  'deleteConversation',
  'resolveOperation',
  'getCleanup',
  'advanceCleanup',
]);
const same = (a, b) => canonicalEditorChatJSON(a) === canonicalEditorChatJSON(b);
export const editorChatConversationRef = (db, uid, id) => db.doc(`users/${uid}/editorChats/${id}`);
export const editorChatConversationScopeKey = (uid, s) =>
  editorChatHash({
    version: 1,
    ownerId: uid,
    target: s.target,
    resource: s.resource,
    projectToken: s.projectToken,
    resourceToken: s.resourceToken,
  });
const scopeOf = (s) => ({ target: s.target, resource: s.resource });
const at = (now, previous = 0) => {
  const n = Math.max(now(), previous + 1);
  if (!Number.isSafeInteger(n) || n < 0 || n > 8640000000000000) editorChatFail('inconsistent');
  return n;
};
const conversationFields = [
  'schemaVersion',
  'ownerId',
  'conversationId',
  'birthNonce',
  'scopeKey',
  'summary',
  'cleanupId',
];

async function conversationRecord(db, uid, id, record, token, scope) {
  if (!record || record.ownerId !== uid) editorChatFail('conversation-unavailable');
  try {
    editorChatClosed(record, conversationFields);
    const summary = normalizeEditorChatDTO('conversation', record.summary);
    if (
      record.schemaVersion !== 1 ||
      record.conversationId !== id ||
      summary.conversationId !== id ||
      record.scopeKey !== (await editorChatConversationScopeKey(uid, summary)) ||
      (record.cleanupId !== null && editorChatId(record.cleanupId) !== record.cleanupId) ||
      (summary.state !== 'open' && summary.activeTurnId !== null) ||
      (summary.state === 'deleted' && summary.title !== '')
    )
      editorChatFail('inconsistent');
    const expected = await editorChatControlToken('conversation', {
      ownerId: uid,
      conversationId: id,
      birthNonce: record.birthNonce,
      projectToken: summary.projectToken,
      resourceToken: summary.resourceToken,
    });
    if (expected !== summary.conversationToken) editorChatFail('inconsistent');
    if (token !== undefined && token !== expected) editorChatFail('identity-changed');
    if (scope && !same(scopeOf(summary), scope)) editorChatFail('conversation-unavailable');
    return { ref: editorChatConversationRef(db, uid, id), record, summary };
  } catch (error) {
    editorChatFail(
      ['identity-changed', 'conversation-unavailable'].includes(error.details?.reason)
        ? error.details.reason
        : 'inconsistent',
    );
  }
}
export async function readEditorChatConversation(tx, db, uid, id, token, scope) {
  return conversationRecord(
    db,
    uid,
    id,
    (await tx.get(editorChatConversationRef(db, uid, id))).data(),
    token,
    scope,
  );
}
async function catalog(tx, db, uid) {
  const ref = db.doc(`users/${uid}/editorChatCatalogs/current`),
    value = (await tx.get(ref)).data();
  if (!value) {
    if (
      (
        await tx.get(
          db.collection(`users/${uid}/editorChats`).orderBy('__name__').limit(1).select(),
        )
      ).docs.length
    )
      editorChatFail('inconsistent');
    return { ref, revision: 0, updatedAt: 0 };
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
    return { ref, revision: value.revision, updatedAt: value.updatedAt };
  } catch {
    editorChatFail('inconsistent');
  }
}
export async function prepareEditorChatCatalogUpdate(tx, db, uid, timestamp) {
  const previous = await catalog(tx, db, uid),
    updatedAt = at(() => timestamp, previous.updatedAt),
    revision = nextEditorChatRevision(previous.revision);
  return {
    revision,
    updatedAt,
    commit() {
      tx.set(previous.ref, { schemaVersion: 1, ownerId: uid, revision, updatedAt });
    },
  };
}
function cursorInput(raw, expected) {
  if (raw === undefined) return null;
  let value;
  try {
    if (raw.length > 12000) throw Error();
    const bytes = Buffer.from(raw, 'base64url');
    if (bytes.toString('base64url') !== raw) throw Error();
    value = JSON.parse(bytes.toString('utf8'));
    editorChatClosed(value, [
      'version',
      'kind',
      'ownerId',
      'scopeKey',
      'revision',
      'conversationId',
      'conversationToken',
      'date',
      'id',
    ]);
    if (value.version !== 1 || !['conversations', 'turns'].includes(value.kind)) throw Error();
    editorChatSourceId(value.ownerId);
    editorChatHashToken(value.scopeKey);
    editorChatRevision(value.revision);
    editorChatRevision(value.date);
    editorChatId(value.id);
    if (value.conversationId !== null) editorChatId(value.conversationId);
    if (value.conversationToken !== null) editorChatHashToken(value.conversationToken);
  } catch {
    editorChatFail('invalid-request');
  }
  for (const k of Object.keys(expected))
    if (value[k] !== expected[k]) editorChatFail('cursor-stale');
  return value;
}
const cursorOutput = (expected, date, id) =>
  Buffer.from(canonicalEditorChatJSON({ version: 1, ...expected, date, id })).toString('base64url');
async function requireSource(tx, db, uid, request, summary) {
  const source = await readEditorChatSource(tx, db, uid, request);
  if (
    summary &&
    (source.source.projectToken !== summary.projectToken ||
      source.source.resourceToken !== summary.resourceToken)
  )
    editorChatFail('identity-changed');
  return source;
}
const receiptConversation = (s) => ({
  kind: 'conversation',
  conversationId: s.conversationId,
  conversationToken: s.conversationToken,
  revision: s.revision,
  state: s.state,
});
const receiptCleanup = (s) => ({
  kind: 'cleanup',
  cleanupId: s.cleanupId,
  cleanupToken: s.cleanupToken,
  revision: s.revision,
  state: s.state,
  phase: s.phase,
  deletedDocuments: s.deletedDocuments,
});

export function createEditorChatConversationsService({
  db,
  now = Date.now,
  randomBytes = secureRandomBytes,
  platformModel = 'gemini-3.7-flash',
}) {
  if (typeof platformModel !== 'string' || !/^[a-zA-Z0-9._:-]{1,120}$/.test(platformModel))
    editorChatFail('inconsistent');
  async function dispatch(uid, data) {
    if (!uid) editorChatFail('auth-required');
    editorChatSourceId(uid);
    const r = await verifyEditorChatRequest(data);
    if (!EDITOR_CHAT_CONVERSATION_ACTIONS.includes(r.action)) editorChatFail('invalid-request');
    const birthNonce = ['createConversation', 'deleteConversation'].includes(r.action)
      ? editorChatHashToken(randomBytes(32).toString('hex'))
      : null;
    return db.runTransaction(async (tx) => {
      if (r.action === 'resolveOperation')
        return resolveEditorChatOperation(tx, db, uid, r, at(now));
      if (r.action === 'getCleanup')
        return (await readEditorChatCleanup(tx, db, uid, r.cleanupId, r.cleanupToken)).summary;
      const mutation = [
        'createConversation',
        'renameConversation',
        'deleteConversation',
        'advanceCleanup',
      ].includes(r.action);
      const operation = mutation ? await readEditorChatOperation(tx, db, uid, r) : null;
      if (operation?.receipt) return { receipt: operation.receipt, current: null };
      if (operation?.pending) editorChatFail('operation-pending');
      if (r.action === 'listConversations') {
        const source = await requireSource(tx, db, uid, r);
        if (
          r.projectToken !== undefined &&
          (r.projectToken !== source.source.projectToken ||
            r.resourceToken !== source.source.resourceToken)
        )
          editorChatFail('identity-changed');
        const scopeKey = await editorChatConversationScopeKey(uid, source.source),
          current = await catalog(tx, db, uid);
        const expected = {
          kind: 'conversations',
          ownerId: uid,
          scopeKey,
          revision: current.revision,
          conversationId: null,
          conversationToken: null,
        };
        const cursor = cursorInput(r.cursor, expected);
        let query = db
          .collection(`users/${uid}/editorChats`)
          .where('scopeKey', '==', scopeKey)
          .where('summary.state', '==', 'open')
          .orderBy('summary.updatedAt', 'desc')
          .orderBy('__name__', 'desc')
          .limit(r.limit + 1)
          .select(...conversationFields);
        if (cursor) query = query.startAfter(cursor.date, cursor.id);
        const page = (await tx.get(query)).docs,
          items = [];
        for (const doc of page.slice(0, r.limit)) {
          const row = await conversationRecord(
            db,
            uid,
            doc.id,
            doc.data(),
            undefined,
            scopeOf(source.source),
          );
          if (row.record.scopeKey !== scopeKey || row.summary.state !== 'open')
            editorChatFail('inconsistent');
          items.push(row.summary);
        }
        const last = items.at(-1);
        return normalizeEditorChatDTO('conversationPage', {
          schemaVersion: 1,
          ownerId: uid,
          ...scopeOf(source.source),
          projectToken: source.source.projectToken,
          resourceToken: source.source.resourceToken,
          collectionRevision: current.revision,
          platformModel,
          items,
          nextCursor:
            page.length > r.limit
              ? cursorOutput(expected, last.updatedAt, last.conversationId)
              : null,
        });
      }
      if (r.action === 'advanceCleanup') {
        const cleanup = await readEditorChatCleanup(tx, db, uid, r.cleanupId, r.cleanupToken);
        if (cleanup.summary.revision !== r.expectedRevision) editorChatFail('revision-conflict');
        let plan;
        const timestamp = at(now, cleanup.summary.updatedAt);
        if (cleanup.summary.subject.kind === 'context') {
          const context = await readEditorChatContext(
            tx,
            db,
            uid,
            cleanup.summary.subject.id,
            cleanup.summary.subject.token,
          );
          plan = await advanceEditorChatCleanup(
            tx,
            db,
            uid,
            cleanup,
            context,
            Math.max(timestamp, context.summary.updatedAt + 1),
          );
        } else {
          const conversation = await readEditorChatConversation(
            tx,
            db,
            uid,
            cleanup.summary.subject.id,
            cleanup.summary.subject.token,
          );
          plan = await advanceEditorChatConversationCleanup(
            tx,
            db,
            uid,
            cleanup,
            conversation,
            Math.max(timestamp, conversation.summary.updatedAt + 1),
          );
        }
        plan.commit();
        return {
          receipt: writeEditorChatReceipt(
            tx,
            operation,
            uid,
            r,
            receiptCleanup(plan.summary),
            timestamp,
          ),
          current: plan.summary,
        };
      }
      if (r.action === 'createConversation') {
        const ref = editorChatConversationRef(db, uid, r.conversationId);
        if ((await tx.get(ref)).exists) editorChatFail('operation-conflict');
        const source = await requireSource(tx, db, uid, r, {
          projectToken: r.projectToken,
          resourceToken: r.resourceToken,
        });
        const update = await prepareEditorChatCatalogUpdate(tx, db, uid, at(now)),
          timestamp = update.updatedAt;
        const conversationToken = await editorChatControlToken('conversation', {
          ownerId: uid,
          conversationId: r.conversationId,
          birthNonce,
          projectToken: r.projectToken,
          resourceToken: r.resourceToken,
        });
        const summary = normalizeEditorChatDTO('conversation', {
          schemaVersion: 1,
          ...scopeOf(source.source),
          conversationId: r.conversationId,
          conversationToken,
          projectToken: r.projectToken,
          resourceToken: r.resourceToken,
          revision: 1,
          state: 'open',
          title: 'Nova conversa',
          activeTurnId: null,
          createdAt: timestamp,
          updatedAt: timestamp,
        });
        const record = {
          schemaVersion: 1,
          ownerId: uid,
          conversationId: r.conversationId,
          birthNonce,
          scopeKey: await editorChatConversationScopeKey(uid, summary),
          summary,
          cleanupId: null,
        };
        assertEditorChatEnvelope(record);
        tx.create(ref, record);
        update.commit();
        return {
          receipt: writeEditorChatReceipt(
            tx,
            operation,
            uid,
            r,
            receiptConversation(summary),
            timestamp,
          ),
          current: summary,
        };
      }
      const conversation = await readEditorChatConversation(
        tx,
        db,
        uid,
        r.conversationId,
        r.conversationToken,
        scopeOf(r),
      );
      if (conversation.summary.state !== 'open') editorChatFail('conversation-unavailable');
      if (r.action === 'deleteConversation') {
        const update = await prepareEditorChatCatalogUpdate(
            tx,
            db,
            uid,
            at(now, conversation.summary.updatedAt),
          ),
          timestamp = update.updatedAt;
        const active =
          conversation.summary.activeTurnId === null
            ? null
            : await readEditorChatTurnMetadata(
                tx,
                db,
                uid,
                conversation,
                conversation.summary.activeTurnId,
              );
        const cleanup = await prepareEditorChatConversationDeletion(
          tx,
          db,
          uid,
          conversation,
          r.operationId,
          birthNonce,
          timestamp,
        );
        const summary = {
          ...conversation.summary,
          state: 'deleting',
          activeTurnId: null,
          revision: nextEditorChatRevision(conversation.summary.revision),
          updatedAt: timestamp,
        };
        if (active && ['running', 'awaiting-byok'].includes(active.summary.state))
          tx.set(active.ref, {
            ...active.record,
            summary: {
              ...active.summary,
              state: 'stopped',
              failureReason: 'turn-stopped',
              revision: nextEditorChatRevision(active.summary.revision),
              updatedAt: timestamp,
            },
          });
        tx.set(conversation.ref, { ...conversation.record, summary, cleanupId: r.operationId });
        update.commit();
        cleanup.commit();
        return {
          receipt: writeEditorChatReceipt(
            tx,
            operation,
            uid,
            r,
            receiptCleanup(cleanup.summary),
            timestamp,
          ),
          current: cleanup.summary,
        };
      }
      if (r.action === 'getTurn') {
        const turn = await readEditorChatTurnMetadata(tx, db, uid, conversation, r.turnId);
        const question = await readEditorChatOwnQuestion(tx, db, uid, conversation, turn);
        let read;
        try {
          read = await readEditorChatAuthorizedTurn(tx, db, uid, conversation, turn, {
            includeBody: turn.summary.state === 'done',
          });
        } catch (error) {
          if (error.details?.reason !== 'provenance-revoked') throw error;
          return normalizeEditorChatDTO('turnRead', {
            turn: turn.summary,
            question,
            presentation: 'blocked',
            answer: null,
          });
        }
        return normalizeEditorChatDTO('turnRead', {
          turn: turn.summary,
          question,
          presentation: 'available',
          answer:
            read.body === null
              ? null
              : {
                  ...read.body.answer,
                  context: read.body.context,
                  provenance: turn.closure,
                  history: read.body.history,
                  freshness: read.freshness,
                },
        });
      }
      await requireSource(tx, db, uid, r, conversation.summary);
      if (r.action === 'renameConversation') {
        if (conversation.summary.revision !== r.expectedRevision)
          editorChatFail('revision-conflict');
        const update = await prepareEditorChatCatalogUpdate(
          tx,
          db,
          uid,
          at(now, conversation.summary.updatedAt),
        );
        const summary = {
          ...conversation.summary,
          title: r.title,
          revision: nextEditorChatRevision(conversation.summary.revision),
          updatedAt: update.updatedAt,
        };
        tx.set(conversation.ref, { ...conversation.record, summary });
        update.commit();
        return {
          receipt: writeEditorChatReceipt(
            tx,
            operation,
            uid,
            r,
            receiptConversation(summary),
            update.updatedAt,
          ),
          current: summary,
        };
      }
      const expected = {
        kind: 'turns',
        ownerId: uid,
        scopeKey: conversation.record.scopeKey,
        revision: conversation.summary.revision,
        conversationId: r.conversationId,
        conversationToken: r.conversationToken,
      };
      const cursor = cursorInput(r.cursor, expected);
      let query = db
        .collection(`${conversation.ref.path}/turns`)
        .orderBy('summary.createdAt', 'desc')
        .orderBy('__name__', 'desc')
        .limit(r.limit + 1);
      if (cursor) query = query.startAfter(cursor.date, cursor.id);
      const docs = (await tx.get(query)).docs,
        items = [];
      for (const doc of docs.slice(0, r.limit))
        items.push((await readEditorChatTurnMetadata(tx, db, uid, conversation, doc.id)).summary);
      const last = items.at(-1);
      return normalizeEditorChatDTO('turnPage', {
        schemaVersion: 1,
        ownerId: uid,
        conversationId: r.conversationId,
        conversationToken: r.conversationToken,
        conversationRevision: conversation.summary.revision,
        items,
        nextCursor:
          docs.length > r.limit ? cursorOutput(expected, last.createdAt, last.turnId) : null,
      });
    });
  }
  return { dispatch };
}
