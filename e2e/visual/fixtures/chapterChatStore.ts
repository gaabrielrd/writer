export interface ChatIdentity {
  bookId: string;
  chapterId: string;
  conversationId?: string;
}
export const chapterChatKey = (identity: ChatIdentity) =>
  `writer.visual.chat:${identity.bookId}:${identity.chapterId}`;
