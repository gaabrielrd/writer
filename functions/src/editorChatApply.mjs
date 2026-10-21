import {
  editorChatFail,
  editorChatSourceId,
  editorChatTextHash,
  editorChatApplyCost,
  canonicalEditorChatJSON,
  verifyEditorChatRequest,
  normalizeEditorChatDTO,
  nextEditorChatRevision,
} from './editorChatContracts.mjs';
import { assertEditorChatHTML } from './editorChatDocument.mjs';
import { readEditorChatOperation, writeEditorChatReceipt } from './editorChatOperations.mjs';
import {
  readEditorChatConversation,
  prepareEditorChatCatalogUpdate,
} from './editorChatConversations.mjs';
import {
  readEditorChatTurnMetadata,
  readEditorChatAuthorizedTurn,
} from './editorChatHistoryRead.mjs';
import { readHistorySource } from './workHistoryContracts.mjs';
import { createScenesService } from './scenes.mjs';
import { createAdventureBlocksService } from './adventureBlocks.mjs';
import { countVisibleWords } from './visibleWordCount.mjs';

const same = (a, b) => canonicalEditorChatJSON(a) === canonicalEditorChatJSON(b);
const baseOf = (source) => ({
  sourceToken: source.sourceToken,
  revision: source.revision,
  bodyHash: source.bodyHash ?? source.contentHash,
});

/** Only the established text writers commit manuscript, aggregates and the progress ledger. */
export function createEditorChatApplyService({ db, now = Date.now }) {
  const scenes = createScenesService({ db, now });
  const blocks = createAdventureBlocksService({ db, now });
  async function dispatch(uid, data) {
    if (!uid) editorChatFail('auth-required');
    editorChatSourceId(uid);
    const request = await verifyEditorChatRequest(data);
    if (request.action !== 'applySuggestion') editorChatFail('invalid-request');
    return db.runTransaction(async (tx) => {
      const operation = await readEditorChatOperation(tx, db, uid, request);
      if (operation.receipt) return { receipt: operation.receipt, current: null };
      if (operation.pending) editorChatFail('operation-pending');
      assertEditorChatHTML(request.after);
      const scope = { target: request.target, resource: request.resource };
      const conversation = await readEditorChatConversation(
        tx,
        db,
        uid,
        request.conversationId,
        request.conversationToken,
        scope,
      );
      if (conversation.summary.state !== 'open') editorChatFail('conversation-unavailable');
      const turn = await readEditorChatTurnMetadata(tx, db, uid, conversation, request.turnId);
      if (turn.summary.state !== 'done' || !turn.summary.suggestionAvailable)
        editorChatFail('suggestion-unavailable');
      const read = await readEditorChatAuthorizedTurn(tx, db, uid, conversation, turn);
      const suggestion = read.body.answer?.suggestion;
      if (
        suggestion === null ||
        suggestion === undefined ||
        (await editorChatTextHash(suggestion)) !== request.suggestionHash
      )
        editorChatFail('suggestion-unavailable');
      if (request.placement === 'original' && !same(baseOf(read.body.context.source), request.base))
        editorChatFail('revision-conflict');
      const path = `${request.target.kind === 'book' ? 'books' : 'adventures'}/${request.target.id}`;
      // Projected authorization metadata cannot substitute for the full writer input.
      const saved = await readHistorySource(
        tx,
        db,
        { uid, target: request.target, path, ref: db.doc(path) },
        request.resource,
      );
      if (!saved || !same(baseOf(saved.source), request.base)) editorChatFail('revision-conflict');
      const userRef = db.doc(`users/${uid}`);
      const user = (await tx.get(userRef)).data();
      const credits = user?.credits ?? 0;
      if (!Number.isSafeInteger(credits) || credits < 0) editorChatFail('inconsistent');
      const chargedCredits = editorChatApplyCost(turn.summary.provider, turn.summary.paid);
      if (credits < chargedCredits) editorChatFail('insufficient-credits');
      const write =
        request.resource.kind === 'block'
          ? await blocks.prepareAdventureBlockTextWrite(tx, {
              uid,
              target: request.target,
              snapshot: saved.snapshot,
              content: request.after,
            })
          : await scenes.prepareSceneTextWrite(tx, {
              uid,
              target: request.target,
              root: saved.root,
              snapshot: saved.snapshot,
              content: request.after,
            });
      const timestamp = Math.max(
        now(),
        conversation.summary.updatedAt + 1,
        turn.summary.updatedAt + 1,
      );
      if (!Number.isSafeInteger(timestamp) || timestamp < 0 || timestamp > 8640000000000000)
        editorChatFail('inconsistent');
      const catalog = await prepareEditorChatCatalogUpdate(tx, db, uid, timestamp);
      const current = normalizeEditorChatDTO('apply', {
        ...scope,
        projectToken: conversation.summary.projectToken,
        resourceToken: conversation.summary.resourceToken,
        revision: write.marker.revision,
        contentHash: write.marker.contentHash,
        bodyBytes: Buffer.byteLength(request.after, 'utf8'),
        wordCount: countVisibleWords(request.after),
        projectRevision: nextEditorChatRevision(saved.root.sceneRevision ?? 0),
        chargedCredits,
      });
      const summary = normalizeEditorChatDTO('turn', {
        ...turn.summary,
        paid: turn.summary.paid || chargedCredits === 1,
        revision: nextEditorChatRevision(turn.summary.revision),
        updatedAt: catalog.updatedAt,
      });
      const nextConversation = normalizeEditorChatDTO('conversation', {
        ...conversation.summary,
        revision: nextEditorChatRevision(conversation.summary.revision),
        updatedAt: catalog.updatedAt,
      });
      // No reads after this point. The receipt and credit cannot diverge from the text.
      write.commit();
      if (chargedCredits) tx.update(userRef, { credits: credits - chargedCredits });
      tx.set(turn.ref, { ...turn.record, summary });
      tx.set(conversation.ref, { ...conversation.record, summary: nextConversation });
      catalog.commit();
      const receipt = writeEditorChatReceipt(
        tx,
        operation,
        uid,
        request,
        {
          kind: 'apply',
          conversationId: request.conversationId,
          conversationToken: request.conversationToken,
          turnId: request.turnId,
          resourceToken: current.resourceToken,
          revision: current.revision,
          contentHash: current.contentHash,
          bodyBytes: current.bodyBytes,
          wordCount: current.wordCount,
          projectRevision: current.projectRevision,
          chargedCredits,
        },
        catalog.updatedAt,
      );
      return { receipt, current };
    });
  }
  return { dispatch };
}
