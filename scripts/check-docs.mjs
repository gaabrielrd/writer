#!/usr/bin/env node

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, '..');

function markdownFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...markdownFiles(path));
    if (entry.isFile() && extname(entry.name) === '.md') files.push(path);
  }
  return files;
}

function localLinkTarget(file, rawLink, root) {
  const link = rawLink.trim().replace(/^<|>$/g, '');
  if (!link || link.startsWith('#') || /^(?:https?:|mailto:|tel:)/.test(link)) return null;
  const path = decodeURIComponent(link.split(/[?#]/, 1)[0]);
  return path.startsWith('/') ? join(root, path.slice(1)) : resolve(dirname(file), path);
}

export function checkDocs(root = defaultRoot) {
  const errors = [];
  const packageFile = join(root, 'package.json');
  const packageJson = JSON.parse(readFileSync(packageFile, 'utf8'));
  const scripts = new Set(Object.keys(packageJson.scripts ?? {}));
  const files = [join(root, 'README.md'), ...markdownFiles(join(root, 'docs'))].filter(existsSync);

  for (const file of files) {
    const content = readFileSync(file, 'utf8');
    const label = relative(root, file).replaceAll('\\', '/');
    for (const match of content.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)) {
      const target = localLinkTarget(file, match[1], root);
      if (target && !existsSync(target)) errors.push(`${label}: link inexistente "${match[1]}".`);
    }
    for (const match of content.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) {
      if (!scripts.has(match[1])) errors.push(`${label}: script npm inexistente "${match[1]}".`);
    }
  }

  for (const file of [join(root, 'README.md'), join(root, 'docs', 'development-process.md')]) {
    if (!existsSync(file)) continue;
    if (readFileSync(file, 'utf8').includes('--no-verify')) {
      errors.push(`${relative(root, file)}: não recomende contornar os hooks com --no-verify.`);
    }
  }

  const hooksRoot = join(root, '.husky');
  for (const hook of ['pre-commit', 'commit-msg', 'pre-push']) {
    const hookFile = join(hooksRoot, hook);
    if (!existsSync(hookFile)) continue;
    const content = readFileSync(hookFile, 'utf8');
    for (const match of content.matchAll(/npm run ([a-zA-Z0-9:_-]+)/g)) {
      if (!scripts.has(match[1])) {
        errors.push(`.husky/${hook}: script npm inexistente "${match[1]}".`);
      }
    }
  }

  const agentsFile = join(root, 'docs', 'agents.md');
  if (existsSync(agentsFile)) {
    const agents = readFileSync(agentsFile, 'utf8');
    for (const match of agents.matchAll(/^- \*\*([a-z0-9-]+)\*\* —/gm)) {
      if (!existsSync(join(root, 'skills', match[1], 'SKILL.md'))) {
        errors.push(`docs/agents.md: skill inexistente "${match[1]}".`);
      }
    }
  }

  const stateFile = join(root, '.template-state.json');
  if (existsSync(stateFile)) {
    const state = JSON.parse(readFileSync(stateFile, 'utf8'));
    if (state.technicalName !== 'web-project-template') {
      const staleFiles = ['package.json', 'index.html', 'README.md', 'docs/architecture.md'];
      for (const staleFile of staleFiles) {
        const path = join(root, staleFile);
        if (existsSync(path) && readFileSync(path, 'utf8').includes('web-project-template')) {
          errors.push(`${staleFile}: identificador original ainda presente após o setup.`);
        }
      }
    }
  }

  return errors;
}

function main() {
  const rootFlag = process.argv.indexOf('--root');
  const root = rootFlag >= 0 ? resolve(process.argv[rootFlag + 1]) : defaultRoot;
  const errors = checkDocs(root);
  if (errors.length) {
    console.error('Validação da documentação FALHOU:\n');
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }
  console.log('Validação da documentação OK.');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
