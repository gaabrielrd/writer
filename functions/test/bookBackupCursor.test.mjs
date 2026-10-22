import assert from 'node:assert/strict';
import { test } from 'node:test';
import { readBookPackageStep, inspectBookBackupPackage } from '../src/bookBackupPackage.mjs';
import { readBookBackupFrame } from '../src/bookBackupContainer.mjs';
import { fixture, source } from './helpers/bookContentFixture.mjs';
test('package cursor JSON resumes every frame with exact spans and the same frozen EOF report', async () => {
  const input = await source(fixture()),
    expected = await inspectBookBackupPackage(input);
  let cursor = null,
    report,
    records = 0;
  for (let i = 0; i < 100; i++) {
    const step = await readBookPackageStep(input, cursor);
    cursor = JSON.parse(JSON.stringify(step.cursor));
    if (step.event?.type === 'record') {
      records++;
      assert.deepEqual(
        new Uint8Array(await input.read(step.span.offset, step.span.length)),
        step.event.record.payload,
      );
    }
    if (step.report) {
      report = step.report;
      break;
    }
  }
  assert.ok(records > 10);
  assert.deepEqual(report, expected);
  assert.equal(cursor.done, true);
  assert.equal(Object.isFrozen(report.manifest.sections), true);
});
test('cursor schema, chain, size and section count corruption fail before returning a trusted report', async () => {
  const input = await source(fixture()),
    first = await readBookPackageStep(input);
  await assert.rejects(readBookBackupFrame(input, Object.assign([], first.cursor.container)));
  for (const change of [
    (s) => {
      s.schemaVersion = 2;
    },
    (s) => {
      s.extra = true;
    },
    (s) => {
      s.container.offset = -1;
    },
    (s) => {
      s.container.previous = '0'.repeat(64);
    },
    (s) => {
      s.container.size++;
    },
    (s) => {
      s.counts.structure.records++;
    },
  ]) {
    const value = structuredClone(first.cursor);
    change(value);
    await assert.rejects(readBookPackageStep(input, value));
  }
});
test('a caller cannot mutate the cursor while the next read is suspended', async () => {
  const input = await source(fixture()),
    first = await readBookPackageStep(input),
    cursor = structuredClone(first.cursor);
  let release, entered;
  const gate = new Promise((resolve) => {
      release = resolve;
    }),
    started = new Promise((resolve) => {
      entered = resolve;
    });
  const pending = readBookPackageStep(
    {
      ...input,
      read: async (...args) => {
        entered();
        await gate;
        return input.read(...args);
      },
    },
    cursor,
  );
  await started;
  cursor.manifest.bookId = 'changed';
  cursor.container.previous = '0'.repeat(64);
  release();
  const result = await pending;
  assert.equal(result.event.record.kind, 'book-metadata');
  assert.equal(result.cursor.manifest.bookId, 'book');
});
test('aborting a step produces no new cursor or verified report', async () => {
  const input = await source(fixture()),
    controller = new AbortController();
  await assert.rejects(
    readBookBackupFrame(
      {
        ...input,
        read: async (...args) => {
          const bytes = await input.read(...args);
          controller.abort();
          return bytes;
        },
      },
      null,
      { signal: controller.signal },
    ),
    { name: 'AbortError' },
  );
});
