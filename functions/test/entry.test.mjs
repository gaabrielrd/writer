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
  ])
    assert.equal(typeof entry[name], 'function');
});
