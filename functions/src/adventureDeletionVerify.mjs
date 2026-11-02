import {
  ADVENTURE_DELETION_LAYOUT,
  readAdventureDeletionInventoryPage,
} from './adventureDeletionInventory.mjs';
import {
  assertAdventureDeletionMediaClosed,
  readAdventureDeletionImageUses,
} from './adventureDeletionCleanup.mjs';
import { inspectAdventureDeletionControls } from './adventureDeletionControls.mjs';
import { readAdventureDeletionActivity } from './adventureDeletionActivity.mjs';
import { adventureChatScope } from './adventureDeletionChatRead.mjs';
import { EDITOR_CHAT_CONTEXT_PHASES } from './editorChatContracts.mjs';
import {
  adventureDeletionInconsistent as invalid,
  adventureDeletionReopen as reopen,
} from './adventureDeletionContracts.mjs';

/** Indexed point checks supplement the bounded account scan; source writers remain fenced. */
async function chatRemaining(tx, db, p) {
  const token = (await adventureChatScope(tx, db, p)).token,
    root = 'users/' + p.ownerId;
  const scope = (query, prefix) =>
    query
      .where(prefix + '.target.kind', '==', 'adventure')
      .where(prefix + '.target.id', '==', p.adventureId)
      .where(prefix + '.projectToken', '==', token);
  const contexts = await tx.get(
    scope(db.collection(root + '/editorChatContexts'), 'summary')
      .where(
        'summary.phase',
        'in',
        EDITOR_CHAT_CONTEXT_PHASES.filter((v) => v !== 'deleted'),
      )
      .select('ownerId')
      .orderBy('__name__')
      .limit(1),
  );
  if (contexts.docs.length) {
    if (contexts.docs[0].data()?.ownerId !== p.ownerId) invalid();
    return reopen(p, 'quiescence');
  }
  const bodies = await tx.get(
    scope(db.collection(root + '/editorChatContextBodies'), 'frozen.source')
      .select('ownerId')
      .orderBy('__name__')
      .limit(1),
  );
  if (bodies.docs.length) {
    if (bodies.docs[0].data()?.ownerId !== p.ownerId) invalid();
    return reopen(p, 'controls');
  }
  if (typeof db.collectionGroup !== 'function') invalid();
  const turns = await tx.get(
    scope(db.collectionGroup('turnBodies'), 'context.source')
      .orderBy('__name__')
      .startAt(db.doc(root + '/editorChats/!/turnBodies/!'))
      .endBefore(db.doc(root + '/editorChats/~/turnBodies/~'))
      .select('ownerId')
      .limit(1),
  );
  if (turns.docs.length) {
    if (turns.docs[0].data()?.ownerId !== p.ownerId) invalid();
    return reopen(p, 'controls', 1);
  }
  return null;
}

/** Terminal mutations are composed by the owner service only after these real empty observations. */
export async function verifyAdventureDeletion(tx, db, p, now) {
  if (p.part < 4) return inspectAdventureDeletionControls(tx, db, p, now);
  if (p.part !== 4 || p.cursor !== null) invalid();
  for (let index = 0; index < ADVENTURE_DELETION_LAYOUT.length; index++)
    if (!(await readAdventureDeletionInventoryPage(tx, db, p, index, 1)).empty)
      return reopen(p, 'children', index);
  if ((await readAdventureDeletionImageUses(tx, db, p)).length) return reopen(p, 'images');
  const chat = await chatRemaining(tx, db, p);
  if (chat) return chat;
  if ((await readAdventureDeletionActivity(tx, db, p)).snapshot.exists)
    return reopen(p, 'activity');
  await assertAdventureDeletionMediaClosed(tx, db, p, now);
  return {
    ...p,
    state: 'deleted',
    phase: 'complete',
    part: 0,
    cursor: null,
    parentId: null,
    childPart: 0,
    childCursor: null,
    certified: [...p.certified, 'verify'],
  };
}
