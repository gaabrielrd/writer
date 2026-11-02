import test from 'node:test';
import assert from 'node:assert/strict';
import { runBookBackupMedia } from './run-book-backup-media.mjs';
test('media runner rejects non-local files and shell-shaped selections before emulator startup', async () => {
  for (const files of [
    [],
    null,
    ['../outside.test.mjs'],
    ['tests/storage/missing.test.mjs'],
    ['tests/storage/a.test.mjs;exit'],
    Array(9).fill('tests/storage/bookBackupCover.rules.test.mjs'),
  ])
    await assert.rejects(() => runBookBackupMedia(files), /arquivos locais/);
});
test('media runner only accepts a simple test filter, without shell interpolation', async () => {
  for (const pattern of ['', 'a b', 'a;exit', 'a"b', '$(whoami)', 'a'.repeat(81)])
    await assert.rejects(() => runBookBackupMedia(undefined, pattern), /palavra simples/);
});
