import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router';
import { chooseDropdown } from '@/test/dropdown';
import { ProjectProgressPanel } from '../components/ProjectProgressPanel';
import * as service from '../services/workProgressService';
import type { WorkProgress, WorkTarget } from '../model/workProgress';
import { progress, target, task, checklist, conflict, uncertain, deferred } from './workFixtures';
const auth = vi.hoisted((): { user: { uid: string } | null; loading: boolean } => ({
  user: { uid: 'owner' },
  loading: false,
}));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/workProgressService');
vi.mock('../services/workTimeZone', async (original) => ({
  ...(await original<object>()),
  deviceTimeZone: () => 'America/Sao_Paulo',
  availableTimeZones: () => ['UTC', 'America/Sao_Paulo'],
}));
let current: WorkProgress;
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { uid: 'owner' };
  auth.loading = false;
  current = progress();
  vi.mocked(service.getWorkProgress).mockImplementation(() => Promise.resolve(current));
  vi.mocked(service.getWorkPreferences).mockResolvedValue({ revision: 1, timeZone: 'UTC' });
  vi.mocked(service.listWorkChecklist).mockResolvedValue(checklist([]));
  vi.mocked(service.updateWorkProgress).mockImplementation((input) => {
    current = { ...current, ...input.patch, revision: current.revision + 1 };
    return Promise.resolve({
      revision: current.revision,
      editorialState: current.editorialState ?? 'draft',
      wordGoal: current.wordGoal,
    });
  });
});
const tree = (scope: WorkTarget = target) => (
  <MemoryRouter>
    <ProjectProgressPanel target={scope} />
  </MemoryRouter>
);
it('cobre carregando, erro recuperável e progresso autorizado sem checklist de livro', async () => {
  const pending = deferred<WorkProgress | null>();
  vi.mocked(service.getWorkProgress).mockReturnValueOnce(pending.promise);
  render(tree());
  expect(screen.getByText('Carregando progresso…')).toBeVisible();
  await act(async () => {
    pending.reject(new Error('Offline'));
    await Promise.resolve();
  });
  expect(screen.getByText('Offline')).toBeVisible();
  await userEvent
    .setup({ delay: null })
    .click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('40 de 100 palavras confirmadas')).toBeVisible();
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '40');
  expect(screen.queryByText('Checklist de preparação')).not.toBeInTheDocument();
  expect(service.prepareWorkWordCount).not.toHaveBeenCalled();
});
it('estado pronto e meta total acima do alvo não publicam, e remover meta preserva escrita', async () => {
  render(tree());
  await screen.findByLabelText('Meta total de palavras');
  const user = userEvent.setup({ delay: null });
  await chooseDropdown(user, screen.getByRole('combobox', { name: 'Estado editorial' }), 'Pronto');
  await user.clear(screen.getByLabelText('Meta total de palavras'));
  await user.type(screen.getByLabelText('Meta total de palavras'), '20');
  await user.click(screen.getByRole('button', { name: 'Salvar progresso' }));
  expect(await screen.findByText('Meta atingida')).toBeVisible();
  expect(screen.getByRole('progressbar')).toHaveAttribute('value', '20');
  expect(service.updateWorkProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      target,
      expectedRevision: 1,
      patch: { editorialState: 'ready', wordGoal: 20 },
    }),
  );
  await user.clear(screen.getByLabelText('Meta total de palavras'));
  await user.click(screen.getByRole('button', { name: 'Salvar progresso' }));
  expect(
    await screen.findByText('Nenhuma meta definida. Você pode continuar escrevendo.'),
  ).toBeVisible();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
});
it('meta inválida tem feedback sem gravar ou bloquear o painel', async () => {
  render(tree());
  const input = await screen.findByLabelText('Meta total de palavras');
  const user = userEvent.setup({ delay: null });
  await user.clear(input);
  await user.type(input, '0');
  await user.click(screen.getByRole('button', { name: 'Salvar progresso' }));
  expect(await screen.findByText('Informe um número inteiro positivo de palavras.')).toBeVisible();
  expect(input).toBeEnabled();
  expect(service.updateWorkProgress).not.toHaveBeenCalled();
  expect(screen.getByText('40 de 100 palavras confirmadas')).toBeVisible();
});
it('resposta incerta bloqueia o payload e repete o mesmo recibo', async () => {
  vi.mocked(service.updateWorkProgress).mockRejectedValueOnce(uncertain());
  render(tree());
  const input = await screen.findByLabelText('Meta total de palavras');
  const user = userEvent.setup({ delay: null });
  await user.clear(input);
  await user.type(input, '80');
  await user.click(screen.getByRole('button', { name: 'Salvar progresso' }));
  expect(
    await screen.findByText('Não foi possível confirmar esta operação. Tente novamente.'),
  ).toBeVisible();
  expect(input).toBeDisabled();
  const first = vi.mocked(service.updateWorkProgress).mock.calls[0]?.[0];
  if (!first) throw new Error('Pedido ausente');
  await user.click(screen.getByRole('button', { name: 'Confirmar progresso novamente' }));
  await screen.findByText('40 de 80 palavras confirmadas');
  expect(service.updateWorkProgress).toHaveBeenCalledTimes(2);
  expect(vi.mocked(service.updateWorkProgress).mock.calls[1]?.[0]).toEqual(first);
});
it('conflito preserva campos, compara a versão atual e usa CAS observado na confirmação', async () => {
  vi.mocked(service.updateWorkProgress).mockImplementationOnce(() => {
    current = { ...current, revision: 3, editorialState: 'review', wordGoal: 70 };
    return Promise.reject(conflict());
  });
  render(tree());
  const input = await screen.findByLabelText('Meta total de palavras');
  const user = userEvent.setup({ delay: null });
  await user.clear(input);
  await user.type(input, '90');
  await user.click(screen.getByRole('button', { name: 'Salvar progresso' }));
  await user.click(await screen.findByRole('button', { name: 'Comparar versão atual' }));
  expect(await screen.findByText(/Versão atual: Em revisão; meta 70/)).toBeVisible();
  expect(input).toHaveValue('90');
  await user.click(screen.getByRole('button', { name: 'Salvar progresso' }));
  await screen.findByText('40 de 90 palavras confirmadas');
  expect(service.updateWorkProgress).toHaveBeenLastCalledWith(
    expect.objectContaining({
      expectedRevision: 3,
      patch: { editorialState: 'draft', wordGoal: 90 },
    }),
  );
});
it('verificação é explícita, retomável e não mostra zero antes de completar', async () => {
  current = progress(target, {
    manuscript: { ready: false, wordCount: null, operationId: 'existing-job', processed: 5 },
  });
  vi.mocked(service.prepareWorkWordCount)
    .mockRejectedValueOnce(uncertain())
    .mockResolvedValueOnce({ complete: false, processed: 25, wordCount: null })
    .mockImplementationOnce(() => {
      current = { ...current, manuscript: { ready: true, wordCount: 60 } };
      return Promise.resolve({ complete: true, processed: 28, wordCount: 60 });
    });
  render(tree());
  expect(await screen.findByText('O total ainda precisa ser verificado.')).toBeVisible();
  expect(service.prepareWorkWordCount).not.toHaveBeenCalled();
  expect(screen.queryByText(/0.*palavras confirmadas/)).not.toBeInTheDocument();
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole('button', { name: 'Retomar verificação' }));
  await screen.findByText('Não foi possível confirmar esta operação. Tente novamente.');
  await user.click(screen.getByRole('button', { name: 'Retomar verificação' }));
  expect(await screen.findByText('60 de 100 palavras confirmadas')).toBeVisible();
  expect(service.prepareWorkWordCount).toHaveBeenCalledTimes(3);
  for (const call of vi.mocked(service.prepareWorkWordCount).mock.calls)
    expect(call[0]).toEqual({ target, operationId: 'existing-job', limit: 25 });
});
it.each([
  null,
  progress(target, { ownerId: 'foreign' }),
  progress({ kind: 'adventure', id: 'other' }),
])('recusa contexto indisponível ou de outra origem %j', async (value) => {
  vi.mocked(service.getWorkProgress).mockResolvedValue(value);
  render(tree());
  expect(await screen.findByText('Progresso indisponível')).toBeVisible();
  expect(screen.queryByLabelText('Meta total de palavras')).not.toBeInTheDocument();
});
it('troca de UID descarta resposta privada tardia e preserva somente a nova conta', async () => {
  const old = deferred<WorkProgress | null>();
  vi.mocked(service.getWorkProgress)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce(progress(target, { ownerId: 'other', wordGoal: 123 }));
  const rendered = render(tree());
  auth.user = { uid: 'other' };
  rendered.rerender(tree());
  expect(await screen.findByLabelText('Meta total de palavras')).toHaveValue('123');
  await act(async () => {
    old.resolve(progress(target, { wordGoal: 999 }));
    await Promise.resolve();
  });
  expect(screen.getByLabelText('Meta total de palavras')).toHaveValue('123');
});
it('campanha mostra apenas checklist privado com totais globais, sem meta ou sessão', async () => {
  const scope: WorkTarget = { kind: 'campaign', id: 'campaign' };
  current = progress(scope);
  vi.mocked(service.listWorkChecklist).mockResolvedValue({
    ...checklist([task]),
    total: 10,
    completed: 3,
  });
  render(tree(scope));
  expect(await screen.findByText('3 de 10 tarefas concluídas')).toBeVisible();
  expect(screen.queryByLabelText('Meta total de palavras')).not.toBeInTheDocument();
  expect(screen.queryByLabelText('Estado editorial')).not.toBeInTheDocument();
  expect(screen.getByText('Revisar pistas')).toBeVisible();
});
it('cria, renomeia e remove tarefa preservando confirmação e revisão', async () => {
  const scope: WorkTarget = { kind: 'adventure', id: 'adventure' };
  current = progress(scope);
  let items = [task];
  vi.mocked(service.listWorkChecklist).mockImplementation(() => Promise.resolve(checklist(items)));
  vi.mocked(service.createWorkChecklistItem).mockImplementation((input) => {
    const item = { ...task, id: 'new', title: input.title };
    items = [...items, item];
    return Promise.resolve({ item, checklistRevision: 2, total: 2, completed: 0 });
  });
  vi.mocked(service.updateWorkChecklistItem).mockImplementation((input) => {
    const item = { ...task, ...input.patch, revision: 2 };
    items = [item];
    return Promise.resolve({ item, checklistRevision: 3, total: 1, completed: 0 });
  });
  vi.mocked(service.deleteWorkChecklistItem).mockImplementation(() => {
    items = [];
    return Promise.resolve({ checklistRevision: 4, total: 0, completed: 0 });
  });
  render(tree(scope));
  await screen.findByText('Revisar pistas');
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole('button', { name: 'Adicionar tarefa' }));
  await user.type(screen.getByLabelText('Título da tarefa'), 'Preparar mapas');
  await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }));
  expect(await screen.findByText('Preparar mapas')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Editar tarefa Revisar pistas' }));
  await user.clear(screen.getByLabelText('Título da tarefa'));
  await user.type(screen.getByLabelText('Título da tarefa'), 'Revisar mapas');
  await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }));
  expect(await screen.findByText('Revisar mapas')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Remover tarefa Revisar mapas' }));
  const dialog = screen.getByRole('dialog', { name: 'Remover tarefa' });
  await user.click(within(dialog).getByRole('button', { name: 'Remover tarefa' }));
  expect(await screen.findByText('Nenhuma tarefa de preparação')).toBeVisible();
  expect(service.deleteWorkChecklistItem).toHaveBeenCalledWith(
    expect.objectContaining({ expectedRevision: 2, id: 'task' }),
  );
});
it('paginação de tarefas mantém página anterior em erro e muda filtro sem cursor antigo', async () => {
  const scope: WorkTarget = { kind: 'campaign', id: 'campaign' };
  current = progress(scope);
  vi.mocked(service.listWorkChecklist)
    .mockResolvedValueOnce({ ...checklist([task], 'next'), total: 30 })
    .mockRejectedValueOnce(new Error('Página indisponível'))
    .mockResolvedValueOnce({
      ...checklist([{ ...task, id: 'second', title: 'Preparar NPCs' }]),
      total: 30,
    });
  render(tree(scope));
  await screen.findByText('Revisar pistas');
  const user = userEvent.setup({ delay: null });
  await user.click(screen.getByRole('button', { name: 'Carregar mais tarefas' }));
  expect(await screen.findByText('Página indisponível')).toBeVisible();
  expect(screen.getByText('Revisar pistas')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Tentar carregar tarefas novamente' }));
  expect(await screen.findByText('Preparar NPCs')).toBeVisible();
  await chooseDropdown(
    user,
    screen.getByRole('combobox', { name: 'Mostrar tarefas' }),
    'Pendentes',
  );
  await waitFor(() =>
    expect(service.listWorkChecklist).toHaveBeenLastCalledWith({
      target: scope,
      filter: 'pending',
      cursor: null,
      limit: 25,
    }),
  );
});
it('retomada removida apresenta aviso genérico no projeto autorizado', async () => {
  render(
    <MemoryRouter
      initialEntries={[{ pathname: '/books/book', state: { workResumeFallback: true } }]}
    >
      <ProjectProgressPanel target={target} />
    </MemoryRouter>,
  );
  expect(
    await screen.findByText(
      'O recurso anterior está indisponível. Você pode continuar pelo projeto.',
    ),
  ).toBeVisible();
});
it('sessão anônima e carregamento de conta não buscam dados privados', () => {
  auth.loading = true;
  const rendered = render(tree());
  expect(screen.getByText('Carregando conta…')).toBeVisible();
  auth.loading = false;
  auth.user = null;
  rendered.rerender(tree());
  expect(screen.getByText('Entre para acompanhar seu trabalho')).toBeVisible();
  expect(service.getWorkProgress).not.toHaveBeenCalled();
});

it('conclusão e reabertura de tarefa preservam recibo incerto e nunca somam só a página', async () => {
  const scope: WorkTarget = { kind: 'campaign', id: 'campaign' };
  current = progress(scope);
  let completed = false;
  vi.mocked(service.listWorkChecklist).mockImplementation(() =>
    Promise.resolve({
      ...checklist([{ ...task, completed, revision: completed ? 2 : 3 }]),
      total: 10,
      completed: completed ? 4 : 3,
    }),
  );
  vi.mocked(service.updateWorkChecklistItem)
    .mockRejectedValueOnce(uncertain())
    .mockImplementation((input) => {
      completed = Boolean(input.patch.completed);
      return Promise.resolve({
        item: { ...task, completed, revision: completed ? 2 : 3 },
        checklistRevision: 2,
        total: 10,
        completed: completed ? 4 : 3,
      });
    });
  render(tree(scope));
  const user = userEvent.setup({ delay: null });
  await user.click(await screen.findByRole('button', { name: 'Concluir tarefa Revisar pistas' }));
  await screen.findByText('Não foi possível confirmar esta operação. Tente novamente.');
  const first = vi.mocked(service.updateWorkChecklistItem).mock.calls[0]?.[0];
  if (!first) throw new Error('Pedido ausente');
  await user.click(screen.getByRole('button', { name: 'Confirmar tarefa novamente' }));
  expect(await screen.findByText('4 de 10 tarefas concluídas')).toBeVisible();
  expect(vi.mocked(service.updateWorkChecklistItem).mock.calls[1]?.[0]).toEqual(first);
  await user.click(screen.getByRole('button', { name: 'Reabrir tarefa Revisar pistas' }));
  expect(await screen.findByText('3 de 10 tarefas concluídas')).toBeVisible();
  expect(service.updateWorkChecklistItem).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: 2, patch: { completed: false } }),
  );
});
it('edição de tarefa em conflito compara páginas sem perder título local', async () => {
  const scope: WorkTarget = { kind: 'adventure', id: 'adventure' };
  current = progress(scope);
  vi.mocked(service.listWorkChecklist)
    .mockResolvedValueOnce(checklist([task]))
    .mockResolvedValueOnce(checklist([{ ...task, id: 'other', title: 'Outra tarefa' }], 'next'))
    .mockRejectedValueOnce(conflict())
    .mockResolvedValueOnce(
      checklist([{ ...task, id: 'other', title: 'Outra tarefa' }], 'fresh-next'),
    )
    .mockResolvedValueOnce(checklist([{ ...task, title: 'Título remoto', revision: 3 }]))
    .mockResolvedValue(checklist([{ ...task, title: 'Título escolhido', revision: 4 }]));
  vi.mocked(service.updateWorkChecklistItem)
    .mockRejectedValueOnce(conflict())
    .mockResolvedValueOnce({
      item: { ...task, title: 'Título escolhido', revision: 4 },
      checklistRevision: 3,
      total: 1,
      completed: 0,
    });
  render(tree(scope));
  const user = userEvent.setup({ delay: null });
  await user.click(await screen.findByRole('button', { name: 'Editar tarefa Revisar pistas' }));
  await user.clear(screen.getByLabelText('Título da tarefa'));
  await user.type(screen.getByLabelText('Título da tarefa'), 'Título escolhido');
  await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }));
  await user.click(await screen.findByRole('button', { name: 'Conferir versão atual' }));
  await user.click(
    await screen.findByRole('button', { name: 'Procurar tarefa na próxima página' }),
  );
  await screen.findByRole('button', { name: 'Conferir versão atual' });
  expect(screen.getByLabelText('Título da tarefa')).toHaveValue('Título escolhido');
  await user.click(screen.getByRole('button', { name: 'Conferir versão atual' }));
  await user.click(
    await screen.findByRole('button', { name: 'Procurar tarefa na próxima página' }),
  );
  expect(await screen.findByText(/Versão atual: Título remoto/)).toBeVisible();
  expect(screen.getByLabelText('Título da tarefa')).toHaveValue('Título escolhido');
  await user.click(screen.getByRole('button', { name: 'Salvar tarefa' }));
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(service.updateWorkChecklistItem).toHaveBeenLastCalledWith(
    expect.objectContaining({ expectedRevision: 3, patch: { title: 'Título escolhido' } }),
  );
});

