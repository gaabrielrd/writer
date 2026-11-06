import { webcrypto } from 'node:crypto';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { createEditorialReviewDriver } from '../services/bookEditorialReviewDriver';
import {
  parseEditorialReviewPending,
  type EditorialReviewPending,
} from '../services/bookEditorialReviewJournal';
import * as contracts from '../services/bookEditorialReviewContracts';
import type {
  EditorialReviewApi,
  EditorialReviewOutcome,
  EditorialReviewWire,
  EditorialReviewView,
} from '../model/bookEditorialReview';
const scope = { actorId: 'author', bookId: 'book' };
const wire = (): EditorialReviewWire => ({
  bookId: 'book',
  id: 'contract',
  operationId: 'original-request',
  reviewToken: 'a'.repeat(64),
  decision: 'keep-current',
});
const outcome = (input = wire()): Extract<EditorialReviewOutcome, { kind: 'confirmed' }> => ({
  schemaVersion: 1,
  bookId: 'book',
  kind: 'confirmed',
  receipt: {
    id: input.id,
    kind: 'contract',
    operationId: input.operationId,
    decision: input.decision,
    nativeRevision: 2,
    nativeContentHash: 'b'.repeat(64),
    acknowledgedAt: 1,
    planChanged: false,
  },
});
function fixture() {
  let row: unknown = null;
  const journal = {
    read: vi.fn(() => Promise.resolve(structuredClone(row))),
    compare: vi.fn((expected: unknown, next: EditorialReviewPending | null) => {
      if (contracts.stableReviewJSON(row) !== contracts.stableReviewJSON(expected))
        return Promise.resolve(false);
      row = structuredClone(next);
      return Promise.resolve(true);
    }),
  };
  const api = {
    list: vi.fn<EditorialReviewApi['list']>(),
    get: vi.fn<EditorialReviewApi['get']>(),
    apply: vi
      .fn<EditorialReviewApi['apply']>()
      .mockImplementation((input) => Promise.resolve(outcome(input))),
    retire: vi.fn<EditorialReviewApi['retire']>().mockImplementation((input) =>
      Promise.resolve({
        schemaVersion: 1,
        bookId: 'book',
        kind: 'retired',
        receipt: { id: input.id, operationId: input.operationId, retiredAt: 2 },
      }),
    ),
    resolve: vi
      .fn<EditorialReviewApi['resolve']>()
      .mockResolvedValue({ schemaVersion: 1, bookId: 'book', state: 'unconfirmed' }),
  };
  const guard = vi.fn(),
    onChange = vi.fn();
  const driver = createEditorialReviewDriver({
    scope,
    journal,
    api,
    guard,
    onChange,
    lock: (run) => run(),
  });
  return {
    driver,
    journal,
    api,
    guard,
    onChange,
    set: (value: unknown) => {
      row = value;
    },
  };
}
beforeEach(() => {
  vi.stubGlobal('crypto', webcrypto);
});
afterEach(() => {
  vi.unstubAllGlobals();
});
it('writes the frozen original request before dispatch and consumes it only with the matching receipt', async () => {
  const f = fixture(),
    input = wire();
  const result = f.driver.submit(input);
  input.operationId = 'edited-after-submit';
  expect(await result).toEqual({ outcome: outcome(), cleared: true });
  expect(f.api.apply).toHaveBeenCalledExactlyOnceWith(wire());
  expect(f.journal.compare.mock.invocationCallOrder[0]).toBeLessThan(
    vi.mocked(f.api.apply).mock.invocationCallOrder[0]!,
  );
  expect(await f.driver.pending()).toBeNull();
  expect(f.onChange).toHaveBeenLastCalledWith(null);
});
it('opening and resolving an uncertain request never resubmits it; explicit retry preserves every byte', async () => {
  const f = fixture();
  vi.mocked(f.api.apply).mockRejectedValueOnce(new Error('Resposta perdida'));
  await expect(f.driver.submit(wire())).rejects.toThrow('Resposta perdida');
  const saved = await f.driver.pending();
  expect(saved).toMatchObject({ phase: 'uncertain', wire: wire(), intent: 'apply' });
  await expect(f.driver.retry()).rejects.toThrow('incompatíveis');
  expect(f.api.apply).toHaveBeenCalledOnce();
  expect(await f.driver.resolve()).toEqual({ outcome: null, cleared: false });
  expect(await f.driver.pending()).toMatchObject({ phase: 'unconfirmed', wire: wire() });
  await f.driver.retry();
  expect(f.api.apply).toHaveBeenCalledTimes(2);
  expect(vi.mocked(f.api.apply).mock.calls[0]).toEqual(vi.mocked(f.api.apply).mock.calls[1]);
  expect(await f.driver.pending()).toBeNull();
});
it('recovers a historical confirmation through its receipt without sending the edit again', async () => {
  const f = fixture();
  vi.mocked(f.api.apply).mockRejectedValueOnce(new Error('Rede'));
  await expect(f.driver.submit(wire())).rejects.toThrow('Rede');
  const confirmed = outcome();
  vi.mocked(f.api.resolve).mockResolvedValue({
    schemaVersion: 1,
    bookId: 'book',
    state: 'confirmed',
    receipt: confirmed.receipt,
  });
  expect(await f.driver.resolve()).toEqual({ outcome: confirmed, cleared: true });
  expect(f.api.apply).toHaveBeenCalledOnce();
  expect(f.api.resolve).toHaveBeenCalledExactlyOnceWith('book', 'original-request');
});
it('withdraws independently of an unresolved producer and a late apply reply cannot clear another generation', async () => {
  const f = fixture();
  let finish!: (reply: EditorialReviewOutcome) => void;
  vi.mocked(f.api.apply).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const applying = f.driver.submit(wire());
  await vi.waitFor(() => expect(f.api.apply).toHaveBeenCalledOnce());
  const retired = await f.driver.retire();
  expect(retired).toMatchObject({ outcome: { kind: 'retired' }, cleared: true });
  expect(f.api.retire).toHaveBeenCalledExactlyOnceWith(wire());
  finish(outcome());
  expect(await applying).toMatchObject({ cleared: false });
  expect(await f.driver.pending()).toBeNull();
});
it('keeps failed withdrawals monotonic and preserves a lost resolve response for another consultation', async () => {
  const f = fixture();
  vi.mocked(f.api.apply).mockRejectedValue(new Error('Rede'));
  await expect(f.driver.submit(wire())).rejects.toThrow('Rede');
  vi.mocked(f.api.retire).mockRejectedValueOnce(new Error('Fechamento incerto'));
  await expect(f.driver.retire()).rejects.toThrow('Fechamento incerto');
  expect(await f.driver.pending()).toMatchObject({ intent: 'withdraw', phase: 'uncertain' });
  vi.mocked(f.api.resolve).mockRejectedValueOnce(new Error('Consulta indisponível'));
  await expect(f.driver.resolve()).rejects.toThrow('Consulta indisponível');
  await expect(f.driver.retry()).rejects.toThrow('incompatíveis');
  expect(f.api.apply).toHaveBeenCalledOnce();
  await f.driver.retire();
  expect(await f.driver.pending()).toBeNull();
});
it('does not dispatch after a failed local CAS or expose another account journal', async () => {
  const f = fixture();
  f.journal.compare.mockResolvedValueOnce(false);
  await expect(f.driver.submit(wire())).rejects.toThrow('incompatíveis');
  expect(f.api.apply).not.toHaveBeenCalled();
  f.set({
    version: 1,
    ...scope,
    actorId: 'other',
    ticket: 'ticket',
    revision: 0,
    intent: 'apply',
    phase: 'prepared',
    wire: wire(),
    wireHash: await contracts.reviewWireHash(wire()),
  });
  await expect(f.driver.pending()).rejects.toThrow('incompatíveis');
  expect(f.api.resolve).not.toHaveBeenCalled();
});
it('rejects a mismatched receipt and retains the original request instead of adopting its response', async () => {
  const f = fixture();
  vi.mocked(f.api.apply).mockResolvedValue(outcome({ ...wire(), operationId: 'different' }));
  await expect(f.driver.submit(wire())).rejects.toThrow('incompatíveis');
  expect(await f.driver.pending()).toMatchObject({ phase: 'uncertain', wire: wire() });
});
it('checks the live account again after dispatch and preserves the durable debt on revocation', async () => {
  const f = fixture();
  vi.mocked(f.api.apply).mockImplementation((input) => {
    f.guard.mockImplementation(() => {
      throw new Error('Conta alterada');
    });
    return Promise.resolve(outcome(input));
  });
  await expect(f.driver.submit(wire())).rejects.toThrow('Conta alterada');
  expect(f.journal.compare.mock.calls.at(-1)?.[1]).toMatchObject({ phase: 'sent' });
});
it('validates the complete local scope and canonical hash before accepting recovered metadata', async () => {
  const pending = {
    version: 1,
    ...scope,
    ticket: 'ticket',
    revision: 0,
    intent: 'apply',
    phase: 'prepared',
    wire: wire(),
    wireHash: await contracts.reviewWireHash(wire()),
  };
  expect(await parseEditorialReviewPending(null, scope)).toBeNull();
  expect(await parseEditorialReviewPending(pending, scope)).toEqual(pending);
  await expect(
    parseEditorialReviewPending({ ...pending, wireHash: 'c'.repeat(64) }, scope),
  ).rejects.toThrow('incompatíveis');
  await expect(parseEditorialReviewPending({ ...pending, extra: 'body' }, scope)).rejects.toThrow(
    'incompatíveis',
  );
});
const reference = {
  kind: 'chapter' as const,
  id: 'chapter',
  scopeId: null,
  sourceToken: 'c'.repeat(64),
  revision: 3,
  purpose: 'subject' as const,
};
function view(): EditorialReviewView {
  const confirmed = outcome();
  return {
    schemaVersion: 1,
    bookId: 'book',
    id: 'contract',
    kind: 'contract',
    title: 'Contrato preservado',
    state: 'changed',
    reviewToken: 'a'.repeat(64),
    native: { revision: 2, contentHash: 'b'.repeat(64) },
    original: { revision: 1, contentHash: 'c'.repeat(64) },
    historicalStatus: null,
    historicalCollaboration: null,
    pendingReferences: [],
    sources: [
      {
        reference,
        label: 'Capítulo',
        available: true,
        changed: false,
        currentReference: reference,
      },
    ],
    reviewState: 'acknowledged',
    acknowledgement: confirmed.receipt,
    currentChangedSinceAcknowledgement: false,
    canUseOriginalDraft: false,
  };
}
it('validates closed pages, native references and private views before displaying restored editorial records', () => {
  const original = view();
  expect(contracts.editorialReviewView(original, 'book', 'contract')).toEqual(original);
  const page = {
    schemaVersion: 1,
    bookId: 'book',
    availability: 'available',
    items: [
      {
        id: original.id,
        kind: original.kind,
        title: original.title,
        reviewState: original.reviewState,
        acknowledgement: original.acknowledgement,
      },
    ],
    next: 'cursor',
  };
  expect(contracts.editorialReviewPage(page, 'book')).toEqual(page);
  const reconciled = { ...wire(), decision: 'reconcile-references', references: [reference] };
  expect(contracts.editorialReviewWire(reconciled)).toEqual(reconciled);
  expect(contracts.nativeReviewReference(reference)).toEqual(reference);
  expect(() => contracts.editorialReviewView(original, 'other', 'contract')).toThrow(
    'incompatíveis',
  );
  expect(() => contracts.editorialReviewPage({ ...page, extra: true }, 'book')).toThrow(
    'incompatíveis',
  );
  expect(() => contracts.editorialReviewWire({ ...wire(), references: [] })).toThrow(
    'incompatíveis',
  );
  expect(() => contracts.nativeReviewReference({ ...reference, sourceToken: 'invalid' })).toThrow(
    'incompatíveis',
  );
  expect(() => contracts.nativeReviewReference({ ...reference, revision: -1 })).toThrow(
    'incompatíveis',
  );
});
it.each([
  'native',
  'original',
  'sources',
  'reviewState',
  'acknowledgement',
  'canUseOriginalDraft',
] as const)('rejects malformed %s without accepting a partial editorial view', (field) => {
  expect(() =>
    contracts.editorialReviewView({ ...view(), [field]: 'invalid' }, 'book', 'contract'),
  ).toThrow('incompatíveis');
});
