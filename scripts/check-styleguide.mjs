#!/usr/bin/env node
// Verifica se o design system e os temas continuam sendo respeitados.
//
// Executado dentro de `npm run validate`.
//
// Regras verificadas:
//  1. `src/styles/globals.css` expõe os tokens semânticos de tema esperados.
//  2. `src/main.tsx` importa o CSS global de estilos.
//  3. A única biblioteca de ícones é `lucide-react`, declarada em `dependencies`.
//  4. `src/shared/ui` continua expondo o kit base esperado.
//
// Compatível com macOS, Linux e Windows: apenas APIs nativas do Node.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, '..');

export const GLOBALS_CSS_FILE = 'src/styles/globals.css';
export const ICON_LIBRARY = 'lucide-react';

/** Tokens de tema obrigatórios */
export const REQUIRED_THEME_TOKENS = [
  '--background',
  '--foreground',
  '--card',
  '--card-foreground',
  '--primary',
  '--primary-foreground',
  '--secondary',
  '--secondary-foreground',
  '--muted',
  '--muted-foreground',
  '--accent',
  '--destructive',
  '--border',
  '--input',
  '--ring',
  '--radius',
];

/** Kit base esperado no src/shared/ui */
export const REQUIRED_COMPONENTS = [
  'Alert',
  'Badge',
  'Button',
  'Card',
  'Dialog',
  'EmptyState',
  'ErrorState',
  'Input',
  'LoadingState',
  'PageHeader',
  'Select',
  'Table',
  'Textarea',
];

/** Bibliotecas de ícones que competem com a padrão. */
const FORBIDDEN_ICON_PACKAGES = [
  'react-icons',
  '@heroicons/react',
  '@mui/icons-material',
  '@fortawesome/react-fontawesome',
  '@phosphor-icons/react',
  'phosphor-react',
  'react-feather',
  'feather-icons',
  '@tabler/icons-react',
  'bootstrap-icons',
];

function listFiles(directory, extensions) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) files.push(...listFiles(path, extensions));
    if (entry.isFile() && extensions.has(extname(entry.name))) files.push(path);
  }
  return files;
}

function normalized(path) {
  return path.split(sep).join('/');
}

/** Remove comentários para não acusar cor citada em explicação. */
function withoutComments(css) {
  return css.replace(/\/\*[\s\S]*?\*\//g, '');
}

function checkTokens(root, warnings) {
  const globalsPath = join(root, GLOBALS_CSS_FILE);
  if (!existsSync(globalsPath)) {
    warnings.push(`${GLOBALS_CSS_FILE}: folha de estilos global ausente.`);
  } else {
    const tokens = withoutComments(readFileSync(globalsPath, 'utf8'));
    for (const token of REQUIRED_THEME_TOKENS) {
      if (!new RegExp(`(?:^|[^-\\w])${token}\\s*:`, 'm').test(tokens)) {
        warnings.push(`${GLOBALS_CSS_FILE}: token obrigatório "${token}" não está declarado.`);
      }
    }
  }

  const mainPath = join(root, 'src/main.tsx');
  if (!existsSync(mainPath) || !readFileSync(mainPath, 'utf8').includes('./styles/globals.css')) {
    warnings.push('src/main.tsx: importe "./styles/globals.css" uma única vez.');
  }
}

function checkIcons(root, warnings) {
  const packagePath = join(root, 'package.json');
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    const dependencies = pkg.dependencies ?? {};
    if (!dependencies[ICON_LIBRARY]) {
      warnings.push(`package.json: "${ICON_LIBRARY}" deve estar em dependencies.`);
    }
    for (const forbidden of FORBIDDEN_ICON_PACKAGES) {
      if (dependencies[forbidden] || (pkg.devDependencies ?? {})[forbidden]) {
        warnings.push(
          `package.json: "${forbidden}" concorre com a biblioteca padrão "${ICON_LIBRARY}".`,
        );
      }
    }
  }

  const sourceRoot = join(root, 'src');
  for (const file of listFiles(sourceRoot, new Set(['.ts', '.tsx']))) {
    const label = normalized(relative(root, file));
    const content = readFileSync(file, 'utf8');
    for (const forbidden of FORBIDDEN_ICON_PACKAGES) {
      if (new RegExp(`from\\s+['"]${forbidden.replace(/[/@]/g, '\\$&')}`).test(content)) {
        warnings.push(`${label}: importe ícones de "${ICON_LIBRARY}", não de "${forbidden}".`);
      }
    }
  }
}

function checkKit(root, warnings) {
  const indexPath = join(root, 'src/shared/ui/index.ts');
  if (!existsSync(indexPath)) {
    warnings.push(`${indexPath}: ponto de entrada do kit de componentes ausente.`);
    return;
  }
  const index = readFileSync(indexPath, 'utf8');
  for (const component of REQUIRED_COMPONENTS) {
    if (!new RegExp(`\\b${component}\\b`).test(index)) {
      warnings.push(`src/shared/ui: o kit base perdeu o componente "${component}".`);
    }
  }
}

export function checkStyleguide(root = defaultRoot) {
  const warnings = [];
  checkTokens(root, warnings);
  checkIcons(root, warnings);
  checkKit(root, warnings);
  return warnings;
}

function main() {
  const rootFlag = process.argv.indexOf('--root');
  const root = rootFlag >= 0 ? resolve(process.argv[rootFlag + 1]) : defaultRoot;
  const strict = process.argv.includes('--strict');
  const warnings = checkStyleguide(root);

  if (warnings.length === 0) {
    console.log('Verificação do styleguide OK.');
    return;
  }

  const title = strict ? 'Verificação do styleguide FALHOU' : 'Avisos do styleguide';
  console[strict ? 'error' : 'warn'](`${title}:\n`);
  for (const warning of warnings) console[strict ? 'error' : 'warn'](`  - ${warning}`);
  if (strict) {
    process.exitCode = 1;
    return;
  }
  console.warn(
    `\n${warnings.length} aviso(s). Regras em docs/styleguide.md. Use --strict para falhar.`,
  );
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
