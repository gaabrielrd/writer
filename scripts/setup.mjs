#!/usr/bin/env node

import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { parseArgs } from 'node:util';
import { withFileRollback } from './lib/file-transaction.mjs';
import { LEGACY_TEMPLATE_VERSION } from './lib/template-version.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(scriptDir, '..');
const stateFile = join(projectRoot, '.template-state.json');
const defaultState = {
  technicalName: 'web-project-template',
  displayName: 'Web Project Template',
  templateVersion: LEGACY_TEMPLATE_VERSION,
};
const transactionTargets = [
  '.template-state.json',
  'package.json',
  'index.html',
  'README.md',
  'docs/architecture.md',
  'src/app/App.tsx',
  'src/features',
  'tasks.md',
  '.claude/skills',
  '.agents/skills',
];
const exampleFeatures = ['notes'];

function log(message) {
  console.log(message);
}

function readState() {
  if (!existsSync(stateFile)) return defaultState;
  return { ...defaultState, ...JSON.parse(readFileSync(stateFile, 'utf8')) };
}

function slugifyPackageName(value) {
  const slug = value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 214);
  if (!slug) throw new Error('O nome precisa conter ao menos uma letra ou número.');
  return slug;
}

function escapeHtml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function validatePreconditions() {
  for (const path of ['package.json', 'index.html', 'README.md', 'src/app/App.tsx']) {
    if (!existsSync(join(projectRoot, path)))
      throw new Error(`Arquivo obrigatório ausente: ${path}`);
  }
  JSON.parse(readFileSync(join(projectRoot, 'package.json'), 'utf8'));
}

function updatePackageJson(config) {
  const file = join(projectRoot, 'package.json');
  const raw = readFileSync(file, 'utf8');
  const pkg = JSON.parse(raw);
  pkg.name = config.name;
  if (config.description) pkg.description = config.description;
  if (config.organization) pkg.author = config.organization;
  if (config.license) pkg.license = config.license;
  if (config.repositoryUrl) pkg.repository = { type: 'git', url: config.repositoryUrl };
  writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`);
}

function updateIndexHtml(displayName) {
  const file = join(projectRoot, 'index.html');
  const source = readFileSync(file, 'utf8');
  if (!/<title>[\s\S]*?<\/title>/i.test(source)) {
    throw new Error('Tag <title> não encontrada em index.html.');
  }
  const updated = source.replace(
    /<title>[\s\S]*?<\/title>/i,
    `<title>${escapeHtml(displayName)}</title>`,
  );
  writeFileSync(file, updated);
}

function updateDocumentation(displayName, previousDisplayName, previousTechnicalName) {
  const readme = join(projectRoot, 'README.md');
  const readmeSource = readFileSync(readme, 'utf8');
  writeFileSync(
    readme,
    readmeSource
      .replace(/^# .+$/m, `# ${displayName}`)
      .split(previousDisplayName)
      .join(displayName)
      .split(previousTechnicalName)
      .join(displayName),
  );

  const architecture = join(projectRoot, 'docs', 'architecture.md');
  if (existsSync(architecture)) {
    const source = readFileSync(architecture, 'utf8');
    writeFileSync(
      architecture,
      source
        .split(previousDisplayName)
        .join(displayName)
        .split(previousTechnicalName)
        .join(displayName),
    );
  }
}

function updateApp(displayName, removeExample) {
  const file = join(projectRoot, 'src', 'app', 'App.tsx');
  if (removeExample) {
    writeFileSync(
      file,
      `import { CircleCheck, Home, Palette } from 'lucide-react';
import { Link, Outlet } from 'react-router';
import styles from './App.module.css';

const PROJECT_NAME = ${JSON.stringify(displayName)};

export function App() {
  return (
    <main className={styles.app}>
      <header className={styles.header}>
        <div className={styles.brand}>
          <img className={styles.mark} src="/favicon.svg" alt="" width="28" height="28" />
          <h1>{PROJECT_NAME}</h1>
        </div>
        <p className={styles.status}>
          <CircleCheck className="icon" aria-hidden="true" />O projeto está pronto para sua primeira feature.
        </p>
        <nav className={styles.nav} aria-label="Navegação principal">
          <Link to="/">
            <Home className="icon icon-sm" aria-hidden="true" />
            Início
          </Link>
          <Link to="/styleguide">
            <Palette className="icon icon-sm" aria-hidden="true" />
            Styleguide
          </Link>
        </nav>
      </header>

      <Outlet />
    </main>
  );
}
`,
    );
    return;
  }
  const source = readFileSync(file, 'utf8');
  const updated = source.replace(
    /const PROJECT_NAME = ['"][^'"]*['"];/,
    `const PROJECT_NAME = ${JSON.stringify(displayName)};`,
  );
  if (updated === source && !source.includes(`PROJECT_NAME = ${JSON.stringify(displayName)}`)) {
    throw new Error('Constante PROJECT_NAME não encontrada em src/app/App.tsx.');
  }
  writeFileSync(file, updated);
}

