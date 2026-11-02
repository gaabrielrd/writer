import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { adventureImportDb } from './helpers/adventureImportDb.mjs';
import { bookLoreWriteRecoveryFixture } from './helpers/bookLoreWriteRecoveryFixture.mjs';
import { createBookLoreRecoveryAuditService } from '../src/bookLoreRecoveryAudit.mjs';
import {
  runHistoricalRecoveryAudit,
  parseAuditArguments,
} from '../scripts/audit-book-lore-recovery.mjs';
async function fixture({ multiple = false } = {}) {
  const d = adventureImportDb({ nativeUpdates: true }),
    s = await bookLoreWriteRecoveryFixture(d.db);
  await s.service.reserveBookLoreEditRecovery(s.uid, s.intent);
  if (multiple)
    await s.service.reserveBookLoreEditRecovery(s.uid, { ...s.intent, writeId: 'another-draft' });
  await d.db.runTransaction((tx) => {
    tx.delete(d.db.doc('books/book'));
    tx.create(d.db.doc('deletedBooks/book'), { deletedAt: 10000 });
  });
  const args = ['--project', 'demo-writer-audit', '--uid', 'author'],
    report = {
      projectId: 'demo-writer-audit',
      ...(await createBookLoreRecoveryAuditService({ db: d.db }).auditBookLoreRecoveryKeys(
        'author',
      )),
    };
  return { ...d, ...s, args, report };
}
test('CLI defaults to a read-only report with explicit project and UID, then closes its client', async () => {
  const f = await fixture(),
    before = structuredClone([...f.records]);
  let opened = 0,
    terminated = 0;
  f.db.terminate = async () => {
    terminated++;
  };
  const result = await runHistoricalRecoveryAudit(f.args, {
    createDb: async (project) => {
      assert.equal(project, 'demo-writer-audit');
      opened++;
      return f.db;
    },
    readReview: async () => assert.fail('dry run cannot read an apply file'),
  });
  assert.equal(result.exitCode, 0);
  assert.equal(result.report.items[0].status, 'eligible');
  assert.deepEqual([...f.records], before);
  assert.equal(opened, 1);
  assert.equal(terminated, 1);
});
for (const args of [
  [],
  ['--project', 'demo-writer-audit'],
  ['--project', 'demo-writer-audit', '--uid', 'bad/uid'],
  ['--project', 'demo-writer-audit', '--uid', 'author', '--unknown', 'yes'],
  ['--project', 'demo-writer-audit', '--uid', 'author', '--uid', 'other'],
  ['--project', 'demo-writer-audit', '--uid', 'author', '--limit', '0'],
  ['--project', 'demo-writer-audit', '--uid', 'author', '--limit', '51'],
  ['--project', 'demo-writer-audit', '--uid', 'author', '--limit', '1x'],
  ['--project', 'demo-writer-audit', '--uid', 'author', '--apply'],
  ['--project', 'demo-writer-audit', '--uid', 'author', '--apply', 'review.json', '--limit', '2'],
])
  test(
    'invalid CLI scope/flags fail before SDK initialization: ' + JSON.stringify(args),
    async () => {
      let calls = 0;
      await assert.rejects(
        runHistoricalRecoveryAudit(args, {
          createDb: async () => {
            calls++;
            throw Error('must not initialize');
          },
        }),
      );
      assert.equal(calls, 0);
    },
  );
