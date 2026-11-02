import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { chooseDropdown } from '@/test/dropdown';
import type { LibraryImage } from '@/features/image-library';
import { AdventureBlockImageEditor } from '../components/AdventureBlockImageEditor';
import { AdventureScenePreviewDialog } from '../components/AdventureScenePreviewDialog';
import { useAdventureScenePreview } from '../hooks/useAdventureScenePreview';
import {
  renderAdventurePreviewHtml,
  validateAdventurePreviewImage,
  validateAdventureScenePreview,
} from '../services/adventurePreviewService';
import { readPendingAdventureBlockOperation } from '../services/adventureBlockRecovery';
import * as api from '../services/adventurePreviewCallables';
import type { AdventureScenePreviewPage } from '../model/adventurePreview';
import type { AdventureBlockMutation } from '../model/adventureBlock';
const auth = vi.hoisted(() => ({ user: { uid: 'owner', credits: 5 } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/adventurePreviewCallables', () => ({
  getAdventureBlockImage: vi.fn(),
  setAdventureBlockImage: vi.fn(),
  readAdventureScenePreview: vi.fn(),
  readAdventurePreviewImage: vi.fn(),
}));
vi.mock('@/features/image-library', () => ({
  ImageLibraryPicker: ({
    open,
    onSelect,
    onClose,
  }: {
    open: boolean;
    onSelect: (image: LibraryImage) => void;
    onClose: () => void;
  }) =>
    open ? (
      <section aria-label="Biblioteca de teste">
        <button
          onClick={() =>
            onSelect({
              id: 'library-image',
              name: 'Mapa do cais',
              url: 'https://private-storage/token',
              createdAt: 1,
              useCount: 0,
            })
          }
        >
          Selecionar mapa
        </button>
        <button onClick={onClose}>Cancelar biblioteca</button>
      </section>
    ) : null,
}));
const token = 'a'.repeat(64),
  otherToken = 'b'.repeat(64),
  dataUrl = 'data:image/webp;base64,UklGRg==';
