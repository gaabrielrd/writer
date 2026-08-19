import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkDocs } from './check-docs.mjs';

function project(readme) {
  const root = mkdtempSync(join(tmpdir(), 'web-docs-'));
  mkdirSync(join(root, 'docs'), { recursive: true });
  writeFileSync(join(root, 'README.md'), readme);
  writeFileSync(join(root, 'package.json'), JSON.stringify({ scripts: { validate: 'true' } }));
  return root;
}

test('aceita links locais e comandos documentados válidos', () => {
  const root = project('[Arquitetura](docs/architecture.md) e `npm run validate`.');
  try {
    writeFileSync(join(root, 'docs', 'architecture.md'), '# Arquitetura\n');
    assert.deepEqual(checkDocs(root), []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('encontra links quebrados e scripts npm inexistentes', () => {
  const root = project('[Ausente](docs/nope.md) e `npm run nao-existe`.');
  try {
    assert.equal(checkDocs(root).length, 2);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejeita recomendação para contornar hooks', () => {
  const root = project('Em emergência, use `git commit --no-verify`.');
  try {
    assert.match(checkDocs(root).join('\n'), /não recomende contornar os hooks/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejeita hook que chama script npm inexistente', () => {
  const root = project('# Projeto');
  try {
    mkdirSync(join(root, '.husky'), { recursive: true });
    writeFileSync(join(root, '.husky', 'pre-push'), 'npm run teste-inexistente\n');
    assert.match(checkDocs(root).join('\n'), /\.husky\/pre-push.*teste-inexistente/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
