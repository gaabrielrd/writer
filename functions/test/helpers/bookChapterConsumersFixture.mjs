import { chapterWritingFixture } from './bookChapterStorageFixture.mjs';
import { createScenesService } from '../../src/scenes.mjs';
import { createChapterChatService } from '../../src/chapterChat.mjs';
export async function chapterConsumersFixture(db) {
  const f = await chapterWritingFixture(db),
    scenes = createScenesService({ db, now: () => 5000 }),
    chat = createChapterChatService({
      db,
      now: () => 6000,
      generator: () => Promise.reject(new Error('Generation is outside this fixture')),
    }),
    identity = { bookId: 'book', chapterId: 'chapter', conversationId: 'conversation' };
  await db.runTransaction((tx) => {
    tx.create(db.doc('users/author'), { credits: 5 });
    return Promise.resolve();
  });
  const seedSuggestion = async (provider = 'platform') => {
    const sourceHash = (await f.source()).contentHash;
    await db.runTransaction((tx) => {
      tx.set(db.doc('users/author/chapterChats/book/chapters/chapter/conversations/conversation'), {
        id: 'conversation',
        title: 'Chat',
      });
      tx.set(
        db.doc(
          'users/author/chapterChats/book/chapters/chapter/conversations/conversation/messages/message',
        ),
        {
          id: 'message',
          state: 'done',
          suggestion: 'Edited passage',
          provider,
          paid: false,
          context: { target: { hash: sourceHash } },
        },
      );
      return Promise.resolve();
    });
    return sourceHash;
  };
  return {
    ...f,
    scenes,
    chat,
    identity,
    seedSuggestion,
    apply: (request, uid = 'author') =>
      chat.chapterChat(uid, { ...identity, action: 'apply', ...request }),
    conversion: async (operationId) => ({
      target: f.target,
      parentId: 'chapter',
      operationId,
      expectedSourceVersion: (
        await scenes.getSceneGroup('author', { target: f.target, parentId: 'chapter' })
      ).sourceVersion,
    }),
  };
}
