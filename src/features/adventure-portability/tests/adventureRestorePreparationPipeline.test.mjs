// @vitest-environment node
import { beforeAll, it, expect } from 'vitest';
import { isDeepStrictEqual } from 'node:util';
import {
  transferFixture,
  upload,
} from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
import { emptyAdventureArchive } from '../../../../functions/test/helpers/adventureRestoreArchiveFixture.mjs';
import { createAdventureRestorePreparationDriver as create } from '../services/adventureRestorePreparationDriver.ts';
import { readAdventurePreparationProgress } from '../services/adventureRestorePreparationProgress.ts';
import {
  readAdventureRestorePreparationIntent,
  ADVENTURE_RESTORE_PREPARATION_COMMANDS,
} from '../services/adventureRestorePreparationContracts.ts';
let f, c, final, first, last, trace, journal, steps;
function memory(initial = null) {
  const j = {
    value: structuredClone(initial),
    async read() {
      return structuredClone(j.value);
    },
    async compareAndSet(old, next) {
      if (!isDeepStrictEqual(old, j.value)) return false;
      j.value = structuredClone(next);
      return true;
    },
  };
  return j;
}
const intentFor = (call) =>
  readAdventureRestorePreparationIntent(
    {
      schemaVersion: 1,
      ownerId: c.ownerId,
      restoreId: c.restoreId,
      adventureId: c.adventureId,
      jobToken: c.jobToken,
      action: call.action,
      operationId: call.input.operationId,
      expectedCheckpoint: call.input.expectedCheckpoint,
      limit: call.input.limit ?? null,
    },
    c,
  );
beforeAll(async () => {
  f = transferFixture(await emptyAdventureArchive());
  const p = await upload(f);
  const { keyId } = await f.api.getAdventureRestoreRecoveryKey(f.uid, {
    restoreId: p.restoreId,
    jobToken: p.jobToken,
    reviewHash: f.input.reviewHash,
  });
  c = {
    ownerId: f.uid,
    restoreId: p.restoreId,
    adventureId: p.adventureId,
    jobToken: p.jobToken,
    reviewHash: f.input.reviewHash,
    keyId,
  };
  trace = [];
  journal = memory();
  let n = 0;
  const api = {
    get: (input) => f.api.getAdventureRestore(f.uid, input),
    async advance(action, input) {
      const reply = await f.api[action](f.uid, input);
      const call = { action, input: structuredClone(input), reply: structuredClone(reply) };
      first ??= call;
      last = call;
      trace.push(call);
      return reply;
    },
  };
  const driver = create({
    context: c,
    api,
    journal,
    check: () => {},
    operationId: () => 'pipeline-prepare-' + String(++n).padStart(8, '0'),
  });
  for (steps = 0; steps < 5000; steps++) {
    const result = await driver.step();
    if (result.kind === 'paused') {
      expect(result.reason).toBe('review-required');
      final = await api.get({ restoreId: c.restoreId, jobToken: c.jobToken });
      break;
    }
  }
  expect(steps).toBeLessThan(5000);
});
it('real zero-image pipeline executes all preparation methods, audits twice and pauses privately', () => {
  expect([...new Set(trace.map((t) => t.action))].sort()).toEqual(
    [...ADVENTURE_RESTORE_PREPARATION_COMMANDS].sort(),
  );
  const audits = trace.filter((t) => t.reply.progress.staging?.phase === 'audit-ready');
  expect(audits).toHaveLength(2);
  expect(Object.hasOwn(audits[0].reply.progress.staging, 'libraryImages')).toBe(false);
  expect(audits[1].reply.progress.staging.libraryImages).toBe(0);
  expect(readAdventurePreparationProgress(final, c).staging.libraryIncluded).toBe(true);
  expect(final.state).toBe('content-verified');
  expect(f.records.get('adventures/' + c.adventureId)).not.toHaveProperty('ownerId');
  expect(journal.value).toBeNull();
});
it.each([
  { version: 2 },
  { phase: 'unknown' },
  { historyPending: true },
  { imagePending: true },
  { storagePending: true },
  { personaLibraryRevoked: true },
  { cleanedArtifacts: 1 },
  { libraryUses: 1 },
  { libraryImages: 1 },
  { privateText: 'NEVER_TRUST' },
])('malformed final public staging %j cannot be used to plan a command', (patch) => {
  expect(() =>
    readAdventurePreparationProgress({ ...final, staging: { ...final.staging, ...patch } }, c),
  ).toThrow();
});
it.each(['staging-counter', 'validation-summary', 'missing-staging'])(
  'same-checkpoint confirmation mismatch %s preserves the pending operation',
  async (kind) => {
    const reply = structuredClone(last.reply);
    if (kind === 'staging-counter') reply.receipt.staging.auditPhysical++;
    if (kind === 'validation-summary')
      reply.receipt.validation.summary.sourceAdventureId = 'another-source-adventure-0001';
    if (kind === 'missing-staging') delete reply.receipt.staging;
    const pending = intentFor(last),
      local = memory(pending),
      calls = [];
    const driver = create({
      context: c,
      journal: local,
      check: () => {},
      operationId: () => {
        throw Error('No new operation allowed');
      },
      api: {
        get: () => {
          throw Error('No replan allowed');
        },
        advance: async (action, input) => {
          calls.push({ action, input });
          return reply;
        },
      },
    });
    await expect(driver.step()).rejects.toThrow();
    expect(local.value).toEqual(pending);
    expect(calls).toHaveLength(1);
  },
);
it('a real historical receipt may return the current final progress and clear only its matching debt', async () => {
  const pending = intentFor(first),
    local = memory(pending),
    calls = [];
  const driver = create({
    context: c,
    journal: local,
    check: () => {},
    operationId: () => {
      throw Error('No new operation');
    },
    api: {
      get: () => {
        throw Error('No replan');
      },
      advance: async (action, input) => {
        calls.push({ action, input });
        return { ...structuredClone(first.reply), progress: structuredClone(final) };
      },
    },
  });
  const result = await driver.step();
  expect(result.progress.staging).toMatchObject({ phase: 'audit-ready', libraryIncluded: true });
  expect(result.progress.checkpoint).toBe(final.checkpoint);
  expect(local.value).toBeNull();
  expect(calls[0].input).toEqual(first.input);
});
it('projects native final metadata without source, summary or private extras', () => {
  const p = readAdventurePreparationProgress(
    { ...final, source: { private: 'PRIVATE_SOURCE' }, privateText: 'PRIVATE_TEXT' },
    c,
  );
  expect(p.validation).toBe('verified');
  expect(Object.isFrozen(p.staging)).toBe(true);
  expect(JSON.stringify(p)).not.toContain('PRIVATE');
  expect(p).not.toHaveProperty('source');
  expect(p.staging).not.toHaveProperty('auditContext');
  expect(p).not.toHaveProperty('activation');
});
