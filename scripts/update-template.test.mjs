import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function copyFixture(version = '0.0.0') {
  const root = mkdtempSync(join(tmpdir(), 'web-update-template-'));
  mkdirSync(join(root, 'scripts'), { recursive: true });
  cpSync(
    join(projectRoot, 'scripts/update-template.mjs'),
    join(root, 'scripts/update-template.mjs'),
  );
  cpSync(join(projectRoot, 'scripts/lib'), join(root, 'scripts/lib'), { recursive: true });
  cpSync(join(projectRoot, 'README.md'), join(root, 'README.md'));
  cpSync(join(projectRoot, 'package.json'), join(root, 'package.json'));
  writeFileSync(
    join(root, '.template-state.json'),
    `${JSON.stringify({ technicalName: 'app', displayName: 'App', templateVersion: version }, null, 2)}\n`,
  );
  return root;
}

function runUpdate(root, ...args) {
  return spawnSync(process.execPath, [join(root, 'scripts/update-template.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
}

test('aplica migrações sequenciais até a versão atual', () => {
  const root = copyFixture();
  try {
    const result = runUpdate(root);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    const state = JSON.parse(readFileSync(join(root, '.template-state.json'), 'utf8'));
    assert.equal(state.templateVersion, '1.0.0');
    assert.match(result.stdout, /0\.0\.0 -> 0\.1\.0/);
    assert.match(result.stdout, /0\.1\.0 -> 1\.0\.0/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('não repete migrações quando o projeto já está atualizado', () => {
  const root = copyFixture('1.0.0');
  try {
    const before = readFileSync(join(root, '.template-state.json'), 'utf8');
    const result = runUpdate(root);
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /já está na versão 1\.0\.0/);
    assert.equal(readFileSync(join(root, '.template-state.json'), 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('dry-run lista o plano sem alterar o estado', () => {
  const root = copyFixture();
  try {
    const before = readFileSync(join(root, '.template-state.json'), 'utf8');
    const result = runUpdate(root, '--dry-run');
    assert.equal(result.status, 0, result.stderr || result.stdout);
    assert.match(result.stdout, /Migrações planejadas/);
    assert.equal(readFileSync(join(root, '.template-state.json'), 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restaura o estado quando uma migração posterior falha', () => {
  const root = copyFixture();
  try {
    const stateFile = join(root, '.template-state.json');
    const before = readFileSync(stateFile, 'utf8');
    rmSync(join(root, 'README.md'));

    const result = runUpdate(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /README\.md/);
    assert.equal(readFileSync(stateFile, 'utf8'), before);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('falha claramente para uma versão sem caminho de migração', () => {
  const root = copyFixture('9.9.9');
  try {
    const result = runUpdate(root);
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /Não existe migração de 9\.9\.9/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
