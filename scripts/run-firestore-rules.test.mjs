import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import {
  availablePort,
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
  assert.equal(result.signal, 'SIGTERM');
  await stopProcess(child, completion);
  await stopProcess(undefined, undefined);
});
