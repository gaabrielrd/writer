import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { SceneEditorPage } from '../components/SceneEditorPage';
import {
  getScene,
  updateScene,
  listSceneReferences,
  setSceneReference,
} from '../services/sceneService';
import { listLoreEntities, type LoreEntity } from '@/features/lore';
import type { RichEditorProps } from '@/features/editor';
import { writeSceneDraft, sceneDraftKey, readSceneDraft } from '../services/sceneDraftStorage';
import { document, target, mutation, conflict, deferred } from './sceneFixtures';
const auth = vi.hoisted(() => {
  const value: {
    user: { uid: string; credits: number } | null;
    loading: boolean;
    setPendingEditorOperation: ReturnType<typeof vi.fn>;
  } = { user: { uid: 'owner', credits: 7 }, loading: false, setPendingEditorOperation: vi.fn() };
  return value;
});
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('@/features/editor', async () => ({
  BusyNavigationGuard: (
    await vi.importActual<typeof import('@/features/editor')>('@/features/editor')
  ).BusyNavigationGuard,
  RichEditor: (props: RichEditorProps) => (
    <>
      <textarea
        aria-label={props.ariaLabel}
        value={props.content}
        readOnly={props.externalBusy}
        onChange={(event) => props.onChange(event.target.value)}
      />
      <p>Créditos reais: {props.userCredits}</p>
      <p>{props.aiUnavailableReason}</p>
      <button onClick={props.onToggleSidebar}>Abrir referências</button>
      {props.entities.map((entity) => (
        <button key={entity.id} onClick={() => props.onSelectEntity(entity)}>
          {entity.name}
        </button>
      ))}
      <button onClick={() => props.onBusyChange?.(true)}>Ocupar editor</button>
      <button onClick={() => props.onBusyChange?.(false)}>Liberar editor</button>
    </>
  ),
}));
vi.mock('@/features/lore', async (original) => ({
  ...(await original<object>()),
  listLoreEntities: vi.fn(),
}));
vi.mock('../services/sceneService', () => ({
  getScene: vi.fn(),
  updateScene: vi.fn(),
  listSceneReferences: vi.fn(),
  setSceneReference: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  auth.user = { uid: 'owner', credits: 7 };
  auth.loading = false;
  vi.mocked(getScene).mockResolvedValue(document);
  vi.mocked(updateScene).mockResolvedValue({
    ...mutation,
    scene: { ...mutation.scene, revision: 2 },
  });
  vi.mocked(listLoreEntities).mockResolvedValue([]);
  vi.mocked(listSceneReferences).mockResolvedValue({
    items: [],
    nextCursor: null,
    projectRevision: 1,
  });
  vi.mocked(setSceneReference).mockResolvedValue({
    ...mutation,
    scene: { ...mutation.scene, revision: 3 },
  });
});
function mount(path = '/books/book/scenes/scene') {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/books/:bookId/scenes/:sceneId" element={<SceneEditorPage />} />
        <Route path="/adventures/:adventureId/scenes/:sceneId" element={<SceneEditorPage />} />
        <Route path="/books/:bookId" element={<p>Voltei ao livro</p>} />
        <Route path="*" element={<SceneEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
}
it('carrega contexto do DTO e envia somente alvo tipado com crédito real e IA indisponível', async () => {
  mount();
  await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  expect(getScene).toHaveBeenCalledWith({ target, sceneId: 'scene' });
  expect(screen.getByText('Créditos reais: 7')).toBeInTheDocument();
  expect(
    screen.getAllByText(/A assistência de IA ainda não está disponível para cenas/).length,
  ).toBeGreaterThan(0);
  expect(screen.getByText('O farol · A última luz')).toBeInTheDocument();
  expect(updateScene).not.toHaveBeenCalled();
});
it('aventura usa prosa própria e não inventa livro auxiliar', async () => {
  vi.mocked(getScene).mockResolvedValue({
    ...document,
    project: { kind: 'adventure', id: 'adventure', title: 'O sino', universeId: null },
    group: { ...document.group!, kind: 'part', title: 'A praça' },
  });
  mount('/adventures/adventure/scenes/scene');
  await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  expect(getScene).toHaveBeenCalledWith({
    target: { kind: 'adventure', id: 'adventure' },
    sceneId: 'scene',
  });
  expect(screen.getByRole('link', { name: 'Voltar ao planejamento' })).toHaveAttribute(
    'href',
    '/adventures/adventure',
  );
});
it('salvamento manual é observável e preserva HTML', async () => {
  mount();
  const field = await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  await userEvent.setup().clear(field);
  await userEvent.setup().type(field, '<p><strong>Lia</strong> observa o farol.</p>');
  await waitFor(() =>
    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        patch: { content: '<p><strong>Lia</strong> observa o farol.</p>' },
      }),
    ),
  );
  await screen.findByText('Salvo');
  expect(auth.setPendingEditorOperation).toHaveBeenCalledWith(true);
  expect(readSceneDraft(sceneDraftKey('owner', target, 'scene'))).toBeNull();
});
it('conflito preserva texto e requer comparação e confirmação para salvar sobre revisão nova', async () => {
  vi.mocked(updateScene).mockRejectedValueOnce(conflict());
  mount();
  const field = await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  await userEvent.setup().clear(field);
  await userEvent.setup().type(field, 'Meu texto');
  await screen.findByText('Conflito de revisão');
  vi.mocked(getScene).mockResolvedValueOnce({
    ...document,
    revision: 5,
    content: '<p>Texto remoto</p>',
  });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Comparar textos' }));
  await screen.findByRole('dialog', { name: 'Comparar textos da cena' });
  expect(field).toHaveValue('Meu texto');
  expect(screen.getByText('Texto remoto')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Manter meu texto e salvar' }));
  await waitFor(() =>
    expect(updateScene).toHaveBeenLastCalledWith(
      expect.objectContaining({ expectedRevision: 5, patch: { content: 'Meu texto' } }),
    ),
  );
});
it('resposta incerta oferece retry do mesmo payload e não acusa salvo', async () => {
  vi.mocked(updateScene).mockRejectedValueOnce(
    Object.assign(new Error('Não confirmado'), { code: 'functions/unavailable' }),
  );
  mount();
  const field = await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  await userEvent.setup().clear(field);
  await userEvent.setup().type(field, 'Guardado');
  await screen.findByText('Salvamento não confirmado');
  expect(screen.queryByText('Salvo')).not.toBeInTheDocument();
  const request = vi.mocked(updateScene).mock.calls.at(0)?.[0];
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar salvar novamente' }));
  await screen.findByText('Salvo');
  expect(vi.mocked(updateScene).mock.calls.at(1)?.[0]).toEqual(request);
});
it('oferece recuperação e descarte explícitos antes de montar editor', async () => {
  writeSceneDraft(sceneDraftKey('owner', target, 'scene'), {
    content: 'Rascunho local',
    revision: 1,
    savedAt: 1,
  });
  mount();
  await screen.findByRole('button', { name: 'Recuperar rascunho' });
  expect(
    screen.queryByRole('textbox', { name: 'Área de escrita da cena' }),
  ).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Recuperar rascunho' }));
  expect(screen.getByRole('textbox', { name: 'Área de escrita da cena' })).toHaveValue(
    'Rascunho local',
  );
  await screen.findByText('Salvo');
});
it('descartar rascunho mostra texto confirmado sem gravar', async () => {
  writeSceneDraft(sceneDraftKey('owner', target, 'scene'), {
    content: 'Rascunho local',
    revision: 1,
    savedAt: 1,
  });
  mount();
  await screen.findByRole('button', { name: 'Usar texto confirmado' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Usar texto confirmado' }));
  expect(screen.getByRole('textbox', { name: 'Área de escrita da cena' })).toHaveValue(
    document.content,
  );
  expect(updateScene).not.toHaveBeenCalled();
});
it('avisa ao sair com texto pendente e permite voltar ou preservar rascunho', async () => {
  const pending = deferred<typeof mutation>();
  vi.mocked(updateScene).mockReturnValue(pending.promise);
  mount();
  await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  await userEvent
    .setup()
    .type(screen.getByRole('textbox', { name: 'Área de escrita da cena' }), ' Pendente');
  await userEvent.setup().click(screen.getByRole('link', { name: 'Voltar ao planejamento' }));
  await screen.findByRole('dialog', { name: 'Texto ainda não confirmado' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Continuar escrevendo' }));
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('link', { name: 'Voltar ao planejamento' }));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Sair com rascunho' }));
  await screen.findByText('Voltei ao livro');
  expect(readSceneDraft(sceneDraftKey('owner', target, 'scene'))?.content).toContain('Pendente');
});
it('abre lore autorizado e painel sem publicar informações privadas', async () => {
  const entity: LoreEntity = {
    id: 'lia',
    bookId: 'book',
    name: 'Lia',
    aliases: [],
    category: 'character',
    summary: 'Reparadora do farol',
    details: 'Um segredo privado',
    relations: [],
    isPublic: false,
    createdAt: 1,
    updatedAt: 1,
  };
  vi.mocked(listLoreEntities).mockResolvedValue([entity]);
  mount();
  await screen.findByRole('button', { name: 'Lia' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Lia' }));
  await screen.findByRole('dialog', { name: 'Lia' });
  expect(screen.getByText('Um segredo privado')).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Fechar' }));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Abrir referências' }));
  await screen.findByRole('region', { name: 'Referências da cena' });
  expect(updateScene).not.toHaveBeenCalled();
});
it('erros de acesso/lore apresentam retry; recursos alheios ficam indisponíveis', async () => {
  vi.mocked(getScene).mockRejectedValueOnce(new Error('Cena inacessível'));
  vi.mocked(listLoreEntities).mockRejectedValueOnce(new Error('Lore negado'));
  mount();
  await screen.findByText('Cena inacessível');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  await screen.findByText('Lore negado');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Tentar novamente' }));
  await waitFor(() => expect(screen.queryByText('Lore negado')).not.toBeInTheDocument());
});
it('não mostra prosa quando alvo ou autoria do DTO divergem', async () => {
  vi.mocked(getScene).mockResolvedValue({ ...document, ownerId: 'other' });
  mount();
  await screen.findByText('Cena indisponível');
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});
it('ausência de conta/params e carregamento são visíveis', () => {
  auth.loading = true;
  const view = mount('/missing');
  expect(screen.getByText('Carregando conta…')).toBeInTheDocument();
  auth.loading = false;
  auth.user = null;
  view.rerender(
    <MemoryRouter>
      <SceneEditorPage />
    </MemoryRouter>,
  );
  expect(screen.getByText('Entre para escrever suas cenas')).toBeInTheDocument();
  auth.user = { uid: 'owner', credits: 7 };
  view.rerender(
    <MemoryRouter>
      <SceneEditorPage />
    </MemoryRouter>,
  );
  expect(screen.getByText('Cena indisponível')).toBeInTheDocument();
});
it('resposta antiga após desmontar não abre editor em outro contexto', async () => {
  const pending = deferred<typeof document | null>();
  vi.mocked(getScene).mockReturnValueOnce(pending.promise);
  const view = mount();
  expect(screen.getByText('Carregando cena…')).toBeInTheDocument();
  view.unmount();
  await act(async () => {
    pending.resolve(document);
    await pending.promise;
  });
  expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
});

it('comparação pode ser fechada preservando conflito e usar remoto exige clique', async () => {
  vi.mocked(updateScene).mockRejectedValueOnce(conflict());
  mount();
  const field = await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  await userEvent.setup().type(field, ' Local');
  await screen.findByText('Conflito de revisão');
  vi.mocked(getScene).mockResolvedValue({ ...document, revision: 4, content: '<p>Remoto</p>' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Comparar textos' }));
  await screen.findByRole('dialog', { name: 'Comparar textos da cena' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Fechar' }));
  expect(screen.getByText('Conflito de revisão')).toBeInTheDocument();
  expect(field).toHaveValue(document.content + ' Local');
  await userEvent.setup().click(screen.getByRole('button', { name: 'Comparar textos' }));
  await screen.findByRole('dialog', { name: 'Comparar textos da cena' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Usar texto remoto' }));
  expect(field).toHaveValue('<p>Remoto</p>');
  expect(screen.getByText('Salvo')).toBeInTheDocument();
  expect(updateScene).toHaveBeenCalledTimes(1);
});
it('bloqueia saída sem rascunho local e conserva texto na página', async () => {
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  mount();
  const field = await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  await userEvent.setup().type(field, ' Local');
  await screen.findByText(/Não foi possível guardar o rascunho/);
  await userEvent.setup().click(screen.getByRole('button', { name: 'Ocupar editor' }));
  await userEvent.setup().click(screen.getByRole('link', { name: 'Voltar ao planejamento' }));
  await screen.findByRole('dialog', { name: 'Texto ainda não confirmado' });
  expect(screen.getByRole('button', { name: 'Sair com rascunho' })).toBeDisabled();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Fechar' }));
  await userEvent.setup().click(screen.getByRole('button', { name: 'Liberar editor' }));
  vi.restoreAllMocks();
});

it('retorno contextual conserva arco e visão do próprio projeto', async () => {
  const returnTo =
    '/books/book?tab=narrative&narrativeView=arcs&narrativeArc=arc&narrativeItem=milestone';
  render(
    <MemoryRouter initialEntries={[{ pathname: '/books/book/scenes/scene', state: { returnTo } }]}>
      <Routes>
        <Route path="/books/:bookId/scenes/:sceneId" element={<SceneEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
  const back = await screen.findByRole('link', { name: 'Voltar ao planejamento' });
  expect(back).toHaveAttribute('href', returnTo);
});
it.each([
  'https://example.com',
  '/books/other?tab=narrative',
  '//example.com',
  '/books/book/scenes/private?tab=narrative',
])('retorno %s não permite sair para origem externa/alheia', async (returnTo) => {
  render(
    <MemoryRouter initialEntries={[{ pathname: '/books/book/scenes/scene', state: { returnTo } }]}>
      <Routes>
        <Route path="/books/:bookId/scenes/:sceneId" element={<SceneEditorPage />} />
      </Routes>
    </MemoryRouter>,
  );
  expect(await screen.findByRole('link', { name: 'Voltar ao planejamento' })).toHaveAttribute(
    'href',
    '/books/book',
  );
});

vi.mock('@/features/work-progress', async (original) => ({
  ...(await original<object>()),
  ProjectProgressPanel: ({ target }: { target: { kind: string; id: string } }) => (
    <h2>
      Progresso de {target.kind}/{target.id}
    </h2>
  ),
  ContinueWorkPanel: () => <h2>Continuar meu trabalho</h2>,
  useWorkActivity: vi.fn(() => ({ loading: false, error: '', conflict: false, retry: vi.fn() })),
  WorkActivityNotice: () => null,
}));