const page = (title = 'Texto permitido', image = false): AdventureScenePreviewPage => ({
  items: [
    {
      key: 'permitted-key',
      title,
      narrativeType: 'clue',
      html: `<p>${title}</p>`,
      image: image
        ? { imageKey: 'opaque-media', alt: 'Mapa acessível', caption: 'Porto ao amanhecer' }
        : null,
    },
  ],
  nextCursor: null,
  projectionToken: token,
});
const mutation = (): AdventureBlockMutation => ({
  block: {
    resource: { kind: 'block', id: 'block' },
    sceneId: 'scene',
    revision: 3,
    title: 'Pista',
    narrativeType: 'clue',
    audience: 'gm',
    archived: false,
    order: 1,
    wordCount: 2,
    bodyHash: 'c'.repeat(64),
    bodyBytes: 2,
    createdAt: 1,
    updatedAt: 2,
  },
  sceneRevision: 8,
  sceneWordCount: 7,
  structureRevision: 4,
  mainBodyHash: 'd'.repeat(64),
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
beforeEach(() => {
  vi.clearAllMocks();
  auth.user = { uid: 'owner', credits: 5 };
  vi.mocked(api.getAdventureBlockImage).mockReset().mockResolvedValue({ revision: 2, image: null });
  vi.mocked(api.setAdventureBlockImage).mockReset().mockResolvedValue(mutation());
  vi.mocked(api.readAdventureScenePreview).mockReset().mockResolvedValue(page());
  vi.mocked(api.readAdventurePreviewImage).mockReset().mockResolvedValue({ dataUrl });
});
const imageProps = {
  adventureId: 'adventure',
  sceneId: 'scene',
  resource: { kind: 'block' as const, id: 'block' },
  revision: 2,
};
it('reserva o host antes de consultar ou escolher imagem e cancelar libera sem mutação', async () => {
  const events: string[] = [];
  vi.mocked(api.getAdventureBlockImage).mockImplementation(() => {
    events.push('read');
    return Promise.resolve({ revision: 2, image: null });
  });
  const runExclusive = async <T,>(work: () => Promise<T>) => {
    events.push('reserve');
    try {
      return await work();
    } finally {
      events.push('release');
    }
  };
  const onReservationChange = vi.fn();
  render(
    <AdventureBlockImageEditor
      {...imageProps}
      runExclusive={runExclusive}
      onReservationChange={onReservationChange}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Ilustração do bloco' }));
  await screen.findByText('Este bloco não tem ilustração.');
  expect(events).toEqual(['reserve', 'read']);
  expect(onReservationChange).toHaveBeenLastCalledWith(true);
  await userEvent.click(screen.getByRole('button', { name: 'Escolher imagem da biblioteca' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar biblioteca' }));
  expect(screen.getByRole('button', { name: 'Salvar ilustração' })).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(onReservationChange).toHaveBeenLastCalledWith(false));
  expect(events).toEqual(['reserve', 'read', 'release']);
  expect(api.setAdventureBlockImage).not.toHaveBeenCalled();
});
it('seleção envia apenas ID, alt e legenda; resposta incerta conserva reserva e recibo exato até confirmar', async () => {
  vi.mocked(api.setAdventureBlockImage).mockRejectedValueOnce(
    Object.assign(new Error('Transporte incerto'), { code: 'functions/unavailable' }),
  );
  const events: string[] = [],
    onSceneChange = vi.fn(),
    onPendingChange = vi.fn();
  const runExclusive = async <T,>(work: () => Promise<T>) => {
    events.push('reserve');
    try {
      return await work();
    } finally {
      events.push('release');
    }
  };
  render(
    <AdventureBlockImageEditor
      {...imageProps}
      runExclusive={runExclusive}
      onSceneChange={onSceneChange}
      onPendingChange={onPendingChange}
    />,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Ilustração do bloco' }));
  await screen.findByText('Este bloco não tem ilustração.');
  await userEvent.click(screen.getByRole('button', { name: 'Escolher imagem da biblioteca' }));
  await userEvent.click(screen.getByRole('button', { name: 'Selecionar mapa' }));
  await userEvent.type(screen.getByLabelText('Texto alternativo da ilustração'), 'Mapa do porto');
  await userEvent.type(screen.getByLabelText('Legenda da ilustração'), 'À primeira luz');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar ilustração' }));
  await screen.findByText('Transporte incerto');
  const input = vi.mocked(api.setAdventureBlockImage).mock.calls[0]![0];
  expect(input).toEqual({
    adventureId: 'adventure',
    resource: imageProps.resource,
    operationId: input.operationId,
    expectedRevision: 2,
    image: { imageId: 'library-image', alt: 'Mapa do porto', caption: 'À primeira luz' },
  });
  expect(JSON.stringify(input)).not.toContain('private-storage');
  expect(onSceneChange).not.toHaveBeenCalled();
  expect(events).toEqual(['reserve']);
  expect(readPendingAdventureBlockOperation('owner', 'adventure', 'scene')).toEqual({
    method: 'setAdventureBlockImage',
    input,
  });
  await userEvent.click(
    within(screen.getByRole('dialog', { name: 'Ilustração do bloco' })).getByRole('button', {
      name: 'Fechar',
    }),
  );
  expect(screen.getByRole('dialog', { name: 'Ilustração do bloco' })).toBeVisible();
  expect(events).toEqual(['reserve']);
  await userEvent.click(
    screen.getByRole('button', { name: 'Confirmar mesmo pedido de ilustração' }),
  );
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  expect(api.setAdventureBlockImage).toHaveBeenNthCalledWith(2, input);
  expect(events).toEqual(['reserve', 'release']);
  expect(onSceneChange).toHaveBeenCalledWith(mutation(), mutation().block);
  expect(onPendingChange).toHaveBeenLastCalledWith(false);
});
it('revisão diferente no getImage não é adotada para enviar set ou sobrescrever texto', async () => {
  vi.mocked(api.getAdventureBlockImage).mockResolvedValue({ revision: 9, image: null });
  render(<AdventureBlockImageEditor {...imageProps} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ilustração do bloco' }));
  expect(await screen.findByText(/O bloco mudou desde o texto aberto/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Salvar ilustração' })).toBeDisabled();
  expect(api.setAdventureBlockImage).not.toHaveBeenCalled();
});
it('cancelar durante getImage libera a reserva e sua resposta tardia não troca a seleção da próxima abertura', async () => {
  const old = deferred<{
    revision: number;
    image: { imageId: string; name: string; alt: string; caption: string } | null;
  }>();
  vi.mocked(api.getAdventureBlockImage)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({
      revision: 2,
      image: { imageId: 'new', name: 'Seleção atual', alt: 'Atual', caption: '' },
    });
  const events: string[] = [];
  const runExclusive = async <T,>(work: () => Promise<T>) => {
    events.push('reserve');
    try {
      return await work();
    } finally {
      events.push('release');
    }
  };
  render(<AdventureBlockImageEditor {...imageProps} runExclusive={runExclusive} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ilustração do bloco' }));
  expect(await screen.findByText('Carregando ilustração do bloco…')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
  await waitFor(() => expect(events).toEqual(['reserve', 'release']));
  await userEvent.click(screen.getByRole('button', { name: 'Ilustração do bloco' }));
  await screen.findByText('Imagem selecionada: Seleção atual');
  await act(async () => {
    old.resolve({
      revision: 2,
      image: { imageId: 'old', name: 'Seleção antiga', alt: 'Antiga', caption: '' },
    });
    await old.promise;
  });
  expect(screen.getByText('Imagem selecionada: Seleção atual')).toBeVisible();
  expect(screen.queryByText('Imagem selecionada: Seleção antiga')).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar' }));
});
it('remover vínculo envia null na revisão observada, sem recalcular contagens', async () => {
  vi.mocked(api.getAdventureBlockImage).mockResolvedValue({
    revision: 2,
    image: { imageId: 'old', name: 'Antiga', alt: 'Antes', caption: 'Legenda' },
  });
  render(<AdventureBlockImageEditor {...imageProps} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ilustração do bloco' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Remover ilustração' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar ilustração' }));
  await waitFor(() => expect(api.setAdventureBlockImage).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.setAdventureBlockImage).mock.calls[0]![0]).toMatchObject({
    expectedRevision: 2,
    image: null,
  });
});
it('confirmação de imagem de outra conta não atualiza o host atual e conserva o recibo privado da conta original', async () => {
  const pending = deferred<AdventureBlockMutation>();
  vi.mocked(api.setAdventureBlockImage).mockReturnValueOnce(pending.promise);
  const onSceneChange = vi.fn();
  const view = render(<AdventureBlockImageEditor {...imageProps} onSceneChange={onSceneChange} />);
  await userEvent.click(screen.getByRole('button', { name: 'Ilustração do bloco' }));
  await screen.findByText('Este bloco não tem ilustração.');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar ilustração' }));
  await waitFor(() => expect(api.setAdventureBlockImage).toHaveBeenCalledTimes(1));
  const input = vi.mocked(api.setAdventureBlockImage).mock.calls[0]![0];
  auth.user = { uid: 'other-owner', credits: 5 };
  view.rerender(<AdventureBlockImageEditor {...imageProps} onSceneChange={onSceneChange} />);
  await act(async () => {
    pending.resolve(mutation());
    await pending.promise;
  });
  expect(onSceneChange).not.toHaveBeenCalled();
  expect(readPendingAdventureBlockOperation('owner', 'adventure', 'scene')?.input).toEqual(input);
  expect(readPendingAdventureBlockOperation('other-owner', 'adventure', 'scene')).toBeNull();
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
});
it('renderer da prévia remove URLs, atributos de lore e elementos executáveis, preservando texto permitido', () => {
  const html = renderAdventurePreviewHtml(
    '<h2 data-lore-id="private">Título</h2><p onclick="run()">Texto <a href="https://token">literal</a><span data-entity="secret">nome escrito</span></p><img src="https://private/token"><script>segredo script</script><style>segredo css</style><iframe>segredo frame</iframe>',
  );
  expect(html).toBe('<h2>Título</h2><p>Texto literalnome escrito</p>');
  expect(html).not.toMatch(/private|secret|token|href|src|data-|script|style|iframe/);
  expect(renderAdventurePreviewHtml('<p><u>ênfase</u><del>revisão</del></p>')).toBe(
    '<p><u>ênfase</u><del>revisão</del></p>',
  );
  expect(
    validateAdventureScenePreview({ ...page(), planning: 'secret' } as AdventureScenePreviewPage),
  ).not.toHaveProperty('planning');
});
it('DTO de projeção e mídia recusam páginas grandes, token inválido e URL da biblioteca', () => {
  expect(() => validateAdventureScenePreview({ ...page(), projectionToken: 'invalid' })).toThrow();
  expect(() =>
    validateAdventureScenePreview({
      ...page(),
      items: [{ ...page().items[0]!, html: 'a'.repeat(4 * 1024 * 1024) }],
    }),
  ).toThrow();
  expect(validateAdventurePreviewImage({ dataUrl })).toBe(dataUrl);
  expect(() =>
    validateAdventurePreviewImage({ dataUrl: 'https://storage/image?token=secret' }),
  ).toThrow();
  expect(() =>
    validateAdventurePreviewImage({ dataUrl: 'data:image/webp;base64,' + 'AAAA'.repeat(524289) }),
  ).toThrow();
});
it('prévia pagina DTO real e mostra somente mídia derivada com alt e legenda projetados', async () => {
  vi.mocked(api.readAdventureScenePreview)
    .mockResolvedValueOnce({ ...page('Primeiro', true), nextCursor: 'allowed-cursor' })
    .mockResolvedValueOnce({
      ...page('Segundo'),
      items: [{ ...page('Segundo').items[0]!, key: 'second' }],
    });
  render(
    <AdventureScenePreviewDialog
      open
      onClose={() => undefined}
      adventureId="adventure"
      sceneId="scene"
    />,
  );
  expect(await screen.findByRole('heading', { name: 'Primeiro' })).toBeVisible();
  expect(await screen.findByRole('img', { name: 'Mapa acessível' })).toHaveAttribute(
    'src',
    dataUrl,
  );
  expect(screen.getByText('Porto ao amanhecer')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais blocos da prévia' }));
  expect(await screen.findByRole('heading', { name: 'Segundo' })).toBeVisible();
  expect(screen.getByRole('heading', { name: 'Primeiro' })).toBeVisible();
  expect(api.readAdventurePreviewImage).toHaveBeenCalledWith({
    adventureId: 'adventure',
    sceneId: 'scene',
    audience: 'creator',
    projectionToken: token,
    imageKey: 'opaque-media',
  });
});
it('trocar modo remove texto e mídia antigos antes da resposta e ignora mídia tardia', async () => {
  const oldMedia = deferred<{ dataUrl: string }>(),
    next = deferred<AdventureScenePreviewPage>();
  vi.mocked(api.readAdventureScenePreview)
    .mockResolvedValueOnce(page('Segredo original', true))
    .mockReturnValueOnce(next.promise);
  vi.mocked(api.readAdventurePreviewImage).mockReturnValueOnce(oldMedia.promise);
  render(
    <AdventureScenePreviewDialog
      open
      onClose={() => undefined}
      adventureId="adventure"
      sceneId="scene"
    />,
  );
  await screen.findByRole('heading', { name: 'Segredo original' });
  await chooseDropdown(userEvent, screen.getByLabelText('Modo da prévia'), 'Jogadores');
  expect(screen.queryByRole('heading', { name: 'Segredo original' })).not.toBeInTheDocument();
  await act(async () => {
    oldMedia.resolve({ dataUrl });
    next.resolve(page('Texto público'));
    await next.promise;
  });
  expect(await screen.findByRole('heading', { name: 'Texto público' })).toBeVisible();
  expect(screen.queryByRole('img')).not.toBeInTheDocument();
  expect(screen.queryByText('Porto ao amanhecer')).not.toBeInTheDocument();
  expect(api.readAdventureScenePreview).toHaveBeenLastCalledWith({
    adventureId: 'adventure',
    sceneId: 'scene',
    audience: 'players',
    cursor: null,
    limit: 25,
  });
});
it('mudança de token e revogação da mídia limpam o conteúdo inteiro, sem repovoar por respostas tardias', async () => {
  const late = deferred<{ dataUrl: string }>();
  vi.mocked(api.readAdventureScenePreview)
    .mockResolvedValueOnce({ ...page('Texto antes', true), nextCursor: 'next' })
    .mockResolvedValueOnce({ ...page('Nova composição'), projectionToken: otherToken });
  vi.mocked(api.readAdventurePreviewImage).mockReturnValueOnce(late.promise);
  const view = renderHook(() => useAdventureScenePreview('adventure', 'scene', 'gm'));
  await waitFor(() => expect(view.result.current.page?.items[0]?.title).toBe('Texto antes'));
  await act(() => view.result.current.loadMore());
  expect(view.result.current.page).toBeNull();
  expect(view.result.current.error).toContain('composição mudou');
  await act(async () => {
    late.resolve({ dataUrl });
    await late.promise;
  });
  expect(view.result.current.images).toEqual({});
  expect(view.result.current.page).toBeNull();
  vi.mocked(api.readAdventureScenePreview).mockResolvedValue(page('Reaberto', true));
  vi.mocked(api.readAdventurePreviewImage).mockRejectedValue(
    Object.assign(new Error('Acesso revogado'), { code: 'functions/permission-denied' }),
  );
  act(() => view.result.current.refresh());
  await waitFor(() => expect(view.result.current.error).toBe('Acesso revogado'));
  expect(view.result.current.page).toBeNull();
  expect(view.result.current.images).toEqual({});
});
it.each(['account', 'scene'] as const)(
  'resposta de prévia tardia após mudança de %s não reaparece',
  async (change) => {
    const old = deferred<AdventureScenePreviewPage>();
    vi.mocked(api.readAdventureScenePreview)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(page('Atual'));
    const view = render(
      <AdventureScenePreviewDialog
        open
        onClose={() => undefined}
        adventureId="adventure"
        sceneId="scene"
      />,
    );
    await waitFor(() => expect(api.readAdventureScenePreview).toHaveBeenCalledTimes(1));
    if (change === 'account') auth.user = { uid: 'other', credits: 5 };
    view.rerender(
      <AdventureScenePreviewDialog
        open
        onClose={() => undefined}
        adventureId="adventure"
        sceneId={change === 'scene' ? 'other-scene' : 'scene'}
      />,
    );
    expect(await screen.findByRole('heading', { name: 'Atual' })).toBeVisible();
    await act(async () => {
      old.resolve(page('Segredo anterior'));
      await old.promise;
    });
    expect(screen.queryByRole('heading', { name: 'Segredo anterior' })).not.toBeInTheDocument();
  },
);
