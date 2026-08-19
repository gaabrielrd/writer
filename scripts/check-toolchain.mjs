#!/usr/bin/env node

import { readFileSync, realpathSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, '..');

export function expectedNpmVersion(root = defaultRoot) {
  const packageJson = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
  const match = /^npm@(\d+\.\d+\.\d+)$/.exec(packageJson.packageManager ?? '');
  if (!match) throw new Error('packageManager deve usar o formato npm@x.y.z.');
  return match[1];
}

export function checkToolchain(root = defaultRoot, userAgent = process.env.npm_config_user_agent) {
  const expected = expectedNpmVersion(root);
  const actual = /^npm\/(\d+\.\d+\.\d+)/.exec(userAgent ?? '')?.[1];
  if (!actual) throw new Error('Execute esta verificação por `npm run check:toolchain`.');
  if (actual !== expected) {
    throw new Error(`Versão do npm divergente: esperado ${expected}, encontrado ${actual}.`);
  }
  return actual;
}

function main() {
  const version = checkToolchain();
  console.log(`Toolchain OK: npm ${version}.`);
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
