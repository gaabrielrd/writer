#!/usr/bin/env node
import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { hasFrontendValidation } from './frontend-validation.mjs';

const defaultRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const zero = /^0+$/;
const objectId = /^(?:[a-f0-9]{40}|[a-f0-9]{64})$/;

/** Use the actual destination ref, falling back to all tests if its history is unavailable. */
export function runPushTests(root, input, { run = spawnSync } = {}) {
  const git = (...args) => run('git', args, { cwd: root, encoding: 'utf8' });
  const head = git('rev-parse', 'HEAD');
  if (head.error || head.status !== 0) return 1;
  const updates = input.trim()
    ? input
        .trim()
        .split(/\r?\n/)
        .map((line) => line.split(/\s+/))
    : [];
  const valid = updates.every(
    (parts) => parts.length === 4 && objectId.test(parts[1]) && objectId.test(parts[3]),
  );
  const active = updates.filter((parts) => !zero.test(parts[1] ?? ''));
  if (valid && updates.length && !active.length) {
    console.log('Pre-push: somente exclusão de refs; nenhum código enviado.');
    return 0;
  }
  if (
    valid &&
    active.length &&
    active.every((parts) => parts[1] === head.stdout.trim()) &&
    hasFrontendValidation(root)
  ) {
    console.log(
      'Pre-push: frontend idêntico à validação local completa aprovada; reutilizando resultado.',
    );
    return 0;
  }
  let base;
  if (valid && active.length) {
    const candidates = new Set(active.map((parts) => parts[3]));
    const candidate = active[0][3];
    if (
      candidates.size === 1 &&
      !zero.test(candidate) &&
      active.every((parts) => parts[1] === head.stdout.trim()) &&
      git('merge-base', '--is-ancestor', candidate, 'HEAD').status === 0
    ) {
      base = candidate;
    }
  }
  const args = ['run', '--maxWorkers=2', '--reporter=default'];
  if (base) args.push('--changed=' + base, '--passWithNoTests');
  console.log(base ? 'Pre-push: testes afetados desde ' + base : 'Pre-push: suíte completa.');
  const result = run(process.execPath, [join(root, 'node_modules/vitest/vitest.mjs'), ...args], {
    cwd: root,
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

if (
  process.argv[1] &&
  realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    process.exitCode = runPushTests(
      defaultRoot,
      process.stdin.isTTY ? '' : readFileSync(0, 'utf8'),
    );
  } catch (error) {
    console.error(error);
    process.exitCode = 1;
  }
}
