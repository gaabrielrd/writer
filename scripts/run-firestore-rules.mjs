#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, open, readFile, readdir, rename, rm, stat } from 'node:fs/promises';
import { createConnection, createServer } from 'node:net';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { fileURLToPath } from 'node:url';

// Official Firebase CLI 15.33.0 downloadableEmulatorInfo.json identifies this
// Google-hosted artifact. SHA-256 pins the exact verified 1.22.0 JAR bytes.
export const FIRESTORE_EMULATOR = Object.freeze({
  version: '1.22.0',
  url: 'https://storage.googleapis.com/firebase-preview-drop/emulator/cloud-firestore-emulator-v1.22.0.jar',
  sha256: '9b6498b7f62714d67f48f59b3818883cd682dbcd46b9f59511de81c97bb5166c',
});
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const host = '127.0.0.1';
const delay = (ms) => new Promise((done) => setTimeout(done, ms));

export async function sha256File(path) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest('hex');
}

/** Downloads once, verifies before execution, and supports a verified offline cache. */
export async function verifiedArtifact(artifact, destination, download = fetch) {
  const cached = await stat(destination).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
    return null;
  });
  if (cached) {
    if ((await sha256File(destination)) !== artifact.sha256) {
      throw new Error(
        `Checksum SHA-256 inválido no cache: ${destination}. Remova o arquivo e tente novamente.`,
      );
    }
    return destination;
  }
  await mkdir(dirname(destination), { recursive: true });
  const temporary = `${destination}.${randomUUID()}.partial`;
  try {
    const response = await download(artifact.url, {
      redirect: 'error',
      signal: AbortSignal.timeout(120_000),
    });
    if (!response.ok || !response.body)
      throw new Error(`Download do emulador falhou: HTTP ${response.status}.`);
    await pipeline(Readable.fromWeb(response.body), createWriteStream(temporary, { flags: 'wx' }));
    if ((await sha256File(temporary)) !== artifact.sha256) {
      throw new Error('Checksum SHA-256 do emulador não confere; o arquivo não será executado.');
    }
    await rename(temporary, destination);
    return destination;
  } finally {
    await rm(temporary, { force: true });
  }
}

export async function availablePort() {
  const server = createServer();
  await new Promise((done, reject) => {
    server.once('error', reject);
    server.listen(0, host, done);
  });
  const address = server.address();
  await new Promise((done, reject) => server.close((error) => (error ? reject(error) : done())));
  if (!address || typeof address === 'string')
    throw new Error('Não foi possível reservar a porta local.');
  return address.port;
}

export function processCompletion(child) {
  return new Promise((done) => {
    child.once('error', (error) => done({ code: 1, error }));
    child.once('exit', (code, signal) => done({ code: code ?? 1, signal }));
  });
}

export async function stopProcess(child, completion, timeoutMs = 5000) {
  if (!child || !child.pid || child.exitCode !== null || child.signalCode !== null) return;
  child.kill('SIGTERM');
  let timer;
  await Promise.race([
    completion,
    new Promise((done) => {
      timer = setTimeout(done, timeoutMs);
    }),
  ]);
  clearTimeout(timer);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill('SIGKILL');
    await completion;
  }
}

async function waitUntilListening(port, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!child.pid || child.exitCode !== null || child.signalCode !== null)
      throw new Error('O emulador encerrou antes de iniciar.');
    const connected = await new Promise((done) => {
      const socket = createConnection({ host, port });
      socket.setTimeout(500);
      socket.once('connect', () => {
        socket.destroy();
        done(true);
      });
      socket.once('error', () => {
        socket.destroy();
        done(false);
      });
      socket.once('timeout', () => {
        socket.destroy();
        done(false);
      });
    });
    if (connected) return;
    await delay(100);
  }
  throw new Error('O emulador não iniciou em 30 segundos. Verifique o Java 21.');
}

export async function runFirestoreRules() {
  const cache = resolve(process.env.WRITER_FIRESTORE_CACHE ?? join(root, '.firebase', 'emulators'));
  const jar = await verifiedArtifact(
    FIRESTORE_EMULATOR,
    join(cache, `cloud-firestore-emulator-v${FIRESTORE_EMULATOR.version}.jar`),
  );
  const port = await availablePort();
  const logPath = join(cache, 'firestore-emulator.log');
  const log = await open(logPath, 'w');
  const emulator = spawn(
    'java',
    [
      '-jar',
      jar,
      '--host',
      host,
      '--port',
      String(port),
      '--websocket_port',
      '0',
      '--project_id',
      'demo-writer-rules',
      '--single_project_mode',
      'false',
    ],
    {
      cwd: root,
      stdio: ['ignore', log.fd, log.fd],
    },
  );
  const emulatorDone = processCompletion(emulator);
  let tests;
  let testsDone;
  let timeout;
  let interrupted = false;
  const interrupt = () => {
    interrupted = true;
    tests?.kill('SIGTERM');
    emulator.kill('SIGTERM');
  };
  process.once('SIGINT', interrupt);
  process.once('SIGTERM', interrupt);
  try {
    await Promise.race([
      waitUntilListening(port, emulator),
      emulatorDone.then((result) => {
        throw result.error ?? new Error('O emulador encerrou antes de iniciar.');
      }),
    ]);
    const files = (await readdir(join(root, 'tests', 'firestore')))
      .filter((name) => name.endsWith('.rules.test.mjs'))
      .sort()
      .map((name) => join(root, 'tests', 'firestore', name));
    if (files.length === 0) throw new Error('Nenhum teste de regras encontrado.');
    console.log(
      `Firestore ${FIRESTORE_EMULATOR.version} em ${host}:${port} (somente emulador demo).`,
    );
    tests = spawn(process.execPath, ['--test', ...files], {
      cwd: root,
      stdio: 'inherit',
      env: {
        ...process.env,
        FIRESTORE_EMULATOR_HOST: `${host}:${port}`,
        GCLOUD_PROJECT: 'demo-writer-rules',
      },
    });
    testsDone = processCompletion(tests);
    const result = await Promise.race([
      testsDone,
      emulatorDone.then((outcome) => {
        throw outcome.error ?? new Error('O emulador encerrou durante os testes.');
      }),
      new Promise((_, reject) => {
        timeout = setTimeout(
          () => reject(new Error('Os testes de regras excederam cinco minutos.')),
          300_000,
        );
      }),
    ]);
    if (result.error) throw result.error;
    return interrupted ? 130 : result.code;
  } catch (error) {
    const output = await readFile(logPath, 'utf8').catch(() => 'Sem log do emulador.');
    console.error(output.slice(-6000));
    throw error;
  } finally {
    clearTimeout(timeout);
    await stopProcess(tests, testsDone);
    await stopProcess(emulator, emulatorDone);
    await log.close();
    process.removeListener('SIGINT', interrupt);
    process.removeListener('SIGTERM', interrupt);
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  runFirestoreRules()
    .then((code) => {
      process.exitCode = code;
    })
    .catch((error) => {
      console.error(error instanceof Error ? error.message : error);
      process.exitCode = 1;
    });
}
