#!/usr/bin/env node

import { existsSync, readFileSync, realpathSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';
import { withFileRollback } from './lib/file-transaction.mjs';
import { CURRENT_TEMPLATE_VERSION, LEGACY_TEMPLATE_VERSION } from './lib/template-version.mjs';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, '..');
const statePath = '.template-state.json';

const migrations = [
  {
    from: LEGACY_TEMPLATE_VERSION,
    to: '0.1.0',
    description: 'adiciona metadados de versão ao estado do template',
    targets: [],
    validate() {},
  },
  {
    from: '0.1.0',
    to: CURRENT_TEMPLATE_VERSION,
    description: 'confirma a estrutura mínima do projeto versionado',
    targets: [],
    validate(root) {
      for (const path of ['README.md', 'package.json']) {
        if (!existsSync(join(root, path))) throw new Error(`Arquivo obrigatório ausente: ${path}`);
      }
      JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
    },
  },
];

function readState(root) {
  const file = join(root, statePath);
  if (!existsSync(file)) {
    throw new Error(`Estado do template ausente: ${statePath}`);
  }
  const state = JSON.parse(readFileSync(file, 'utf8'));
  return {
    ...state,
    templateVersion: state.templateVersion ?? LEGACY_TEMPLATE_VERSION,
  };
}

function writeState(root, state) {
  writeFileSync(join(root, statePath), `${JSON.stringify(state, null, 2)}\n`);
}

export function planTemplateUpdate(root = defaultRoot) {
  const state = readState(root);
  if (state.templateVersion === CURRENT_TEMPLATE_VERSION) return { state, migrations: [] };

  const planned = [];
  let version = state.templateVersion;
  while (version !== CURRENT_TEMPLATE_VERSION) {
    const migration = migrations.find((candidate) => candidate.from === version);
    if (!migration) {
      throw new Error(
        `Não existe migração de ${version} até ${CURRENT_TEMPLATE_VERSION}. Atualize manualmente.`,
      );
    }
    planned.push(migration);
    version = migration.to;
  }
  return { state, migrations: planned };
}

export function updateTemplate(root = defaultRoot, { dryRun = false } = {}) {
  const plan = planTemplateUpdate(root);
  if (dryRun || plan.migrations.length === 0) return plan;

  const targets = [statePath, ...plan.migrations.flatMap((migration) => migration.targets)];
  withFileRollback(root, [...new Set(targets)], () => {
    const nextState = { ...plan.state };
    for (const migration of plan.migrations) {
      migration.validate(root);
      nextState.templateVersion = migration.to;
      writeState(root, nextState);
    }
  });

  return plan;
}

function main() {
  const { values } = parseArgs({
    options: {
      root: { type: 'string' },
      'dry-run': { type: 'boolean' },
    },
  });
  const root = resolve(values.root || defaultRoot);
  const plan = updateTemplate(root, { dryRun: values['dry-run'] || false });

  if (plan.migrations.length === 0) {
    console.log(`Template já está na versão ${CURRENT_TEMPLATE_VERSION}.`);
    return;
  }

  console.log(`${values['dry-run'] ? 'Migrações planejadas' : 'Migrações aplicadas'}:`);
  for (const migration of plan.migrations) {
    console.log(`  - ${migration.from} -> ${migration.to}: ${migration.description}`);
  }
}

if (
  process.argv[1] &&
  realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))
) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
