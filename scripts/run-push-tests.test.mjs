import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { before, after, test } from 'node:test';
import { runPushTests } from './run-push-tests.mjs';

let root;
let base;
let head;
let sibling;
const deleted = '0'.repeat(40);
function git(...args) {
  const result = spawnSync('git', args, { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  return result.stdout.trim();
}
before(() => {
  root = mkdtempSync(join(tmpdir(), 'writer-push-tests-'));
  git('init');
  git('config', 'user.name', 'Writer test');
  git('config', 'user.email', 'test@example.invalid');
  git('config', 'commit.gpgsign', 'false');
  git('commit', '--allow-empty', '-m', 'base');
  base = git('rev-parse', 'HEAD');
  writeFileSync(join(root, 'source.ts'), 'export const value = 1;\n');
  git('add', 'source.ts');
  git('commit', '-m', 'source change');
  head = git('rev-parse', 'HEAD');
  git('checkout', '--detach', base);
  git('commit', '--allow-empty', '-m', 'sibling');
  sibling = git('rev-parse', 'HEAD');
  git('checkout', '--detach', head);
});
after(() => rmSync(root, { recursive: true, force: true }));

function execute(input, status = 0) {
  const calls = [];
  const result = runPushTests(root, input, {
    run(command, args, options) {
      if (command === 'git') return spawnSync(command, args, options);
      calls.push({ command, args });
      return { status };
    },
  });
  return { result, calls };
}
const update = (remote, local = head) => 'refs/heads/work ' + local + ' refs/heads/main ' + remote;
function full(input) {
  const { result, calls } = execute(input);
  assert.equal(result, 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0].args.slice(1), ['run', '--maxWorkers=2']);
}

test('seleciona testes desde o commit real do destino quando ele é ancestral', () => {
  const { result, calls } = execute(update(base));
  assert.equal(result, 0);
  assert.deepEqual(calls[0].args.slice(1), [
    'run',
    '--maxWorkers=2',
    '--changed=' + base,
    '--passWithNoTests',
  ]);
});
test('branch nova e entrada ausente ou malformada executam a suíte completa', () => {
  for (const input of [update(deleted), '', 'invalid', update('not-an-object-id')]) full(input);
});
test('objeto indisponível e histórico divergente executam a suíte completa', () => {
  full(update('a'.repeat(40)));
  full(update(sibling));
});
test('refs com destinos diferentes e envio de outro commit usam a suíte completa', () => {
  full(update(base) + '\n' + update(head));
  full(update(base, base));
});
test('excluir somente refs não inicia testes e excluir junto de um envio mantém a checagem', () => {
  const removal = update(base, deleted);
  assert.deepEqual(execute(removal), { result: 0, calls: [] });
  const { calls } = execute(removal + '\n' + update(base));
  assert.ok(calls[0].args.includes('--changed=' + base));
});
test('propaga falhas dos testes para impedir o push', () => {
  assert.equal(execute(update(base), 7).result, 7);
});
test('falha ao consultar HEAD também impede o push', () => {
  assert.equal(
    runPushTests(root, update(base), {
      run: () => ({ status: 1, stdout: '' }),
    }),
    1,
  );
});
