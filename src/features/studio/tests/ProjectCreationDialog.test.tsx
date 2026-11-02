import { beforeEach, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createAdventure, type Adventure } from '@/features/adventures';
import { createCampaign, type Campaign } from '@/features/campaigns';
import { ProjectCreationDialog } from '../components/ProjectCreationDialog';
vi.mock('@/features/adventures', () => ({ createAdventure: vi.fn() }));
vi.mock('@/features/campaigns', () => ({ createCampaign: vi.fn() }));
vi.mock('@/features/universes', () => ({
  UniverseSelect: ({
    onChange,
    disabled,
    hint,
  }: {
    onChange: (value: string | null) => void;
    disabled: boolean;
    hint: string;
  }) => (
    <div>
      <p>{hint}</p>
      <button type="button" disabled={disabled} onClick={() => onChange('world')}>
        Vincular Atlas
      </button>
    </div>
  ),
}));
const campaign: Campaign = {
  id: 'campaign',
  ownerId: 'owner',
  schemaVersion: 1,
  revision: 1,
  title: 'Campanha',
  description: '',
  provenance: { kind: 'independent' },
  status: 'planning',
  universeId: null,
  createdAt: 1,
  updatedAt: 1,
};
const adventure: Adventure = {
  id: 'adventure',
  ownerId: 'owner',
  schemaVersion: 1,
  revision: 1,
  title: 'Aventura',
  synopsis: '',
  origin: { kind: 'authored' },
  language: 'pt-BR',
  status: 'draft',
  universeId: null,
  createdAt: 1,
  updatedAt: 1,
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(createCampaign).mockReset().mockResolvedValue(campaign);
  vi.mocked(createAdventure).mockReset().mockResolvedValue(adventure);
});
function requestAt<T>(calls: readonly (readonly [T])[], index: number): T {
  const call = calls[index];
  if (!call) throw new Error('A chamada de criação esperada não ocorreu.');
  return call[0];
}
function props(kind: 'adventure' | 'campaign' = 'campaign') {
  return { kind, open: true, onClose: vi.fn(), onCreated: vi.fn() };
}
it('cria campanha independente só após persistência e bloqueia envio duplicado', async () => {
  let finish!: (project: Campaign) => void;
  vi.mocked(createCampaign).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const callbacks = props();
  render(<ProjectCreationDialog {...callbacks} />);
  expect(screen.getByRole('button', { name: 'Criar campanha' })).toBeDisabled();
  await userEvent.type(screen.getByLabelText('Título da campanha'), '  Mesa independente  ');
  await userEvent.type(screen.getByLabelText('Descrição da campanha'), '  Uma premissa privada  ');
  await userEvent.click(screen.getByRole('button', { name: 'Criar campanha' }));
  expect(screen.getByRole('button', { name: 'Criando...' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Fechar formulário' })).toBeDisabled();
  expect(callbacks.onCreated).not.toHaveBeenCalled();
  expect(createCampaign).toHaveBeenCalledOnce();
  expect(requestAt(vi.mocked(createCampaign).mock.calls, 0)).toMatchObject({
    title: 'Mesa independente',
    description: 'Uma premissa privada',
    universeId: null,
  });
  await act(async () => {
    finish(campaign);
    await Promise.resolve();
  });
  expect(callbacks.onCreated).toHaveBeenCalledWith('campaign');
});
it('cria aventura com sinopse e universo opcional sem criar dependências', async () => {
  const callbacks = props('adventure');
  render(<ProjectCreationDialog {...callbacks} />);
  await userEvent.type(screen.getByLabelText('Título da aventura'), 'O sino');
  await userEvent.type(screen.getByLabelText('Sinopse da aventura'), 'Uma pista');
  await userEvent.click(screen.getByRole('button', { name: 'Vincular Atlas' }));
  await userEvent.click(screen.getByRole('button', { name: 'Criar aventura' }));
  expect(requestAt(vi.mocked(createAdventure).mock.calls, 0)).toMatchObject({
    title: 'O sino',
    synopsis: 'Uma pista',
    universeId: 'world',
  });
  expect(callbacks.onCreated).toHaveBeenCalledWith('adventure');
  expect(createCampaign).not.toHaveBeenCalled();
});
it('preserva pedido incerto, recebe foco no erro e verifica a mesma operação após reabrir', async () => {
  vi.mocked(createCampaign)
    .mockRejectedValueOnce(
      Object.assign(new Error('Não foi possível confirmar esta operação. Tente novamente.'), {
        code: 'functions/internal',
      }),
    )
    .mockResolvedValue(campaign);
  const callbacks = props();
  const view = render(<ProjectCreationDialog {...callbacks} />);
  await userEvent.type(screen.getByLabelText('Título da campanha'), 'Atlas');
  await userEvent.click(screen.getByRole('button', { name: 'Criar campanha' }));
  const error = await screen.findByText(
    'Não foi possível confirmar esta operação. Tente novamente.',
  );
  expect(error.closest('[role=alert]')).toHaveFocus();
  expect(screen.getByLabelText('Título da campanha')).toBeDisabled();
  expect(callbacks.onCreated).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Fechar formulário' }));
  expect(callbacks.onClose).toHaveBeenCalledOnce();
  view.rerender(<ProjectCreationDialog {...callbacks} open={false} />);
  view.rerender(<ProjectCreationDialog {...callbacks} />);
  expect(screen.getByLabelText('Título da campanha')).toHaveValue('Atlas');
  await userEvent.click(screen.getByRole('button', { name: 'Verificar criação' }));
  expect(requestAt(vi.mocked(createCampaign).mock.calls, 0)).toEqual(
    requestAt(vi.mocked(createCampaign).mock.calls, 1),
  );
  expect(callbacks.onCreated).toHaveBeenCalledWith('campaign');
});
it('permite corrigir erro definitivo usando nova operação somente quando o payload muda', async () => {
  const failure = Object.assign(new Error('Universo indisponível'), {
    code: 'functions/failed-precondition',
  });
  vi.mocked(createAdventure)
    .mockRejectedValueOnce(failure)
    .mockRejectedValueOnce(failure)
    .mockResolvedValue(adventure);
  render(<ProjectCreationDialog {...props('adventure')} />);
  await userEvent.type(screen.getByLabelText('Título da aventura'), 'O sino');
  await userEvent.click(screen.getByRole('button', { name: 'Criar aventura' }));
  await screen.findByText('Universo indisponível');
  expect(screen.getByLabelText('Título da aventura')).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Criar aventura' }));
  await screen.findByText('Universo indisponível');
  expect(requestAt(vi.mocked(createAdventure).mock.calls, 1).operationId).toBe(
    requestAt(vi.mocked(createAdventure).mock.calls, 0).operationId,
  );
  await userEvent.type(screen.getByLabelText('Título da aventura'), ' novo');
  await userEvent.click(screen.getByRole('button', { name: 'Criar aventura' }));
  await waitFor(() => expect(createAdventure).toHaveBeenCalledTimes(3));
  expect(requestAt(vi.mocked(createAdventure).mock.calls, 2).operationId).not.toBe(
    requestAt(vi.mocked(createAdventure).mock.calls, 0).operationId,
  );
  expect(requestAt(vi.mocked(createAdventure).mock.calls, 2).title).toBe('O sino novo');
});
it('ignora confirmação de criação que chega após desmontar a conta', async () => {
  let finish!: (project: Campaign) => void;
  vi.mocked(createCampaign).mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const callbacks = props();
  const view = render(<ProjectCreationDialog {...callbacks} />);
  await userEvent.type(screen.getByLabelText('Título da campanha'), 'Conta anterior');
  await userEvent.click(screen.getByRole('button', { name: 'Criar campanha' }));
  view.unmount();
  await act(async () => {
    finish(campaign);
    await Promise.resolve();
  });
  expect(callbacks.onCreated).not.toHaveBeenCalled();
});
