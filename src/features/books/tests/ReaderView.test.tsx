import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, render, screen, waitFor, within } from '@/test/render';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { ThemeProvider } from '@/shared/theme';
import { ReaderView } from '../components/ReaderView';
import * as service from '../services/publicBookService';
import type {
  PublicBook,
  PublicBookContent,
  PublicLoreEntity,
} from '../services/publicBookService';

vi.mock('../services/publicBookService', async () => ({
  ...(await vi.importActual<typeof import('../services/publicBookService')>(
    '../services/publicBookService',
  )),
  getPublicBook: vi.fn(),
  getPublicBookContent: vi.fn(),
  subscribePublicBook: vi.fn(),
  copyPublicReadingLink: vi.fn(),
}));
const book: PublicBook = {
  id: 'book',
  title: 'A Jornada',
  authorName: 'Ana Autora',
  revisionId: 'rev1',
  publishedAt: 100,
};
const content: PublicBookContent = {
  chapters: [
    {
      id: 'one',
      title: 'A partida',
      order: 1,
      content: '<p>Éowyn e Lume chegaram. Segredo espera. <strong>Coragem.</strong></p>',
    },
    { id: 'two', title: 'O retorno', order: 2, content: '<h3>De volta</h3><p>Segundo texto.</p>' },
  ],
  lore: [
    {
      id: 'hero',
      name: 'Éowyn',
      aliases: ['Lume'],
      category: 'character',
      summary: 'Uma viajante.',
      isPublic: true,
    },
  ],
};
let changed: (book: PublicBook | null) => void;
let failed: (error: unknown) => void;
const unsubscribe = vi.fn();
function mount(path = '/read/book') {
  const router = createMemoryRouter([{ path: '/read/:bookId', element: <ReaderView /> }], {
    initialEntries: [path],
  });
  const result = render(
    <ThemeProvider>
      <RouterProvider router={router} />
    </ThemeProvider>,
  );
  return { ...result, router, user: userEvent.setup() };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

describe('ReaderView', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(service.getPublicBook).mockResolvedValue(book);
    vi.mocked(service.getPublicBookContent).mockResolvedValue(content);
    vi.mocked(service.subscribePublicBook).mockImplementation((_id, onChange, onError) => {
      changed = onChange;
      failed = onError;
      return unsubscribe;
    });
    vi.mocked(service.copyPublicReadingLink).mockResolvedValue();
  });
  it('renders a published book anonymously with semantic prose, TOC and no editing controls', async () => {
    mount();
    expect(screen.getByText('Abrindo a obra...')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'A Jornada' })).toBeInTheDocument();
    expect(screen.getByText('Por Ana Autora')).toBeInTheDocument();
    expect(screen.getByRole('navigation', { name: 'Sumário' })).toBeInTheDocument();
    expect(screen.getByText('Coragem.').tagName).toBe('STRONG');
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Anterior' })).toBeDisabled();
  });
  it('keeps chapter deep links, TOC, previous/next and browser back/forward synchronized', async () => {
    const { user, router } = mount('/read/book?chapter=two');
    expect(await screen.findByRole('heading', { name: 'O retorno', level: 2 })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Próximo' })).toBeDisabled();
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByRole('heading', { name: 'A partida', level: 2 })).toHaveFocus();
    expect(router.state.location.search).toBe('?chapter=one');
    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(router.state.location.search).toBe('?chapter=two');
    await act(() => router.navigate(-1));
    expect(screen.getByRole('heading', { name: 'A partida', level: 2 })).toBeInTheDocument();
    await act(() => router.navigate(1));
    expect(screen.getByRole('heading', { name: 'O retorno', level: 2 })).toBeInTheDocument();
    await user.click(
      within(screen.getByRole('navigation', { name: 'Sumário' })).getByRole('link', {
        name: 'A partida',
      }),
    );
    expect(router.state.location.search).toBe('?chapter=one');
    expect(service.getPublicBookContent).toHaveBeenCalledTimes(1);
  });
  it('falls back to the first chapter for stale links and shares the actual chapter', async () => {
    const { user } = mount('/read/book?chapter=deleted');
    await screen.findByRole('heading', { name: 'A partida', level: 2 });
    await user.click(screen.getByRole('button', { name: 'Compartilhar link' }));
    expect(service.copyPublicReadingLink).toHaveBeenCalledWith('book', 'one');
    expect(await screen.findByText('Link do capítulo copiado.')).toBeInTheDocument();
  });
  it('offers a usable share URL when clipboard permission is denied', async () => {
    vi.mocked(service.copyPublicReadingLink).mockRejectedValue(new Error('denied'));
    const { user } = mount();
    await screen.findByRole('heading', { name: 'A Jornada' });
    await user.click(screen.getByRole('button', { name: 'Compartilhar link' }));
    expect(
      await screen.findByRole('link', { name: 'Abra o link para compartilhar.' }),
    ).toHaveAttribute('href', expect.stringContaining('/read/book?chapter=one'));
  });
  it('exposes only public category and summary by hover, keyboard focus and tap, dismissing with Escape', async () => {
    vi.mocked(service.getPublicBookContent).mockResolvedValue({
      ...content,
      lore: [
        ...content.lore,
        {
          id: 'private',
          name: 'Segredo',
          aliases: [],
          category: 'other',
          summary: 'SPOILER',
          isPublic: false,
        } as unknown as PublicLoreEntity,
      ],
    });
    const { user } = mount();
    await screen.findByRole('heading', { name: 'A Jornada' });
    const triggers = screen.getAllByRole('button', { name: 'Ver resumo de Éowyn' });
    expect(triggers).toHaveLength(2);
    await user.hover(triggers[0]!);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Personagem');
    expect(screen.getByRole('tooltip')).toHaveTextContent('Uma viajante.');
    await user.unhover(triggers[0]!);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    act(() => triggers[1]!.focus());
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await user.click(triggers[1]!);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ver resumo de Segredo' })).not.toBeInTheDocument();
    expect(screen.queryByText('SPOILER')).not.toBeInTheDocument();
  });
  it('supports all reading themes using the existing provider', async () => {
    const { user } = mount();
    await screen.findByRole('heading', { name: 'A Jornada' });
    const themes = new Set<string | null>();
    for (let index = 0; index < 3; index += 1) {
      await user.click(screen.getByRole('button', { name: /Alternar tema/ }));
      themes.add(document.documentElement.getAttribute('data-theme'));
    }
    expect(themes).toEqual(new Set(['light', 'dark', 'sepia']));
  });
  it('never exposes metadata for missing/draft/revoked books and skips content reads', async () => {
    vi.mocked(service.getPublicBook).mockResolvedValue(null);
    mount();
    expect(await screen.findByText('Obra indisponível')).toBeInTheDocument();
    expect(service.getPublicBookContent).not.toHaveBeenCalled();
    expect(screen.queryByText('A Jornada')).not.toBeInTheDocument();
  });
  it('displays empty editions and empty chapters honestly', async () => {
    vi.mocked(service.getPublicBookContent).mockResolvedValueOnce({ chapters: [], lore: [] });
    const first = mount();
    expect(await screen.findByText('Nenhum capítulo publicado')).toBeInTheDocument();
    first.unmount();
    vi.mocked(service.getPublicBookContent).mockResolvedValueOnce({
      chapters: [{ id: 'empty', title: 'Vazio', content: '', order: 1 }],
      lore: [],
    });
    mount();
    expect(await screen.findByText('Este capítulo ainda não contém texto.')).toBeInTheDocument();
  });
  it('recovers from an initial network error on retry', async () => {
    vi.mocked(service.getPublicBook).mockRejectedValueOnce(new Error('offline'));
    const { user } = mount();
    await screen.findByRole('alert');
    await user.click(screen.getByRole('button', { name: 'Tentar novamente' }));
    expect(await screen.findByRole('heading', { name: 'A Jornada' })).toBeInTheDocument();
  });
  it('clears already-rendered content as soon as publication is revoked and unsubscribes', async () => {
    const { unmount } = mount();
    await screen.findByRole('heading', { name: 'A Jornada' });
    act(() => changed(null));
    expect(screen.getByText('Obra indisponível')).toBeInTheDocument();
    expect(screen.queryByText('Coragem.')).not.toBeInTheDocument();
    unmount();
    expect(unsubscribe).toHaveBeenCalled();
  });
  it('does not show an old in-flight response after unpublishing', async () => {
    const pending = deferred<PublicBookContent>();
    vi.mocked(service.getPublicBookContent).mockReturnValue(pending.promise);
    mount();
    await waitFor(() => expect(service.subscribePublicBook).toHaveBeenCalled());
    act(() => changed(null));
    await act(async () => {
      pending.resolve(content);
      await pending.promise;
    });
    expect(screen.getByText('Obra indisponível')).toBeInTheDocument();
    expect(screen.queryByText('Coragem.')).not.toBeInTheDocument();
  });
  it('rechecks revocation before showing data and handles subscription network errors', async () => {
    vi.mocked(service.getPublicBook).mockResolvedValueOnce(book).mockResolvedValueOnce(null);
    const result = mount();
    expect(await screen.findByText('Obra indisponível')).toBeInTheDocument();
    result.unmount();
    vi.mocked(service.getPublicBook).mockResolvedValue(book);
    mount();
    await screen.findByRole('heading', { name: 'A Jornada' });
    act(() => failed(new Error('offline')));
    expect(screen.getByRole('alert')).toBeInTheDocument();
    expect(screen.queryByText('Coragem.')).not.toBeInTheDocument();
  });
  it('loads a new publication revision and ignores superseded content', async () => {
    const pending = deferred<PublicBookContent>();
    vi.mocked(service.getPublicBookContent)
      .mockReturnValueOnce(pending.promise)
      .mockResolvedValueOnce({
        chapters: [{ id: 'new', title: 'Nova edição', content: 'Novo conteúdo', order: 1 }],
        lore: [],
      });
    mount();
    await waitFor(() => expect(service.subscribePublicBook).toHaveBeenCalled());
    const revised = { ...book, revisionId: 'rev2' };
    vi.mocked(service.getPublicBook).mockResolvedValue(revised);
    act(() => changed(revised));
    expect(
      await screen.findByRole('heading', { name: 'Nova edição', level: 2 }),
    ).toBeInTheDocument();
    await act(async () => {
      pending.resolve(content);
      await pending.promise;
    });
    expect(screen.queryByText('Coragem.')).not.toBeInTheDocument();
  });
  it('sanitizes hostile chapter markup and does not nest tooltip buttons inside links or code', async () => {
    vi.mocked(service.getPublicBookContent).mockResolvedValue({
      ...content,
      chapters: [
        {
          id: 'html',
          title: 'Texto seguro',
          order: 1,
          content:
            '<p onclick="bad()"><span data-lore-id="secret">Segredo</span><img src="https://tracker.test"><script>secret()</script><a href="javascript:bad()">unsafe</a><a href="https://example.com">Éowyn</a><code>Lume</code></p>',
        },
      ],
    });
    const { container } = mount();
    await screen.findByRole('heading', { name: 'Texto seguro', level: 2 });
    expect(container.querySelector('script,img,[onclick],[data-lore-id]')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Ver resumo de Éowyn' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Éowyn' })).toHaveAttribute(
      'href',
      'https://example.com/',
    );
  });
  it('ignores a late response after navigating to another book', async () => {
    const pending = deferred<PublicBookContent>();
    const other = { ...book, id: 'other', title: 'Outra obra' };
    vi.mocked(service.getPublicBook).mockImplementation((id) =>
      Promise.resolve(id === 'other' ? other : book),
    );
    vi.mocked(service.getPublicBookContent).mockImplementation((current) =>
      current.id === 'book'
        ? pending.promise
        : Promise.resolve({
            chapters: [
              { id: 'new', title: 'Outro capítulo', content: '<p>Outro texto</p>', order: 1 },
            ],
            lore: [],
          }),
    );
    const { router } = mount();
    await waitFor(() => expect(service.subscribePublicBook).toHaveBeenCalled());
    await act(() => router.navigate('/read/other'));
    expect(await screen.findByRole('heading', { name: 'Outra obra' })).toBeInTheDocument();
    await act(async () => {
      pending.resolve(content);
      await pending.promise;
    });
    expect(screen.queryByText('A Jornada')).not.toBeInTheDocument();
    expect(screen.queryByText('Coragem.')).not.toBeInTheDocument();
    expect(unsubscribe).toHaveBeenCalled();
  });

  it('shows the empty state for a rich-editor blank paragraph', async () => {
    vi.mocked(service.getPublicBookContent).mockResolvedValue({
      chapters: [{ id: 'blank', title: 'Em branco', order: 1, content: '<p><br></p>' }],
      lore: [],
    });
    mount();
    expect(await screen.findByText('Este capítulo ainda não contém texto.')).toBeInTheDocument();
  });
  it('lets a reader retry a previously unavailable edition after the author publishes', async () => {
    vi.mocked(service.getPublicBook).mockResolvedValueOnce(null);
    const { user } = mount();
    await screen.findByText('Obra indisponível');
    await user.click(screen.getByRole('button', { name: 'Verificar novamente' }));
    expect(await screen.findByRole('heading', { name: 'A Jornada' })).toBeInTheDocument();
  });
  it('navigates chapters with arrow keys without stealing control shortcuts or selected text', async () => {
    const { user, router, container } = mount();
    await screen.findByRole('heading', { name: 'A partida', level: 2 });
    await user.keyboard('{ArrowLeft}');
    expect(router.state.location.search).toBe('');
    await user.keyboard('{Control>}{ArrowRight}{/Control}');
    expect(router.state.location.search).toBe('');
    await user.keyboard('{ArrowRight}');
    expect(router.state.location.search).toBe('?chapter=two');
    await user.keyboard('{ArrowRight}');
    expect(router.state.location.search).toBe('?chapter=two');
    await user.keyboard('{ArrowLeft}');
    expect(router.state.location.search).toBe('?chapter=one');
    act(() => screen.getByRole('button', { name: 'Compartilhar link' }).focus());
    await user.keyboard('{ArrowRight}');
    expect(router.state.location.search).toBe('?chapter=one');
    const input = document.createElement('input');
    container.append(input);
    input.focus();
    await user.keyboard('{ArrowRight}');
    expect(router.state.location.search).toBe('?chapter=one');
    const heading = screen.getByRole('heading', { name: 'A partida', level: 2 });
    heading.focus();
    const range = document.createRange();
    range.selectNodeContents(heading);
    window.getSelection()?.removeAllRanges();
    window.getSelection()?.addRange(range);
    await user.keyboard('{ArrowRight}');
    expect(router.state.location.search).toBe('?chapter=one');
    window.getSelection()?.removeAllRanges();
  });

  it('agrupa sumário por ato e navega entre atos mantendo links diretos', async () => {
    vi.mocked(service.getPublicBookContent).mockResolvedValue({
      ...content,
      acts: [
        { id: 'a', name: 'I', order: 1 },
        { id: 'b', name: 'Virada', order: 2 },
      ],
      chapters: content.chapters.map((chapter, index) => ({
        ...chapter,
        actId: index ? 'b' : 'a',
      })),
    });
    const { user, router } = mount();
    expect(await screen.findByRole('heading', { name: 'I', level: 3 })).toBeInTheDocument();
    expect(screen.getByText('Ato I')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Próximo' }));
    expect(screen.getByText('Ato Virada')).toBeInTheDocument();
    expect(router.state.location.search).toBe('?chapter=two');
    await user.click(screen.getByRole('button', { name: 'Anterior' }));
    expect(screen.getByText('Ato I')).toBeInTheDocument();
  });
});
