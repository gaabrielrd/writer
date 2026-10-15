import { act, render, renderHook, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { useWorkHistory, type UseWorkHistoryOptions } from '../hooks/useWorkHistory';
import { WorkHistoryDialog } from '../components/WorkHistoryDialog';
import {
  createWorkVersion,
  deleteWorkVersion,
  getWorkVersionSource,
  listWorkVersions,
  readWorkVersion,
  restoreWorkVersion,
} from '../services/workHistoryCallables';
import { readPendingWorkHistoryOperation } from '../services/workHistoryRecovery';
import {
  workHistoryHash,
  type RestoreWorkVersionResult,
  type VersionBodyPage,
  type VersionEditorAdapter,
  type VersionSource,
  type VersionSummary,
  type VersionTarget,
} from '../model/workHistory';
const auth = vi.hoisted((): { user: { uid: string } | null } => ({ user: { uid: 'owner' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/workHistoryCallables', () => ({
  createWorkVersion: vi.fn(),
  deleteWorkVersion: vi.fn(),
  getWorkVersionSource: vi.fn(),
  listWorkVersions: vi.fn(),
  readWorkVersion: vi.fn(),
  restoreWorkVersion: vi.fn(),
}));
const target: VersionTarget = { kind: 'book', id: 'book' };
const resource = { kind: 'chapter' as const, id: 'chapter' };
const saved = '<p>Texto atual confirmado.</p>';
const original = '<p><strong>Versão</strong> do cais.</p>';
let source: VersionSource,
  version: VersionSummary,
  previousVersion: VersionSummary,
  restored: VersionSource;
let confirmed: string | null;
let adapter: VersionEditorAdapter;
let pendingChange: ReturnType<typeof vi.fn<(pending: boolean) => void>>;
const clipboardWrite = vi.fn<(text: string) => Promise<void>>();
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
function options(): UseWorkHistoryOptions {
  return { open: true, target, resource, editor: adapter, onPendingChange: pendingChange };
}
beforeEach(async () => {
  vi.clearAllMocks();
  auth.user = { uid: 'owner' };
  source = {
    target,
    resource,
    title: 'Capítulo do cais',
    content: saved,
    sourceToken: 'a'.repeat(64),
    contentHash: await workHistoryHash(saved),
    revision: null,
  };
  version = {
    id: 'version',
    target,
    resource,
    createdAt: 2,
    reason: 'manual',
    label: 'Antes da revisão',
    wordCount: 3,
    byteLength: new TextEncoder().encode(original).byteLength,
    contentHash: await workHistoryHash(original),
    chunkCount: 1,
  };
  previousVersion = {
    ...version,
    id: 'before-restore',
    reason: 'before-restore',
    label: null,
    contentHash: source.contentHash,
    byteLength: new TextEncoder().encode(saved).byteLength,
  };
  restored = {
    ...source,
    content: original,
    contentHash: version.contentHash,
    sourceToken: 'b'.repeat(64),
  };
  confirmed = saved;
  pendingChange = vi.fn();
  adapter = {
    resource,
    getConfirmedContent: () => confirmed,
    runExclusive: (work) => work(),
    acceptRestored: vi.fn((value: VersionSource) => {
      confirmed = value.content;
    }),
  };
  vi.mocked(getWorkVersionSource)
    .mockReset()
    .mockImplementation(() => Promise.resolve(source));
  vi.mocked(listWorkVersions)
    .mockReset()
    .mockResolvedValue({ items: [version], nextCursor: null });
  vi.mocked(readWorkVersion)
    .mockReset()
    .mockResolvedValue({ version, chunks: [{ index: 0, content: original }], nextCursor: null });
  vi.mocked(createWorkVersion)
    .mockReset()
    .mockResolvedValue({
      version: { ...previousVersion, id: 'manual-new', reason: 'manual', label: 'Meu ponto' },
    });
  vi.mocked(restoreWorkVersion)
    .mockReset()
    .mockResolvedValue({ source: restored, previousVersion });
  vi.mocked(deleteWorkVersion).mockReset().mockResolvedValue({ complete: true, processed: 1 });
  clipboardWrite.mockReset().mockResolvedValue(undefined);
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { writeText: clipboardWrite },
  });
});
async function ready(view: { result: { current: ReturnType<typeof useWorkHistory> } }) {
  await waitFor(() => {
    expect(view.result.current.loading).toBe(false);
    expect(view.result.current.source).toEqual(source);
  });
}
it('abrir lista somente metadados; selecionar verifica o corpo sem criar versões', async () => {
  const view = renderHook(() => useWorkHistory(options()));
  await ready(view);
  expect(listWorkVersions).toHaveBeenCalledWith({ target, resource, cursor: null, limit: 25 });
  expect(readWorkVersion).not.toHaveBeenCalled();
  expect(createWorkVersion).not.toHaveBeenCalled();
  await act(() => view.result.current.select(version));
  expect(view.result.current.selected?.content).toBe(original);
  expect(view.result.current.source?.content).toBe(saved);
  expect(createWorkVersion).not.toHaveBeenCalled();
});
it('criação manual reserva o editor e preserva recibo antes da chamada sem enviar prosa', async () => {
  const exclusive = vi.spyOn(adapter, 'runExclusive');
  vi.mocked(createWorkVersion).mockImplementationOnce((input) => {
    expect(pendingChange).toHaveBeenLastCalledWith(true);
    expect(readPendingWorkHistoryOperation('owner', target)?.input.operationId).toBe(
      input.operationId,
    );
    return Promise.resolve({ version: { ...version, id: 'manual-new' } });
  });
  const view = renderHook(() => useWorkHistory(options()));
  await ready(view);
  await act(() => view.result.current.create('  Meu ponto  '));
  expect(exclusive).toHaveBeenCalledWith(expect.any(Function), { recovery: false });
  const operationId = vi.mocked(createWorkVersion).mock.calls[0]![0].operationId;
  expect(typeof operationId).toBe('string');
  expect(createWorkVersion).toHaveBeenCalledWith({
    target,
    resource,
    operationId,
    expectedSourceToken: source.sourceToken,
    label: 'Meu ponto',
  });
  expect(view.result.current.items[0]?.id).toBe('manual-new');
  expect(adapter.acceptRestored).not.toHaveBeenCalled();
  expect(pendingChange).toHaveBeenLastCalledWith(false);
  expect(readPendingWorkHistoryOperation('owner', target)).toBeNull();
});
it('não cria versão nem salva implicitamente quando o texto deixou de estar confirmado', async () => {
  const view = renderHook(() => useWorkHistory(options()));
  await ready(view);
  confirmed = '<p>Alteração ainda não salva</p>';
  await act(() => view.result.current.create('Ponto'));
  expect(createWorkVersion).not.toHaveBeenCalled();
  expect(view.result.current.error).toContain('Salve e confirme');
  expect(view.result.current.pending).toBeNull();
});
it('restauração usa a base comparada e aceita apenas a fonte confirmada do servidor', async () => {
  const view = renderHook(() => useWorkHistory(options()));
  await ready(view);
  await act(() => view.result.current.select(version));
  await act(() => view.result.current.restore());
  const operationId = vi.mocked(restoreWorkVersion).mock.calls[0]![0].operationId;
  expect(typeof operationId).toBe('string');
  expect(restoreWorkVersion).toHaveBeenCalledWith({
    target,
    resource,
    versionId: version.id,
    operationId,
    expectedSourceToken: source.sourceToken,
  });
  expect(adapter.acceptRestored).toHaveBeenCalledExactlyOnceWith(restored);
  expect(view.result.current.items[0]?.reason).toBe('before-restore');
  expect(view.result.current.notice).toContain('versão anterior foi guardada');
  expect(view.result.current.pending).toBeNull();
});
it('conflito mantém a base observada e exige atualizar comparação explicitamente', async () => {
  vi.mocked(restoreWorkVersion).mockRejectedValueOnce(
    Object.assign(new Error('O texto remoto mudou'), { code: 'functions/failed-precondition' }),
  );
  const view = renderHook(() => useWorkHistory(options()));
  await ready(view);
  await act(() => view.result.current.select(version));
  const reads = vi.mocked(getWorkVersionSource).mock.calls.length;
  await act(() => view.result.current.restore());
  expect(view.result.current.conflict).toBe(true);
  expect(view.result.current.source).toEqual(source);
  expect(adapter.acceptRestored).not.toHaveBeenCalled();
  expect(getWorkVersionSource).toHaveBeenCalledTimes(reads);
  await act(() => view.result.current.restore());
  expect(restoreWorkVersion).toHaveBeenCalledTimes(1);
  source = { ...source, sourceToken: 'c'.repeat(64) };
  await act(() => view.result.current.compareCurrent());
  expect(view.result.current.source?.sourceToken).toBe('c'.repeat(64));
  expect(view.result.current.conflict).toBe(false);
});
it('mantém operação incerta após fechar e reconcilia o mesmo pedido sem pedir outra base', async () => {
  vi.mocked(restoreWorkVersion)
    .mockRejectedValueOnce(
      Object.assign(new Error('Não confirmado'), { code: 'functions/unavailable' }),
    )
    .mockResolvedValue({ source: restored, previousVersion });
  const exclusive = vi.spyOn(adapter, 'runExclusive');
  const view = renderHook(({ open }) => useWorkHistory({ ...options(), open }), {
    initialProps: { open: true },
  });
  await ready(view);
  await act(() => view.result.current.select(version));
  await act(() => view.result.current.restore());
  const request = vi.mocked(restoreWorkVersion).mock.calls[0]![0];
  expect(view.result.current.pending?.input.operationId).toBe(request.operationId);
  expect(pendingChange).toHaveBeenLastCalledWith(true);
  view.rerender({ open: false });
  expect(view.result.current.selected).toBeNull();
  expect(pendingChange).toHaveBeenLastCalledWith(true);
  confirmed = null;
  await act(() => view.result.current.recover());
  expect(restoreWorkVersion).toHaveBeenNthCalledWith(2, request);
  expect(exclusive).toHaveBeenLastCalledWith(expect.any(Function), { recovery: true });
  expect(adapter.acceptRestored).toHaveBeenCalledExactlyOnceWith(restored);
  expect(pendingChange).toHaveBeenLastCalledWith(false);
});
it('recibo após remontagem bloqueia novas mutações até rejeição definitiva, sem reaplicar prosa', async () => {
  vi.mocked(restoreWorkVersion).mockRejectedValueOnce(
    Object.assign(new Error('Não confirmado'), { code: 'functions/unavailable' }),
  );
  const first = renderHook(() => useWorkHistory(options()));
  await ready(first);
  await act(() => first.result.current.select(version));
  await act(() => first.result.current.restore());
  first.unmount();
  const second = renderHook(() => useWorkHistory({ ...options(), open: false }));
  expect(second.result.current.pending?.kind).toBe('restore');
  expect(pendingChange).toHaveBeenLastCalledWith(true);
  vi.mocked(restoreWorkVersion).mockRejectedValueOnce(
    Object.assign(new Error('A fonte mudou depois da operação'), {
      code: 'functions/failed-precondition',
    }),
  );
  await act(() => second.result.current.recover());
  expect(second.result.current.pending).toBeNull();
  expect(second.result.current.error).toContain('A fonte mudou');
  expect(adapter.acceptRestored).not.toHaveBeenCalled();
});
it('resposta tardia de restauração não atinge outra conta e conserva recibo da anterior', async () => {
  const response = deferred<RestoreWorkVersionResult>();
  vi.mocked(restoreWorkVersion).mockReturnValueOnce(response.promise);
  const view = renderHook(() => useWorkHistory(options()));
  await ready(view);
  await act(() => view.result.current.select(version));
  let operation!: Promise<void>;
  act(() => {
    operation = view.result.current.restore();
  });
  auth.user = { uid: 'other-owner' };
  vi.mocked(listWorkVersions).mockResolvedValue({ items: [], nextCursor: null });
  vi.mocked(getWorkVersionSource).mockResolvedValue(null);
  view.rerender();
  await act(async () => {
    response.resolve({ source: restored, previousVersion });
    await operation;
  });
  expect(adapter.acceptRestored).not.toHaveBeenCalled();
  expect(view.result.current.items).toEqual([]);
  expect(view.result.current.pending).toBeNull();
  expect(readPendingWorkHistoryOperation('owner', target)?.kind).toBe('restore');
  expect(readPendingWorkHistoryOperation('other-owner', target)).toBeNull();
});
it('excluir durante leitura invalida preview e repete a limpeza com o mesmo recibo', async () => {
  const response = deferred<VersionBodyPage>();
  vi.mocked(readWorkVersion).mockReturnValueOnce(response.promise);
  vi.mocked(deleteWorkVersion)
    .mockResolvedValueOnce({ complete: false, processed: 4 })
    .mockResolvedValueOnce({ complete: true, processed: 1 });
  const view = renderHook(() => useWorkHistory(options()));
  await ready(view);
  let reading!: Promise<void>;
  act(() => {
    reading = view.result.current.select(version);
  });
  await act(() => view.result.current.remove(version));
  await act(async () => {
    response.resolve({ version, chunks: [{ index: 0, content: original }], nextCursor: null });
    await reading;
  });
  expect(view.result.current.selected).toBeNull();
  expect(view.result.current.items).toEqual([]);
  expect(deleteWorkVersion).toHaveBeenCalledTimes(2);
  expect(vi.mocked(deleteWorkVersion).mock.calls[0]).toEqual(
    vi.mocked(deleteWorkVersion).mock.calls[1],
  );
});
it('paginação preserva a lista em erro e deduplica o retry', async () => {
  vi.mocked(listWorkVersions)
    .mockResolvedValueOnce({ items: [version], nextCursor: 'page-2' })
    .mockRejectedValueOnce(new Error('Página temporariamente indisponível'))
    .mockResolvedValueOnce({
      items: [version, { ...version, id: 'other-version' }],
      nextCursor: null,
    });
  const view = renderHook(() => useWorkHistory(options()));
  await ready(view);
  await act(() => view.result.current.loadMore());
  expect(view.result.current.items).toEqual([version]);
  expect(view.result.current.moreError).toContain('Página temporariamente');
  await act(() => view.result.current.loadMore());
  expect(view.result.current.items.map((item) => item.id)).toEqual(['version', 'other-version']);
  expect(listWorkVersions).toHaveBeenLastCalledWith({
    target,
    resource,
    cursor: 'page-2',
    limit: 25,
  });
});
it('permite ler, copiar e excluir versão da origem removida pelo histórico do projeto', async () => {
  vi.mocked(getWorkVersionSource).mockResolvedValue(null);
  render(<WorkHistoryDialog open target={target} onClose={vi.fn()} />);
  const dialog = await screen.findByRole('dialog', { name: 'Histórico do texto' });
  expect(within(dialog).queryByRole('button', { name: 'Criar versão' })).not.toBeInTheDocument();
  await userEvent.click(await within(dialog).findByRole('button', { name: /Antes da revisão/ }));
  expect(
    await within(dialog).findByText(/A origem desta versão não está disponível/),
  ).toBeVisible();
  expect(within(dialog).getByRole('button', { name: 'Restaurar esta versão' })).toBeDisabled();
  await userEvent.click(within(dialog).getByRole('button', { name: 'Copiar texto da versão' }));
  expect(clipboardWrite).toHaveBeenCalledWith('Versão do cais.');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Excluir esta versão' }));
  expect(deleteWorkVersion).not.toHaveBeenCalled();
  await userEvent.click(
    within(dialog).getByRole('button', { name: 'Confirmar exclusão da versão' }),
  );
  expect(await within(dialog).findByText('Versão excluída.')).toBeVisible();
  expect(restoreWorkVersion).not.toHaveBeenCalled();
});
it('comparação e cancelamento não alteram texto; confirmação mostra cópia recuperável', async () => {
  render(<WorkHistoryDialog {...options()} onClose={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: /Antes da revisão/ }));
  const comparison = await screen.findByRole('region', { name: 'Comparação da versão' });
  expect(
    within(comparison).getByRole('region', { name: 'Texto da versão guardada' }),
  ).toHaveTextContent('Versão do cais.');
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Restaurar esta versão' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Restaurar esta versão' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar restauração' }));
  expect(restoreWorkVersion).not.toHaveBeenCalled();
  expect(adapter.acceptRestored).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Restaurar esta versão' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar restauração' }));
  expect(
    await screen.findByText('Texto restaurado. A versão anterior foi guardada para recuperação.'),
  ).toBeVisible();
});
it('bloqueia mutações com rascunho pendente mas preserva a leitura e a comparação', async () => {
  adapter.blockedReason = 'Há texto ainda não salvo.';
  render(<WorkHistoryDialog {...options()} onClose={vi.fn()} />);
  expect(screen.getByRole('button', { name: 'Criar versão' })).toBeDisabled();
  await userEvent.click(await screen.findByRole('button', { name: /Antes da revisão/ }));
  await screen.findByRole('region', { name: 'Comparação da versão' });
  expect(screen.getByRole('button', { name: 'Restaurar esta versão' })).toBeDisabled();
  expect(screen.getByText(/Há texto ainda não salvo/)).toBeVisible();
  expect(createWorkVersion).not.toHaveBeenCalled();
  expect(restoreWorkVersion).not.toHaveBeenCalled();
});