test('CLI applies only a reviewed report for the original scope and supports idempotent rerun', async () => {
  const f = await fixture(),
    deps = { createDb: async () => f.db, readReview: async () => structuredClone(f.report) },
    args = [...f.args, '--apply', 'review.json'];
  assert.equal((await runHistoricalRecoveryAudit(args, deps)).report.results[0].status, 'revoked');
  assert.equal(f.records.has(f.c.key.path), false);
  assert.equal(
    (await runHistoricalRecoveryAudit(args, deps)).report.results[0].status,
    'already-revoked',
  );
});
for (const mutation of [
  (r) => {
    r.projectId = 'another-project';
  },
  (r) => {
    r.uid = 'other';
  },
  (r) => {
    r.force = true;
  },
  (r) => {
    r.items.push(structuredClone(r.items[0]));
  },
  (r) => {
    r.items[0].control.writeId = 'different';
  },
  (r) => {
    r.items[0].control.force = true;
  },
])
  test('invalid review is rejected before any SDK is created: ' + mutation.toString(), async () => {
    const f = await fixture(),
      report = structuredClone(f.report);
    mutation(report);
    let opened = 0;
    await assert.rejects(
      runHistoricalRecoveryAudit([...f.args, '--apply', 'review.json'], {
        createDb: async () => {
          opened++;
          return f.db;
        },
        readReview: async () => report,
      }),
    );
    assert.equal(opened, 0);
    assert.equal(f.records.has(f.c.key.path), true);
  });
test('partial failure reports confirmed work, sanitizes diagnostics and can resume the original review', async () => {
  const f = await fixture({ multiple: true }),
    run = f.db.runTransaction.bind(f.db);
  let calls = 0;
  f.db.runTransaction = (fn) => {
    if (++calls === 2)
      return Promise.reject(
        Object.assign(Error('private-key-and-diagnostic'), { code: 'unavailable' }),
      );
    return run(fn);
  };
  const deps = { createDb: async () => f.db, readReview: async () => structuredClone(f.report) },
    args = [...f.args, '--apply', 'review.json'],
    result = await runHistoricalRecoveryAudit(args, deps);
  assert.equal(result.exitCode, 1);
  assert.deepEqual(
    result.report.results.map((r) => r.status),
    ['revoked', 'failed'],
  );
  assert.equal(result.report.results[1].code, 'unavailable');
  assert.equal(JSON.stringify(result.report).includes('private-key-and-diagnostic'), false);
  f.db.runTransaction = run;
  assert.deepEqual(
    (await runHistoricalRecoveryAudit(args, deps)).report.results.map((r) => r.status),
    ['already-revoked', 'revoked'],
  );
});
test('large or malformed review files are rejected before credentials or SDK access', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'writer-key-review-'));
  try {
    for (const text of [' '.repeat(1_048_577), 'not JSON']) {
      const path = join(directory, 'review.json');
      await writeFile(path, text);
      let opened = 0;
      await assert.rejects(
        runHistoricalRecoveryAudit(
          ['--project', 'demo-writer-audit', '--uid', 'author', '--apply', path],
          {
            createDb: async () => {
              opened++;
              throw Error('no SDK');
            },
          },
        ),
      );
      assert.equal(opened, 0);
    }
  } finally {
    await rm(join(directory, 'review.json'), { force: true });
    await rmdir(directory);
  }
});
test('pagination arguments are parsed literally without a project default', () => {
  assert.deepEqual(
    parseAuditArguments([
      '--project',
      'demo-writer-audit',
      '--uid',
      'author',
      '--limit',
      '2',
      '--after',
      'original',
    ]),
    {
      projectId: 'demo-writer-audit',
      uid: 'author',
      apply: null,
      limit: 2,
      after: 'original',
    },
  );
});

test('a real UTF8 review with BOM is read within the byte limit and can apply its exact control', async () => {
  const f = await fixture(),
    directory = await mkdtemp(join(tmpdir(), 'writer-key-bom-')),
    path = join(directory, 'review.json');
  try {
    await writeFile(
      path,
      Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(JSON.stringify(f.report))]),
    );
    const result = await runHistoricalRecoveryAudit([...f.args, '--apply', path], {
      createDb: async () => f.db,
    });
    assert.equal(result.exitCode, 0);
    assert.equal(result.report.results[0].status, 'revoked');
  } finally {
    await rm(path, { force: true });
    await rmdir(directory);
  }
});
