import { test } from 'node:test';
import assert from 'node:assert/strict';
test('server entry loads all deployment exports without a provider secret or network call', async () => {
  process.env.GCLOUD_PROJECT = 'demo-writer-generation-bootstrap';
  const entry = await import('../src/index.mjs');
  for (const name of [
    'bookGenerationQuote',
    'generateBookAsset',
    'acceptBookAsset',
    'discardBookAsset',
    'createBookWithCover',
    'listLibraryImages',
    'renameLibraryImage',
    'deleteLibraryImage',
    'saveBookImage',
    'migrateImageLibrary',
    'cleanupBookAssets',
    'cleanupDeletedBookCover',
    'analyzeChapterLore',
    'prepareBYOKLore',
    'applyLoreAnalysis',
    'bookLoreEdit',
    'reserveBookLoreEditRecovery',
    'getBookLoreEditRecovery',
    'revokeBookLoreEditRecovery',
    'getBookLoreEditRecoveryKey',
  ])
    assert.equal(typeof entry[name], 'function');
  assert.ok(entry.getBookLoreEditRecoveryKey.__endpoint.httpsTrigger);
  assert.equal(entry.getBookLoreEditRecoveryKey.__endpoint.callableTrigger, undefined);
});
