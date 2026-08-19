#!/usr/bin/env node

import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, join, normalize, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const defaultRoot = resolve(scriptDir, '..');

function assetPaths(html) {
  return [...html.matchAll(/(?:src|href)=["']([^"']+)["']/g)]
    .map((match) => match[1])
    .filter((path) => !/^(?:https?:|data:|#)/.test(path));
}

export async function smokeBuild(root = defaultRoot) {
  const dist = join(root, 'dist');
  const index = join(dist, 'index.html');
  if (!existsSync(index)) throw new Error('dist/index.html não foi gerado.');
  const html = readFileSync(index, 'utf8');
  const assets = assetPaths(html);
  for (const asset of assets) {
    const path = join(dist, asset.replace(/^\.?\//, ''));
    if (!existsSync(path)) throw new Error(`Asset referenciado não existe: ${asset}`);
  }

  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url ?? '/', 'http://localhost').pathname);
    const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
    const file = normalize(join(dist, requested));
    if (relative(dist, file).startsWith('..') || !existsSync(file)) {
      response.writeHead(404).end();
      return;
    }
    response.writeHead(200).end(readFileSync(file));
  });

  await new Promise((resolveListen, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolveListen);
  });
  try {
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('Servidor de smoke inválido.');
    for (const path of ['/', ...assets]) {
      const response = await fetch(
        `http://127.0.0.1:${address.port}/${path.replace(/^\.?\//, '')}`,
      );
      if (!response.ok) throw new Error(`Smoke HTTP falhou para ${path}: ${response.status}.`);
    }
  } finally {
    await new Promise((resolveClose) => server.close(resolveClose));
  }
}

async function main() {
  await smokeBuild();
  console.log('Smoke test do bundle OK.');
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
