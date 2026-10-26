import { editorChatFixture } from '../../../../functions/test/helpers/editorChatFixture.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { createWorkHistoryService } from '../../../../functions/src/workHistory.mjs';
import { inventoryReadHarness } from './adventureInventoryFixture.mjs';
export async function historyDataFixture(
  content = 'a'.repeat(65535) + '🌙' + 'b'.repeat(65533),
  count = 1,
) {
  const f = await editorChatFixture('adventure', false, adventureImportDb({ nativeUpdates: true })),
    sceneId = f.resource.id;
  await f.scenes.updateScene('author', {
    target: f.target,
    sceneId,
    operationId: 'history-file-source-0001',
    expectedRevision: f.records.get(f.path + '/scenes/' + sceneId).revision,
    patch: { content },
  });
  const history = createWorkHistoryService({ db: f.db, now: () => 3000 });
  for (let n = 1; n <= count; n++) {
    const current = await history.getWorkVersionSource('author', {
      target: f.target,
      resource: f.resource,
    });
    const id = 'history-file-version-' + String(n).padStart(4, '0');
    await history.createWorkVersion('author', {
      target: f.target,
      resource: f.resource,
      operationId: id,
      expectedSourceToken: current.sourceToken,
      label: 'PRIVATE_LABEL_' + n,
    });
  }
  return { ...f, id: f.target.id, content, history, ...inventoryReadHarness(f) };
}
