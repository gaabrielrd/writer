import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import * as store from '../services/literaryImpactStorage';
import type { ImpactResolve } from '../model/impact';
import { impactStart, impactFrame, impactHash, impactLocks } from './impactFixtures';
beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal('navigator', { locks: impactLocks() });
});
afterEach(() => vi.unstubAllGlobals());
async function adopted() {
  return store.adoptImpactJournal('author', 'book', impactFrame);
}
const advance = () => ({
  target: impactStart.target,
  jobId: impactStart.jobId,
  operationId: 'impact-step-000001',
  expectedOriginToken: impactFrame.originToken,
  expectedRevision: 1,
  requestHash: impactHash,
});
it('reserves the immutable start before HTTP, scoped to the actor and book, without result or labels', async () => {
  const value = await store.reserveImpactJournal('author', impactStart);
  expect(value.pending?.kind).toBe('start');
  expect(value.originToken).toBeNull();
  expect(store.readImpactJournal('author', 'book')).toEqual(value);
  expect(store.readImpactJournal('other', 'book')).toBeNull();
  expect(store.readImpactJournal('author', 'other')).toBeNull();
  await expect(store.reserveImpactJournal('author', impactStart)).rejects.toThrow(
    /Consulte ou encerre/,
  );
  expect(Object.keys(value).sort()).toEqual(
    [
      'version',
      'actorId',
      'bookId',
      'sessionId',
      'jobId',
      'bookToken',
      'originToken',
      'start',
      'pending',
      'cancelRequested',
      'cancel',
      'revision',
    ].sort(),
  );
});
it('closes the entire original CAS and rejects an ACK against another native origin', async () => {
  const first = await store.reserveImpactJournal('author', impactStart);
  const acknowledged = await store.acknowledgeImpactOperation(first, impactFrame);
  const pending = await store.stageImpactOperation(acknowledged, {
    kind: 'advance',
    closeRequested: false,
    wire: advance(),
  });
  await expect(
    store.acknowledgeImpactOperation(pending, { ...impactFrame, originToken: 'f'.repeat(64) }),
  ).rejects.toThrow(/confirmação/);
  await expect(store.acknowledgeImpactOperation(first, impactFrame)).rejects.toThrow(
    /outra janela/,
  );
  expect(store.readImpactJournal('author', 'book')).toEqual(pending);
});
it('projects a resolution to closed correlation metadata and never stores its private text', async () => {
  const first = await adopted();
  const wire: ImpactResolve = {
    ...advance(),
    checkId: 'check',
    observationToken: 'f'.repeat(64),
    expectedDecisionRevision: 0,
    status: 'reviewed',
    rationale: 'PRIVATE RATIONALE',
    evidence: [{ note: 'PRIVATE EVIDENCE' }],
  };
  const pending = store.impactResolutionPending(wire);
  const saved = await store.stageImpactOperation(first, pending);
  expect(JSON.stringify(saved)).not.toContain('PRIVATE');
  const raw = localStorage.getItem(localStorage.key(0)!)!;
  expect(raw).not.toMatch(/rationale|evidence|status|labels/);
  await expect(
    store.stageImpactOperation(saved, {
      kind: 'advance',
      closeRequested: false,
      wire: { ...advance(), operationId: 'other-operation' },
    }),
  ).rejects.toThrow(/Reconcilie/);
});
it('a permanent operation-close intention prevents a late ACK from clearing the debt', async () => {
  const pending = await store.stageImpactOperation(await adopted(), {
    kind: 'advance',
    closeRequested: false,
    wire: advance(),
  });
  const closing = await store.requestImpactOperationClose(pending);
  await expect(store.acknowledgeImpactOperation(pending, impactFrame)).rejects.toThrow(
    /outra janela/,
  );
  await expect(store.acknowledgeImpactOperation(closing, impactFrame)).rejects.toThrow(
    /confirmação/,
  );
  await expect(store.confirmImpactOperationClose(closing, 'f'.repeat(64))).rejects.toThrow(
    /encerramento/,
  );
  const settled = await store.confirmImpactOperationClose(closing, impactFrame.originToken);
  expect(settled.pending).toBeNull();
  expect(settled.jobId).toBe(impactFrame.jobId);
});
it('whole-map cancellation is monotonic and can settle pending requests only after original server proof', async () => {
  const first = await store.reserveImpactJournal('author', impactStart);
  const cancel = {
    target: impactStart.target,
    jobId: impactStart.jobId,
    operationId: 'cancel-original',
    start: impactStart,
    requestHash: impactHash,
  };
  const closing = await store.requestImpactCancellation(first, cancel);
  await expect(store.acknowledgeImpactOperation(first, impactFrame)).rejects.toThrow(
    /outra janela/,
  );
  await expect(
    store.requestImpactCancellation(closing, { ...cancel, operationId: 'new-cancel' }),
  ).rejects.toThrow(/original/);
  await expect(
    store.confirmImpactCancellation(closing, {
      jobId: impactFrame.jobId,
      phase: 'done',
      originToken: null,
    }),
  ).rejects.toThrow(/encerramento/);
  expect(store.readImpactJournal('author', 'book')).toEqual(closing);
  await store.confirmImpactCancellation(closing, {
    jobId: impactFrame.jobId,
    phase: 'canceled',
    originToken: null,
  });
  expect(store.readImpactJournal('author', 'book')).toBeNull();
});
it('an account/session change while waiting for the short local lock preserves the pointer', async () => {
  const pending = await store.stageImpactOperation(await adopted(), {
    kind: 'advance',
    closeRequested: false,
    wire: advance(),
  });
  await expect(store.acknowledgeImpactOperation(pending, impactFrame, () => false)).rejects.toThrow(
    /sessão/,
  );
  expect(store.readImpactJournal('author', 'book')).toEqual(pending);
});
it('malformed plaintext additions are preserved rather than purged or migrated', async () => {
  await adopted();
  const key = localStorage.key(0)!;
  const malformed = JSON.stringify({
    ...store.readImpactJournal('author', 'book'),
    rationale: 'forbidden',
  });
  localStorage.setItem(key, malformed);
  expect(() => store.readImpactJournal('author', 'book')).toThrow(/inválido/);
  await expect(store.reserveImpactJournal('author', impactStart)).rejects.toThrow();
  expect(localStorage.getItem(key)).toBe(malformed);
});
it('release requires a closed observed map, no local debt and the same book/control incarnation', async () => {
  const first = await adopted();
  await expect(store.releaseImpactJournal(first, impactFrame)).rejects.toThrow(/encerrado/);
  await expect(
    store.releaseImpactJournal(first, {
      ...impactFrame,
      phase: 'partial',
      bookToken: 'f'.repeat(64),
    }),
  ).rejects.toThrow(/encerrado/);
  await store.releaseImpactJournal(first, { ...impactFrame, phase: 'partial' });
  expect(store.readImpactJournal('author', 'book')).toBeNull();
});
it('storage quota and missing Web Locks fail before any local reservation is announced', async () => {
  vi.stubGlobal('navigator', {});
  await expect(adopted()).rejects.toThrow(/Web Locks/);
  expect(localStorage.length).toBe(0);
  vi.stubGlobal('navigator', { locks: impactLocks() });
  const write = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new DOMException('Quota', 'QuotaExceededError');
  });
  await expect(adopted()).rejects.toThrow('Quota');
  expect(localStorage.length).toBe(0);
  write.mockRestore();
});
it('two windows cannot replace the same pending operation or revive a released session', async () => {
  const first = await adopted(),
    left = store.stageImpactOperation(first, {
      kind: 'advance',
      closeRequested: false,
      wire: advance(),
    });
  const right = store.stageImpactOperation(first, {
    kind: 'advance',
    closeRequested: false,
    wire: { ...advance(), operationId: 'competing-step' },
  });
  const values = await Promise.allSettled([left, right]);
  expect(values.filter((value) => value.status === 'fulfilled')).toHaveLength(1);
  const current = store.readImpactJournal('author', 'book')!;
  expect(current.pending?.kind).toBe('advance');
  const settled = await store.acknowledgeImpactOperation(current, {
    ...impactFrame,
    phase: 'partial',
  });
  await store.releaseImpactJournal(settled, { ...impactFrame, phase: 'partial' });
  const replacement = await adopted();
  await expect(store.acknowledgeImpactOperation(current, impactFrame)).rejects.toThrow(
    /outra janela/,
  );
  expect(store.readImpactJournal('author', 'book')).toEqual(replacement);
});
