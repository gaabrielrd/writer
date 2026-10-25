// @vitest-environment node
import { it, expect } from 'vitest';
import defineConfig from '../../../../vite.config.ts';
const config = await defineConfig({
  command: 'serve',
  mode: 'test',
  isSsrBuild: false,
  isPreview: false,
});
const matching = (path) =>
  Object.entries(config.server.proxy).filter(([pattern]) => new RegExp(pattern).test(path));
it('local book recovery proxy matches the exact path and optional query and rewrites to the existing HTTP function', () => {
  for (const path of ['/api/book-restore/recovery-key', '/api/book-restore/recovery-key?test=1']) {
    const matches = matching(path);
    expect(matches).toHaveLength(1);
    const route = matches[0][1];
    expect(route.rewrite(path)).toBe('/getBookRestoreRecoveryKey');
    expect(route.changeOrigin).toBe(true);
    expect(route.target).toMatch(/^https:\/\/us-central1-[a-z][a-z0-9-]+[.]cloudfunctions[.]net$/);
  }
});
it('local book recovery proxy rejects neighboring paths, trailing slash and malformed query separator', () => {
  for (const path of [
    '/api/book-restore/recovery-key/',
    '/api/book-restore/recovery-key-other',
    '/api/book-restore/recovery-keyx',
    '/api/book-restore/recovery-key\\anything',
    '/api/book-restore/other',
  ])
    expect(matching(path)).toHaveLength(0);
});
it('the existing adventure recovery proxy remains separate and targets its original HTTP function', () => {
  for (const path of [
    '/api/adventure-import/recovery-key',
    '/api/adventure-import/recovery-key?test=1',
  ]) {
    const matches = matching(path);
    expect(matches).toHaveLength(1);
    expect(matches[0][1].rewrite(path)).toBe('/getAdventureImportRecoveryKey');
  }
});
