#!/usr/bin/env node
// Trava da anatomia de página (ADR 0275), executada por `npm run check:styleguide`.
//
// Regras, contadas por arquivo em src/ (sem testes):
//  1. `role="tablist"` só no componente `Tabs` de src/shared/ui.
//  2. `<Button variant="destructive|danger">` só em diálogos de confirmação.
//
// Funciona como catraca: `scripts/page-anatomy-baseline.json` guarda quantos usos
// cada arquivo tinha quando a regra entrou. Arquivo novo com uso, ou arquivo
// existente acima da linha de base, falha. Ao migrar um arquivo, reduza a contagem.
//
// Compatível com macOS, Linux e Windows: apenas APIs nativas do Node.

import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, '..');
export const BASELINE_FILE = 'scripts/page-anatomy-baseline.json';
const TABS_COMPONENT = 'src/shared/ui/Tabs.tsx';

function sourceFiles(directory) {
  if (!existsSync(directory)) return [];
  const files = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'tests' && entry.name !== 'test') files.push(...sourceFiles(path));
    } else if (/\.tsx$/.test(entry.name) && !/\.test\.tsx$/.test(entry.name)) files.push(path);
  }
  return files;
}

/** Counts per rule for one source text. */
export function countPatterns(source) {
  const tablists = (source.match(/role=["']tablist["']/g) ?? []).length;
  let destructiveButtons = 0;
  for (const match of source.matchAll(/variant=["'](destructive|danger)["']/g)) {
    const before = source.slice(0, match.index);
    const tag = [...before.matchAll(/<([A-Z][A-Za-z.]*)/g)].at(-1)?.[1];
    if (tag === 'Button') destructiveButtons += 1;
  }
  return { tablists, destructiveButtons };
}

export function measure(root = defaultRoot) {
  const counts = {};
  for (const path of sourceFiles(join(root, 'src'))) {
    const file = relative(root, path).split(sep).join('/');
    const found = countPatterns(readFileSync(path, 'utf8'));
    if (file === TABS_COMPONENT) found.tablists = 0;
    if (found.tablists || found.destructiveButtons) counts[file] = found;
  }
  return counts;
}

export function checkPageAnatomy(root = defaultRoot, baseline = null) {
  const allowed =
    baseline ??
    (existsSync(join(root, BASELINE_FILE))
      ? JSON.parse(readFileSync(join(root, BASELINE_FILE), 'utf8'))
      : {});
  const errors = [];
  const tightened = [];
  const current = measure(root);
  for (const [file, found] of Object.entries(current)) {
    const limit = allowed[file] ?? { tablists: 0, destructiveButtons: 0 };
    if (found.tablists > limit.tablists)
      errors.push(
        `${file}: ${found.tablists} role="tablist" (limite ${limit.tablists}). Use Tabs de @/shared/ui.`,
      );
    if (found.destructiveButtons > limit.destructiveButtons)
      errors.push(
        `${file}: ${found.destructiveButtons} botão(ões) destrutivo(s) (limite ${limit.destructiveButtons}). ` +
          'Exclusão fica no menu "…" e o vermelho só no diálogo de confirmação.',
      );
  }
  for (const [file, limit] of Object.entries(allowed)) {
    const found = current[file] ?? { tablists: 0, destructiveButtons: 0 };
    if (found.tablists < limit.tablists || found.destructiveButtons < limit.destructiveButtons)
      tightened.push(file);
  }
  return { errors, tightened };
}

function main() {
  const rootFlag = process.argv.indexOf('--root');
  const root = rootFlag >= 0 ? resolve(process.argv[rootFlag + 1]) : defaultRoot;
  if (process.argv.includes('--write-baseline')) {
    writeFileSync(join(root, BASELINE_FILE), JSON.stringify(measure(root), null, 2) + '\n');
    console.log(`Linha de base gravada em ${BASELINE_FILE}.`);
    return;
  }
  const { errors, tightened } = checkPageAnatomy(root);
  if (errors.length) {
    console.error('Anatomia de página FALHOU:\n');
    for (const error of errors) console.error(`  - ${error}`);
    console.error('\nRegras em docs/styleguide.md#anatomia-de-página.');
    process.exitCode = 1;
    return;
  }
  console.log('Anatomia de página OK.');
  if (tightened.length)
    console.log(
      `${tightened.length} arquivo(s) abaixo da linha de base; rode com --write-baseline para apertar a catraca.`,
    );
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) main();
