import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { chooseDropdown } from '@/test/dropdown';
import { ContinueWorkPanel } from '../components/ContinueWorkPanel';
import * as service from '../services/workProgressService';
import { recent, target, deferred, conflict } from './workFixtures';
import type { ResumePage, ResolvedResume } from '../model/workProgress';
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
beforeEach(() => {
  vi.resetAllMocks();
  auth.user = { uid: 'owner' };
  auth.loading = false;
  vi.mocked(service.getWorkPreferences).mockResolvedValue({ revision: 1, timeZone: 'UTC' });
  vi.mocked(service.listWorkResume).mockResolvedValue({
    items: [recent],
    nextCursor: null,
    activityRevision: 1,
  });
  vi.mocked(service.resolveWorkResume).mockResolvedValue({
    target,
    title: recent.title,
    resource: recent.resource,
    fallback: false,
  });
});
function Destination() {
  const location = useLocation();
  const state: unknown = location.state;
  return (
    <output aria-label="Destino">
      {location.pathname + location.search}
      {typeof state === 'object' &&
      state !== null &&
      'workResumeFallback' in state &&
      state.workResumeFallback === true
        ? ' aviso'
        : ''}
    </output>
  );
}
function tree() {
  return (
    <MemoryRouter initialEntries={['/studio']}>
      <Routes>
        <Route path="/studio" element={<ContinueWorkPanel />} />
        <Route path="*" element={<Destination />} />
      </Routes>
    </MemoryRouter>
  );
}
it('cobre loading, vazio e retry de erro sem esconder trabalhos disponíveis', async () => {
  const pending = deferred<ResumePage>();
  vi.mocked(service.listWorkResume)
    .mockReturnValueOnce(pending.promise)
    .mockResolvedValueOnce({ items: [], nextCursor: null, activityRevision: 0 });
  render(tree());
  expect(screen.getByText('Carregando seus projetos recentes…')).toBeVisible();
  await act(async () => {
    pending.reject(new Error('Offline'));
    await Promise.resolve();
  });
  await userEvent
    .setup({ delay: null })
    .click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('Nenhum trabalho recente')).toBeVisible();
});
it('página filtrada vazia com cursor mantém próxima página e só confirma vazio no fim', async () => {
  vi.mocked(service.listWorkResume)
    .mockResolvedValueOnce({ items: [], nextCursor: 'next', activityRevision: 1 })
    .mockResolvedValueOnce({ items: [recent], nextCursor: null, activityRevision: 1 });
  render(tree());
  const more = await screen.findByRole('button', { name: 'Carregar mais projetos recentes' });
  expect(screen.queryByText('Nenhum trabalho recente')).not.toBeInTheDocument();
  await userEvent.setup({ delay: null }).click(more);
  expect(await screen.findByRole('heading', { name: recent.title })).toBeVisible();
  expect(service.listWorkResume).toHaveBeenLastCalledWith({ cursor: 'next', limit: 25 });
});
it.each([
  {
    kind: 'chapter',
    id: 'chapter',
    label: 'Continuar capítulo',
    path: '/books/book/editor/chapter',
  },
  { kind: 'scene', id: 'scene', label: 'Continuar cena', path: '/books/book/scenes/scene' },
  { kind: 'project', label: 'Continuar projeto', path: '/books/book' },
] as const)('reautoriza e retoma $kind pela identidade atual', async (resource) => {
  const source =
    resource.kind === 'project'
      ? { kind: resource.kind }
      : { kind: resource.kind, id: resource.id };
  vi.mocked(service.listWorkResume).mockResolvedValue({
    items: [{ ...recent, resource: source }],
    nextCursor: null,
    activityRevision: 1,
  });
  vi.mocked(service.resolveWorkResume).mockResolvedValue({
    target,
    title: recent.title,
    resource: source,
    fallback: false,
  });
  render(tree());
  await userEvent
    .setup({ delay: null })
    .click(await screen.findByRole('button', { name: resource.label }));
  expect(await screen.findByLabelText('Destino')).toHaveTextContent(resource.path);
  expect(service.resolveWorkResume).toHaveBeenCalledWith({ target });
});
it('recurso removido retorna ao projeto com aviso genérico sem nome histórico', async () => {
  vi.mocked(service.resolveWorkResume).mockResolvedValue({
    target,
    title: recent.title,
    resource: { kind: 'project' },
    fallback: true,
  });
  render(tree());
  await userEvent
    .setup({ delay: null })
    .click(await screen.findByRole('button', { name: 'Continuar capítulo' }));
  expect(await screen.findByLabelText('Destino')).toHaveTextContent(
    '/books/book?tab=progress aviso',
  );
});
it('projeto revogado não navega nem revela origem antiga', async () => {
  vi.mocked(service.resolveWorkResume).mockResolvedValue(null);
  vi.mocked(service.listWorkResume)
    .mockResolvedValueOnce({ items: [recent], nextCursor: null, activityRevision: 1 })
    .mockResolvedValueOnce({ items: [], nextCursor: null, activityRevision: 2 });
  render(tree());
  await userEvent
    .setup({ delay: null })
    .click(await screen.findByRole('button', { name: 'Continuar capítulo' }));
  expect(
    await screen.findByText('Este projeto não está mais disponível para sua conta.'),
  ).toBeVisible();
  expect(screen.queryByLabelText('Destino')).not.toBeInTheDocument();
  expect(await screen.findByText('Nenhum trabalho recente')).toBeVisible();
});
it('falha da página adicional preserva cards e retry; conflito reinicia cursor', async () => {
  vi.mocked(service.listWorkResume)
    .mockResolvedValueOnce({ items: [recent], nextCursor: 'next', activityRevision: 1 })
    .mockRejectedValueOnce(new Error('Página falhou'))
    .mockRejectedValueOnce(conflict())
    .mockResolvedValueOnce({ items: [recent], nextCursor: null, activityRevision: 2 });
  render(tree());
  const user = userEvent.setup({ delay: null });
  await user.click(await screen.findByRole('button', { name: 'Carregar mais projetos recentes' }));
  expect(await screen.findByText('Página falhou')).toBeVisible();
  expect(screen.getByRole('heading', { name: recent.title })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Tentar carregar retomada novamente' }));
  await screen.findByText('A versão foi alterada em outro dispositivo.');
  await user.click(screen.getByRole('button', { name: 'Tentar carregar retomada novamente' }));
  await waitFor(() =>
    expect(service.listWorkResume).toHaveBeenLastCalledWith({ cursor: null, limit: 25 }),
  );
});
it('filtro reinicia cursor e conta nova não recebe resposta ou navegação antiga', async () => {
  const old = deferred<ResolvedResume | null>();
  vi.mocked(service.resolveWorkResume).mockReturnValueOnce(old.promise);
  const rendered = render(tree());
  const user = userEvent.setup({ delay: null });
  await user.click(await screen.findByRole('button', { name: 'Continuar capítulo' }));
  auth.user = { uid: 'other' };
  vi.mocked(service.listWorkResume).mockResolvedValue({
    items: [],
    nextCursor: null,
    activityRevision: 0,
  });
  rendered.rerender(tree());
  await screen.findByText('Nenhum trabalho recente');
  await act(async () => {
    old.resolve({ target, title: 'Título antigo', resource: recent.resource, fallback: false });
    await Promise.resolve();
  });
  expect(screen.queryByLabelText('Destino')).not.toBeInTheDocument();
  await chooseDropdown(
    user,
    screen.getByRole('combobox', { name: 'Retomar tipo de projeto' }),
    'Campanhas',
  );
  await waitFor(() =>
    expect(service.listWorkResume).toHaveBeenLastCalledWith({
      kind: 'campaign',
      cursor: null,
      limit: 25,
    }),
  );
});
it('sessão em carregamento ou anônima não busca retomadas privadas', () => {
  auth.loading = true;
  const rendered = render(tree());
  expect(screen.getByText('Carregando retomada…')).toBeVisible();
  auth.loading = false;
  auth.user = null;
  rendered.rerender(tree());
  expect(service.listWorkResume).not.toHaveBeenCalled();
});
