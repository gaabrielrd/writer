import { createElement } from 'react';
import { it, expect, vi, beforeEach } from 'vitest';
import { render, screen, act, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseDropdown } from '@/test/dropdown';
const m = vi.hoisted(() => ({ supported: true, export: vi.fn() }));
vi.mock('../services/adventureArchiveDestination', () => ({
  adventureArchivePicker: { supported: () => m.supported },
}));
vi.mock('../services/exportAdventureArchive', () => ({
  exportAdventureArchive: (...a) => m.export(...a),
}));
import { AdventureBackupDialog } from '../components/AdventureBackupDialog.tsx';
const props = () => ({
  open: true,
  ownerId: 'author',
  adventureId: 'adventure-ui-0001',
  title: 'Minha aventura',
  onClose: vi.fn(),
});
const draft = {
  adventureId: 'adventure-ui-0001',
  resource: { kind: 'scene', id: 'scene-ui-0001' },
  content: 'Texto aberto',
  baseRevision: 4,
  savedAt: 1000,
};
beforeEach(() => {
  vi.resetAllMocks();
  m.supported = true;
  m.export.mockResolvedValue({ kind: 'saved' });
});
it('opening or closing only explains complete scope and does not capture or enumerate draft', async () => {
  const p = { ...props(), getDraft: vi.fn(() => draft) };
  render(createElement(AdventureBackupDialog, p));
  expect(screen.getByRole('dialog')).toHaveTextContent('histórico de versões');
  expect(m.export).not.toHaveBeenCalled();
  expect(p.getDraft).not.toHaveBeenCalled();
  await userEvent.click(screen.getAllByRole('button', { name: 'Fechar', exact: true })[0]);
  expect(p.onClose).toHaveBeenCalledTimes(1);
  expect(m.export).not.toHaveBeenCalled();
});
it('unsupported context explains requirement and never enables a memory fallback', () => {
  m.supported = false;
  render(createElement(AdventureBackupDialog, props()));
  expect(screen.getByText('Gravação de arquivo indisponível')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Salvar backup' })).toBeDisabled();
  expect(m.export).not.toHaveBeenCalled();
});
it('defaults to saved state and guards the current owner/project without reading available draft', async () => {
  const p = { ...props(), getDraft: vi.fn(() => draft) };
  render(createElement(AdventureBackupDialog, p));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar backup' }));
  await screen.findByText('Backup salvo.');
  expect(m.export).toHaveBeenCalledTimes(1);
  expect(p.getDraft).not.toHaveBeenCalled();
  expect(m.export.mock.calls[0][0]).toMatchObject({
    ownerId: p.ownerId,
    adventureId: p.adventureId,
    draft: null,
    title: p.title,
  });
  expect(m.export.mock.calls[0][0].signal).toBeInstanceOf(AbortSignal);
  expect(m.export.mock.calls[0][0].check).toBeInstanceOf(Function);
});
it('includes only explicitly selected open text and calls its getter when saving', async () => {
  const p = { ...props(), getDraft: vi.fn(() => draft) };
  render(createElement(AdventureBackupDialog, p));
  await chooseDropdown(
    userEvent,
    screen.getByLabelText('Texto do backup'),
    'Estado salvo e texto aberto como rascunho',
  );
  expect(p.getDraft).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Salvar backup' }));
  await screen.findByText('Backup salvo.');
  expect(p.getDraft).toHaveBeenCalledTimes(1);
  expect(m.export.mock.calls[0][0].draft).toEqual(draft);
});
it('saved-only page explains how to include the draft and does not offer a fabricated current resource', () => {
  render(createElement(AdventureBackupDialog, props()));
  expect(screen.getByText(/Para acrescentar um rascunho/)).toBeInTheDocument();
  expect(screen.getByLabelText('Texto do backup')).toHaveTextContent('Somente estado salvo');
});
it('chooser cancellation is shown separately and does not claim a saved backup', async () => {
  m.export.mockResolvedValueOnce({ kind: 'cancelled' });
  render(createElement(AdventureBackupDialog, props()));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar backup' }));
  await screen.findByText('Seleção de arquivo cancelada.');
  expect(screen.queryByText('Backup salvo.')).not.toBeInTheDocument();
});
it('unexpected failure offers a fresh retry without claiming success or exposing server details', async () => {
  m.export.mockRejectedValueOnce(Error('PRIVATE_NATIVE_TOKEN'));
  render(createElement(AdventureBackupDialog, props()));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar backup' }));
  await screen.findByText('Backup não concluído');
  expect(screen.queryByText(/PRIVATE_NATIVE_TOKEN/)).not.toBeInTheDocument();
  expect(screen.queryByText('Backup salvo.')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Salvar backup' }));
  await screen.findByText('Backup salvo.');
  expect(m.export).toHaveBeenCalledTimes(2);
});
it('cancel aborts the current producer and suppresses a late saved outcome', async () => {
  let release;
  m.export.mockImplementation(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  render(createElement(AdventureBackupDialog, props()));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar backup' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar geração' }));
  expect(m.export.mock.calls[0][0].signal.aborted).toBe(true);
  await act(async () => release({ kind: 'saved' }));
  await screen.findByText('Geração cancelada. Nenhum backup completo foi confirmado.');
  expect(screen.queryByText('Backup salvo.')).not.toBeInTheDocument();
});
it('unmount aborts and makes the captured lifetime guard reject late work', async () => {
  let release;
  m.export.mockImplementation(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  const view = render(createElement(AdventureBackupDialog, props()));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar backup' }));
  const request = m.export.mock.calls[0][0];
  view.unmount();
  expect(request.signal.aborted).toBe(true);
  expect(() => request.check()).toThrow();
  await act(async () => release({ kind: 'saved' }));
  expect(screen.queryByText('Backup salvo.')).not.toBeInTheDocument();
});
it.each([{ ownerId: 'other' }, { adventureId: 'other-adventure-0001' }])(
  'account/project replacement retires the prior session %j',
  async (change) => {
    let release;
    m.export.mockImplementation(
      () =>
        new Promise((r) => {
          release = r;
        }),
    );
    const p = props(),
      view = render(createElement(AdventureBackupDialog, p));
    await userEvent.click(screen.getByRole('button', { name: 'Salvar backup' }));
    const request = m.export.mock.calls[0][0];
    view.rerender(createElement(AdventureBackupDialog, { ...p, ...change }));
    expect(request.signal.aborted).toBe(true);
    await act(async () => release({ kind: 'saved' }));
    expect(screen.queryByText('Backup salvo.')).not.toBeInTheDocument();
  },
);
it('draft getter failure never reaches export; closed component does not mount a session', async () => {
  const p = {
    ...props(),
    getDraft: () => {
      throw Error('stale editor');
    },
  };
  const view = render(createElement(AdventureBackupDialog, { ...p, open: false }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  view.rerender(createElement(AdventureBackupDialog, p));
  await chooseDropdown(
    userEvent,
    screen.getByLabelText('Texto do backup'),
    'Estado salvo e texto aberto como rascunho',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Salvar backup' }));
  await screen.findByText('Backup não concluído');
  expect(m.export).not.toHaveBeenCalled();
});
it('a pending generation cannot start a second export or change draft selection', async () => {
  let release;
  m.export.mockImplementation(
    () =>
      new Promise((r) => {
        release = r;
      }),
  );
  render(createElement(AdventureBackupDialog, { ...props(), getDraft: () => draft }));
  await userEvent.dblClick(screen.getByRole('button', { name: 'Salvar backup' }));
  expect(m.export).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Texto do backup')).toBeDisabled();
  await act(async () => release({ kind: 'saved' }));
  await screen.findByText('Backup salvo.');
});
