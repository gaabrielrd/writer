import { readWorkMetadata, workId } from './workProgressContracts.mjs';
import { readEditorChatCatalogFence } from './editorChatCatalog.mjs';
import { literaryNativeBirth } from './literarySourceOrigins.mjs';
// Impact can observe legacy data without repairing or trusting its absent clock.
// A malformed existing catalog remains an error in the strict native reader.
export async function readLiteraryImpactChatCatalog(tx, db, uid) {
  const root = 'users/' + workId(uid);
  const row = await readWorkMetadata(tx, db.doc(root + '/editorChatCatalogs/current'), []);
  if (row.exists) return { tracked: true, value: await readEditorChatCatalogFence(tx, db, uid) };
  const page = await tx.get(
    db
      .collection(root + '/editorChats')
      .orderBy('__name__')
      .limit(1)
      .select(),
  );
  if (page.docs.length)
    return {
      tracked: false,
      reason: 'native-chat-catalog-missing',
      first: { id: page.docs[0].id, birth: literaryNativeBirth(page.docs[0]) },
    };
  return { tracked: true, value: await readEditorChatCatalogFence(tx, db, uid) };
}
