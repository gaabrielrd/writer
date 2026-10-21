import { runChapterOperation } from '../services/chapterContentStorage';
import { chooseDropdown } from '@/test/dropdown';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes } from 'react-router';
import { EditorPage } from '../components/EditorPage';
import * as bookService from '@/features/books';
import * as loreService from '@/features/lore';
import type { Book, Chapter } from '@/features/books';
import type { LoreEntity } from '@/features/lore';
import * as personaAPI from '@/features/ai-assistant';
import { writeLocalDraft, readLocalDraft } from '../services/localDraftStorage';

vi.mock('@/features/auth', async () => {
  const actual = await vi.importActual<typeof import('@/features/auth')>('@/features/auth');
  return {
    ...actual,
    useAuth: vi.fn(() => ({
      user: {
        uid: 'auth-1',
        email: 'autor@exemplo.com',
        name: 'Autor',
        tier: 'free',
        credits: 10,
        createdAt: 1000,
        updatedAt: 1000,
      },
      loading: false,
      updateUserCreditsState: vi.fn(),
      setPendingEditorOperation: vi.fn(),
    })),
  };
});

describe('EditorPage', () => {
  const mockBook: Book = {
    id: 'b-1',
    authorId: 'auth-1',
    title: 'Crônicas de Avalon',
    genre: 'Fantasia',
    synopsis: '',
    coverUrl: null,
    status: 'draft',
    wordCount: 1500,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const mockChapters: Chapter[] = [
    {
      id: 'c-1',
      bookId: 'b-1',
      title: 'Capítulo 1: O Encontro',
      order: 1,
      wordCount: 120,
      content: 'Arthur caminhava ao entardecer.',
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'c-2',
      bookId: 'b-1',
      title: 'Capítulo 2: A Espada',
      order: 2,
      wordCount: 80,
      content: 'A espada brilhava na pedra.',
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  it('espera a gravação pendente da sessão anterior antes de carregar a nova base CAS', async () => {
    let release!: () => void;
    let remote = 'Base anterior';
    const pending = runChapterOperation(
      'b-1',
      'c-1',
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            remote = 'Texto confirmado da sessão anterior';
            resolve();
          };
        }),
    );
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    const list = vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    const chapter = vi
      .spyOn(bookService, 'getChapter')
      .mockImplementation(() => Promise.resolve({ ...mockChapters[0]!, content: remote }));
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue([]);
    render(
      <MemoryRouter initialEntries={['/books/b-1/editor/c-1']}>
        <Routes>
          <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await waitFor(() => expect(list).toHaveBeenCalled());
    expect(chapter).not.toHaveBeenCalled();
    await act(async () => {
      release();
      await pending;
    });
    expect(
      await screen.findByRole('textbox', { name: 'Área de escrita do capítulo' }),
    ).toHaveTextContent('Texto confirmado da sessão anterior');
  });

  const mockEntities: LoreEntity[] = [
    {
      id: 'e-1',
      bookId: 'b-1',
      name: 'Arthur',
      aliases: ['Pendragon'],
      category: 'character',
      summary: 'Herdeiro do trono',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(bookService, 'subscribeWritingBindings').mockReturnValue(() => undefined);
    vi.spyOn(loreService, 'subscribeLoreEntities').mockReturnValue(() => undefined);
  });

  it('rota composta oferece rascunho legado preservado e não inicia edição do corpo congelado', async () => {
    writeLocalDraft('auth-1', 'b-1', 'c-1', '<p>Rascunho anterior</p>');
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'getChapter').mockResolvedValue({
      ...mockChapters[0]!,
      contentMode: 'scenes',
      content: '<p>Composição atual</p>',
    });
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue([]);
    const update = vi.spyOn(bookService, 'updateChapter').mockResolvedValue();
    vi.spyOn(bookService, 'SceneChapterView').mockImplementation(({ legacyDraft }) => (
      <section aria-label="Composição de cenas">{legacyDraft}</section>
    ));
    render(
      <MemoryRouter initialEntries={['/books/b-1/editor/c-1']}>
        <Routes>
          <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByRole('region', { name: 'Composição de cenas' })).toHaveTextContent(
      '<p>Rascunho anterior</p>',
    );
    expect(readLocalDraft('auth-1', 'b-1', 'c-1')?.content).toBe('<p>Rascunho anterior</p>');
    expect(screen.queryByRole('textbox', { name: 'Área de escrita' })).not.toBeInTheDocument();
    expect(update).not.toHaveBeenCalled();
  });
  it('sincroniza personas sem substituir o texto e salva vínculos pelo editor, com retry de configuração', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'getChapter').mockResolvedValue(mockChapters[0] ?? null);
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue(mockEntities);
    const updateBook = vi.spyOn(bookService, 'updateBook').mockResolvedValue();
    const updateChapter = vi.spyOn(bookService, 'updateChapter').mockResolvedValue();
    const retry = vi.fn();
    vi.spyOn(personaAPI, 'usePersonaLibrary').mockReturnValue({
      personas: personaAPI.DEFAULT_PERSONAS,
      loading: false,
      error: null,
      retry,
    });
    vi.spyOn(personaAPI, 'ChapterPersonaDialog').mockImplementation((props) => (
      <div role="dialog" aria-label="Persona">
        <p>Livro definido: {props.bookPersonaId}</p>
        <p>Complemento definido: {props.complement?.personaId}</p>
        <button onClick={() => void props.onSaveBook('preset-incisive').then(props.onClose)}>
          Salvar persona do livro
        </button>
        <button
          onClick={() =>
            void props
              .onSaveChapter({
                personaId: 'preset-unsettling',
                overrides: [{ traitId: 'tension', value: 100 }],
              })
              .then(props.onClose)
          }
        >
          Salvar persona do capítulo
        </button>
        {props.error && (
          <>
            <p>{props.error}</p>
            <button onClick={props.onRetry}>Tentar novamente</button>
          </>
        )}
        <button onClick={props.onClose}>Fechar persona</button>
      </div>
    ));
    let changed: Parameters<typeof bookService.subscribeWritingBindings>[2] = () => undefined;
    let failed: (error: Error) => void = () => undefined;
    vi.mocked(bookService.subscribeWritingBindings).mockImplementation(
      (_book, _chapter, callback, error) => {
        changed = callback;
        failed = error;
        return vi.fn();
      },
    );
    render(
      <MemoryRouter initialEntries={['/books/b-1/editor/c-1']}>
        <Routes>
          <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const editor = await screen.findByLabelText('Área de escrita do capítulo');
    const original = editor.textContent;
    act(() =>
      changed({
        personaId: 'preset-atmospheric',
        personaComplement: { personaId: 'preset-intimate', overrides: [] },
      }),
    );
    expect(screen.queryByText('Capítulo: O Íntimo')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Gerenciar personas' })).not.toBeInTheDocument();
    expect(editor.textContent).toBe(original);
    await user.click(screen.getByRole('button', { name: 'Opções do capítulo' }));
    await user.click(screen.getByRole('menuitem', { name: 'Persona' }));
    await screen.findByRole('dialog', { name: 'Persona' });
    expect(screen.getByText('Livro definido: preset-atmospheric')).toBeVisible();
    expect(screen.getByText('Complemento definido: preset-intimate')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Salvar persona do livro' }));
    await waitFor(() =>
      expect(updateBook).toHaveBeenCalledWith('b-1', { personaId: 'preset-incisive' }),
    );
    await user.click(screen.getByRole('button', { name: 'Opções do capítulo' }));
    await user.click(screen.getByRole('menuitem', { name: 'Persona' }));
    await screen.findByRole('dialog', { name: 'Persona' });
    await user.click(screen.getByRole('button', { name: 'Salvar persona do capítulo' }));
    await waitFor(() =>
      expect(updateChapter).toHaveBeenCalledWith('b-1', 'c-1', {
        personaComplement: {
          personaId: 'preset-unsettling',
          overrides: [{ traitId: 'tension', value: 100 }],
        },
      }),
    );
    act(() => failed(new Error('Configuração indisponível')));
    expect(screen.getByRole('button', { name: 'Abrir Assistente Criativo de IA' })).toBeDisabled();
    expect(editor.textContent).toBe(original);
    expect(screen.queryByText('Configuração indisponível')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Opções do capítulo' }));
    await user.click(screen.getByRole('menuitem', { name: 'Persona' }));
    await screen.findByRole('dialog', { name: 'Persona' });
    expect(screen.getByText('Configuração indisponível')).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(retry).toHaveBeenCalledOnce();
    act(() => changed({ personaId: 'preset-incisive', personaComplement: null }));
    expect(screen.getByRole('button', { name: 'Abrir Assistente Criativo de IA' })).toBeEnabled();
  });

  it('exibe tela de erro quando livro ou capitulo nao sao encontrados', async () => {
    vi.spyOn(bookService, 'getBook').mockResolvedValue(null);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue([]);
    vi.spyOn(bookService, 'getChapter').mockResolvedValue(null);
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue([]);

    render(
      <MemoryRouter initialEntries={['/books/b-none/editor/c-none']}>
        <Routes>
          <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Não foi possível abrir o editor')).toBeInTheDocument();
  });

  it('carrega o capitulo no editor e exibe contagem de palavras e status de salvamento', async () => {
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'getChapter').mockResolvedValue(mockChapters[0] ?? null);
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue(mockEntities);

    render(
      <MemoryRouter initialEntries={['/books/b-1/editor/c-1']}>
        <Routes>
          <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    expect(await screen.findByText('Capítulo 1: O Encontro')).toBeInTheDocument();
    expect(screen.getByText('Crônicas de Avalon')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
    expect(screen.getByText('Salvo')).toBeInTheDocument();

    const textarea = screen.getByLabelText(/área de escrita do capítulo/i);
    expect(textarea).toHaveTextContent('Arthur caminhava ao entardecer.');
    expect(screen.getByRole('link', { name: 'Voltar para o livro' })).toHaveAttribute(
      'href',
      '/books/b-1',
    );
  });

  it('permite abrir sidebar, criar entidade e navegar para proximo capitulo', async () => {
    const user = userEvent.setup({ delay: null });
    vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'getChapter').mockImplementation((_bookId, chapterId) =>
      Promise.resolve(mockChapters.find((chapter) => chapter.id === chapterId) ?? null),
    );
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue(mockEntities);
    vi.spyOn(loreService, 'createLoreEntity').mockResolvedValue({
      id: 'e-2',
      bookId: 'b-1',
      name: 'Guinevere',
      aliases: [],
      category: 'character',
      summary: 'Rainha',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    });
    vi.spyOn(loreService, 'updateLoreEntity').mockResolvedValue();

    render(
      <MemoryRouter initialEntries={['/books/b-1/editor/c-1']}>
        <Routes>
          <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    );

    await screen.findByText('Capítulo 1: O Encontro');

    // Abre sidebar
    const toggleBtn = screen.getByRole('button', { name: /compêndio/i });
    await user.click(toggleBtn);

    const sidebar = screen.getByRole('complementary', {
      name: 'Painel lateral do Compêndio de Lore',
    });
    expect(within(sidebar).getByRole('heading', { name: 'Compêndio' })).toBeInTheDocument();

    // Criar nova entidade via sidebar
    await user.click(screen.getByRole('button', { name: /nova entidade/i }));
    const createDialog = await screen.findByRole('dialog', {
      name: 'Cadastrar Nova Entidade no Compêndio',
    });
    await user.click(within(createDialog).getByLabelText(/nome da entidade/i));
    await user.paste('Guinevere');
    await user.click(within(createDialog).getByLabelText(/resumo curto/i));
    await user.paste('Rainha');
    await user.click(screen.getByRole('button', { name: 'Cadastrar Entidade' }));

    await waitFor(() => expect(createDialog).not.toBeInTheDocument());
    expect(await within(sidebar).findByText('Guinevere', { exact: true })).toBeInTheDocument();
    expect(loreService.createLoreEntity).toHaveBeenCalledWith(
      'b-1',
      expect.objectContaining({ name: 'Guinevere' }),
    );

    // Editar entidade via sidebar
    const editBtns = within(sidebar).getAllByRole('button', { name: 'Editar' });
    expect(editBtns).toHaveLength(2);
    await user.click(editBtns[0]!);
    const editDialog = await screen.findByRole('dialog', { name: 'Editar Entidade: Arthur' });
    await user.click(within(editDialog).getByLabelText(/resumo curto/i));
    await user.keyboard('{End}');
    await user.paste(' de Camelot');
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    await waitFor(() => expect(editDialog).not.toBeInTheDocument());
    expect(await within(sidebar).findByText('Herdeiro do trono de Camelot')).toBeInTheDocument();
    expect(loreService.updateLoreEntity).toHaveBeenCalledWith(
      'b-1',
      'e-1',
      expect.objectContaining({ name: 'Arthur', summary: 'Herdeiro do trono de Camelot' }),
    );

    // Navegação entre capítulos
    const nextBtn = screen.getByLabelText('Próximo capítulo');
    await user.click(nextBtn);
    expect(await screen.findByText('Capítulo 2: A Espada')).toBeInTheDocument();
    expect(screen.getByLabelText(/área de escrita do capítulo/i)).toHaveTextContent(
      'A espada brilhava na pedra.',
    );
  });
  it('carrega, reconhece e edita lore global separadamente e acompanha alterações do universo', async () => {
    const global: LoreEntity = {
      ...mockEntities[0]!,
      id: 'universe:world:e-1',
      bookId: undefined,
      adventureId: undefined,
      universeId: 'world',
      name: 'Sábia',
      summary: 'Uma sábia do universo',
    };
    vi.spyOn(bookService, 'getBook').mockResolvedValue({ ...mockBook, universeId: 'world' });
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'getChapter').mockResolvedValue({
      ...mockChapters[0]!,
      content: '<p>Arthur encontra a Sábia.</p>',
    });
    vi.spyOn(loreService, 'listLoreEntities').mockImplementation((scope) =>
      Promise.resolve(typeof scope === 'string' ? mockEntities : [global]),
    );
    const update = vi.spyOn(loreService, 'updateLoreEntity').mockResolvedValue();
    const listeners = new Map<string, (entities: LoreEntity[]) => void>();
    const stop = vi.fn();
    vi.spyOn(loreService, 'subscribeLoreEntities').mockImplementation((scope, changed) => {
      const key = typeof scope === 'string' ? scope : scope.id;
      listeners.set(key, changed);
      changed(key === 'world' ? [global] : mockEntities);
      return stop;
    });
    const view = render(
      <MemoryRouter initialEntries={['/books/b-1/editor/c-1']}>
        <Routes>
          <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    const user = userEvent.setup();
    await screen.findByLabelText(/área de escrita do capítulo/i);
    act(() => screen.getByRole('button', { name: 'Ver ficha de Sábia' }).focus());
    await user.keyboard('{Enter}');
    expect(screen.getByLabelText('Escopo do lore')).toHaveTextContent(
      'Lore global — universo compartilhado',
    );
    await user.click(screen.getByRole('button', { name: 'Editar' }));
    await user.click(screen.getByLabelText(/Tornar visível/));
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    expect(update).toHaveBeenCalledWith(
      { kind: 'universe', id: 'world' },
      global.id,
      expect.objectContaining({ isPublic: false }),
    );
    act(() => {
      listeners.get('world')?.([
        { ...global, name: 'Oráculo', summary: 'Resumo atualizado globalmente' },
      ]);
    });
    expect(screen.getByText('Resumo atualizado globalmente')).toBeInTheDocument();
    await chooseDropdown(
      user,
      screen.getByLabelText('Escopo do lore'),
      'Lore local — somente este livro',
    );
    expect(
      within(screen.getByRole('complementary', { name: /Painel lateral/ })).getByText(
        mockEntities[0]!.name,
      ),
    ).toBeInTheDocument();
    view.unmount();
    expect(stop).toHaveBeenCalledTimes(2);
  });
  it('manter versão salva descarta rascunho local sem escrever e conserva a base CAS para a próxima edição', async () => {
    const user = userEvent.setup({ delay: null });
    const saved = '<p>Versão salva A.</p>';
    vi.spyOn(bookService, 'getBook').mockResolvedValue({ ...mockBook, hasProgressResources: true });
    vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
    vi.spyOn(bookService, 'getChapter').mockResolvedValue({ ...mockChapters[0]!, content: saved });
    const update = vi.spyOn(bookService, 'updateChapter').mockResolvedValue();
    vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue([]);
    writeLocalDraft('auth-1', 'b-1', 'c-1', '<p>Rascunho local B.</p>');
    const view = render(
      <MemoryRouter initialEntries={['/books/b-1/editor/c-1']}>
        <Routes>
          <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByRole('dialog', { name: 'Recuperar rascunho local?' });
    const keep = screen.getByRole('button', { name: 'Manter versão salva' });
    await waitFor(() => expect(getComputedStyle(keep).pointerEvents).not.toBe('none'));
    await user.click(keep);
    const editor = await screen.findByRole('textbox', { name: 'Área de escrita do capítulo' });
    expect(editor).toHaveTextContent('Versão salva A.');
    expect(readLocalDraft('auth-1', 'b-1', 'c-1')).toBeNull();
    expect(update).not.toHaveBeenCalled();
    // JSDOM não edita contenteditable nativamente; entregamos a alteração DOM
    // e os eventos de entrada/seleção, com editor e autosave reais.
    const descriptors = ['getBoundingClientRect', 'getClientRects'].map((name) => ({
      name,
      value: Object.getOwnPropertyDescriptor(Range.prototype, name),
    }));
    const rect = {
      left: 0,
      right: 100,
      top: 0,
      bottom: 20,
      width: 100,
      height: 20,
      x: 0,
      y: 0,
      toJSON: () => ({}),
    };
    Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
      configurable: true,
      value: () => rect,
    });
    Object.defineProperty(Range.prototype, 'getClientRects', {
      configurable: true,
      value: () => Object.assign([rect], { item: () => rect }),
    });
    const scroll = vi.spyOn(window, 'scrollBy').mockImplementation(() => undefined);
    try {
      const text = editor.querySelector('p')?.lastChild;
      if (!(text instanceof Text)) throw new Error('Prosa salva ausente');
      const selection = window.getSelection();
      if (!selection) throw new Error('Seleção nativa indisponível');
      act(() => {
        editor.focus();
        selection.collapse(text, text.length);
        fireEvent(document, new Event('selectionchange'));
        fireEvent(
          editor,
          new InputEvent('beforeinput', { bubbles: true, inputType: 'insertText', data: ' C' }),
        );
        text.appendData(' C');
        selection.collapse(text, text.length);
        fireEvent.input(editor, { inputType: 'insertText', data: ' C' });
        fireEvent(document, new Event('selectionchange'));
      });
      expect(editor).toHaveTextContent('Versão salva A. C');
      await screen.findByText('Não salvo');
      view.unmount();
      await waitFor(() => expect(update).toHaveBeenCalledTimes(1));
      const call = update.mock.calls[0];
      if (!call) throw new Error('Gravação da edição C ausente');
      expect(call.slice(0, 2)).toEqual(['b-1', 'c-1']);
      expect(call[2]).toMatchObject({ expectedContent: saved, expectedOwnerId: 'auth-1' });
      expect(call[2].content).toContain('C');
    } finally {
      view.unmount();
      scroll.mockRestore();
      for (const descriptor of descriptors) {
        if (descriptor.value)
          Object.defineProperty(Range.prototype, descriptor.name, descriptor.value);
        else Reflect.deleteProperty(Range.prototype, descriptor.name);
      }
    }
  });
  it.each(['Recuperar texto local', 'Manter versão salva'])(
    'exige escolha explicita para rascunho divergente: %s',
    async (choice) => {
      const user = userEvent.setup({ delay: null });
      vi.spyOn(bookService, 'getBook').mockResolvedValue(mockBook);
      vi.spyOn(bookService, 'listChapters').mockResolvedValue(mockChapters);
      vi.spyOn(bookService, 'getChapter').mockResolvedValue(mockChapters[0] ?? null);
      vi.spyOn(bookService, 'updateChapter').mockResolvedValue();
      vi.spyOn(loreService, 'listLoreEntities').mockResolvedValue(mockEntities);
      localStorage.setItem(
        'writer:draft:auth-1:b-1:c-1',
        JSON.stringify({ content: 'Texto local preservado', updatedAt: 1 }),
      );
      render(
        <MemoryRouter initialEntries={['/books/b-1/editor/c-1']}>
          <Routes>
            <Route path="/books/:bookId/editor/:chapterId" element={<EditorPage />} />
          </Routes>
        </MemoryRouter>,
      );
      expect(
        await screen.findByRole('dialog', { name: 'Recuperar rascunho local?' }),
      ).toBeInTheDocument();
      expect(bookService.updateChapter).not.toHaveBeenCalled();
      expect(screen.queryByLabelText(/área de escrita do capítulo/i)).not.toBeInTheDocument();
      const choiceButton = screen.getByRole('button', { name: choice });
      await waitFor(() => expect(getComputedStyle(choiceButton).pointerEvents).not.toBe('none'));
      await user.click(choiceButton);
      const editor = await screen.findByLabelText(/área de escrita do capítulo/i);
      expect(editor).toHaveTextContent(
        choice === 'Recuperar texto local'
          ? 'Texto local preservado'
          : 'Arthur caminhava ao entardecer.',
      );
    },
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
