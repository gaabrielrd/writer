import test from 'node:test';
import assert from 'node:assert/strict';
import { studioDb } from './helpers/studioDb.mjs';
import { setup, id } from './helpers/literarySequenceFixtures.mjs';
import { target } from './helpers/literaryWorkflowFixtures.mjs';
import { createLiterarySequenceDriver } from '../src/literarySequenceDriver.mjs';
import { createLiteraryDraftService } from '../src/literaryDrafting.mjs';
import { createLiteraryReviewService } from '../src/literaryReview.mjs';
import { createLiteraryMilestoneService } from '../src/literaryMilestones.mjs';
import { createLiteraryIntegrationService } from '../src/literaryIntegration.mjs';
import { createLiteraryProseService } from '../src/literaryProse.mjs';
import { createLiteraryPublicationService } from '../src/literaryPublication.mjs';
const marker = 'books/book/literaryBackupControls/current';
for (const [name, create, method, key] of [
  ['draft', createLiteraryDraftService, 'cancelLiteraryDraft', 'jobId'],
  ['review', createLiteraryReviewService, 'cancelLiteraryReview', 'jobId'],
  ['milestone', createLiteraryMilestoneService, 'cancelLiteraryMilestone', 'jobId'],
  ['integration', createLiteraryIntegrationService, 'cancelLiteraryIntegration', 'jobId'],
  ['prose', createLiteraryProseService, 'cancelLiteraryProse', 'requestId'],
])
  test(
    name +
      ' cancellation creates a capture marker atomically and terminal replay leaves it unchanged',
    async () => {
      const f = studioDb(),
        root = {
          authorId: 'author',
          title: 'Livro',
          status: 'draft',
          updatedAt: 10,
          createdAt: 1,
          wordCount: 0,
        };
      f.records.set('books/book', root);
      f.records.set('users/author', { credits: 8 });
      const api = create({ db: f.db, now: () => 100 }),
        wire = { target, [key]: 'fence-cancel-native-0001' };
      assert.equal(f.records.has(marker), false);
      await api[method]('author', wire);
      const first = structuredClone(f.records.get(marker));
      assert.equal(first.schemaVersion, 1);
      assert.match(first.writeId, /^[a-f0-9-]{36}$/);
      await api[method]('author', wire);
      assert.deepEqual(f.records.get(marker), first);
      assert.deepEqual(f.records.get('books/book'), root);
      assert.equal(f.records.get('users/author').credits, 8);
      await assert.rejects(api[method]('other', wire));
      assert.deepEqual(f.records.get(marker), first);
    },
  );
test('sequence registration and linking the native child each invalidate the marker without an extra producer', async () => {
  const f = await setup();
  assert.equal(f.records.has(marker), false);
  await f.startSequence();
  const initial = structuredClone(f.records.get(marker));
  await f.getSequence();
  assert.deepEqual(f.records.get(marker), initial);
  await f.startFirst();
  assert.notEqual(f.records.get(marker).writeId, initial.writeId);
  assert.equal(f.calls.length, 0);
});
test('the serial driver records a busy/completed checkpoint and preserves its marker on exact replay', async () => {
  const f = await setup(),
    driver = createLiterarySequenceDriver({
      db: f.db,
      sequences: f.sequence,
      workflows: f.api,
      now: () => 700,
    });
  await driver.startLiterarySequence('author', f.input);
  const before = f.records.get(marker).writeId,
    { job } = await driver.getLiterarySequence('author', { target, jobId: id }),
    wire = {
      target,
      jobId: id,
      operationId: 'fence-sequence-step-0001',
      expectedRevision: job.revision,
      expectedOriginToken: job.originToken,
    };
  await driver.advanceLiterarySequence('author', wire);
  const after = structuredClone(f.records.get(marker));
  assert.notEqual(after.writeId, before);
  await driver.advanceLiterarySequence('author', wire);
  assert.deepEqual(f.records.get(marker), after);
});

test('publication cancellation uses its explicit checkpoint writer and terminal replay does not move the marker', async () => {
  const f = studioDb(),
    root = {
      authorId: 'author',
      title: 'Livro',
      status: 'draft',
      updatedAt: 10,
      createdAt: 1,
      wordCount: 0,
    };
  f.records.set('books/book', root);
  f.records.set('users/author', { credits: 8 });
  const api = createLiteraryPublicationService({ db: f.db, now: () => 100 }),
    wire = { target, jobId: 'fence-publication-0001' };
  await api.cancelLiteraryPublication('author', wire);
  const first = structuredClone(f.records.get(marker));
  assert.equal(first.schemaVersion, 1);
  await api.cancelLiteraryPublication('author', wire);
  assert.deepEqual(f.records.get(marker), first);
  assert.equal(f.records.get('books/book').title, root.title);
  assert.equal(f.records.get('books/book').wordCount, root.wordCount);
  assert.equal(f.records.get('users/author').credits, 8);
});
