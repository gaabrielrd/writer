import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { generateFeature } from './generate-feature.mjs';

test('planeja e cria uma feature completa sem sobrescrever arquivos', () => {
  const root = mkdtempSync(join(tmpdir(), 'web-feature-'));
  try {
    const planned = generateFeature(root, 'Relatórios Mensais', true);
    assert.equal(planned.length, 6);
    assert.equal(existsSync(join(root, 'src/features/relatorios-mensais')), false);

    generateFeature(root, 'Relatórios Mensais');
    assert.equal(existsSync(join(root, 'src/features/relatorios-mensais/index.ts')), true);
    // O scaffold já usa os tokens do styleguide, sem valor literal de cor.
    const css = readFileSync(
      join(root, 'src/features/relatorios-mensais/components/RelatoriosMensais.module.css'),
      'utf8',
    );
    assert.match(css, /var\(--navy\)/);
    assert.doesNotMatch(css, /#[0-9a-fA-F]{3,8}/);
    assert.throws(() => generateFeature(root, 'Relatórios Mensais'), /já existe/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
