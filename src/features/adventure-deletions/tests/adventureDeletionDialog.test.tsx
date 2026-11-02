import { useState } from 'react';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { Button } from '@/shared/ui';
import { AdventureDeletionDialog } from '../components/AdventureDeletionDialog';
import * as recovery from '../services/adventureDeletionRecovery';
import { knownDeletion } from '../services/adventureDeletionRecovery';
import {
  uid,
  adventureId,
  source,
  progress,
  start,
  step,
  storageKey,
  installBrowser,
  server,
  deferred,
} from './fixtures';
const auth = vi.hoisted((): { user: { uid: string } | null } => ({ user: { uid: 'author' } }));
const rpc = vi.hoisted(() => ({
  getSource: vi.fn(),
  start: vi.fn(),
  resolveStart: vi.fn(),
  get: vi.fn(),
  list: vi.fn(),
  advance: vi.fn(),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/adventureDeletionTransport', () => ({ adventureDeletionTransport: rpc }));
let s: ReturnType<typeof server>;
beforeEach(() => {
  vi.resetAllMocks();
  installBrowser();
  auth.user = { uid };
  s = server();
  Object.assign(rpc, s.transport);
});
afterEach(() => vi.restoreAllMocks());
const confirmedButton = () =>
  screen.findByRole('button', { name: 'Excluir aventura definitivamente' });
function Host({
  onRevoked = () => {},
}: {
  onRevoked?: Parameters<typeof AdventureDeletionDialog>[0]['onRevoked'];
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button onClick={() => setOpen(true)}>Abrir exclusão</Button>
      <AdventureDeletionDialog
        adventureId={adventureId}
        open={open}
        onClose={() => setOpen(false)}
        onRevoked={onRevoked}
      />
    </>
  );
}
it('consulta sem excluir e exige confirmação explícita antes de percorrer a limpeza', async () => {
  const user = userEvent.setup(),
    revoked = vi.fn();
  render(
    <AdventureDeletionDialog
      adventureId={adventureId}
      open
      onClose={vi.fn()}
      onRevoked={revoked}
    />,
  );
  expect(await confirmedButton()).toBeEnabled();
  expect(screen.getByText(source.title)).toBeVisible();
  expect(s.transport.start).not.toHaveBeenCalled();
  expect(screen.getByText(/As perguntas próprias do chat são preservadas/)).toBeVisible();
  await user.click(await confirmedButton());
  expect(await screen.findByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
  expect(revoked).toHaveBeenCalledOnce();
  expect(s.transport.start).toHaveBeenCalledOnce();
  expect(s.transport.advance).toHaveBeenCalledTimes(3);
  expect(localStorage.getItem(storageKey)).not.toContain(source.title);
});
it('Escape fecha e pausa depois do início pendente; reabrir só consulta e preserva foco do acionador', async () => {
  const user = userEvent.setup(),
    gate = deferred<Awaited<ReturnType<typeof s.transport.start>>>(),
    revoked = vi.fn();
  s.transport.start.mockReturnValueOnce(gate.promise);
  render(<Host onRevoked={revoked} />);
  await user.click(screen.getByRole('button', { name: 'Abrir exclusão' }));
  await user.click(await confirmedButton());
  await waitFor(() => expect(s.transport.start).toHaveBeenCalledOnce());
  await user.keyboard('{Escape}');
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Excluir aventura' })).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(screen.getByRole('button', { name: 'Abrir exclusão' })).toHaveFocus());
  await act(async () => {
    gate.resolve(s.confirm('start', s.transport.start.mock.calls[0]![0]));
    await gate.promise;
  });
  await waitFor(() => expect(recovery.readDeletion(uid, adventureId)?.kind).toBe('known'));
  expect(s.transport.advance).not.toHaveBeenCalled();
  expect(revoked).toHaveBeenCalledOnce();
  await user.click(screen.getByRole('button', { name: 'Abrir exclusão' }));
  expect(await screen.findByRole('heading', { name: 'Acesso à aventura encerrado' })).toBeVisible();
  expect(s.transport.advance).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Continuar limpeza' }));
  expect(await screen.findByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
});
it('pausa uma etapa em andamento sem perder recibo nem iniciar a próxima unidade', async () => {
  const user = userEvent.setup(),
    gate = deferred<Awaited<ReturnType<typeof s.transport.advance>>>();
  s.transport.advance.mockReturnValueOnce(gate.promise);
  render(<AdventureDeletionDialog adventureId={adventureId} open onClose={vi.fn()} />);
  await user.click(await confirmedButton());
  await waitFor(() => expect(s.transport.advance).toHaveBeenCalledOnce());
  await user.click(screen.getByRole('button', { name: 'Pausar após esta etapa' }));
  await act(async () => {
    gate.resolve(s.confirm('advance', s.transport.advance.mock.calls[0]![0]));
    await gate.promise;
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Continuar limpeza' })).toBeEnabled(),
  );
  expect(s.transport.advance).toHaveBeenCalledOnce();
  expect(recovery.readDeletion(uid, adventureId)).toMatchObject({
    kind: 'known',
    floor: { checkpoint: 1 },
  });
  await user.click(screen.getByRole('button', { name: 'Continuar limpeza' }));
  expect(await screen.findByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
});
it('fonte atrasada da abertura anterior não vira confirmação após fechar e reabrir', async () => {
  const user = userEvent.setup(),
    old = deferred<typeof source>();
  s.transport.getSource.mockReturnValueOnce(old.promise);
  s.transport.getSource.mockResolvedValueOnce({
    ...source,
    title: 'Fonte atualizada',
    sourceToken: 'd'.repeat(64),
    revision: 5,
  });
  render(<Host />);
  await user.click(screen.getByRole('button', { name: 'Abrir exclusão' }));
  await waitFor(() => expect(s.transport.getSource).toHaveBeenCalledOnce());
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));
  await user.click(screen.getByRole('button', { name: 'Abrir exclusão' }));
  expect(await screen.findByText('Fonte atualizada')).toBeVisible();
  await act(async () => {
    old.resolve(source);
    await old.promise;
  });
  expect(screen.queryByText(source.title)).not.toBeInTheDocument();
  expect(s.transport.start).not.toHaveBeenCalled();
});
it('troca de conta durante resposta não notifica revogação nem expõe título da conta anterior', async () => {
  const user = userEvent.setup(),
    gate = deferred<Awaited<ReturnType<typeof s.transport.start>>>(),
    revoked = vi.fn();
  s.transport.start.mockReturnValueOnce(gate.promise);
  const view = render(
    <AdventureDeletionDialog
      adventureId={adventureId}
      open
      onClose={vi.fn()}
      onRevoked={revoked}
    />,
  );
  await user.click(await confirmedButton());
  await waitFor(() => expect(s.transport.start).toHaveBeenCalledOnce());
  auth.user = { uid: 'other' };
  view.rerender(
    <AdventureDeletionDialog
      adventureId={adventureId}
      open
      onClose={vi.fn()}
      onRevoked={revoked}
    />,
  );
  await act(async () => {
    gate.resolve(s.confirm('start', s.transport.start.mock.calls[0]![0]));
    await gate.promise;
  });
  expect(revoked).not.toHaveBeenCalled();
  expect(screen.queryByText(source.title)).not.toBeInTheDocument();
  expect(recovery.readDeletion(uid, adventureId)).toMatchObject({ kind: 'start' });
  expect(recovery.readDeletion('other', adventureId)).toBeNull();
  expect(s.transport.advance).not.toHaveBeenCalled();
});
it('resposta forjada mantém pedido sem notificar e permite recuperar o mesmo início', async () => {
  const user = userEvent.setup(),
    revoked = vi.fn();
  s.transport.start.mockResolvedValueOnce({
    receipt: {
      operationId: 'wrong-operation-0001',
      action: 'start',
      expectedCheckpoint: null,
      confirmedCheckpoint: 0,
    },
    progress,
  });
  render(
    <AdventureDeletionDialog
      adventureId={adventureId}
      open
      onClose={vi.fn()}
      onRevoked={revoked}
    />,
  );
  await user.click(await confirmedButton());
  expect(await screen.findByRole('button', { name: 'Confirmar pedido e continuar' })).toBeEnabled();
  expect(revoked).not.toHaveBeenCalled();
  expect(s.transport.advance).not.toHaveBeenCalled();
  expect(recovery.readDeletion(uid, adventureId)).toMatchObject({ kind: 'start' });
  await user.click(screen.getByRole('button', { name: 'Confirmar pedido e continuar' }));
  expect(await screen.findByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
  expect(s.transport.start.mock.calls[0]?.[0]).toEqual(s.transport.start.mock.calls[1]?.[0]);
  expect(revoked).toHaveBeenCalledOnce();
});
it('revogação confirmada aparece antes de quota local falhar, preservando o pedido para replay', async () => {
  const user = userEvent.setup(),
    revoked = vi.fn(),
    send = s.transport.start.getMockImplementation()!;
  const write = localStorage.setItem.bind(localStorage);
  let quota = false;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation((key, value) => {
    if (quota) throw Error('Local quota');
    write(key, value);
  });
  s.transport.start.mockImplementation(async (input) => {
    const value = await send(input);
    quota = true;
    return value;
  });
  render(
    <AdventureDeletionDialog
      adventureId={adventureId}
      open
      onClose={vi.fn()}
      onRevoked={revoked}
    />,
  );
  await user.click(await confirmedButton());
  expect(await screen.findByRole('heading', { name: 'Acesso à aventura encerrado' })).toBeVisible();
  expect(await screen.findByText('Local quota')).toBeVisible();
  expect(revoked).toHaveBeenCalledOnce();
  expect(
    screen.queryByRole('button', { name: 'Excluir aventura definitivamente' }),
  ).not.toBeInTheDocument();
  expect(recovery.readDeletion(uid, adventureId)).toMatchObject({ kind: 'start' });
  quota = false;
  s.transport.start.mockImplementation(send);
  await user.click(screen.getByRole('button', { name: 'Confirmar pedido e continuar' }));
  expect(await screen.findByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
  expect(revoked).toHaveBeenCalledOnce();
});
it('confirmação aninhada captura o pedido exibido e recusa intenção alterada por outra aba', async () => {
  const user = userEvent.setup();
  localStorage.setItem(storageKey, JSON.stringify(start));
  render(<AdventureDeletionDialog adventureId={adventureId} open onClose={vi.fn()} />);
  await user.click(await screen.findByRole('button', { name: 'Encerrar início não confirmado' }));
  const modal = screen.getByRole('dialog', { name: 'Encerrar início não confirmado?' });
  const changed = { ...start, input: { ...start.input, operationId: 'other-pending-start-0001' } };
  await act(async () => {
    localStorage.setItem(storageKey, JSON.stringify(changed));
    window.dispatchEvent(new StorageEvent('storage', { key: storageKey }));
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(
      within(modal).getByRole('button', { name: 'Confirmar encerramento inicial' }),
    ).toBeEnabled(),
  );
  await user.click(within(modal).getByRole('button', { name: 'Confirmar encerramento inicial' }));
  expect(await screen.findByText(/O pedido mudou em outra aba/)).toBeVisible();
  expect(recovery.readDeletion(uid, adventureId)).toEqual(changed);
  expect(s.transport.resolveStart).not.toHaveBeenCalled();
  expect(s.transport.start).not.toHaveBeenCalled();
});
it('progresso conhecido é consultado uma vez sem recursão provocada pelo pulso do próprio diário', async () => {
  const final = {
    ...progress,
    checkpoint: 3,
    deletedDocuments: 3,
    updatedAt: 1003,
    phase: 'complete' as const,
    state: 'deleted' as const,
    complete: true,
  };
  s.setJob(final);
  localStorage.setItem(storageKey, JSON.stringify(knownDeletion(final)));
  render(<AdventureDeletionDialog adventureId={adventureId} open onClose={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Aventura excluída' })).toBeVisible();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Consultar progresso da exclusão' })).toBeEnabled(),
  );
  expect(s.transport.get).toHaveBeenCalledOnce();
  expect(s.transport.getSource).not.toHaveBeenCalled();
  expect(s.transport.advance).not.toHaveBeenCalled();
});
it('sem reserva segura permite consulta mas não oferece avanço habilitado', async () => {
  s.setJob(progress);
  Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
  render(<AdventureDeletionDialog adventureId={adventureId} open onClose={vi.fn()} />);
  expect(await screen.findByRole('heading', { name: 'Acesso à aventura encerrado' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Continuar limpeza' })).toBeDisabled();
  expect(screen.getByText(/Este navegador não permite preservar/)).toBeVisible();
  expect(s.transport.advance).not.toHaveBeenCalled();
});
it('falha de leitura permite consultar novamente sem produzir exclusão', async () => {
  const user = userEvent.setup();
  s.transport.get.mockRejectedValueOnce(Error('Read unavailable'));
  render(<AdventureDeletionDialog adventureId={adventureId} open onClose={vi.fn()} />);
  expect(await screen.findByText('Read unavailable')).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Excluir aventura definitivamente' }),
  ).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Consultar progresso da exclusão' }));
  expect(await confirmedButton()).toBeEnabled();
  expect(s.transport.start).not.toHaveBeenCalled();
});
it('sem conta e com diálogo fechado não consulta dados privados', async () => {
  auth.user = null;
  const view = render(<AdventureDeletionDialog adventureId={adventureId} open onClose={vi.fn()} />);
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  auth.user = { uid };
  view.rerender(
    <AdventureDeletionDialog adventureId={adventureId} open={false} onClose={vi.fn()} />,
  );
  await act(() => Promise.resolve());
  expect(s.transport.get).not.toHaveBeenCalled();
  expect(s.transport.getSource).not.toHaveBeenCalled();
});

it('encerramento confirmado de início nunca recebido limpa somente aquele pedido e permite nova revisão', async () => {
  const user = userEvent.setup(),
    revoked = vi.fn();
  localStorage.setItem(storageKey, JSON.stringify(start));
  render(
    <AdventureDeletionDialog
      adventureId={adventureId}
      open
      onClose={vi.fn()}
      onRevoked={revoked}
    />,
  );
  await user.click(await screen.findByRole('button', { name: 'Encerrar início não confirmado' }));
  await user.click(screen.getByRole('button', { name: 'Confirmar encerramento inicial' }));
  expect(await screen.findByText(/Pedido inicial encerrado/)).toBeVisible();
  expect(await confirmedButton()).toBeEnabled();
  expect(recovery.readDeletion(uid, adventureId)).toBeNull();
  expect(s.transport.resolveStart).toHaveBeenCalledWith({ ...start.input, intent: 'cancel' });
  expect(s.transport.start).not.toHaveBeenCalled();
  expect(revoked).not.toHaveBeenCalled();
});
it('conflito confirmado usa o progresso atual sem avançar outra unidade automaticamente', async () => {
  const user = userEvent.setup();
  s.confirm('start', start.input);
  s.setJob({ ...progress, checkpoint: 1, deletedDocuments: 1, updatedAt: 1001, phase: 'controls' });
  localStorage.setItem(storageKey, JSON.stringify(step));
  s.transport.advance.mockRejectedValueOnce(
    Object.assign(Error('Checkpoint conflict'), { details: { reason: 'checkpoint-conflict' } }),
  );
  render(<AdventureDeletionDialog adventureId={adventureId} open onClose={vi.fn()} />);
  await user.click(await screen.findByRole('button', { name: 'Confirmar pedido e continuar' }));
  await user.click(
    await screen.findByRole('button', { name: 'Encerrar tentativa e usar progresso atual' }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Continuar limpeza' })).toBeEnabled(),
  );
  expect(recovery.readDeletion(uid, adventureId)).toMatchObject({
    kind: 'known',
    floor: { checkpoint: 1 },
  });
  expect(s.transport.advance).toHaveBeenCalledOnce();
});
it('fonte ausente apresenta indisponibilidade sem oferecer confirmação destrutiva', async () => {
  s.transport.getSource.mockResolvedValueOnce(null);
  render(<AdventureDeletionDialog adventureId={adventureId} open onClose={vi.fn()} />);
  expect(await screen.findByText(/Esta aventura não está disponível para excluir/)).toBeVisible();
  expect(
    screen.queryByRole('button', { name: 'Excluir aventura definitivamente' }),
  ).not.toBeInTheDocument();
  expect(s.transport.start).not.toHaveBeenCalled();
});

it('revogação de ID nativo longo não depende do orçamento do pulso de apresentação', async () => {
  const id = 'a'.repeat(1500),
    revoked = vi.fn(),
    held = deferred<Awaited<ReturnType<typeof s.transport.advance>>>();
  s.transport.getSource.mockResolvedValueOnce({ ...source, adventureId: id });
  s.transport.get.mockResolvedValueOnce({
    schemaVersion: 1,
    ownerId: uid,
    lookup: { adventureId: id },
    deletion: null,
  });
  s.transport.start.mockImplementationOnce((input) =>
    Promise.resolve({
      receipt: {
        operationId: input.operationId,
        action: 'start',
        expectedCheckpoint: null,
        confirmedCheckpoint: 0,
      },
      progress: { ...progress, adventureId: id, deletionId: input.operationId },
    }),
  );
  s.transport.advance.mockReturnValueOnce(held.promise);
  render(<AdventureDeletionDialog adventureId={id} open onClose={vi.fn()} onRevoked={revoked} />);
  await userEvent.click(await confirmedButton());
  await waitFor(() => expect(revoked).toHaveBeenCalledOnce());
  expect(revoked.mock.calls[0]?.[0]).toMatchObject({ adventureId: id, revoked: true });
  expect(screen.getByRole('heading', { name: 'Acesso à aventura encerrado' })).toBeVisible();
});
