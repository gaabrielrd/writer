import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkActivity } from '../hooks/useWorkActivity';
import { WorkActivityNotice } from '../components/WorkActivityNotice';
import * as service from '../services/workProgressService';
import { target, progress, conflict, uncertain, deferred } from './workFixtures';
import type { WorkProgress } from '../model/workProgress';
const auth = vi.hoisted((): { user: { uid: string } | null } => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/workProgressService');
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { uid: 'owner' };
  vi.mocked(service.getWorkProgress).mockResolvedValue(progress());
  vi.mocked(service.recordWorkActivity).mockResolvedValue({
    activityRevision: 8,
    accessedAt: 2000,
  });
});
function Editor({ enabled = true, id = 'book' }: { enabled?: boolean; id?: string }) {
  const activity = useWorkActivity({
    target: { kind: 'book', id },
    resource: { kind: 'project' },
    enabled,
  });
  return (
    <>
      <p>Texto salvo e disponível</p>
      <WorkActivityNotice activity={activity} />
    </>
  );
}
it('registra só depois de autorizado e não usa corpo, títulos, cursor ou timers', async () => {
  const rendered = render(<Editor enabled={false} />);
  expect(service.getWorkProgress).not.toHaveBeenCalled();
  rendered.rerender(<Editor />);
  await waitFor(() => expect(service.recordWorkActivity).toHaveBeenCalledTimes(1));
  expect(service.recordWorkActivity).toHaveBeenCalledWith({
    target,
    resource: { kind: 'project' },
    operationId: String(vi.mocked(service.recordWorkActivity).mock.calls[0]?.[0].operationId),
    expectedActivityRevision: 7,
  });
  rendered.rerender(<Editor />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(service.recordWorkActivity).toHaveBeenCalledTimes(1);
  expect(screen.getByText('Texto salvo e disponível')).toBeVisible();
});
it('transporte incerto mantém pedido e erro de atividade separado do salvamento', async () => {
  vi.mocked(service.recordWorkActivity).mockRejectedValueOnce(uncertain());
  render(<Editor />);
  await screen.findByText('Retomada não atualizada');
  expect(screen.getByText('Texto salvo e disponível')).toBeVisible();
  const first = vi.mocked(service.recordWorkActivity).mock.calls[0]?.[0];
  if (!first) throw new Error('pedido ausente');
  await userEvent
    .setup({ delay: null })
    .click(screen.getByRole('button', { name: 'Tentar registrar novamente' }));
  await waitFor(() =>
    expect(screen.queryByText('Retomada não atualizada')).not.toBeInTheDocument(),
  );
  expect(service.recordWorkActivity).toHaveBeenCalledTimes(2);
  expect(vi.mocked(service.recordWorkActivity).mock.calls[1]?.[0]).toEqual(first);
  expect(service.getWorkProgress).toHaveBeenCalledTimes(1);
});
it('CAS global conflitante não sobrescreve outra visita sem ação explícita', async () => {
  vi.mocked(service.recordWorkActivity).mockRejectedValueOnce(conflict());
  vi.mocked(service.getWorkProgress)
    .mockResolvedValueOnce(progress())
    .mockResolvedValueOnce(progress(target, { activityRevision: 10 }));
  render(<Editor />);
  await screen.findByText('Retomada não atualizada');
  expect(service.recordWorkActivity).toHaveBeenCalledTimes(1);
  await userEvent
    .setup({ delay: null })
    .click(screen.getByRole('button', { name: 'Registrar este recurso como último acesso' }));
  await waitFor(() => expect(service.recordWorkActivity).toHaveBeenCalledTimes(2));
  expect(service.recordWorkActivity).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedActivityRevision: 10 }),
  );
});
it('resposta de outra conta ou projeto não registra atividade', async () => {
  vi.mocked(service.getWorkProgress).mockResolvedValue(progress(target, { ownerId: 'foreign' }));
  render(<Editor />);
  expect(
    await screen.findByText('O projeto não está disponível para registrar a retomada.'),
  ).toBeVisible();
  expect(service.recordWorkActivity).not.toHaveBeenCalled();
});
it('mudança de UID invalida leitura antiga antes da gravação', async () => {
  const old = deferred<WorkProgress | null>();
  vi.mocked(service.getWorkProgress)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(progress(target, { ownerId: 'other' }));
  const rendered = render(<Editor />);
  await waitFor(() => expect(service.getWorkProgress).toHaveBeenCalledTimes(1));
  auth.user = { uid: 'other' };
  rendered.rerender(<Editor />);
  await waitFor(() => expect(service.recordWorkActivity).toHaveBeenCalledTimes(1));
  await act(async () => {
    old.resolve(progress());
    await Promise.resolve();
  });
  expect(service.recordWorkActivity).toHaveBeenCalledTimes(1);
});
it('resposta de mutação tardia e sessão anônima não alteram nova origem', async () => {
  const pending = deferred<{ activityRevision: number; accessedAt: number }>();
  vi.mocked(service.recordWorkActivity).mockReturnValueOnce(pending.promise);
  const rendered = render(<Editor />);
  await waitFor(() => expect(service.recordWorkActivity).toHaveBeenCalledTimes(1));
  auth.user = null;
  rendered.rerender(<Editor />);
  await act(async () => {
    pending.reject(uncertain());
    await Promise.resolve();
  });
  expect(screen.queryByText('Retomada não atualizada')).not.toBeInTheDocument();
  expect(screen.getByText('Texto salvo e disponível')).toBeVisible();
});
it('falha de leitura oferece retry sem fabricar versão de atividade', async () => {
  vi.mocked(service.getWorkProgress).mockRejectedValueOnce(new Error('Leitura indisponível'));
  render(<Editor />);
  await screen.findByText('Leitura indisponível');
  expect(service.recordWorkActivity).not.toHaveBeenCalled();
  await userEvent
    .setup({ delay: null })
    .click(screen.getByRole('button', { name: 'Tentar registrar novamente' }));
  await waitFor(() => expect(service.recordWorkActivity).toHaveBeenCalledTimes(1));
});