it('atualiza total após metadata do projeto mudar sem perder campos ou rebasear CAS', async () => {
  const view = render(
    <MemoryRouter>
      <ProjectProgressPanel target={target} manuscriptRefreshKey={1} />
    </MemoryRouter>,
  );
  const user = userEvent.setup({ delay: null });
  const goal = await screen.findByLabelText('Meta total de palavras');
  await user.clear(goal);
  await user.type(goal, '80');
  await chooseDropdown(
    user,
    screen.getByRole('combobox', { name: 'Estado editorial' }),
    'Em revisão',
  );
  current = progress(target, {
    revision: 9,
    editorialState: 'ready',
    wordGoal: 300,
    manuscript: { ready: true, wordCount: 60 },
  });
  view.rerender(
    <MemoryRouter>
      <ProjectProgressPanel target={target} manuscriptRefreshKey={2} />
    </MemoryRouter>,
  );
  expect(await screen.findByText('60 de 100 palavras confirmadas')).toBeVisible();
  expect(goal).toHaveValue('80');
  expect(screen.getByRole('combobox', { name: 'Estado editorial' })).toHaveTextContent(
    'Em revisão',
  );
  vi.mocked(service.updateWorkProgress).mockRejectedValueOnce(conflict());
  await user.click(screen.getByRole('button', { name: 'Salvar progresso' }));
  await screen.findByRole('button', { name: 'Comparar versão atual' });
  expect(service.updateWorkProgress).toHaveBeenCalledWith(
    expect.objectContaining({
      expectedRevision: 1,
      patch: { editorialState: 'review', wordGoal: 80 },
    }),
  );
  vi.mocked(service.getWorkProgress).mockRejectedValueOnce(new Error('Contagem indisponível'));
  await user.click(screen.getByRole('button', { name: 'Atualizar contagem' }));
  expect(await screen.findByText('Contagem indisponível')).toBeVisible();
  expect(screen.getByText('60 de 100 palavras confirmadas')).toBeVisible();
  current = progress(target, { manuscript: { ready: true, wordCount: 20 } });
  await user.click(screen.getByRole('button', { name: 'Atualizar contagem' }));
  expect(await screen.findByText('20 de 100 palavras confirmadas')).toBeVisible();
  expect(goal).toHaveValue('80');
});
it('contagem tardia não substitui leitura mais recente do mesmo projeto', async () => {
  const pending = deferred<WorkProgress | null>();
  const view = render(
    <MemoryRouter>
      <ProjectProgressPanel target={target} manuscriptRefreshKey={1} />
    </MemoryRouter>,
  );
  await screen.findByText('40 de 100 palavras confirmadas');
  vi.mocked(service.getWorkProgress).mockReturnValueOnce(pending.promise);
  view.rerender(
    <MemoryRouter>
      <ProjectProgressPanel target={target} manuscriptRefreshKey={2} />
    </MemoryRouter>,
  );
  await waitFor(() => expect(service.getWorkProgress).toHaveBeenCalledTimes(2));
  current = progress(target, { manuscript: { ready: true, wordCount: 10 } });
  view.rerender(
    <MemoryRouter>
      <ProjectProgressPanel target={target} manuscriptRefreshKey={3} />
    </MemoryRouter>,
  );
  expect(await screen.findByText('10 de 100 palavras confirmadas')).toBeVisible();
  await act(async () => {
    pending.resolve(progress(target, { manuscript: { ready: true, wordCount: 999 } }));
    await pending.promise;
  });
  expect(screen.getByText('10 de 100 palavras confirmadas')).toBeVisible();
  expect(screen.queryByText('999 de 100 palavras confirmadas')).not.toBeInTheDocument();
});
it('conflito ao concluir oferece comparação no diálogo sem submeter novamente a tarefa', async () => {
  const scope: WorkTarget = { kind: 'campaign', id: 'campaign' };
  current = progress(scope);
  vi.mocked(service.listWorkChecklist)
    .mockResolvedValueOnce(checklist([task]))
    .mockResolvedValueOnce(checklist([{ ...task, title: 'Título remoto', revision: 3 }]));
  vi.mocked(service.updateWorkChecklistItem).mockRejectedValueOnce(conflict());
  render(tree(scope));
  const user = userEvent.setup({ delay: null });
  await user.click(await screen.findByRole('button', { name: 'Concluir tarefa Revisar pistas' }));
  await user.click(await screen.findByRole('button', { name: 'Conferir tarefa atual' }));
  await user.click(screen.getByRole('button', { name: 'Conferir versão atual' }));
  expect(await screen.findByText(/Versão atual: Título remoto/)).toBeVisible();
  expect(screen.getByLabelText('Título da tarefa')).toHaveValue('Revisar pistas');
  expect(service.updateWorkChecklistItem).toHaveBeenCalledTimes(1);
});
