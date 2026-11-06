import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { useLiteraryImpact } from '../hooks/useLiteraryImpact';
import * as api from '../services/literaryImpactService';
import * as store from '../services/literaryImpactStorage';
import {
  impactFrame,
  impactScope,
  impactStart,
  impactHash,
  impactLocks,
  deferred,
} from './impactFixtures';
import type { ImpactFrame } from '../model/impact';
vi.mock('../services/literaryImpactService', () => ({
  getLiteraryImpactScope: vi.fn(),
  startLiteraryImpact: vi.fn(),
  getLiteraryImpact: vi.fn(),
  listLiteraryImpacts: vi.fn(),
  advanceLiteraryImpact: vi.fn(),
  resolveLiteraryImpact: vi.fn(),
  cancelLiteraryImpact: vi.fn(),
  getLiteraryImpactOperation: vi.fn(),
  cancelLiteraryImpactOperation: vi.fn(),
  readLiteraryImpactPage: vi.fn(),
  impactRequestHash: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  vi.stubGlobal('navigator', { locks: impactLocks() });
  vi.mocked(api.impactRequestHash).mockResolvedValue(impactHash);
  vi.mocked(api.getLiteraryImpact).mockResolvedValue(impactFrame);
  vi.mocked(api.startLiteraryImpact).mockResolvedValue(impactFrame);
  vi.mocked(api.advanceLiteraryImpact).mockResolvedValue({ ...impactFrame, revision: 2 });
  vi.mocked(api.cancelLiteraryImpact).mockResolvedValue({
    jobId: impactFrame.jobId,
    phase: 'canceled',
    revision: 2,
    originToken: impactFrame.originToken,
    publicationReady: false,
  });
});
afterEach(() => vi.unstubAllGlobals());
const hook = () => renderHook(() => useLiteraryImpact('author', 'book'));
it('mount reads local metadata only and never starts, retries, queries or clears an uncertain request', async () => {
  const original = await store.reserveImpactJournal('author', impactStart);
  const view = hook();
  expect(view.result.current.journal).toEqual(original);
  for (const call of [
    api.startLiteraryImpact,
    api.advanceLiteraryImpact,
    api.resolveLiteraryImpact,
    api.cancelLiteraryImpact,
    api.getLiteraryImpact,
    api.getLiteraryImpactOperation,
  ])
    expect(call).not.toHaveBeenCalled();
});
it('start writes ahead before HTTP and only clears its pointer after a fresh matching origin', async () => {
  vi.mocked(api.startLiteraryImpact).mockImplementation((input) => {
    expect(store.readImpactJournal('author', 'book')?.start).toEqual(input);
    expect(store.readImpactJournal('author', 'book')?.pending?.kind).toBe('start');
    return Promise.resolve({ ...impactFrame, jobId: input.jobId });
  });
  vi.mocked(api.getLiteraryImpact).mockImplementation((_book, id) =>
    Promise.resolve({
      ...impactFrame,
      jobId: id,
    }),
  );
  const view = hook();
  await act(() =>
    view.result.current.start(
      { bookIds: ['book'], sources: impactStart.sources, prepareIndices: false },
      impactScope,
    ),
  );
  expect(view.result.current.journal?.pending).toBeNull();
  expect(view.result.current.journal?.originToken).toBe(impactFrame.originToken);
  expect(api.startLiteraryImpact).toHaveBeenCalledTimes(1);
  expect(api.advanceLiteraryImpact).not.toHaveBeenCalled();
});
it('unknown original outcomes leave the exact request pending and do not authorize a resend', async () => {
  const pending = await store.reserveImpactJournal('author', impactStart);
  vi.mocked(api.getLiteraryImpactOperation).mockResolvedValue({ status: 'unknown' });
  const view = hook();
  await act(() => view.result.current.consult());
  expect(view.result.current.journal).toEqual(pending);
  expect(api.startLiteraryImpact).not.toHaveBeenCalled();
  expect(api.advanceLiteraryImpact).not.toHaveBeenCalled();
  await act(() => view.result.current.retry());
  expect(api.startLiteraryImpact).toHaveBeenCalledWith(impactStart);
});
it('whole-map cancellation completes independently while an advance is still in flight and its late ACK cannot reopen tracking', async () => {
  await store.adoptImpactJournal('author', 'book', impactFrame);
  const response = deferred<ImpactFrame>();
  vi.mocked(api.advanceLiteraryImpact).mockReturnValue(response.promise);
  const view = hook();
  let request!: Promise<void>;
  act(() => {
    request = view.result.current.advance();
  });
  await waitFor(() => expect(api.advanceLiteraryImpact).toHaveBeenCalledTimes(1));
  await act(() => view.result.current.cancel());
  expect(view.result.current.journal).toBeNull();
  await act(async () => {
    response.resolve({ ...impactFrame, revision: 2 });
    await request;
  });
  expect(store.readImpactJournal('author', 'book')).toBeNull();
  expect(view.result.current.frame).toBeNull();
  expect(api.cancelLiteraryImpact).toHaveBeenCalledTimes(1);
});
it('unmount during an HTTP request leaves the original debt for explicit recovery', async () => {
  await store.adoptImpactJournal('author', 'book', impactFrame);
  const response = deferred<ImpactFrame>();
  vi.mocked(api.advanceLiteraryImpact).mockReturnValue(response.promise);
  const view = hook();
  let request!: Promise<void>;
  act(() => {
    request = view.result.current.advance();
  });
  await waitFor(() => expect(api.advanceLiteraryImpact).toHaveBeenCalledTimes(1));
  const pending = store.readImpactJournal('author', 'book');
  view.unmount();
  response.resolve(impactFrame);
  await request;
  expect(store.readImpactJournal('author', 'book')).toEqual(pending);
});
it('a reloaded resolution cannot reconstruct or resend private text; its original operation can be fenced explicitly', async () => {
  const first = await store.adoptImpactJournal('author', 'book', impactFrame);
  await store.stageImpactOperation(
    first,
    store.impactResolutionPending({
      target: impactStart.target,
      jobId: impactFrame.jobId,
      operationId: 'resolve-original',
      expectedOriginToken: impactFrame.originToken,
      expectedRevision: 1,
      requestHash: impactHash,
      checkId: 'check',
      observationToken: 'd'.repeat(64),
      expectedDecisionRevision: 0,
      status: 'reviewed',
      rationale: 'PRIVATE',
      evidence: [{ note: 'PRIVATE' }],
    }),
  );
  vi.mocked(api.cancelLiteraryImpactOperation).mockResolvedValue({
    status: 'canceled',
    method: 'resolveLiteraryImpact',
    originToken: impactFrame.originToken,
    result: { jobId: impactFrame.jobId, operationId: 'resolve-original', operationCanceled: true },
  });
  const view = hook();
  await act(() => view.result.current.retry());
  expect(api.resolveLiteraryImpact).not.toHaveBeenCalled();
  expect(view.result.current.error).toMatch(/texto desta resolução/);
  expect(view.result.current.journal?.pending?.kind).toBe('resolve');
  await act(() => view.result.current.closeOperation());
  expect(view.result.current.journal?.pending).toBeNull();
  expect(api.advanceLiteraryImpact).not.toHaveBeenCalled();
  expect(api.cancelLiteraryImpactOperation).toHaveBeenCalledWith(
    'book',
    impactFrame.jobId,
    'resolve-original',
    'resolveLiteraryImpact',
    impactHash,
    impactFrame.originToken,
  );
});
it('a lost cancel response preserves the exact monotonic intent and retries only that cancellation', async () => {
  await store.adoptImpactJournal('author', 'book', impactFrame);
  vi.mocked(api.cancelLiteraryImpact).mockRejectedValueOnce(new Error('offline'));
  const view = hook();
  await act(() => view.result.current.cancel());
  const original = store.readImpactJournal('author', 'book');
  expect(original?.cancelRequested).toBe(true);
  expect(view.result.current.error).toBe('offline');
  await act(() => view.result.current.cancel());
  expect(api.cancelLiteraryImpact).toHaveBeenNthCalledWith(1, original?.cancel);
  expect(api.cancelLiteraryImpact).toHaveBeenNthCalledWith(2, original?.cancel);
  expect(store.readImpactJournal('author', 'book')).toBeNull();
});
it('pause waits for the current step and prevents a bounded batch from sending another', async () => {
  await store.adoptImpactJournal('author', 'book', impactFrame);
  const response = deferred<ImpactFrame>();
  vi.mocked(api.advanceLiteraryImpact).mockReturnValue(response.promise);
  const view = hook();
  let request!: Promise<void>;
  act(() => {
    request = view.result.current.advance(20);
  });
  await waitFor(() => expect(api.advanceLiteraryImpact).toHaveBeenCalledTimes(1));
  act(() => view.result.current.pause());
  await act(async () => {
    response.resolve(impactFrame);
    await request;
  });
  expect(api.advanceLiteraryImpact).toHaveBeenCalledTimes(1);
  expect(view.result.current.journal?.pending).toBeNull();
});
it('a native origin mismatch in the fresh get preserves the confirmed request for investigation', async () => {
  const original = await store.reserveImpactJournal('author', impactStart);
  vi.mocked(api.getLiteraryImpact).mockResolvedValue({
    ...impactFrame,
    originToken: 'f'.repeat(64),
  });
  const view = hook();
  await act(() => view.result.current.retry());
  expect(view.result.current.error).toMatch(/outra origem/);
  expect(store.readImpactJournal('author', 'book')).toEqual(original);
});