it('fonte com acesso negado invalida o corpo selecionado mesmo se a leitura já respondeu', async () => {
  const view = renderHook(() => useWorkHistory(options()));
  await ready(view);
  vi.mocked(getWorkVersionSource).mockRejectedValueOnce(
    Object.assign(new Error('Sem acesso'), { code: 'functions/permission-denied' }),
  );
  await act(() => view.result.current.select(version));
  expect(view.result.current.selected).toBeNull();
  expect(view.result.current.source).toBeNull();
  expect(view.result.current.readError).toContain('não está disponível');
});

it('resposta de outra seleção não repõe o corpo escolhido depois', async () => {
  const old = deferred<VersionBodyPage>();
  const other = { ...version, id: 'other-version', label: 'Outro ponto' };
  vi.mocked(readWorkVersion)
    .mockReturnValueOnce(old.promise)
    .mockResolvedValueOnce({
      version: other,
      chunks: [{ index: 0, content: original }],
      nextCursor: null,
    });
  const view = renderHook(() => useWorkHistory(options()));
  await ready(view);
  let first!: Promise<void>;
  act(() => {
    first = view.result.current.select(version);
  });
  await act(() => view.result.current.select(other));
  await act(async () => {
    old.resolve({ version, chunks: [{ index: 0, content: original }], nextCursor: null });
    await first;
  });
  expect(view.result.current.selected?.version.id).toBe('other-version');
});

