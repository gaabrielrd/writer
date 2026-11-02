// @vitest-environment node
import { it, expect } from 'vitest';
import { readFile } from 'node:fs/promises';
import defineConfig from '../../../../vite.config.ts';
const config = await defineConfig({
  command: 'serve',
  mode: 'test',
  isSsrBuild: false,
  isPreview: false,
});
const matching = (path) =>
  Object.entries(config.server.proxy).filter(([pattern]) => new RegExp(pattern).test(path));
it('adventure restore proxy accepts only its exact path, strips query and targets its own HTTPS', () => {
  for (const path of [
    '/api/adventure-restore/recovery-key',
    '/api/adventure-restore/recovery-key?ignored=PRIVATE_LITERAL',
  ]) {
    const matches = matching(path);
    expect(matches).toHaveLength(1);
    const route = matches[0][1];
    expect(route.rewrite(path)).toBe('/getAdventureRestoreRecoveryKey');
    expect(route.changeOrigin).toBe(true);
    expect(route.target).toMatch(/^https:\/\/us-central1-[a-z][a-z0-9-]+[.]cloudfunctions[.]net$/);
  }
});
it('adventure restore proxy refuses adjacent paths and path suffixes', () => {
  for (const path of [
    '/api/adventure-restore/recovery-key/',
    '/api/adventure-restore/recovery-key-other',
    '/api/adventure-restore/recovery-keyx',
    '/api/adventure-restore/recovery-key\\anything',
    '/api/adventure-restore/other',
  ])
    expect(matching(path)).toHaveLength(0);
});
it('book and adventure import key paths stay separate', () => {
  for (const [path, target] of [
    ['/api/book-restore/recovery-key', '/getBookRestoreRecoveryKey'],
    ['/api/adventure-import/recovery-key', '/getAdventureImportRecoveryKey'],
  ]) {
    const matches = matching(path);
    expect(matches).toHaveLength(1);
    expect(matches[0][1].rewrite(path)).toBe(target);
  }
});
it('Hosting declares the exact adventure HTTPS rewrite before the SPA and keeps existing key routes', async () => {
  const config = JSON.parse(
    await readFile(new URL('../../../../firebase.json', import.meta.url), 'utf8'),
  );
  const rewrites = config.hosting.rewrites;
  const matching = rewrites.filter((r) => r.source === '/api/adventure-restore/recovery-key');
  expect(matching).toEqual([
    {
      source: '/api/adventure-restore/recovery-key',
      function: { functionId: 'getAdventureRestoreRecoveryKey', region: 'us-central1' },
    },
  ]);
  expect(rewrites.indexOf(matching[0])).toBeLessThan(rewrites.findIndex((r) => r.source === '**'));
  expect(rewrites.at(-1)).toEqual({ source: '**', destination: '/index.html' });
  for (const [source, functionId] of [
    ['/api/book-restore/recovery-key', 'getBookRestoreRecoveryKey'],
    ['/api/book-lore/recovery-key', 'getBookLoreEditRecoveryKey'],
    ['/api/adventure-import/recovery-key', 'getAdventureImportRecoveryKey'],
  ])
    expect(rewrites.filter((r) => r.source === source)).toEqual([
      { source, function: { functionId, region: 'us-central1' } },
    ]);
});
