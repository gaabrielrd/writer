import test, { before, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile, mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment } from '@firebase/rules-unit-testing';
import {
  bookLoreWriteRecoveryFixture,
  recoveryControl,
} from '../../functions/test/helpers/bookLoreWriteRecoveryFixture.mjs';
import { createBookLoreRecoveryAuditService } from '../../functions/src/bookLoreRecoveryAudit.mjs';
import { recoveryKeyInventoryRef } from '../../functions/src/bookLoreWriteRecoveryInventory.mjs';
const requireFunctions = createRequire(new URL('../../functions/package.json', import.meta.url)),
  { Firestore, FieldValue } = requireFunctions('firebase-admin/firestore'),
  projectId = 'demo-writer-key-audit';
let admin, env;
before(async () => {
  const address = process.env.FIRESTORE_EMULATOR_HOST;
  if (!/^127[.]0[.]0[.]1:[0-9]+$/.test(address ?? ''))
    throw Error('Dedicated demo loopback emulator required');
  const [host, port] = address.split(':');
  env = await initializeTestEnvironment({
    projectId,
    firestore: {
      host,
      port: Number(port),
      rules: await readFile(new URL('../../firestore.rules', import.meta.url), 'utf8'),
    },
  });
  admin = new Firestore({ projectId, host: address, ssl: false, universeDomain: 'googleapis.com' });
});
beforeEach(async () => env.clearFirestore());
after(async () => {
  await admin?.terminate();
  await env?.cleanup();
});
async function fixture() {
  const f = await bookLoreWriteRecoveryFixture(admin, { mode: 'inline' }),
    p = await f.service.reserveBookLoreEditRecovery(f.uid, f.intent),
    index = recoveryKeyInventoryRef(f.c, f.bookId);
  await admin.runTransaction(async (tx) => {
    tx.delete(admin.doc('books/book'));
    tx.create(admin.doc('deletedBooks/book'), { deletedAt: FieldValue.serverTimestamp() });
  });
  return { ...f, p, index, audit: createBookLoreRecoveryAuditService({ db: admin }) };
}
const candidate = async (f) => (await f.audit.auditBookLoreRecoveryKeys(f.uid)).items[0];
test('SDK historical audit accepts a legacy Timestamp, is read-only and revokes only the original key atomically', async () => {
  const f = await fixture(),
    key = await f.c.key.get(),
    row = await candidate(f);
  assert.equal(row.status, 'eligible');
  assert.equal((await f.c.key.get()).updateTime.isEqual(key.updateTime), true);
  const results = await Promise.all([
    f.audit.revokeAuditedBookLoreRecovery(f.uid, row.control),
    f.audit.revokeAuditedBookLoreRecovery(f.uid, row.control),
  ]);
  assert.deepEqual(results.map((r) => r.status).sort(), ['already-revoked', 'revoked']);
  const terminal = await f.c.closed.get(),
    proof = await f.c.closedProof.get();
  assert.equal(terminal.createTime.isEqual(proof.createTime), true);
  assert.equal((await f.c.key.get()).exists, false);
  assert.equal((await f.index.get()).exists, false);
  assert.equal((await admin.doc('books/book').get()).exists, false);
  assert.equal((await admin.doc('books/book/lore/' + f.intent.loreId).get()).exists, true);
  assert.equal(
    (await f.service.getBookLoreEditRecovery(f.uid, recoveryControl(f.p))).jobToken,
    f.p.jobToken,
  );
});
test('SDK a changed deletion marker or recreated book invalidates the reviewed historical capability', async () => {
  const f = await fixture(),
    row = await candidate(f);
  await admin.doc('deletedBooks/book').update({ deletedAt: FieldValue.serverTimestamp() });
  await assert.rejects(f.audit.revokeAuditedBookLoreRecovery(f.uid, row.control));
  const fresh = await candidate(f);
  assert.equal(fresh.status, 'eligible');
  await admin.doc('books/book').create({ authorId: 'author', title: 'Recreated' });
  const before = await f.c.key.get();
  await assert.rejects(f.audit.revokeAuditedBookLoreRecovery(f.uid, fresh.control));
  assert.equal((await candidate(f)).status, 'book-present');
  assert.equal((await f.c.key.get()).updateTime.isEqual(before.updateTime), true);
  assert.equal((await f.index.get()).exists, true);
});
test('SDK failure of the last index delete rolls back terminal and key, and explicit retry can finish', async () => {
  const f = await fixture(),
    row = await candidate(f),
    key = await f.c.key.get();
  const db = {
    doc: admin.doc.bind(admin),
    collection: admin.collection.bind(admin),
    runTransaction: (callback) =>
      admin.runTransaction((tx) =>
        callback(
          new Proxy(tx, {
            get(target, name) {
              const method = target[name];
              if (typeof method !== 'function') return method;
              return (...args) => {
                if (name === 'delete' && args[0]?.path === f.index.path) {
                  target.update(admin.doc(f.c.path + '/rollback/missing'), { fail: true });
                  return target;
                }
                return method.apply(target, args);
              };
            },
          }),
        ),
      ),
  };
  await assert.rejects(
    createBookLoreRecoveryAuditService({ db }).revokeAuditedBookLoreRecovery(f.uid, row.control),
  );
  assert.equal((await f.c.key.get()).updateTime.isEqual(key.updateTime), true);
  assert.equal((await f.c.closed.get()).exists, false);
  assert.equal((await f.index.get()).exists, true);
  assert.equal((await f.audit.revokeAuditedBookLoreRecovery(f.uid, row.control)).status, 'revoked');
});

test('SDK actual administrative CLI writes a dry-run report and applies its reviewed file on the loopback emulator', async () => {
  const f = await fixture(),
    script = fileURLToPath(
      new URL('../../functions/scripts/audit-book-lore-recovery.mjs', import.meta.url),
    ),
    args = [script, '--project', projectId, '--uid', f.uid],
    run = (more) =>
      spawnSync(process.execPath, [...args, ...more], {
        encoding: 'utf8',
        windowsHide: true,
        timeout: 20000,
        env: { ...process.env },
      }),
    dry = run([]);
  assert.equal(dry.status, 0, dry.stderr);
  const report = JSON.parse(dry.stdout);
  assert.equal(report.items[0].status, 'eligible');
  assert.equal((await f.c.key.get()).exists, true);
  const directory = await mkdtemp(join(tmpdir(), 'writer-sdk-key-review-')),
    path = join(directory, 'review.json');
  try {
    await writeFile(path, JSON.stringify(report), 'utf8');
    const result = run(['--apply', path]);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(JSON.parse(result.stdout).results[0].status, 'revoked');
    assert.equal((await f.c.key.get()).exists, false);
    assert.equal((await f.index.get()).exists, false);
  } finally {
    await rm(path, { force: true });
    await rmdir(directory);
  }
});