it.each(['scene', 'block'] as const)(
  'restauração de %s recebe revisão real e total confirmado',
  async (kind) => {
    const sceneTarget: VersionTarget = { kind: 'adventure', id: 'adventure' };
    const sceneResource = { kind, id: 'source' };
    source = {
      ...source,
      target: sceneTarget,
      resource: sceneResource,
      revision: 4,
      sceneWordCount: 42,
    };
    version = { ...version, target: sceneTarget, resource: sceneResource };
    restored = {
      ...source,
      content: original,
      contentHash: version.contentHash,
      sourceToken: 'b'.repeat(64),
      revision: 5,
      sceneWordCount: 39,
    };
    previousVersion = { ...previousVersion, target: sceneTarget, resource: sceneResource };
    vi.mocked(listWorkVersions).mockResolvedValue({ items: [version], nextCursor: null });
    vi.mocked(readWorkVersion).mockResolvedValue({
      version,
      chunks: [{ index: 0, content: original }],
      nextCursor: null,
    });
    vi.mocked(restoreWorkVersion).mockResolvedValue({ source: restored, previousVersion });
    adapter.resource = sceneResource;
    const view = renderHook(() =>
      useWorkHistory({ ...options(), target: sceneTarget, resource: sceneResource }),
    );
    await ready(view);
    await act(() => view.result.current.select(version));
    await act(() => view.result.current.restore());
    expect(adapter.acceptRestored).toHaveBeenCalledExactlyOnceWith(restored);
    expect(view.result.current.source?.revision).toBe(5);
    expect(view.result.current.source?.sceneWordCount).toBe(39);
  },
);

