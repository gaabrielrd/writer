import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { checkToolchain, expectedNpmVersion } from './check-toolchain.mjs';

function project(packageManager = 'npm@10.6.0') {
  const root = mkdtempSync(join(tmpdir(), 'web-toolchain-'));
  writeFileSync(join(root, 'package.json'), JSON.stringify({ packageManager }));
  return root;
}

test('aceita a versão exata declarada em packageManager', () => {
  const root = project();
  try {
    assert.equal(expectedNpmVersion(root), '10.6.0');
    assert.equal(checkToolchain(root, 'npm/10.6.0 node/v22.0.0 darwin arm64'), '10.6.0');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejeita versão diferente da declarada', () => {
  const root = project();
  try {
    assert.throws(
      () => checkToolchain(root, 'npm/11.0.0 node/v24.0.0 linux x64'),
      /esperado 10\.6\.0, encontrado 11\.0\.0/,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('rejeita packageManager sem versão exata do npm', () => {
  const root = project('npm@latest');
  try {
    assert.throws(() => expectedNpmVersion(root), /npm@x\.y\.z/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