function removeExampleFeatures() {
  const features = join(projectRoot, 'src', 'features');
  if (!existsSync(features)) return;
  for (const example of exampleFeatures) {
    const feature = join(features, example);
    if (!existsSync(feature)) continue;
    rmSync(feature, { recursive: true, force: true });
    log(`Demonstração removida: src/features/${example}`);
  }
}

function resetTasks() {
  writeFileSync(
    join(projectRoot, 'tasks.md'),
    '# Tarefas\n\nRegistre aqui as tarefas do projeto. O detalhamento de cada demanda fica em\n[docs/tasks/](docs/tasks/README.md).\n\n## A fazer\n\n## Em andamento\n\n## Concluído\n',
  );
}

function runSyncSkills() {
  const result = spawnSync(process.execPath, [join(scriptDir, 'sync-skills.mjs')], {
    stdio: 'inherit',
  });
  if (result.status !== 0) throw new Error('A sincronização de skills falhou.');
}

function plan(config, state) {
  return [
    `package: ${state.technicalName} -> ${config.name}`,
    `nome exibido: ${state.displayName} -> ${config.displayName}`,
    `demonstração: ${config.removeExample ? 'remover' : 'manter'}`,
    `tasks.md: ${config.doResetTasks ? 'reiniciar' : 'preservar'}`,
    `skills: ${config.doSyncSkills ? 'sincronizar' : 'preservar'}`,
  ];
}

function applyChanges(config) {
  validatePreconditions();
  const state = readState();
  log('\nPlano do setup:');
  for (const item of plan(config, state)) log(`  - ${item}`);
  if (config.dryRun) {
    log('\nDry-run concluído; nenhum arquivo foi alterado.');
    return;
  }

  withFileRollback(projectRoot, transactionTargets, () => {
    updatePackageJson(config);
    updateIndexHtml(config.displayName);
    updateDocumentation(config.displayName, state.displayName, state.technicalName);
    updateApp(config.displayName, config.removeExample);
    if (config.removeExample) removeExampleFeatures();
    if (config.doResetTasks) resetTasks();
    if (config.doSyncSkills) runSyncSkills();
    writeFileSync(
      stateFile,
      `${JSON.stringify(
        {
          technicalName: config.name,
          displayName: config.displayName,
          templateVersion: state.templateVersion,
        },
        null,
        2,
      )}\n`,
    );
  });
  log('\nSetup concluído. Rode `npm run validate`.');
}

function isYes(answer, defaultYes) {
  const normalized = answer.trim().toLowerCase();
  return normalized ? ['s', 'sim', 'y', 'yes'].includes(normalized) : defaultYes;
}

async function main() {
  const { values } = parseArgs({
    options: {
      name: { type: 'string' },
      'display-name': { type: 'string' },
      description: { type: 'string' },
      organization: { type: 'string' },
      license: { type: 'string' },
      'repository-url': { type: 'string' },
      'remove-example': { type: 'boolean' },
      'reset-tasks': { type: 'boolean' },
      'keep-tasks': { type: 'boolean' },
      'no-sync-skills': { type: 'boolean' },
      'dry-run': { type: 'boolean' },
    },
  });
  const current = readState();
  if (Object.keys(values).length > 0) {
    const rawName = values.name?.trim() || current.technicalName;
    applyChanges({
      name: slugifyPackageName(rawName),
      displayName: values['display-name']?.trim() || current.displayName,
      description: values.description?.trim() || '',
      organization: values.organization?.trim() || '',
      license: values.license?.trim() || '',
      repositoryUrl: values['repository-url']?.trim() || '',
      removeExample: values['remove-example'] || false,
      // Reiniciar é o padrão: um projeto novo não deve herdar o backlog do
      // template. Use --keep-tasks para preservar o conteúdo existente.
      doResetTasks: !values['keep-tasks'],
      doSyncSkills: !values['no-sync-skills'],
      dryRun: values['dry-run'] || false,
    });
    return;
  }
  if (!stdin.isTTY) {
    log('Use: npm run setup -- --name="meu-app" --display-name="Meu App" [--dry-run]');
    return;
  }
  const rl = createInterface({ input: stdin, output: stdout });
  try {
    const displayName = (await rl.question(`Nome de exibição (${current.displayName}): `)).trim();
    const suggestedName = slugifyPackageName(displayName || current.displayName);
    const name = (await rl.question(`Identificador técnico (${suggestedName}): `)).trim();
    const description = (await rl.question('Descrição do projeto: ')).trim();
    const organization = (await rl.question('Nome da organização: ')).trim();
    const removeExample = isYes(await rl.question('Remover demonstrações? (s/N): '), false);
    const doResetTasks = isYes(await rl.question('Reiniciar tasks.md? (S/n): '), true);
    const doSyncSkills = isYes(await rl.question('Sincronizar skills? (S/n): '), true);
    applyChanges({
      name: slugifyPackageName(name || suggestedName),
      displayName: displayName || current.displayName,
      description,
      organization,
      license: '',
      repositoryUrl: '',
      removeExample,
      doResetTasks,
      doSyncSkills,
      dryRun: false,
    });
  } finally {
    rl.close();
  }
}

main().catch((error) => {
  console.error('Erro durante o setup:', error instanceof Error ? error.message : error);
  process.exit(1);
});
