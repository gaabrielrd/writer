#!/usr/bin/env node
import { readdirSync, realpathSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const eslintBin = join(defaultRoot, 'node_modules/eslint/bin/eslint.js');
function directories(root, path) {
  try {
    return readdirSync(join(root, path), { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name);
  } catch (error) {
    if (error.code === 'ENOENT') return [];
    throw error;
  }
}
/** Only partition existing safe directory names; the final root pass retains every other path/configured extension. */
export function lintBatches(root = defaultRoot) {
  const partitions = directories(root, 'src/features')
    .filter((name) => /^[a-zA-Z0-9_-]+$/.test(name))
    .map((name) => 'src/features/' + name);
  for (const name of directories(root, 'functions'))
    if (['src', 'test'].includes(name)) partitions.push('functions/' + name);
  partitions.sort();
  return [
    ...partitions.map((path) => [path, '--no-error-on-unmatched-pattern']),
    ['.', ...partitions.flatMap((path) => ['--ignore-pattern', path + '/**'])],
  ];
}
/** No changed-file filter, caches, concurrency or rule overrides. Each process frees its parser state on exit. */
export function runLint(root = defaultRoot, { args = [], run = spawnSync } = {}) {
  const batches = lintBatches(root);
  for (let index = 0; index < batches.length; index++) {
    const batch = batches[index];
    console.log('Lint ' + (index + 1) + '/' + batches.length + ': ' + batch[0]);
    const result = run(process.execPath, [eslintBin, ...batch, ...args], {
      cwd: root,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    if (result.status !== 0) return result.status ?? 1;
  }
  return 0;
}
if (
  process.argv[1] &&
  realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    process.exitCode = runLint(defaultRoot, { args: process.argv.slice(2) });
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
