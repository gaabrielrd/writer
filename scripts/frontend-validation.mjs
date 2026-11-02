import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const rootPath = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const receiptPath = (root) => join(root, '.firebase', 'local-validation', 'frontend.json');
export const frontendPaths = [
  'src',
  'functions',
  'public',
  'index.html',
  'package.json',
  'package-lock.json',
  '.nvmrc',
  'tsconfig*.json',
  'vite*.ts',
  'vitest*.ts',
];
const relevant = (name) =>
  /^(src|functions|public)\//.test(name) ||
  /^(index\.html|package(?:-lock)?\.json|\.nvmrc|tsconfig.*\.json|vite.*\.ts|vitest.*\.ts)$/.test(
    name,
  );

export function frontendFingerprint(root) {
  const files = spawnSync('git', ['ls-files', '-c', '-o', '--exclude-standard', '-z'], {
    cwd: root,
    encoding: 'utf8',
  });
  if (files.status !== 0) throw new Error('Não foi possível identificar os arquivos da validação.');
  const hash = createHash('sha256');
  hash.update(
    JSON.stringify({
      root: resolve(root),
      node: process.version,
      platform: process.platform,
      arch: process.arch,
      nodeEnv: process.env.NODE_ENV ?? null,
      tz: process.env.TZ ?? null,
      ci: process.env.CI ?? null,
      options: process.env.NODE_OPTIONS ?? null,
      configEnv: Object.fromEntries(
        Object.entries(process.env)
          .filter(([key]) => /^(VITE_|WRITER_)/.test(key))
          .sort(([a], [b]) => a.localeCompare(b)),
      ),
    }),
  );
  for (const name of [...new Set(files.stdout.split('\0').filter(relevant))].sort()) {
    hash.update(name + '\0');
    if (!existsSync(join(root, name))) {
      hash.update('deleted\0');
      continue;
    }
    let bytes = readFileSync(join(root, name));
    if (name === 'package.json') {
      const pkg = JSON.parse(bytes);
      // Hook/documentation commands do not change the frontend tested by Vitest.
      bytes = Buffer.from(
        JSON.stringify(
          Object.fromEntries(
            [
              'type',
              'packageManager',
              'engines',
              'dependencies',
              'devDependencies',
              'peerDependencies',
              'optionalDependencies',
              'overrides',
            ].map((key) => [key, pkg[key]]),
          ),
        ),
      );
    }
    hash.update(String(bytes.length) + ':');
    hash.update(bytes);
  }
  for (const name of [
    '.env',
    '.env.local',
    '.env.test',
    '.env.test.local',
    'node_modules/.package-lock.json',
  ]) {
    hash.update(name + '\0');
    if (existsSync(join(root, name))) hash.update(readFileSync(join(root, name)));
  }
  return hash.digest('hex');
}

export function invalidateFrontendValidation(root) {
  rmSync(receiptPath(root), { force: true });
}
export function recordFrontendValidation(root, fingerprint) {
  if (frontendFingerprint(root) !== fingerprint) return false;
  mkdirSync(dirname(receiptPath(root)), { recursive: true });
  writeFileSync(
    receiptPath(root),
    JSON.stringify({
      version: 1,
      root: resolve(root),
      fingerprint,
      validatedAt: new Date().toISOString(),
      scope: 'full-frontend',
    }) + '\n',
  );
  return true;
}
export function hasFrontendValidation(root) {
  try {
    const receipt = JSON.parse(readFileSync(receiptPath(root), 'utf8'));
    if (
      receipt.version !== 1 ||
      receipt.root !== resolve(root) ||
      receipt.scope !== 'full-frontend'
    )
      return false;
    const dirty = spawnSync(
      'git',
      ['status', '--porcelain', '--untracked-files=all', '--', ...frontendPaths],
      {
        cwd: root,
        encoding: 'utf8',
      },
    );
    return (
      dirty.status === 0 &&
      !dirty.stdout.trim() &&
      receipt.fingerprint === frontendFingerprint(root)
    );
  } catch {
    return false;
  }
}

export function runValidatedFrontend(root, { run = spawnSync, args = [] } = {}) {
  invalidateFrontendValidation(root);
  const fingerprint = frontendFingerprint(root);
  const result = run(
    process.execPath,
    [
      join(root, 'node_modules/vitest/vitest.mjs'),
      'run',
      '--coverage',
      '--reporter=default',
      '--reporter=json',
      '--outputFile.json=coverage/results.json',
      ...args,
    ],
    { cwd: root, stdio: 'inherit' },
  );
  if (result.error) throw result.error;
  if (result.status === 0 && args.length === 0) {
    if (recordFrontendValidation(root, fingerprint))
      console.log('Validação local do frontend registrada para o pre-push.');
    else
      console.log('Arquivos mudaram durante os testes; o pre-push não reutilizará esta execução.');
  }
  return result.status ?? 1;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = runValidatedFrontend(rootPath, { args: process.argv.slice(2) });
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
