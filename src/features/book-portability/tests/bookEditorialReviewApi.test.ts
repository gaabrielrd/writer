import { beforeEach, expect, it, vi } from 'vitest';
import { bookEditorialReviewApi } from '../services/bookEditorialReviewApi';
import { callBookBackup } from '../services/bookStructureCallables';
import type { EditorialReviewView, EditorialReviewWire } from '../model/bookEditorialReview';
vi.mock('../services/bookStructureCallables', () => ({ callBookBackup: vi.fn() }));
const wire: EditorialReviewWire = {
  bookId: 'book',
  id: 'contract',
  operationId: 'operation-native-001',
  reviewToken: 'a'.repeat(64),
  decision: 'keep-current',
};
const view: EditorialReviewView = {
  schemaVersion: 1,
  bookId: 'book',
  id: 'contract',
  kind: 'contract',
  title: 'Contrato',
  state: 'unchanged',
  reviewToken: wire.reviewToken,
  native: { revision: 1, contentHash: 'b'.repeat(64) },
  original: { revision: 1, contentHash: 'b'.repeat(64) },
  historicalStatus: null,
  historicalCollaboration: null,
  pendingReferences: [],
  sources: [],
  reviewState: 'required',
  acknowledgement: null,
  currentChangedSinceAcknowledgement: null,
  canUseOriginalDraft: false,
};
const receipt = {
  id: wire.id,
  kind: 'contract' as const,
  operationId: wire.operationId,
  decision: wire.decision,
  nativeRevision: 1,
  nativeContentHash: 'b'.repeat(64),
  acknowledgedAt: 2,
  planChanged: false,
};
beforeEach(() => {
  vi.resetAllMocks();
});
it('reads bounded review pages and a native item only through the book server port', async () => {
  const page = {
    schemaVersion: 1,
    bookId: 'book',
    availability: 'available',
    items: [
      {
        id: view.id,
        kind: view.kind,
        title: view.title,
        reviewState: view.reviewState,
        acknowledgement: null,
      },
    ],
    next: 'next',
  };
  vi.mocked(callBookBackup).mockResolvedValueOnce(page).mockResolvedValueOnce(view);
  expect(await bookEditorialReviewApi.list('book', 'previous')).toEqual(page);
  expect(callBookBackup).toHaveBeenNthCalledWith(1, 'listBookEditorialRestoreReviews', {
    bookId: 'book',
    after: 'previous',
    limit: 25,
  });
  expect(await bookEditorialReviewApi.get('book', 'contract')).toEqual(view);
  expect(callBookBackup).toHaveBeenNthCalledWith(2, 'getBookEditorialRestoreReview', {
    bookId: 'book',
    id: 'contract',
  });
});
it('keeps apply, metadata resolution and retirement distinct and bound to their original operation', async () => {
  const confirmed = { schemaVersion: 1, bookId: 'book', kind: 'confirmed', receipt };
  const resolution = { schemaVersion: 1, bookId: 'book', state: 'confirmed', receipt };
  const retired = {
    schemaVersion: 1,
    bookId: 'book',
    kind: 'retired',
    receipt: { id: wire.id, operationId: wire.operationId, retiredAt: 3 },
  };
  vi.mocked(callBookBackup)
    .mockResolvedValueOnce(confirmed)
    .mockResolvedValueOnce(resolution)
    .mockResolvedValueOnce(retired);
  expect(await bookEditorialReviewApi.apply(wire)).toEqual(confirmed);
  expect(await bookEditorialReviewApi.resolve('book', wire.operationId)).toEqual(resolution);
  expect(await bookEditorialReviewApi.retire(wire)).toEqual(retired);
  expect(callBookBackup).toHaveBeenNthCalledWith(1, 'reviewBookEditorialRestore', wire);
  expect(callBookBackup).toHaveBeenNthCalledWith(2, 'getBookEditorialRestoreReviewOperation', {
    bookId: 'book',
    operationId: wire.operationId,
  });
  expect(callBookBackup).toHaveBeenNthCalledWith(3, 'retireBookEditorialRestoreReview', wire);
});
it('rejects another book or operation instead of adopting its historical acknowledgement', async () => {
  vi.mocked(callBookBackup)
    .mockResolvedValueOnce({ ...view, bookId: 'another' })
    .mockResolvedValueOnce({
      schemaVersion: 1,
      bookId: 'book',
      state: 'confirmed',
      receipt: { ...receipt, operationId: 'another-operation' },
    });
  await expect(bookEditorialReviewApi.get('book', 'contract')).rejects.toThrow();
  await expect(bookEditorialReviewApi.resolve('book', wire.operationId)).rejects.toThrow();
});
