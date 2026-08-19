#!/usr/bin/env node
// Verifica se o styleguide do template continua sendo respeitado.
//
// Executado dentro de `npm run validate`. Por padrão apenas AVISA (sai com
// código 0), para não bloquear quem está no meio de uma refatoração visual.
// Use `npm run check:styleguide -- --strict` (ou no CI) para transformar os
// avisos em falha.
//
// Regras verificadas:
//  1. O pacote `@vitru/styleguide` está instalado e expõe os tokens esperados.
//  2. `main.tsx` importa o CSS público e `index.html` declara o tema.
//  3. Nenhum CSS fora de `tokens.css` usa cor literal (hex, rgb, hsl ou nome
//     de cor CSS): componentes consomem `var(--token)`.
//  4. A única biblioteca de ícones é `lucide-react`, declarada em
//     `dependencies`.
//  5. O pacote continua expondo o kit base esperado pelo template.
//
// Compatível com macOS, Linux e Windows: apenas APIs nativas do Node.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { dirname, extname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, '..');

export const STYLEGUIDE_PACKAGE = '@vitru/styleguide';
export const TOKENS_FILE = 'node_modules/@vitru/styleguide/dist/tokens.css';
export const ICON_LIBRARY = 'lucide-react';
const LOCAL_DEPENDENCY_PROTOCOL = /^(?:file|link|workspace):/;

/** Tokens de tema obrigatórios: renomeá-los quebra os componentes do template. */
export const REQUIRED_THEME_TOKENS = [
  '--ink',
  '--ink-soft',
  '--paper',
  '--paper-2',
  '--line',
  '--accent',
  '--navy',
  '--navy-strong',
  '--danger',
  '--danger-line',
  '--success',
  '--field-bg',
  '--field-border',
  '--danger-bg',
  '--danger-bg-hover',
  '--week-today-bg',
  '--week-today-fill',
  '--on-accent',
  '--shadow',
  '--backdrop',
  '--bar-edge',
  '--event-ferias-bg',
  '--event-ferias-ink',
  '--event-viagem-bg',
  '--event-viagem-ink',
  '--event-evento-bg',
  '--event-evento-ink',
];

/** Escalas compartilhadas por qualquer tema. */
export const REQUIRED_SCALE_TOKENS = [
  '--font-display',
  '--font-sans',
  '--font-mono',
  '--text-md',
  '--space-4',
  '--radius-md',
  '--transition-base',
  '--icon-size',
];

/** Kit base esperado no contrato público do pacote. */
export const REQUIRED_COMPONENTS = [
  'Alert',
  'Badge',
  'Button',
  'Card',
  'Dialog',
  'EmptyState',
  'ErrorBoundary',
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

// Cores literais em CSS. Nomes de cor cobrem só os mais comuns: a intenção é
// pegar o descuido, não policiar o dicionário inteiro do CSS.
const COLOR_PATTERNS = [
  /#[0-9a-fA-F]{3,8}\b/,
  /\brgba?\(/,
  /\bhsla?\(/,
  /\b(?:oklch|oklab|lab|lch|color)\(/,
  /:\s*(?:white|black|red|blue|green|yellow|orange|purple|pink|gray|grey|silver|navy|teal|olive|maroon|lime|aqua|fuchsia)\b/,
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
  const tokensPath = join(root, TOKENS_FILE);
  if (!existsSync(tokensPath)) {
    warnings.push(`${TOKENS_FILE}: tokens do pacote ausentes; instale "${STYLEGUIDE_PACKAGE}".`);
  } else {
    const tokens = withoutComments(readFileSync(tokensPath, 'utf8'));
    for (const token of [...REQUIRED_THEME_TOKENS, ...REQUIRED_SCALE_TOKENS]) {
      if (!new RegExp(`(?:^|[^-\\w])${token}\\s*:`, 'm').test(tokens)) {
        warnings.push(`${TOKENS_FILE}: token obrigatório "${token}" não está declarado.`);
      }
    }
  }

  const mainPath = join(root, 'src/main.tsx');
  if (
    !existsSync(mainPath) ||
    !readFileSync(mainPath, 'utf8').includes('@vitru/styleguide/styles.css')
  ) {
    warnings.push('src/main.tsx: importe "@vitru/styleguide/styles.css" uma única vez.');
  }

  const indexPath = join(root, 'index.html');
  if (existsSync(indexPath) && !/<html[^>]*\sdata-theme=/.test(readFileSync(indexPath, 'utf8'))) {
    warnings.push('index.html: declare o tema no <html> (ex.: data-theme="vitru").');
  }
}

function checkCssLiterals(root, warnings) {
  const sourceRoot = join(root, 'src');
  for (const file of listFiles(sourceRoot, new Set(['.css']))) {
    const label = normalized(relative(root, file));
    if (label === TOKENS_FILE) continue;
    const lines = withoutComments(readFileSync(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      if (COLOR_PATTERNS.some((pattern) => pattern.test(line))) {
        warnings.push(
          `${label}:${index + 1}: cor literal fora de tokens.css; use var(--token). -> ${line.trim()}`,
        );
      }
    });
  }
}

function checkIcons(root, warnings) {
  const packagePath = join(root, 'package.json');
  if (existsSync(packagePath)) {
    const pkg = JSON.parse(readFileSync(packagePath, 'utf8'));
    const dependencies = pkg.dependencies ?? {};
    const styleguideVersion = dependencies[STYLEGUIDE_PACKAGE];
    if (!styleguideVersion) {
      warnings.push(`package.json: "${STYLEGUIDE_PACKAGE}" deve estar em dependencies.`);
    } else if (LOCAL_DEPENDENCY_PROTOCOL.test(styleguideVersion)) {
      warnings.push(
        `package.json: "${STYLEGUIDE_PACKAGE}" deve usar uma versão publicada no npm, não "${styleguideVersion}".`,
      );
    }
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
  const indexPath = join(root, 'node_modules/@vitru/styleguide/dist/index.d.ts');
  if (!existsSync(indexPath)) {
    warnings.push(`${indexPath}: declarações públicas do kit ausentes.`);
    return;
  }
  const index = readFileSync(indexPath, 'utf8');
  for (const component of REQUIRED_COMPONENTS) {
    if (!new RegExp(`\\b${component}\\b`).test(index)) {
      warnings.push(
        `${STYLEGUIDE_PACKAGE}: o kit base perdeu "${component}" (docs/styleguide.md).`,
      );
    }
  }
}

export function checkStyleguide(root = defaultRoot) {
  const warnings = [];
  checkTokens(root, warnings);
  checkCssLiterals(root, warnings);
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
