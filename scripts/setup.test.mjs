import assert from 'node:assert/strict';
import {
  cpSync,
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const projectRoot = join(dirname(fileURLToPath(import.meta.url)), '..');

function copyFixture() {
  const root = mkdtempSync(join(tmpdir(), 'web-setup-'));
  for (const path of [
    '.template-state.json',
    'package.json',
    'index.html',
    'README.md',
    'tasks.md',
  ]) {
    cpSync(join(projectRoot, path), join(root, path));
  }
  for (const path of ['docs', 'src', 'scripts/setup.mjs', 'scripts/lib']) {
    const destination = join(root, path);
    mkdirSync(dirname(destination), { recursive: true });
    cpSync(join(projectRoot, path), destination, { recursive: true });
  }
  return root;
}

function runSetup(root, ...args) {
  const result = spawnSync(process.execPath, [join(root, 'scripts', 'setup.mjs'), ...args], {
    cwd: root,
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
}

test('personaliza identificadores, nome visível e organização', () => {
  const root = copyFixture();
  try {
    runSetup(
      root,
      '--name=Meu Aplicativo',
      '--display-name=Meu Aplicativo',
      '--organization=Equipe Exemplo',
      '--no-sync-skills',
    );
    const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    assert.equal(pkg.name, 'meu-aplicativo');
    assert.equal(pkg.author, 'Equipe Exemplo');
    assert.match(readFileSync(join(root, 'src/app/App.tsx'), 'utf8'), /Meu Aplicativo/);
    assert.match(readFileSync(join(root, 'docs/architecture.md'), 'utf8'), /Meu Aplicativo/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('remove a demonstração e deixa uma composição sem imports quebrados', () => {
  const root = copyFixture();
  try {
    const customFeature = join(root, 'src/features/custom-feature/index.ts');
    mkdirSync(dirname(customFeature), { recursive: true });
    writeFileSync(customFeature, 'export const customFeature = true;\n');

    runSetup(root, '--name=clean-app', '--remove-example', '--reset-tasks', '--no-sync-skills');
    const app = readFileSync(join(root, 'src/app/App.tsx'), 'utf8');
    assert.doesNotMatch(app, /features\//);
    assert.equal(existsSync(join(root, 'src/features/notes')), false);
    assert.equal(readFileSync(customFeature, 'utf8'), 'export const customFeature = true;\n');
    assert.match(app, /pronto para sua primeira feature/);
    assert.match(readFileSync(join(root, 'tasks.md'), 'utf8'), /## A fazer/);

    runSetup(root, '--name=clean-app', '--remove-example', '--no-sync-skills');
    assert.equal(existsSync(join(root, 'src/features/notes')), false);
    assert.equal(readFileSync(customFeature, 'utf8'), 'export const customFeature = true;\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('reinicia tasks.md por padrão e preserva com --keep-tasks', () => {
  const root = copyFixture();
  try {
    writeFileSync(join(root, 'tasks.md'), '# Backlog do template\n\n- [x] item herdado\n');
    runSetup(root, '--name=reset-app', '--no-sync-skills');
    const reset = readFileSync(join(root, 'tasks.md'), 'utf8');
    assert.match(reset, /## A fazer/);
    assert.doesNotMatch(reset, /item herdado/);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  const kept = copyFixture();
  try {
    writeFileSync(join(kept, 'tasks.md'), '# Backlog do template\n\n- [x] item herdado\n');
    runSetup(kept, '--name=keep-app', '--keep-tasks', '--no-sync-skills');
    assert.match(readFileSync(join(kept, 'tasks.md'), 'utf8'), /item herdado/);
  } finally {
    rmSync(kept, { recursive: true, force: true });
  }
});

test('dry-run e repetição com os mesmos valores são idempotentes', () => {
  const root = copyFixture();
  try {
    const before = readFileSync(join(root, 'package.json'), 'utf8');
    runSetup(root, '--name=dry-app', '--dry-run', '--no-sync-skills');
    assert.equal(readFileSync(join(root, 'package.json'), 'utf8'), before);

    const args = ['--name=stable-app', '--display-name=Stable App', '--no-sync-skills'];
    runSetup(root, ...args);
    const first = [
      readFileSync(join(root, 'package.json'), 'utf8'),
      readFileSync(join(root, 'src/app/App.tsx'), 'utf8'),
      readFileSync(join(root, '.template-state.json'), 'utf8'),
    ];
    runSetup(root, ...args);
    assert.deepEqual(
      [
        readFileSync(join(root, 'package.json'), 'utf8'),
        readFileSync(join(root, 'src/app/App.tsx'), 'utf8'),
        readFileSync(join(root, '.template-state.json'), 'utf8'),
      ],
      first,
    );
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('não marca um estado legado como atualizado durante o setup', () => {
  const root = copyFixture();
  try {
    writeFileSync(
      join(root, '.template-state.json'),
      `${JSON.stringify({ technicalName: 'legacy-app', displayName: 'Legacy App' }, null, 2)}\n`,
    );

    runSetup(root, '--name=legacy-app', '--no-sync-skills');

    const state = JSON.parse(readFileSync(join(root, '.template-state.json'), 'utf8'));
    assert.equal(state.templateVersion, '0.0.0');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restaura arquivos quando uma etapa intermediária falha', () => {
  const root = copyFixture();
  try {
    const packageFile = join(root, 'package.json');
    const before = readFileSync(packageFile, 'utf8');
    const appFile = join(root, 'src/app/App.tsx');
    const brokenApp = 'export function App() { return null; }\n';
    writeFileSync(appFile, brokenApp);

    const result = spawnSync(
      process.execPath,
      [join(root, 'scripts', 'setup.mjs'), '--name=broken-app', '--no-sync-skills'],
      { cwd: root, encoding: 'utf8' },
    );
    assert.notEqual(result.status, 0);
    assert.equal(readFileSync(packageFile, 'utf8'), before);
    assert.equal(readFileSync(appFile, 'utf8'), brokenApp);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('restaura a demonstração quando uma etapa posterior falha', () => {
  const root = copyFixture();
  try {
    const notes = join(root, 'src/features/notes');
    const customFeature = join(root, 'src/features/custom-feature/index.ts');
    mkdirSync(dirname(customFeature), { recursive: true });
    writeFileSync(customFeature, 'export const customFeature = true;\n');

    const result = spawnSync(
      process.execPath,
      [join(root, 'scripts', 'setup.mjs'), '--name=rollback-app', '--remove-example'],
      { cwd: root, encoding: 'utf8' },
    );

    assert.notEqual(result.status, 0);
    assert.equal(existsSync(notes), true);
    assert.equal(readFileSync(customFeature, 'utf8'), 'export const customFeature = true;\n');
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});
