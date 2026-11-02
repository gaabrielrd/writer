import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, realpathSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { spawnSync } from 'node:child_process';
import { lintBatches, runLint } from './run-lint.mjs';
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'writer-lint-'));
  for (const name of [
    'src/features/first',
    'src/features/new-feature',
    'src/features/empty',
    'src/features/ignored',
    'src/features/odd[name]',
    'functions/src',
    'functions/test',
    'extra',
  ]) {
    mkdirSync(join(root, name), { recursive: true });
  }
  writeFileSync(
    join(root, 'eslint.config.mjs'),
    "export default [{ignores:['src/features/ignored/**']},{files:['**/*.{js,mjs}'],rules:{'no-undef':'error'}}];\n",
  );
  for (const name of [
    'src/features/first/good.js',
    'src/features/new-feature/good.js',
    'src/features/odd[name]/good.js',
    'functions/src/good.mjs',
    'functions/test/good.mjs',
    'extra/good.js',
    'root.js',
  ])
    writeFileSync(join(root, name), 'const value = 1; void value;\n');
  writeFileSync(join(root, 'src/features/ignored/ignored.js'), 'MISSING_IGNORED;\n');
  return root;
}
function cleanup(root) {
  const actual = realpathSync(root),
    temporary = realpathSync(tmpdir());
  assert.ok(actual.startsWith(temporary + sep) && actual.includes('writer-lint-'));
  rmSync(actual, { recursive: true, force: true });
}
const quiet = (command, args, options) =>
  spawnSync(command, args, { ...options, stdio: 'pipe', encoding: 'utf8' });
test('complete lint includes new features and the root remainder while preserving configured ignores', () => {
  const root = fixture();
  try {
    const batches = lintBatches(root);
    assert.ok(batches.some((row) => row[0] === 'src/features/new-feature'));
    assert.ok(!batches.at(-1).includes('src/features/odd[name]/**'));
    assert.equal(runLint(root, { run: quiet }), 0);
    writeFileSync(join(root, 'extra/good.js'), 'MISSING_REMAINDER;\n');
    assert.equal(runLint(root, { run: quiet }), 1);
  } finally {
    cleanup(root);
  }
});
test('new feature failures are real lint failures and prevent subsequent processes', () => {
  const root = fixture(),
    visited = [];
  try {
    writeFileSync(join(root, 'src/features/new-feature/good.js'), 'MISSING_FEATURE;\n');
    const code = runLint(root, {
      run: (command, args, options) => {
        visited.push(args[1]);
        return quiet(command, args, options);
      },
    });
    assert.equal(code, 1);
    assert.ok(visited.includes('src/features/new-feature'));
    assert.ok(!visited.includes('.'));
  } finally {
    cleanup(root);
  }
});
test('process errors and signals cannot produce a green lint result', () => {
  const root = fixture();
  try {
    assert.equal(runLint(root, { run: () => ({ status: null, signal: 'SIGTERM' }) }), 1);
    const failure = Error('spawn failed');
    assert.throws(
      () => runLint(root, { run: () => ({ error: failure }) }),
      (error) => error === failure,
    );
  } finally {
    cleanup(root);
  }
});
