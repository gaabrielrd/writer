import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { NarrativeItemDialog } from '../components/NarrativeItemDialog';
import * as api from '../services/narrativePlanningService';
import {
  arc,
  event,
  milestone,
  target,
  summary,
  conflict,
  transport,
  deferred,
} from './narrativeFixtures';
import type { NarrativeItem, NarrativeMutationResult, NarrativeResource } from '../model/narrative';
vi.mock('../services/narrativePlanningService', () => ({
  createNarrativeItem: vi.fn(),
  updateNarrativeItem: vi.fn(),
  getNarrativeItem: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.createNarrativeItem).mockResolvedValue({
    item: summary(arc),
    projectRevision: 2,
    sceneRevision: 1,
  });
  vi.mocked(api.updateNarrativeItem).mockResolvedValue({
    item: summary(arc),
    projectRevision: 2,
    sceneRevision: 1,
  });
});
it.each<{ resource: NarrativeResource; field: string; value: string }>([
  { resource: { kind: 'arc' }, field: 'Objetivo', value: 'Reconstruir' },
  { resource: { kind: 'event' }, field: 'Data livre (opcional)', value: 'Depois da chuva' },
  {
    resource: { kind: 'milestone', arcId: 'arc' },
    field: 'Notas do marco',
    value: 'Encontrar cartas',
  },
])(
  'cria $resource.kind com campos próprios, título obrigatório e confirmação',
  async ({ resource, field, value }) => {
    const done = vi.fn();
    render(
      <NarrativeItemDialog
        target={target}
        resource={resource}
        onClose={vi.fn()}
        onSuccess={done}
      />,
    );
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
    await user.type(screen.getByLabelText('Título'), 'Uma nova etapa');
    await user.type(screen.getByLabelText(field), value);
    await user.click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() => expect(done).toHaveBeenCalled());
    expect(api.createNarrativeItem).toHaveBeenCalledWith(
      expect.objectContaining({
        target,
        resource,
        title: 'Uma nova etapa',
      }),
    );
  },
);
it.each<NarrativeItem>([arc, event, milestone])(
  'edição $kind preserva valores e revisão',
  async (item) => {
    render(
      <NarrativeItemDialog
        target={target}
        resource={
          item.kind === 'milestone' ? { kind: item.kind, arcId: item.arcId } : { kind: item.kind }
        }
        item={item}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />,
    );
    await userEvent.setup().click(screen.getByRole('button', { name: 'Salvar' }));
    await waitFor(() =>
      expect(api.updateNarrativeItem).toHaveBeenCalledWith(
        expect.objectContaining({
          expectedRevision: 1,
          patch:
            item.kind === 'arc'
              ? {
                  title: item.title,
                  initialState: item.initialState,
                  objective: item.objective,
                  plannedOutcome: item.plannedOutcome,
                }
              : item.kind === 'event'
                ? { title: item.title, description: item.description, dateLabel: item.dateLabel }
                : { title: item.title, notes: item.notes },
        }),
      ),
    );
  },
);
it('resposta perdida conserva payload/operação e congela campos e saída', async () => {
  vi.mocked(api.createNarrativeItem).mockRejectedValueOnce(transport());
  const close = vi.fn();
  render(
    <NarrativeItemDialog
      target={target}
      resource={{ kind: 'event' }}
      onClose={close}
      onSuccess={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Título'), 'O sino');
  await user.click(screen.getByRole('button', { name: 'Salvar' }));
  await screen.findByText(/A resposta não foi confirmada/);
  expect(screen.getByLabelText('Título')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Cancelar' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Fechar' }));
  expect(close).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(api.createNarrativeItem).toHaveBeenCalledTimes(2));
  const first = vi.mocked(api.createNarrativeItem).mock.calls.at(0)?.[0];
  const second = vi.mocked(api.createNarrativeItem).mock.calls.at(1)?.[0];
  expect(first).toBeDefined();
  expect(second).toEqual(first);
});
it('validação definitiva permite corrigir sem perder campos', async () => {
  vi.mocked(api.createNarrativeItem).mockRejectedValueOnce(
    Object.assign(new Error('Verifique o título'), { code: 'functions/invalid-argument' }),
  );
  render(
    <NarrativeItemDialog
      target={target}
      resource={{ kind: 'arc' }}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.type(screen.getByLabelText('Título'), 'Lia');
  await user.click(screen.getByRole('button', { name: 'Salvar' }));
  await screen.findByText('Verifique o título');
  expect(screen.getByLabelText('Título')).toBeEnabled();
  await user.type(screen.getByLabelText('Título'), ' no farol');
  await user.click(screen.getByRole('button', { name: 'Salvar' }));
  await waitFor(() => expect(api.createNarrativeItem).toHaveBeenCalledTimes(2));
  expect(api.createNarrativeItem).toHaveBeenLastCalledWith(
    expect.objectContaining({ title: 'Lia no farol' }),
  );
});
it('conflito compara estado remoto sem substituir preenchimento local', async () => {
  vi.mocked(api.updateNarrativeItem).mockRejectedValueOnce(conflict());
  vi.mocked(api.getNarrativeItem).mockResolvedValue({ ...arc, revision: 4, title: 'Remoto' });
  render(
    <NarrativeItemDialog
      target={target}
      resource={{ kind: 'arc' }}
      item={arc}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.clear(screen.getByLabelText('Título'));
  await user.type(screen.getByLabelText('Título'), 'Meu título');
  await user.click(screen.getByRole('button', { name: 'Salvar' }));
  await user.click(await screen.findByRole('button', { name: 'Comparar com dados atuais' }));
  await screen.findByText('Remoto');
  expect(screen.getByLabelText('Título')).toHaveValue('Meu título');
  await user.click(screen.getByRole('button', { name: 'Salvar' }));
  await waitFor(() =>
    expect(api.updateNarrativeItem).toHaveBeenLastCalledWith(
      expect.objectContaining({
        expectedRevision: 4,
        patch: {
          title: 'Meu título',
          initialState: arc.kind === 'arc' ? arc.initialState : '',
          objective: arc.kind === 'arc' ? arc.objective : '',
          plannedOutcome: arc.kind === 'arc' ? arc.plannedOutcome : '',
        },
      }),
    ),
  );
});
it('comparação de origem perdida mantém conflito e preenchimento', async () => {
  vi.mocked(api.updateNarrativeItem).mockRejectedValueOnce(conflict());
  vi.mocked(api.getNarrativeItem).mockResolvedValue(null);
  render(
    <NarrativeItemDialog
      target={target}
      resource={{ kind: 'arc' }}
      item={arc}
      onClose={vi.fn()}
      onSuccess={vi.fn()}
    />,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Salvar' }));
  await user.click(await screen.findByRole('button', { name: 'Comparar com dados atuais' }));
  await screen.findByText('Item indisponível.');
  expect(screen.getByRole('button', { name: 'Salvar' })).toBeDisabled();
});
it('pedido em andamento não duplica nem confirma após desmontagem', async () => {
  const pending = deferred<NarrativeMutationResult>();
  vi.mocked(api.updateNarrativeItem).mockReturnValue(pending.promise);
  const success = vi.fn();
  const mounted = render(
    <NarrativeItemDialog
      target={target}
      resource={{ kind: 'arc' }}
      item={arc}
      onClose={vi.fn()}
      onSuccess={success}
    />,
  );
  await userEvent.setup().dblClick(screen.getByRole('button', { name: 'Salvar' }));
  expect(api.updateNarrativeItem).toHaveBeenCalledTimes(1);
  mounted.unmount();
  await act(async () => {
    pending.resolve({ item: summary(arc), projectRevision: 2, sceneRevision: 1 });
    await pending.promise;
  });
  expect(success).not.toHaveBeenCalled();
});
