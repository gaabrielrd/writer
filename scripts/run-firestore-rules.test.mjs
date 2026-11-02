import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createConnection } from 'node:net';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  availablePort,
  shardRulesFiles,
  FIRESTORE_EMULATOR,
  processCompletion,
  sha256File,
  stopProcess,
  verifiedArtifact,
} from './run-firestore-rules.mjs';

const bytes = 'fixture for checksum tests';
const fixture = {
  url: 'https://storage.googleapis.com/example.jar',
  sha256: createHash('sha256').update(bytes).digest('hex'),
};

test('every rules workflow installs backend dependencies in the same job before testing', async () => {
  for (const name of ['firestore-rules', 'deploy-hosting', 'deploy-firestore']) {
    const source = await readFile(
      new URL(`../.github/workflows/${name}.yml`, import.meta.url),
      'utf8',
    );
    const jobs = source.slice(source.indexOf('\njobs:')).split(/\n {2}[\w-]+:\s*\n/);
    const rulesJobs = jobs.filter((job) => job.includes('npm run test:rules'));
    assert.ok(rulesJobs.length > 0, `${name}: missing rules gate`);
    for (const job of rulesJobs) {
      const installation = job.indexOf('npm ci --prefix functions');
      assert.ok(
        installation >= 0 && installation < job.indexOf('npm run test:rules'),
        `${name}: install functions dependencies before testing rules`,
      );
    }
  }
});

async function temporary(testFunction) {
  const path = await mkdtemp(join(tmpdir(), 'writer-rules-runner-'));
  try {
    await testFunction(path);
  } finally {
    await rm(path, { recursive: true, force: true });
  }
}

test('pins the official emulator artifact and uses a real SHA-256 digest', () => {
  assert.equal(FIRESTORE_EMULATOR.version, '1.22.0');
  assert.equal(new URL(FIRESTORE_EMULATOR.url).hostname, 'storage.googleapis.com');
  assert.match(FIRESTORE_EMULATOR.sha256, /^[a-f0-9]{64}$/);
});

test('downloads and verifies once, then reuses the cache entirely offline', async () =>
  temporary(async (directory) => {
    const destination = join(directory, 'emulator.jar');
    let downloads = 0;
    const download = async (url, options) => {
      downloads += 1;
      assert.equal(url, fixture.url);
      assert.equal(options.redirect, 'error');
      return new Response(bytes);
    };
    assert.equal(await verifiedArtifact(fixture, destination, download), destination);
    assert.equal(await readFile(destination, 'utf8'), bytes);
    assert.equal(await sha256File(destination), fixture.sha256);
    await verifiedArtifact(fixture, destination, () => {
      throw new Error('must remain offline');
    });
    assert.equal(downloads, 1);
  }));

test('rejects corrupted downloads and never leaves an executable cached artifact', async () =>
  temporary(async (directory) => {
    await assert.rejects(
      verifiedArtifact(
        fixture,
        join(directory, 'emulator.jar'),
        async () => new Response('corrupt'),
      ),
      /SHA-256/,
    );
    assert.deepEqual(await readdir(directory), []);
  }));

test('rejects corrupted existing cache without silently trusting or replacing it', async () =>
  temporary(async (directory) => {
    const destination = join(directory, 'emulator.jar');
    await writeFile(destination, 'corrupt');
    await assert.rejects(
      verifiedArtifact(fixture, destination, () => {
        throw new Error('must not download');
      }),
      /SHA-256 inválido/,
    );
    assert.equal(await readFile(destination, 'utf8'), 'corrupt');
  }));

test('rejects HTTP download errors and cleans partial files', async () =>
  temporary(async (directory) => {
    await assert.rejects(
      verifiedArtifact(
        fixture,
        join(directory, 'emulator.jar'),
        async () => new Response('', { status: 503 }),
      ),
      /HTTP 503/,
    );
    assert.deepEqual(await readdir(directory), []);
  }));

test('chooses an ephemeral loopback port', async () => {
  const port = await availablePort();
  assert.ok(Number.isInteger(port) && port > 0 && port < 65536);
});

test('shuts down a child process and observes its completion', async () => {
  const child = spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });
  const completion = processCompletion(child);
  await stopProcess(child, completion, 500);
  const result = await completion;
  if (process.platform === 'win32') assert.ok(Number.isInteger(result.code));
  else assert.equal(result.signal, 'SIGTERM');
  await stopProcess(child, completion);
  await stopProcess(undefined, undefined);
});

test('rules shards include every file exactly once and preserve their order', () => {
  const files = Array.from({ length: 148 }, (_, index) => `rules-${index}.test.mjs`);
  assert.deepEqual(shardRulesFiles(files), files);
  const partitions = Array.from({ length: 8 }, (_, index) =>
    shardRulesFiles(files, `${index + 1}/8`),
  );
  assert.equal(partitions.flat().length, files.length);
  assert.equal(new Set(partitions.flat()).size, files.length);
  assert.deepEqual(new Set(partitions.flat()), new Set(files));
  for (const part of partitions)
    assert.deepEqual(
      part,
      files.filter((file) => part.includes(file)),
    );
  assert.notEqual(shardRulesFiles(files), files);
});

test('invalid rules shards fail instead of silently skipping the suite', () => {
  for (const shard of ['0/8', '9/8', '1/0', '2', '1/17', '1.5/8', ''])
    assert.throws(() => shardRulesFiles(['test'], shard), /shard/);
});

test(
  'Windows cleanup releases a listening grandchild instead of leaving an orphan emulator',
  {
    skip: process.platform !== 'win32',
    timeout: 15000,
  },
  async () => {
    const serverCode = `require('node:net').createServer().listen(0, '127.0.0.1', function () { console.log(this.address().port); });`;
    const parentCode = `require('node:child_process').spawn(process.execPath, ['-e', ${JSON.stringify(serverCode)}], { stdio: ['ignore', 'inherit', 'ignore'] }); setInterval(() => {}, 1000);`;
    const child = spawn(process.execPath, ['-e', parentCode], {
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    const completion = processCompletion(child);
    const connect = (port) =>
      new Promise((resolve, reject) => {
        const socket = createConnection({ host: '127.0.0.1', port });
        socket.once('connect', () => {
          socket.destroy();
          resolve();
        });
        socket.once('error', reject);
      });
    try {
      const [ready] = await once(child.stdout, 'data');
      const port = Number(String(ready).trim());
      assert.ok(Number.isInteger(port) && port > 0);
      await connect(port);
      await stopProcess(child, completion, 500);
      await assert.rejects(connect(port), { code: 'ECONNREFUSED' });
    } finally {
      await stopProcess(child, completion, 500);
    }
  },
);
