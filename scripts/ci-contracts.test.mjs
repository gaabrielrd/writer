import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const packageJson = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8'));
const vitest = readFileSync(new URL('../vitest.config.ts', import.meta.url), 'utf8');

function job(name) {
  const sections = [...workflow.matchAll(/^ {2}(\w+):\s*$/gm)];
  const index = sections.findIndex((section) => section[1] === name);
  assert.notEqual(index, -1, `Job ausente: ${name}`);
  return workflow.slice(sections[index].index, sections[index + 1]?.index);
}

const gate = job('e2e').match(/^\s+node -e "(.+)"$/m)?.[1];
assert.ok(gate, 'Gate de E2E ausente');

function gateStatus(browser, visual) {
  const env = { ...process.env, BROWSER_RESULT: browser, VISUAL_RESULT: visual };
  if (browser === undefined) delete env.BROWSER_RESULT;
  if (visual === undefined) delete env.VISUAL_RESULT;
  const result = spawnSync(process.execPath, ['-e', gate], { env, encoding: 'utf8' });
  assert.ifError(result.error);
  return result.status;
}

test('validate conserva cobertura, scripts, backend e limites mínimos', () => {
  assert.equal(packageJson.scripts.test, 'npm run test:coverage && npm run test:setup');
  assert.match(packageJson.scripts['test:setup'], /scripts\/\*\.test\.mjs/);
  assert.match(packageJson.scripts['test:setup'], /npm run test:book-generation/);
  assert.match(vitest, /provider: 'v8'/);
  for (const [metric, minimum] of Object.entries({
    statements: 85,
    lines: 85,
    branches: 75,
    functions: 90,
  })) {
    const value = Number(vitest.match(new RegExp(`${metric}: (\\d+)`))?.[1]);
    assert.ok(value >= minimum, `Cobertura mínima reduzida: ${metric}`);
  }
  assert.doesNotMatch(vitest, /isolate:\s*false/);
});

test('CI conserva validate completo em Node 22 e 24', () => {
  const validate = job('validate');
  assert.match(validate, /node: \['22', '24'\]/);
  assert.match(validate, /run: npm run validate/);
  assert.match(validate, /npm ci --prefix functions/);
});

test('três shards executam a suíte visual inteira sem filtros ou fail-fast', () => {
  const visual = job('visual');
  assert.match(visual, /shard: \[1, 2, 3\]/);
  assert.match(visual, /fail-fast: false/);
  assert.match(
    visual,
    /run: npx playwright test -c playwright\.visual\.config\.ts --shard=\$\{\{ matrix\.shard \}\}\/3\s*$/m,
  );
  assert.doesNotMatch(visual, /--grep|--project|selection-smoke/);
  assert.doesNotMatch(visual, /continue-on-error:\s*true/);
  assert.match(job('browser'), /run: npm run test:e2e/);
});

test('evidências dos shards não colidem e o relatório completo continua disponível', () => {
  const visual = job('visual');
  const e2e = job('e2e');
  assert.match(visual, /name: writer-visual-blob-\$\{\{ matrix\.shard \}\}/);
  assert.match(visual, /name: writer-visual-results-\$\{\{ matrix\.shard \}\}/);
  assert.match(visual, /results-\$\{\{ matrix\.shard \}\}\.json/);
  assert.match(e2e, /pattern: writer-visual-blob-\*/);
  assert.match(e2e, /pattern: writer-visual-results-\*/);
  assert.match(e2e, /playwright merge-reports --reporter=html all-blob-reports/);
  assert.match(e2e, /name: writer-visual-preview/);
});

test('check E2E conserva o nome e espera o navegador e todos os shards', () => {
  const e2e = job('e2e');
  assert.match(e2e, /name: E2E \(Chromium\)/);
  assert.match(e2e, /needs: \[browser, visual\]/);
  assert.match(e2e, /^ {4}if: always\(\)$/m);
  assert.match(e2e, /BROWSER_RESULT: \$\{\{ needs\.browser\.result \}\}/);
  assert.match(e2e, /VISUAL_RESULT: \$\{\{ needs\.visual\.result \}\}/);
  assert.equal(gateStatus('success', 'success'), 0);
});

test('repetir jobs substitui somente suas próprias evidências sem colisões', () => {
  for (const name of ['validate', 'browser', 'visual', 'e2e']) {
    const uploads = job(name).split('uses: actions/upload-artifact@').slice(1);
    assert.ok(uploads.length, `Uploads ausentes: ${name}`);
    for (const upload of uploads) {
      const configuration = upload.split(/^\s+- (?:name:|uses:)/m)[0];
      assert.match(configuration, /overwrite: true/, `Repetição sem substituição: ${name}`);
    }
  }
});

test('gate real falha se o navegador falhar, for cancelado, pulado ou estiver ausente', () => {
  for (const outcome of ['failure', 'cancelled', 'skipped', '', undefined]) {
    assert.equal(gateStatus(outcome, 'success'), 1, `Navegador: ${outcome}`);
  }
});

test('gate real falha se qualquer shard falhar, for cancelado, pulado ou estiver ausente', () => {
  for (const outcome of ['failure', 'cancelled', 'skipped', '', undefined]) {
    assert.equal(gateStatus('success', outcome), 1, `Visual: ${outcome}`);
  }
});
