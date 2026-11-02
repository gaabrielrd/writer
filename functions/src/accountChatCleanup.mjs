import { onUserDeleted, IS_NOT_TENANT } from 'firebase-functions/v2/identity';

export function createAccountChatCleanupTrigger({ db }) {
  return onUserDeleted(
    {
      region: 'us-central1',
      tenantId: IS_NOT_TENANT,
      timeoutSeconds: 540,
      memory: '512MiB',
      retry: true,
    },
    async (event) => {
      await db.recursiveDelete(db.collection(`users/${event.data.uid}/chapterChats`));
      await db.recursiveDelete(db.collection(`users/${event.data.uid}/chapterChatLimits`));
    },
  );
}
