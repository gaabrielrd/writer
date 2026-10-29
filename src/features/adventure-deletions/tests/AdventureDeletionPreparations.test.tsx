import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { AdventureDeletionPreparations } from '../components/AdventureDeletionPreparations';
import { reserveDeletion } from '../services/adventureDeletionRecovery';
import type { AdventureDeletionProgress as Progress } from '../model/adventureDeletion';
import {
  uid,
  adventureId,
  progress,
  start,
  installBrowser,
  server,
  deferred,
  storageKey,
} from './fixtures';
const auth = vi.hoisted((): { user: { uid: string } | null } => ({ user: { uid: 'author' } }));
const rpc = vi.hoisted(() => ({
  getSource: vi.fn(),
  get: vi.fn(),
  start: vi.fn(),
  resolveStart: vi.fn(),
  list: vi.fn(),
  advance: vi.fn(),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/adventureDeletionTransport', () => ({ adventureDeletionTransport: rpc }));
vi.mock('../components/AdventureDeletionDialog', () => ({
  AdventureDeletionDialog: ({
    open,
    adventureId: id,
    onClose,
  }: {
    open: boolean;
    adventureId: string;
    onClose: () => void;
  }) =>
    open ? (
      <section aria-label="Exclusão selecionada">
        <p>{id}</p>
        <button onClick={onClose}>Fechar consulta</button>
      </section>
    ) : null,
}));
const page = (items: Progress[] = [], nextCursor: string | null = null, ownerId = uid) => ({
  schemaVersion: 1,
  ownerId,
  items,
  nextCursor,
});
const line = () => screen.getByRole('button', { name: /PRIVATE_TITLE_NOT_IN_JOURNAL/ });
beforeEach(() => {
  vi.resetAllMocks();
  installBrowser();
  auth.user = { uid };
  Object.assign(rpc, server().transport);
});
it('oculta catálogo vazio sem iniciar ou avançar qualquer pedido', async () => {
  render(<AdventureDeletionPreparations />);
  await waitFor(() =>
    expect(screen.queryByText('Carregando exclusões de aventuras...')).not.toBeInTheDocument(),
  );
  expect(screen.queryByRole('heading', { name: 'Exclusões de aventuras' })).not.toBeInTheDocument();
  expect(rpc.start).not.toHaveBeenCalled();
  expect(rpc.advance).not.toHaveBeenCalled();
});
it('reúne pedido local não recebido e job remoto sem duplicar a aventura; seleção só abre consulta', async () => {
  await reserveDeletion(start, () => {});
  const other = {
    ...progress,
    adventureId: 'other-project',
    deletionId: 'other-deletion-start-0001',
    title: 'Outra exclusão privada',
  };
  rpc.list.mockResolvedValue(page([progress, other]));
  render(<AdventureDeletionPreparations />);
  expect(
    await screen.findByRole('button', { name: /PRIVATE_TITLE_NOT_IN_JOURNAL/ }),
  ).toHaveTextContent('confirmação pendente');
  expect(
    screen.queryByRole('button', { name: /Confirmar exclusão preservada/ }),
  ).not.toBeInTheDocument();
  await userEvent.click(line());
  expect(screen.getByRole('region', { name: 'Exclusão selecionada' })).toHaveTextContent(
    adventureId,
  );
  expect(rpc.start).not.toHaveBeenCalled();
  expect(rpc.advance).not.toHaveBeenCalled();
  expect(localStorage.getItem(storageKey)).not.toContain(progress.title);
});
it('pedido somente local continua descobrível mesmo sem linha remota ou raiz', async () => {
  await reserveDeletion(start, () => {});
  render(<AdventureDeletionPreparations />);
  await userEvent.click(
    await screen.findByRole('button', { name: /Confirmar exclusão preservada/ }),
  );
  expect(screen.getByRole('region', { name: 'Exclusão selecionada' })).toHaveTextContent(
    adventureId,
  );
  expect(rpc.get).not.toHaveBeenCalled();
});
it('carrega páginas, deduplica sobreposição verificada e mantém títulos anteriores se cursor repetir', async () => {
  rpc.list.mockResolvedValueOnce(page([progress], 'page2'));
  render(<AdventureDeletionPreparations />);
  await screen.findByRole('button', { name: /PRIVATE_TITLE_NOT_IN_JOURNAL/ });
  const advanced: Progress = {
    ...progress,
    checkpoint: 1,
    deletedDocuments: 2,
    updatedAt: 1001,
    phase: 'controls',
  };
  const other = {
    ...advanced,
    adventureId: 'other',
    deletionId: 'other-deletion-0001',
    title: 'Outra página',
  };
  rpc.list.mockResolvedValueOnce(page([advanced, other], 'page3'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Carregar mais exclusões de aventuras' }),
  );
  expect(await screen.findByRole('button', { name: /Outra página/ })).toBeVisible();
  expect(screen.getAllByRole('button', { name: /PRIVATE_TITLE_NOT_IN_JOURNAL/ })).toHaveLength(1);
  rpc.list.mockResolvedValueOnce(page([{ ...other, title: 'NÃO ADOTAR' }], 'page2'));
  await userEvent.click(
    screen.getByRole('button', { name: 'Carregar mais exclusões de aventuras' }),
  );
  expect(await screen.findByText(/A paginação mudou/)).toBeVisible();
  expect(screen.queryByText(/NÃO ADOTAR/)).not.toBeInTheDocument();
  expect(line()).toBeVisible();
});
for (const mutation of [
  { checkpoint: 0, updatedAt: 1000, deletedDocuments: 0, phase: 'quiescence' },
  { deletionToken: 'd'.repeat(64) },
  { deletionId: 'replacement-deletion-0001' },
  { ownerId: 'another-account' },
])
  it(
    'preserva linhas verificadas ao rejeitar regressão ou troca de identidade: ' +
      JSON.stringify(mutation),
    async () => {
      const known: Progress = {
        ...progress,
        checkpoint: 2,
        updatedAt: 1002,
        deletedDocuments: 3,
        phase: 'controls',
      };
      rpc.list.mockResolvedValueOnce(page([known]));
      render(<AdventureDeletionPreparations />);
      await screen.findByRole('button', { name: /PRIVATE_TITLE_NOT_IN_JOURNAL/ });
      rpc.list.mockResolvedValueOnce(
        page([{ ...known, ...mutation, title: 'Resposta rejeitada' } as Progress]),
      );
      await userEvent.click(
        screen.getByRole('button', { name: 'Atualizar exclusões de aventuras' }),
      );
      expect(await screen.findByRole('alert')).toBeVisible();
      expect(screen.queryByText(/Resposta rejeitada/)).not.toBeInTheDocument();
      expect(line()).toBeVisible();
    },
  );
it('troca de conta invalida resposta atrasada sem revelar título anterior ou iniciar RPC de mutação', async () => {
  const delayed = deferred<ReturnType<typeof page>>();
  rpc.list.mockReturnValueOnce(delayed.promise);
  const view = render(<AdventureDeletionPreparations />);
  await waitFor(() => expect(rpc.list).toHaveBeenCalledOnce());
  auth.user = { uid: 'other' };
  rpc.list.mockResolvedValue(page([], null, 'other'));
  view.rerender(<AdventureDeletionPreparations />);
  await act(async () => {
    delayed.resolve(page([progress]));
    await delayed.promise;
  });
  await waitFor(() =>
    expect(screen.queryByText('Carregando exclusões de aventuras...')).not.toBeInTheDocument(),
  );
  expect(screen.queryByText(progress.title)).not.toBeInTheDocument();
  expect(rpc.start).not.toHaveBeenCalled();
});
it('falha de consulta pode ser repetida; controle local inválido é preservado sem substituição', async () => {
  localStorage.setItem(storageKey, '{"invalid":true}');
  rpc.list.mockRejectedValueOnce(Error('Sem resposta'));
  render(<AdventureDeletionPreparations />);
  expect(await screen.findByText('Sem resposta')).toBeVisible();
  expect(screen.getByText(/pedido local inválido foi preservado/)).toBeVisible();
  rpc.list.mockResolvedValue(page([progress]));
  await userEvent.click(
    screen.getByRole('button', { name: 'Tentar listar exclusões de aventuras novamente' }),
  );
  expect(await screen.findByRole('button', { name: /PRIVATE_TITLE_NOT_IN_JOURNAL/ })).toBeVisible();
  expect(localStorage.getItem(storageKey)).toBe('{"invalid":true}');
});
it('notificação de metadata local atualiza somente a união e não relê o servidor por unidade', async () => {
  render(<AdventureDeletionPreparations />);
  await waitFor(() =>
    expect(screen.queryByText('Carregando exclusões de aventuras...')).not.toBeInTheDocument(),
  );
  await act(async () => {
    await reserveDeletion(start, () => {});
  });
  expect(
    await screen.findByRole('button', { name: /Confirmar exclusão preservada/ }),
  ).toBeVisible();
  expect(rpc.list).toHaveBeenCalledOnce();
});
it('não consulta sem conta autenticada', () => {
  auth.user = null;
  render(<AdventureDeletionPreparations />);
  expect(rpc.list).not.toHaveBeenCalled();
});
