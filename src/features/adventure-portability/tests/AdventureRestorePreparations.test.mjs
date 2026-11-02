import { createElement, StrictMode } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({
  remote: vi.fn(),
  starts: vi.fn(),
  effects: vi.fn(),
  account: 'author',
}));
vi.mock('../services/adventureRestoreStartSession', () => ({
  createAdventureRestoreStartSession: () => ({
    listRemote: (...a) => m.remote(...a),
    list: (...a) => m.starts(...a),
  }),
}));
vi.mock('../services/adventureRestoreEffectStore', () => ({
  listStoredAdventureRestoreEffects: (...a) => m.effects(...a),
}));
vi.mock('../services/adventureRestoreLocalRecovery', () => ({
  checkAdventureRestoreAccount: (uid) => {
    if (uid !== m.account) throw Error('Inactive');
  },
}));
import { AdventureRestorePreparations } from '../components/AdventureRestorePreparations.tsx';
const empty = { items: [], nextCursor: null };
const job = (id, state = 'uploaded') => ({ restoreId: id, state, createdAt: 1000 });
const local = (id, key = 'restoreId') => ({ intent: { [key]: id } });
const props = () => ({ ownerId: 'author', onResume: vi.fn() });
beforeEach(() => {
  vi.resetAllMocks();
  m.account = 'author';
  for (const f of [m.remote, m.starts, m.effects]) f.mockResolvedValue(empty);
});
it('loading and empty list are explicit, and refreshing retries all three sources', async () => {
  let release;
  m.remote.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  render(createElement(AdventureRestorePreparations, props()));
  expect(screen.getByRole('status')).toHaveTextContent('Carregando restaurações');
  await act(async () => release(empty));
  await screen.findByText('Nenhuma restauração encontrada');
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar restaurações' }));
  await waitFor(() => expect(m.remote).toHaveBeenCalledTimes(2));
  expect(m.effects).toHaveBeenCalledTimes(2);
});
it('local pending operations remain discoverable if remote listing fails, without exposing IDs or tokens', async () => {
  m.remote.mockRejectedValue(Error('Offline'));
  m.starts.mockResolvedValue({
    items: [local('initial-private-id', 'operationId')],
    nextCursor: null,
  });
  m.effects.mockResolvedValue({ items: [local('terminal-private-id')], nextCursor: null });
  const p = props();
  render(createElement(AdventureRestorePreparations, p));
  await screen.findByText('Não foi possível consultar todas as restaurações');
  expect(screen.getAllByRole('button', { name: 'Retomar restauração' })).toHaveLength(2);
  expect(screen.queryByText(/private-id/)).not.toBeInTheDocument();
  await userEvent.click(screen.getAllByRole('button', { name: 'Retomar restauração' })[0]);
  expect(p.onResume).toHaveBeenCalledWith('terminal-private-id');
  expect(screen.queryByText('Nenhuma restauração encontrada')).not.toBeInTheDocument();
});
it('independent cursor pages deduplicate the same restore and preserve all pending source groups', async () => {
  m.remote.mockResolvedValueOnce({ items: [job('same-restore')], nextCursor: 'remote-cursor' });
  m.remote.mockResolvedValueOnce({ items: [job('next-restore')], nextCursor: null });
  m.starts.mockResolvedValueOnce({
    items: [local('same-restore', 'operationId')],
    nextCursor: 'start-cursor',
  });
  m.starts.mockResolvedValueOnce({ items: [local('new-start', 'operationId')], nextCursor: null });
  m.effects.mockResolvedValueOnce({ items: [local('same-restore')], nextCursor: 'effect-cursor' });
  m.effects.mockResolvedValueOnce({ items: [local('new-effect')], nextCursor: null });
  render(createElement(AdventureRestorePreparations, props()));
  await screen.findByRole('button', { name: 'Mais restaurações da conta' });
  expect(screen.getAllByRole('button', { name: 'Retomar restauração' })).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Mais restaurações da conta' }));
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: 'Retomar restauração' })).toHaveLength(2),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Mais inícios do dispositivo' }));
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: 'Retomar restauração' })).toHaveLength(3),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Mais pedidos do dispositivo' }));
  await waitFor(() =>
    expect(screen.getAllByRole('button', { name: 'Retomar restauração' })).toHaveLength(4),
  );
  expect(m.remote).toHaveBeenLastCalledWith({ cursor: 'remote-cursor', limit: 10 });
  expect(m.starts).toHaveBeenLastCalledWith({ cursor: 'start-cursor', limit: 10 });
  expect(m.effects).toHaveBeenLastCalledWith('author', expect.any(Function), {
    cursor: 'effect-cursor',
    limit: 10,
  });
});
it('a local storage failure is visible while authorized remote jobs remain resumable', async () => {
  m.effects.mockRejectedValue(Error('DB unavailable'));
  m.remote.mockResolvedValue({ items: [job('remote-only', 'activated')], nextCursor: null });
  render(createElement(AdventureRestorePreparations, props()));
  await screen.findByText(/pedidos salvos neste dispositivo não puderam ser lidos/);
  expect(screen.getByText('Cópia criada')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retomar restauração' })).toBeEnabled();
});
it('late pages from a retired account are not rendered even in StrictMode', async () => {
  const releases = [];
  const delayed = () =>
    new Promise((resolve) => {
      releases.push(resolve);
    });
  m.remote.mockImplementationOnce(delayed).mockImplementationOnce(delayed);
  const p = props(),
    r = render(createElement(StrictMode, null, createElement(AdventureRestorePreparations, p)));
  r.unmount();
  m.account = 'other';
  render(createElement(AdventureRestorePreparations, { ...p, ownerId: 'other' }));
  await act(async () => {
    for (const release of releases)
      release({ items: [job('SECRET_PREVIOUS_ACCOUNT')], nextCursor: null });
  });
  await screen.findByText('Nenhuma restauração encontrada');
  expect(screen.queryByRole('button', { name: 'Retomar restauração' })).not.toBeInTheDocument();
});

it('changing account remounts the list before new data can arrive', async () => {
  m.remote.mockResolvedValueOnce({ items: [job('first-account')], nextCursor: null });
  const p = props(),
    r = render(createElement(AdventureRestorePreparations, p));
  await screen.findByRole('button', { name: 'Retomar restauração' });
  let release;
  m.account = 'other';
  m.remote.mockReturnValueOnce(
    new Promise((resolve) => {
      release = resolve;
    }),
  );
  r.rerender(createElement(AdventureRestorePreparations, { ...p, ownerId: 'other' }));
  expect(screen.queryByRole('button', { name: 'Retomar restauração' })).not.toBeInTheDocument();
  await act(async () => release(empty));
  await screen.findByText('Nenhuma restauração encontrada');
});