it.each([undefined, -1, Number.NaN])(
  'não adota fonte de bloco com total de cena inválido %s',
  async (sceneWordCount) => {
    const target: VersionTarget = { kind: 'adventure', id: 'adventure' };
    const resource = { kind: 'block' as const, id: 'additional-block' };
    source = { ...source, target, resource, revision: 3, sceneWordCount };
    adapter.resource = resource;
    const view = renderHook(() => useWorkHistory({ ...options(), target, resource }));
    await waitFor(() => expect(view.result.current.sourceError).toContain('verificada'));
    expect(view.result.current.source).toBeNull();
    expect(adapter.acceptRestored).not.toHaveBeenCalled();
  },
);

it('comparação atualizada não libera criação ou restauração enquanto a base confirmada local diverge', async () => {
  vi.mocked(restoreWorkVersion).mockRejectedValueOnce(
    Object.assign(new Error('O texto remoto mudou'), { code: 'functions/failed-precondition' }),
  );
  render(<WorkHistoryDialog {...options()} onClose={vi.fn()} />);
  await userEvent.click(await screen.findByRole('button', { name: /Antes da revisão/ }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Restaurar esta versão' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Restaurar esta versão' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar restauração' }));
  await screen.findByText('O texto remoto mudou');
  const remote = '<p>Texto salvo em outro dispositivo.</p>';
  source = {
    ...source,
    content: remote,
    contentHash: await workHistoryHash(remote),
    sourceToken: 'c'.repeat(64),
  };
  await userEvent.click(screen.getByRole('button', { name: 'Atualizar comparação' }));
  await waitFor(() =>
    expect(screen.getByRole('region', { name: 'Texto atual confirmado' })).toHaveTextContent(
      'Texto salvo em outro dispositivo.',
    ),
  );
  expect(screen.getByRole('button', { name: 'Restaurar esta versão' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Criar versão' })).toBeDisabled();
  expect(screen.getByText(/O texto confirmado neste editor difere do texto salvo/)).toBeVisible();
  expect(confirmed).toBe(saved);
  expect(adapter.acceptRestored).not.toHaveBeenCalled();
  expect(restoreWorkVersion).toHaveBeenCalledTimes(1);
  expect(createWorkVersion).not.toHaveBeenCalled();
});
