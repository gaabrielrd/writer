import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import {
  frontendFingerprint,
  hasFrontendValidation,
  recordFrontendValidation,
  runValidatedFrontend,
} from './frontend-validation.mjs';
import { runPushTests } from './run-push-tests.mjs';

function fixture(t) {
  const root = mkdtempSync(join(tmpdir(), 'writer-validation-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  const git = (...args) => {
    const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
    return result.stdout.trim();
  };
  git('init');
  git('config', 'user.name', 'Writer test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  mkdirSync(join(root, 'src'));
  writeFileSync(join(root, 'src/value.ts'), 'export const value = 1;');
  writeFileSync(
    join(root, 'package.json'),
    JSON.stringify({ dependencies: { example: '1' }, scripts: {} }),
  );
  writeFileSync(join(root, '.gitignore'), '.firebase/\n');
  git('add', '.');
  git('commit', '-m', 'fixture');
  return { root, git };
}
function approved(root) {
  assert.equal(recordFrontendValidation(root, frontendFingerprint(root)), true);
}

test('reuses exact content and invalidates edits even when the timestamp is preserved', (t) => {
  const { root } = fixture(t);
  approved(root);
  assert.equal(hasFrontendValidation(root), true);
  writeFileSync(join(root, 'src/value.ts'), 'export const value = 2;');
  utimesSync(join(root, 'src/value.ts'), 1, 1);
  assert.equal(hasFrontendValidation(root), false);
});
test('committed changes, new tests, deleted sources and config changes invalidate approval', (t) => {
  for (const kind of ['edit', 'add', 'delete', 'config']) {
    const { root, git } = fixture(t);
    approved(root);
    if (kind === 'edit') writeFileSync(join(root, 'src/value.ts'), 'export const value = 2;');
    if (kind === 'add') writeFileSync(join(root, 'src/new.test.ts'), 'test fixture');
    if (kind === 'delete') rmSync(join(root, 'src/value.ts'));
    if (kind === 'config') writeFileSync(join(root, 'vitest.config.ts'), 'export default {};');
    git('add', '-A');
    git('commit', '-m', 'change');
    assert.equal(hasFrontendValidation(root), false, kind);
  }
});
test('dependency changes invalidate approval; committed docs and hook commands preserve it', (t) => {
  const { root, git } = fixture(t);
  approved(root);
  const pkg = JSON.parse(readFileSync(join(root, 'package.json')));
  pkg.scripts['test:coverage'] = 'node scripts/frontend-validation.mjs';
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
  writeFileSync(join(root, 'README.md'), 'Docs');
  git('add', '-A');
  git('commit', '-m', 'commands and docs');
  assert.equal(hasFrontendValidation(root), true);
  pkg.dependencies.example = '2';
  writeFileSync(join(root, 'package.json'), JSON.stringify(pkg));
  git('add', '-A');
  git('commit', '-m', 'dependency');
  assert.equal(hasFrontendValidation(root), false);
});
test('failed runs clear an older approval and preserve their failure status', (t) => {
  const { root } = fixture(t);
  approved(root);
  assert.equal(runValidatedFrontend(root, { run: () => ({ status: 7 }) }), 7);
  assert.equal(hasFrontendValidation(root), false);
});
test('successful full coverage records approval with the existing reporters and thresholds', (t) => {
  const { root } = fixture(t);
  let args;
  assert.equal(
    runValidatedFrontend(root, {
      run: (_cmd, actual) => {
        args = actual;
        return { status: 0 };
      },
    }),
    0,
  );
  assert.ok(args.includes('--coverage'));
  assert.ok(args.includes('--reporter=json'));
  assert.ok(args.includes('--outputFile.json=coverage/results.json'));
  assert.equal(hasFrontendValidation(root), true);
});
test('changes during a successful run cannot create reusable approval', (t) => {
  const { root } = fixture(t);
  assert.equal(
    runValidatedFrontend(root, {
      run: () => {
        writeFileSync(join(root, 'src/value.ts'), 'changed during test');
        return { status: 0 };
      },
    }),
    0,
  );
  assert.equal(hasFrontendValidation(root), false);
});
test('corrupt receipts and receipts copied between checkouts fail closed', (t) => {
  const first = fixture(t),
    second = fixture(t);
  approved(first.root);
  const name = '.firebase/local-validation/frontend.json';
  mkdirSync(join(second.root, '.firebase/local-validation'), { recursive: true });
  writeFileSync(join(second.root, name), readFileSync(join(first.root, name)));
  assert.equal(hasFrontendValidation(second.root), false);
  writeFileSync(join(first.root, name), '{');
  assert.equal(hasFrontendValidation(first.root), false);
});
test('pre-push reuses approval only for the exact current HEAD with clean inputs', (t) => {
  const { root, git } = fixture(t);
  approved(root);
  const head = git('rev-parse', 'HEAD');
  const calls = [];
  const run = (command, args, options) => {
    if (command === 'git') return spawnSync(command, args, options);
    calls.push(args);
    return { status: 0 };
  };
  const input = (local) => `refs/heads/work ${local} refs/heads/main ${'0'.repeat(40)}`;
  assert.equal(runPushTests(root, input(head), { run }), 0);
  assert.equal(calls.length, 0);
  assert.equal(runPushTests(root, input('a'.repeat(40)), { run }), 0);
  assert.equal(calls.length, 1);
  writeFileSync(join(root, 'src/value.ts'), 'dirty');
  assert.equal(runPushTests(root, input(head), { run }), 0);
  assert.equal(calls.length, 2);
});

test('environment changes invalidate the local result without changing files', (t) => {
  const { root } = fixture(t);
  const previous = process.env.CI;
  t.after(() => {
    if (previous === undefined) delete process.env.CI;
    else process.env.CI = previous;
  });
  approved(root);
  process.env.CI = previous === 'true' ? 'false' : 'true';
  assert.equal(hasFrontendValidation(root), false);
});

test('filtered coverage forwards arguments and never records a full-suite approval', (t) => {
  const { root } = fixture(t);
  let actual;
  assert.equal(
    runValidatedFrontend(root, {
      args: ['src/value.test.ts', '-t', 'one case'],
      run: (_command, args) => {
        actual = args;
        return { status: 0 };
      },
    }),
    0,
  );
  assert.deepEqual(actual.slice(-3), ['src/value.test.ts', '-t', 'one case']);
  assert.equal(hasFrontendValidation(root), false);
});
test('Vite environment changes invalidate approval', (t) => {
  const { root } = fixture(t);
  const previous = process.env.VITE_WRITER_CACHE_TEST;
  t.after(() => {
    if (previous === undefined) delete process.env.VITE_WRITER_CACHE_TEST;
    else process.env.VITE_WRITER_CACHE_TEST = previous;
  });
  approved(root);
  process.env.VITE_WRITER_CACHE_TEST = 'changed';
  assert.equal(hasFrontendValidation(root), false);
});
