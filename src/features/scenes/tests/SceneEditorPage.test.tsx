import type {
  EditorChatWorkspaceProps,
  AdventurePersonaDialogProps,
} from '@/features/ai-assistant';
import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, createMemoryRouter, RouterProvider } from 'react-router';
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
import type {
  AdventureBlockCountRecoveryProps,
  AdventureBlockImageEditorProps,
  AdventureBlockNavigatorProps,
  AdventureScenePreviewDialogProps,
} from '@/features/adventure-blocks';
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
const chatView = vi.hoisted(() => ({ props: null as EditorChatWorkspaceProps | null }));
vi.mock('@/features/ai-assistant', async (original) => ({
  ...(await original<object>()),
  AdventurePersonaDialog: (props: AdventurePersonaDialogProps) => (
    <div role="dialog" aria-label="Persona da cena simulada">
      <p>
        {props.adventureId}/{props.sceneId}
      </p>
      <button onClick={() => props.onChanged?.()}>Confirmar persona</button>
      <button onClick={props.onClose}>Fechar persona</button>
    </div>
  ),
  EditorChatWorkspace: (props: EditorChatWorkspaceProps) => {
    chatView.props = props;
    return (
      <section aria-label="Assistente simulado">
        <button onClick={() => props.onPendingChange?.(true)}>Simular geração</button>
        <button onClick={() => props.onPendingChange?.(false)}>Concluir geração</button>
        <button onClick={() => props.onDraftChange?.(true)}>Pergunta em memória</button>
        {props.open && (
          <div role="dialog" aria-label="Chat simulado">
            <button onClick={props.onClose}>Recolher chat</button>
          </div>
        )}
      </section>
    );
  },
}));
const imageFlight = vi.hoisted(() => ({ finish: null as (() => void) | null }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('@/features/adventure-blocks', () => ({
  useAdventureBlockMutation: () => ({ busy: false, pending: null }),
  AdventureBlockImageEditor: (props: AdventureBlockImageEditorProps) => (
    <>
      <button
        disabled={props.disabled}
        onClick={() => {
          void props.runExclusive?.(async () => {
            props.onReservationChange?.(true);
            await new Promise<void>((resolve) => {
              imageFlight.finish = resolve;
            });
            props.onReservationChange?.(false);
          });
        }}
      >
        Escolher ilustração de {props.resource.kind}
      </button>
      <button onClick={() => imageFlight.finish?.()}>Cancelar ilustração simulada</button>
    </>
  ),
  AdventureScenePreviewDialog: (props: AdventureScenePreviewDialogProps) =>
    props.open ? (
      <div role="dialog" aria-label="Prévia da cena simulada">
        {props.adventureId}/{props.sceneId}
        <button onClick={props.onClose}>Fechar prévia simulada</button>
      </div>
    ) : null,
  AdventureBlockCountRecovery: (props: AdventureBlockCountRecoveryProps) => (
    <button onClick={props.onRecovered}>
      Verificar metadados de {props.adventureId}/{props.sceneId}
    </button>
  ),
  AdventureBlockNavigator: (props: AdventureBlockNavigatorProps) => (
    <section aria-label="Blocos da cena">
      <button
        disabled={props.disabled}
        onClick={() =>
          void props.runExclusive?.(() => {
            props.onSceneChange?.({
              sceneRevision: 4,
              sceneWordCount: 12,
              mainBodyHash: document.bodyHash,
              structureRevision: 2,
            });
            return Promise.resolve();
          })
        }
      >
        Confirmar novo bloco
      </button>
      <button
        onClick={() =>
          props.onSceneChange?.({
            sceneRevision: 8,
            sceneWordCount: 24,
            mainBodyHash: 'principal-remoto',
            structureRevision: 3,
          })
        }
      >
        Confirmar bloco após edição remota
      </button>
      <button onClick={() => props.onPendingChange?.(true)}>Simular pedido de bloco incerto</button>
      <button onClick={() => props.onPendingChange?.(false)}>Confirmar pedido de bloco</button>
    </section>
  ),
}));
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
      <p data-testid="ai-capabilities">{JSON.stringify(props.aiCapabilities)}</p>
      <button
        disabled={
          props.aiCapabilities?.chat === false ||
          Boolean(
            props.chatUnavailableReason === undefined
              ? props.aiUnavailableReason
              : props.chatUnavailableReason,
          )
        }
        onClick={() => props.onOpenChat?.()}
      >
        Conversar sobre cena
      </button>
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
  useAdventureLoreContext: () => ({
    items: [],
    error: '',
    loading: false,
    context: null,
    refresh: vi.fn(),
  }),
  AdventureLoreReader: () => null,
}));
vi.mock('../services/sceneService', () => ({
  getScene: vi.fn(),
  updateScene: vi.fn(),
  listSceneReferences: vi.fn(),
  setSceneReference: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  imageFlight.finish = null;
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
    <RouterProvider
      router={createMemoryRouter(
        [
          { path: '/books/:bookId/scenes/:sceneId', element: <SceneEditorPage /> },
          { path: '/adventures/:adventureId/scenes/:sceneId', element: <SceneEditorPage /> },
          { path: '/books/:bookId', element: <p>Voltei ao livro</p> },
          { path: '*', element: <SceneEditorPage /> },
        ],
        { initialEntries: [path] },
      )}
    />,
  );
}

it('carrega contexto do DTO com crédito real e habilita somente o novo chat', async () => {
  mount();
  await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  expect(getScene).toHaveBeenCalledWith({ target, sceneId: 'scene' });
  expect(screen.getByText('Créditos reais: 7')).toBeInTheDocument();
  expect(screen.getAllByText(/Converse sobre esta cena/).length).toBeGreaterThan(0);
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

it('oferece recuperação explícita da contagem antes de conseguir abrir uma aventura', async () => {
  vi.mocked(getScene)
    .mockRejectedValueOnce(new Error('Agregado de blocos indisponível'))
    .mockResolvedValueOnce({
      ...document,
      project: { kind: 'adventure', id: 'adventure', title: 'O sino', universeId: null },
    });
  mount('/adventures/adventure/scenes/scene');
  const recovery = await screen.findByRole('button', {
    name: 'Verificar metadados de adventure/scene',
  });
  expect(
    screen.queryByRole('textbox', { name: 'Área de escrita da cena' }),
  ).not.toBeInTheDocument();
  expect(getScene).toHaveBeenCalledTimes(1);
  expect(updateScene).not.toHaveBeenCalled();
  await userEvent.setup().click(recovery);
  expect(await screen.findByRole('textbox', { name: 'Área de escrita da cena' })).toHaveValue(
    document.content,
  );
  expect(getScene).toHaveBeenCalledTimes(2);
  expect(updateScene).not.toHaveBeenCalled();
});

it('erro de abertura de livro não oferece reparo de blocos de aventura', async () => {
  vi.mocked(getScene).mockRejectedValue(new Error('Livro indisponível'));
  mount();
  await screen.findByText('Livro indisponível');
  expect(screen.queryByRole('button', { name: /Verificar metadados/ })).not.toBeInTheDocument();
  expect(updateScene).not.toHaveBeenCalled();
});

it('reservar ilustração bloqueia texto, histórico e blocos até cancelar sem adotar revisão nova', async () => {
  vi.mocked(getScene).mockResolvedValue({
    ...document,
    project: { kind: 'adventure', id: 'adventure', title: 'O sino', universeId: null },
  });
  mount('/adventures/adventure/scenes/scene');
  const field = await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  const user = userEvent.setup();
  await user.click(screen.getByRole('button', { name: 'Escolher ilustração de scene' }));
  expect(field).toHaveAttribute('readonly');
  expect(screen.getByRole('button', { name: 'Histórico do texto' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Confirmar novo bloco' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Conferir prévia da cena' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Cancelar ilustração simulada' }));
  await waitFor(() => expect(field).not.toHaveAttribute('readonly'));
  expect(screen.getByRole('button', { name: 'Confirmar novo bloco' })).toBeEnabled();
  expect(getScene).toHaveBeenCalledTimes(1);
  expect(updateScene).not.toHaveBeenCalled();
});

it('abre prévia somente com identidade de aventura e cena', async () => {
  vi.mocked(getScene).mockResolvedValue({
    ...document,
    project: { kind: 'adventure', id: 'adventure', title: 'O sino', universeId: null },
  });
  mount('/adventures/adventure/scenes/scene');
  const button = await screen.findByRole('button', { name: 'Conferir prévia da cena' });
  await userEvent.setup().click(button);
  expect(screen.getByRole('dialog', { name: 'Prévia da cena simulada' })).toHaveTextContent(
    'adventure/scene',
  );
  expect(updateScene).not.toHaveBeenCalled();
});

it('adota total e revisão de bloco apenas com o mesmo principal confirmado', async () => {
  vi.mocked(getScene).mockResolvedValue({
    ...document,
    project: { kind: 'adventure', id: 'adventure', title: 'O sino', universeId: null },
    mainWordCount: 2,
    blockWordCount: 0,
  });
  vi.mocked(updateScene).mockResolvedValue({
    ...mutation,
    scene: { ...mutation.scene, revision: 5, wordCount: 13, mainWordCount: 3, blockWordCount: 10 },
  });
  mount('/adventures/adventure/scenes/scene');
  const field = await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar novo bloco' }));
  expect(screen.getByText('2 palavras no texto principal · 12 na cena')).toBeVisible();
  await userEvent.setup().type(field, ' Nova');
  await waitFor(() =>
    expect(updateScene).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedRevision: 4,
        patch: { content: document.content + ' Nova' },
      }),
    ),
  );
});

it('mutação de bloco não libera sobrescrita do principal remoto sem comparar', async () => {
  vi.mocked(getScene).mockResolvedValue({
    ...document,
    project: { kind: 'adventure', id: 'adventure', title: 'O sino', universeId: null },
  });
  mount('/adventures/adventure/scenes/scene');
  const field = await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Confirmar bloco após edição remota' }));
  expect(field).toHaveValue(document.content);
  expect(screen.getByRole('button', { name: 'Comparar textos' })).toBeVisible();
  expect(screen.getByText('Conflito de revisão')).toBeVisible();
  expect(updateScene).not.toHaveBeenCalled();
});

it('pedido de bloco incerto bloqueia prosa e saída até confirmar o mesmo pedido', async () => {
  vi.mocked(getScene).mockResolvedValue({
    ...document,
    project: { kind: 'adventure', id: 'adventure', title: 'O sino', universeId: null },
  });
  mount('/adventures/adventure/scenes/scene');
  const field = await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  await userEvent
    .setup()
    .click(screen.getByRole('button', { name: 'Simular pedido de bloco incerto' }));
  expect(field).toHaveAttribute('readonly');
  await userEvent.setup().click(screen.getByRole('link', { name: 'Voltar ao planejamento' }));
  expect(field).toBeInTheDocument();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar pedido de bloco' }));
  expect(field).not.toHaveAttribute('readonly');
  expect(updateScene).not.toHaveBeenCalled();
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

it('abre novo chat com capacidades separadas, sem habilitar ações legadas', async () => {
  mount();
  await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  expect(screen.getByTestId('ai-capabilities')).toHaveTextContent(
    '{"chat":true,"autocomplete":false,"legacyActions":false}',
  );
  expect(screen.getByRole('button', { name: 'Conversar sobre cena' })).toBeEnabled();
  await userEvent.setup().click(screen.getByRole('button', { name: 'Conversar sobre cena' }));
  expect(screen.getByRole('dialog', { name: 'Chat simulado' })).toBeInTheDocument();
  expect(chatView.props?.host.target).toEqual(target);
  expect(chatView.props?.host.resource).toEqual({ kind: 'scene', id: 'scene' });
});
it('geração em andamento mantém escrita disponível e bloqueia saída pendente', async () => {
  mount();
  const field = await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Simular geração' }));
  expect(field).not.toHaveAttribute('readonly');
  await userEvent.setup().type(field, ' Durante a resposta');
  expect(field).toHaveValue(document.content + ' Durante a resposta');
  await userEvent.setup().click(screen.getByRole('link', { name: 'Voltar ao planejamento' }));
  expect(field).toBeInTheDocument();
});
it('pergunta em RAM exige descarte explícito ao sair, sem guardar seu texto', async () => {
  mount();
  await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  await userEvent.setup().click(screen.getByRole('button', { name: 'Pergunta em memória' }));
  const closing = new Event('beforeunload', { cancelable: true });
  window.dispatchEvent(closing);
  expect(closing.defaultPrevented).toBe(true);
  await userEvent.setup().click(screen.getByRole('link', { name: 'Voltar ao planejamento' }));
  expect(screen.getByRole('dialog', { name: 'Texto ainda não confirmado' })).toHaveTextContent(
    'A pergunta do assistente está só na memória',
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Sair e descartar pergunta' }));
  expect(await screen.findByText('Voltei ao livro')).toBeInTheDocument();
});
it('adota texto e metadados confirmados sob reserva sem novo autosave nem reset do editor', async () => {
  mount();
  const field = await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  const source = {
    target,
    resource: { kind: 'scene' as const, id: 'scene' },
    title: 'Cena',
    content: '<p>Confirmado IA</p>',
    contentHash: 'hash-ia-confirmado',
    sourceToken: 'a'.repeat(64),
    revision: 4,
  };
  vi.mocked(getScene).mockResolvedValue({
    ...document,
    content: source.content,
    bodyHash: source.contentHash,
    revision: 4,
    wordCount: 2,
    bodyBytes: source.content.length,
  });
  const host = chatView.props!.host;
  await act(() =>
    host.runExclusive(async () => {
      const adopt = await host.prepareAdoption!(source);
      adopt();
    }),
  );
  expect(field).toHaveValue(source.content);
  expect(updateScene).not.toHaveBeenCalled();
  expect(screen.getByText('Salvo')).toBeInTheDocument();
});
it('confirmação divergente mantém manuscrito local e não adota resposta histórica', async () => {
  mount();
  const field = await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  const source = {
    target,
    resource: { kind: 'scene' as const, id: 'scene' },
    title: 'Cena',
    content: '<p>Texto antigo</p>',
    contentHash: 'hash-historico',
    sourceToken: 'a'.repeat(64),
    revision: 4,
  };
  const host = chatView.props!.host;
  await act(async () => {
    await expect(host.runExclusive(() => host.prepareAdoption!(source))).rejects.toThrow(
      'A confirmação da cena mudou',
    );
  });
  expect(field).toHaveValue(document.content);
  expect(updateScene).not.toHaveBeenCalled();
});

it('configura complemento da cena e invalida contexto sem criar persona separada por bloco', async () => {
  vi.mocked(getScene).mockResolvedValue({
    ...document,
    project: { kind: 'adventure', id: 'adventure', title: 'Aventura', universeId: null },
    group: { ...document.group!, kind: 'part' },
  });
  mount('/adventures/adventure/scenes/scene');
  await screen.findByRole('textbox', { name: 'Área de escrita da cena' });
  const oldHint = chatView.props!.invalidationKey;
  await userEvent.setup().click(screen.getByRole('button', { name: 'Persona da cena' }));
  expect(screen.getByRole('dialog', { name: 'Persona da cena simulada' })).toHaveTextContent(
    'adventure/scene',
  );
  await userEvent.setup().click(screen.getByRole('button', { name: 'Confirmar persona' }));
  expect(chatView.props!.invalidationKey).not.toBe(oldHint);
  expect(updateScene).not.toHaveBeenCalled();
});
