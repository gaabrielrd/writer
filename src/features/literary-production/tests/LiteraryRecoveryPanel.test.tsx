import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { LiteraryRecoveryPanel } from '../components/LiteraryRecoveryPanel';
import {
  beginLiteraryOperation,
  finishLiteraryOperation,
  listLiteraryPendingOperations,
} from '../services/literaryRecoveryStorage';
import {
  getLiterarySequenceOperation,
  resumeLiterarySequenceOperation,
  type SequenceOperation,
} from '../services/literarySequenceService';
import { getLiteraryOperation } from '../services/literaryProductionService';
const actor = vi.hoisted(() => ({ uid: 'author' }));
vi.mock('@/features/auth', () => ({
  useAuth: () => ({ user: actor.uid ? { uid: actor.uid } : null }),
}));
vi.mock('../services/literaryProductionService', () => ({ getLiteraryOperation: vi.fn() }));
vi.mock('../services/literarySequenceService', async (original) => ({
  ...(await original<typeof import('../services/literarySequenceService')>()),
  getLiterarySequenceOperation: vi.fn(),
  resumeLiterarySequenceOperation: vi.fn(),
}));
const operationId = 'sequence-recovery-operation';
const pending = () => listLiteraryPendingOperations('author', 'book');
const outcome = (state: 'confirmed' | 'running' | 'superseded'): SequenceOperation => ({
  state,
  method: 'advanceLiterarySequence',
  id: 'sequence',
  revision: state === 'confirmed' ? 5 : 4,
  updatedAt: 100,
  requestHash: pending()[0]?.wireHash ?? null,
});
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  actor.uid = 'author';
});
async function seed(
  method: 'advanceLiterarySequence' | 'startLiterarySequence' = 'advanceLiterarySequence',
) {
  return beginLiteraryOperation(
    'author',
    'book',
    'sequence',
    'sequence',
    { operationId, expectedRevision: method === 'startLiterarySequence' ? 0 : 4 },
    method,
  );
}
it('opening the recovery panel performs no remote request or generation', async () => {
  await seed();
  render(<LiteraryRecoveryPanel bookId="book" />);
  await screen.findByRole('button', { name: /Consultar sequência/ });
  expect(getLiterarySequenceOperation).not.toHaveBeenCalled();
  expect(getLiteraryOperation).not.toHaveBeenCalled();
  expect(resumeLiterarySequenceOperation).not.toHaveBeenCalled();
});
it('retains unconfirmed metadata without enabling a producer', async () => {
  await seed();
  vi.mocked(getLiterarySequenceOperation).mockResolvedValue({ state: 'unconfirmed' });
  render(<LiteraryRecoveryPanel bookId="book" />);
  await userEvent.click(await screen.findByRole('button', { name: /Consultar sequência/ }));
  await screen.findByText(/ainda não tem confirmação/);
  expect(pending()).toHaveLength(1);
  expect(
    screen.queryByRole('button', { name: 'Retomar passo original da sequência' }),
  ).not.toBeInTheDocument();
  expect(resumeLiterarySequenceOperation).not.toHaveBeenCalled();
});
it('a running lookup preserves debt and only an explicit second action can resume the original step', async () => {
  const entry = await seed();
  vi.mocked(getLiterarySequenceOperation).mockResolvedValue(outcome('running'));
  render(<LiteraryRecoveryPanel bookId="book" />);
  await userEvent.click(await screen.findByRole('button', { name: /Consultar sequência/ }));
  const retry = await screen.findByRole('button', { name: 'Retomar passo original da sequência' });
  expect(pending()).toHaveLength(1);
  expect(resumeLiterarySequenceOperation).not.toHaveBeenCalled();
  await userEvent.click(retry);
  await waitFor(() => expect(resumeLiterarySequenceOperation).toHaveBeenCalledTimes(1));
  expect(vi.mocked(resumeLiterarySequenceOperation).mock.calls[0]?.slice(0, 2)).toEqual([
    entry,
    'author',
  ]);
  await screen.findByText(/O passo original foi consultado ou retomado/);
});
it('confirmed commands clear only their journal and do not claim that prose was applied', async () => {
  await seed();
  vi.mocked(getLiterarySequenceOperation).mockResolvedValue(outcome('confirmed'));
  render(<LiteraryRecoveryPanel bookId="book" />);
  await userEvent.click(await screen.findByRole('button', { name: /Consultar sequência/ }));
  await screen.findByText(/não comprova aplicação de texto/);
  expect(pending()).toEqual([]);
  expect(getLiteraryOperation).not.toHaveBeenCalled();
  expect(resumeLiterarySequenceOperation).not.toHaveBeenCalled();
});
it('superseded advances close at the original revision without rearming a canceled step', async () => {
  await seed();
  vi.mocked(getLiterarySequenceOperation).mockResolvedValue(outcome('superseded'));
  render(<LiteraryRecoveryPanel bookId="book" />);
  await userEvent.click(await screen.findByRole('button', { name: /Consultar sequência/ }));
  await screen.findByText(/encerrado por um controle posterior/);
  expect(pending()).toEqual([]);
  expect(resumeLiterarySequenceOperation).not.toHaveBeenCalled();
});
it('a confirmed original registration uses revision one even if later controls already changed the parent', async () => {
  await seed('startLiterarySequence');
  vi.mocked(getLiterarySequenceOperation).mockResolvedValue({
    state: 'confirmed',
    method: 'startLiterarySequence',
    id: 'sequence',
    revision: 1,
    updatedAt: 100,
    requestHash: pending()[0]?.wireHash ?? null,
  });
  render(<LiteraryRecoveryPanel bookId="book" />);
  await userEvent.click(await screen.findByRole('button', { name: /Consultar sequência/ }));
  await screen.findByText(/Comando da sequência confirmado/);
  expect(pending()).toEqual([]);
});
it('wrong method or revision keeps the pending operation and presents a concrete error', async () => {
  await seed();
  vi.mocked(getLiterarySequenceOperation).mockResolvedValue({
    ...outcome('confirmed'),
    method: 'setLiterarySequenceControl',
  } as SequenceOperation);
  render(<LiteraryRecoveryPanel bookId="book" />);
  await userEvent.click(await screen.findByRole('button', { name: /Consultar sequência/ }));
  await screen.findByText(/A confirmação não corresponde ao pedido original/);
  expect(pending()).toHaveLength(1);
});
it('switching account drops the old session and a held result cannot clear the original account journal', async () => {
  await seed();
  let release!: (value: SequenceOperation) => void;
  vi.mocked(getLiterarySequenceOperation).mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  const view = render(<LiteraryRecoveryPanel bookId="book" />);
  await userEvent.click(await screen.findByRole('button', { name: /Consultar sequência/ }));
  actor.uid = 'other';
  view.rerender(<LiteraryRecoveryPanel bookId="book" />);
  await act(async () => {
    release(outcome('confirmed'));
    await Promise.resolve();
  });
  expect(pending()).toHaveLength(1);
  expect(screen.queryByText(/Comando da sequência confirmado/)).not.toBeInTheDocument();
  expect(screen.queryByRole('button', { name: /Consultar sequência/ })).not.toBeInTheDocument();
});
it('switching books clears a stale busy state while preserving each journal and legacy confirmation behavior', async () => {
  await seed();
  await beginLiteraryOperation('author', 'second', 'contract', 'current', {
    operationId: 'legacy-contract-operation',
    expectedRevision: 2,
  });
  let release!: (value: SequenceOperation) => void;
  vi.mocked(getLiterarySequenceOperation).mockReturnValue(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  vi.mocked(getLiteraryOperation).mockResolvedValue({
    state: 'confirmed',
    kind: 'contract',
    id: 'current',
    revision: 3,
    updatedAt: 100,
    noOp: false,
  });
  const view = render(<LiteraryRecoveryPanel bookId="book" />);
  await userEvent.click(await screen.findByRole('button', { name: /Consultar sequência/ }));
  view.rerender(<LiteraryRecoveryPanel bookId="second" />);
  const legacy = await screen.findByRole('button', { name: /Consultar contrato/ });
  expect(legacy).toBeEnabled();
  await userEvent.click(legacy);
  await screen.findByText(/Salvamento confirmado na revisão 3/);
  await act(async () => {
    release(outcome('confirmed'));
    await Promise.resolve();
  });
  expect(pending()).toHaveLength(1);
  expect(listLiteraryPendingOperations('author', 'second')).toEqual([]);
});
it('a changed local record prevents clearing the debt even after a matching native confirmation', async () => {
  const entry = await seed();
  vi.mocked(getLiterarySequenceOperation).mockImplementation(async () => {
    finishLiteraryOperation(entry);
    await beginLiteraryOperation(
      'author',
      'book',
      'sequence',
      'sequence',
      { operationId, expectedRevision: 4, changed: true } as {
        operationId: string;
        expectedRevision: number;
      },
      'advanceLiterarySequence',
    );
    return { ...outcome('confirmed'), requestHash: entry.wireHash };
  });
  render(<LiteraryRecoveryPanel bookId="book" />);
  await userEvent.click(await screen.findByRole('button', { name: /Consultar sequência/ }));
  await screen.findByText(/O acompanhamento local mudou/);
  expect(pending()).toHaveLength(1);
});