it('visita nova espera a anterior já enviada e lê a versão CAS confirmada sem rebase de conflito', async () => {
  let revision = 7;
  const first = deferred<{ activityRevision: number; accessedAt: number }>();
  vi.mocked(service.getWorkProgress).mockImplementation((input) =>
    Promise.resolve(progress(input.target, { activityRevision: revision })),
  );
  vi.mocked(service.recordWorkActivity)
    .mockReturnValueOnce(first.promise)
    .mockResolvedValueOnce({ activityRevision: 9, accessedAt: 3000 });
  const rendered = render(<Editor />);
  await waitFor(() => expect(service.recordWorkActivity).toHaveBeenCalledTimes(1));
  rendered.rerender(<Editor id="other" />);
  await act(async () => {
    await Promise.resolve();
  });
  expect(service.getWorkProgress).toHaveBeenCalledTimes(1);
  await act(async () => {
    revision = 8;
    first.resolve({ activityRevision: 8, accessedAt: 2000 });

    await Promise.resolve();
  });
  await waitFor(() => expect(service.recordWorkActivity).toHaveBeenCalledTimes(2));
  expect(service.recordWorkActivity).toHaveBeenLastCalledWith(
    expect.objectContaining({ target: { kind: 'book', id: 'other' }, expectedActivityRevision: 8 }),
  );
});

it('visita desmontada enquanto aguarda a fila não é enviada depois de abrir o próximo projeto', async () => {
  const pending = deferred<{ activityRevision: number; accessedAt: number }>();
  vi.mocked(service.getWorkProgress).mockImplementation((input) =>
    Promise.resolve(progress(input.target)),
  );
  vi.mocked(service.recordWorkActivity)
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ activityRevision: 9, accessedAt: 3000 });
  const view = render(<Editor />);
  await waitFor(() => expect(service.recordWorkActivity).toHaveBeenCalledTimes(1));
  view.rerender(<Editor id="intermediate" />);
  view.rerender(<Editor id="latest" />);
  await act(async () => {
    pending.resolve({ activityRevision: 8, accessedAt: 2000 });
    await pending.promise;
  });
  await waitFor(() => expect(service.recordWorkActivity).toHaveBeenCalledTimes(2));
  expect(service.getWorkProgress).toHaveBeenNthCalledWith(2, {
    target: { kind: 'book', id: 'latest' },
  });
  expect(service.getWorkProgress).toHaveBeenCalledTimes(2);
  expect(service.recordWorkActivity).toHaveBeenLastCalledWith(
    expect.objectContaining({ target: { kind: 'book', id: 'latest' } }),
  );
});
