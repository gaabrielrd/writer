import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { beforeEach, expect, it, vi } from 'vitest';
import { chooseDropdown } from '@/test/dropdown';
import type { RichEditorProps } from '@/features/editor';
import type { WorkHistoryDialogProps, VersionSource } from '@/features/manuscript-history';
import { AdventureBlockNavigator } from '../components/AdventureBlockNavigator';
import { AdventureBlockEditor } from '../components/AdventureBlockEditor';
import { AdventureBlockCountRecovery } from '../components/AdventureBlockCountRecovery';
import { useAdventureBlocks } from '../hooks/useAdventureBlocks';
import { useAdventureBlockMutation } from '../hooks/useAdventureBlockMutation';
import { useAdventureBlockDraft } from '../hooks/useAdventureBlockDraft';
import * as api from '../services/adventureBlockCallables';
import {
  readAdventureBlockDraft,
  readPendingAdventureBlockOperation,
  writeAdventureBlockDraft,
} from '../services/adventureBlockRecovery';
import {
  blockContentHash,
  type AdventureBlockDocument,
  type AdventureBlockMutation,
  type AdventureBlockSummary,
  type AdventureBlockTotals,
  type AdventureBlockVerificationProgress,
} from '../model/adventureBlock';
const auth = vi.hoisted(() => ({
  user: { uid: 'owner', credits: 5 },
  loading: false,
  setPendingEditorOperation: vi.fn(),
}));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('../services/adventureBlockCallables', () => ({
  listAdventureBlocks: vi.fn(),
  getAdventureBlock: vi.fn(),
  createAdventureBlock: vi.fn(),
  updateAdventureBlock: vi.fn(),
  duplicateAdventureBlock: vi.fn(),
  moveAdventureBlock: vi.fn(),
  archiveAdventureBlock: vi.fn(),
  deleteAdventureBlock: vi.fn(),
  verifyAdventureBlockCount: vi.fn(),
  getAdventureBlockCountStatus: vi.fn(),
}));
vi.mock('@/features/editor', () => ({
  RichEditor: (props: RichEditorProps) => (
    <textarea
      aria-label={props.ariaLabel}
      value={props.content}
      readOnly={props.externalBusy}
      onChange={(event) => props.onChange(event.target.value)}
    />
  ),
}));
vi.mock('@/features/books', () => ({
  countWords: (text: string) =>
    text
      .replace(/<[^>]*>/g, ' ')
      .trim()
      .split(/\s+/)
      .filter(Boolean).length,
}));
vi.mock('@/features/lore', () => ({
  useAdventureLoreContext: () => ({ items: [], error: '', loading: false }),
  AdventureLoreReader: () => null,
}));
let historySource: VersionSource;
vi.mock('@/features/manuscript-history', () => ({
  readPendingWorkHistoryOperation: () => null,
  WorkHistoryDialog: (props: WorkHistoryDialogProps) =>
    props.open ? (
      <div>
        <p>Audiência atual: {props.editor?.destinationAudience}</p>
        <button
          onClick={() =>
            void props.editor?.runExclusive(async () => {
              await props.editor?.acceptRestored(historySource);
            })
          }
        >
          Restaurar ponto do bloco
        </button>
        <button onClick={props.onClose}>Fechar histórico de teste</button>
      </div>
    ) : null,
}));
let document: AdventureBlockDocument, main: AdventureBlockSummary;
const summary = (): AdventureBlockSummary => ({
  resource: document.resource,
  sceneId: document.sceneId,
  revision: document.revision,
  title: document.title,
  narrativeType: document.narrativeType,
  audience: document.audience,
  archived: document.archived,
  order: document.order,
  wordCount: document.wordCount,
  bodyHash: document.bodyHash,
  bodyBytes: document.bodyBytes,
  createdAt: document.createdAt,
  updatedAt: document.updatedAt,
});
const totals = (): AdventureBlockTotals => ({
  sceneRevision: document.sceneRevision,
  sceneWordCount: document.sceneWordCount,
  structureRevision: document.structureRevision,
  mainBodyHash: document.mainBodyHash,
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((finish) => {
    resolve = finish;
  });
  return { promise, resolve };
}
beforeEach(async () => {
  vi.clearAllMocks();
  auth.user = { uid: 'owner', credits: 5 };
  auth.loading = false;
  const content = '<p>Texto do bloco</p>',
    mainBodyHash = await blockContentHash('<p>Texto principal</p>');
  document = {
    resource: { kind: 'block', id: 'block-a' },
    sceneId: 'scene',
    revision: 2,
    title: 'Pista do cais',
    narrativeType: 'clue',
    audience: 'creator',
    archived: false,
    order: 1,
    wordCount: 3,
    bodyHash: await blockContentHash(content),
    bodyBytes: new TextEncoder().encode(content).byteLength,
    createdAt: 1,
    updatedAt: 2,
    content,
    sceneTitle: 'Cena do cais',
    adventureTitle: 'Aventura original',
    universeId: null,
    sceneRevision: 4,
    sceneWordCount: 5,
    sceneArchived: false,
    structureRevision: 3,
    mainBodyHash,
  };
  main = {
    ...summary(),
    resource: { kind: 'scene', id: 'scene' },
    revision: 4,
    title: 'Texto principal',
    narrativeType: 'scene',
    order: 0,
    wordCount: 2,
    bodyHash: mainBodyHash,
  };
  vi.mocked(api.listAdventureBlocks)
    .mockReset()
    .mockImplementation(() =>
      Promise.resolve({ items: [main, summary()], nextCursor: null, ...totals() }),
    );
  vi.mocked(api.getAdventureBlock)
    .mockReset()
    .mockImplementation(() => Promise.resolve(document));
  vi.mocked(api.createAdventureBlock)
    .mockReset()
    .mockResolvedValue({
      block: { ...summary(), resource: { kind: 'block', id: 'new-block' } },
      ...totals(),
    });
  vi.mocked(api.updateAdventureBlock)
    .mockReset()
    .mockImplementation(async (input) => {
      const content = input.patch.content ?? document.content;
      return {
        block: {
          ...summary(),
          ...input.patch,
          resource: input.resource,
          revision: input.expectedRevision + 1,
          bodyHash: await blockContentHash(content),
          bodyBytes: new TextEncoder().encode(content).byteLength,
        },
        ...totals(),
        sceneRevision: document.sceneRevision + 1,
      };
    });
  vi.mocked(api.duplicateAdventureBlock)
    .mockReset()
    .mockResolvedValue({
      block: { ...summary(), resource: { kind: 'block', id: 'copy' } },
      ...totals(),
    });
  vi.mocked(api.moveAdventureBlock)
    .mockReset()
    .mockResolvedValue({ block: summary(), ...totals(), structureRevision: 4 });
  vi.mocked(api.archiveAdventureBlock)
    .mockReset()
    .mockResolvedValue({ block: { ...summary(), archived: true }, ...totals(), sceneWordCount: 2 });
  vi.mocked(api.deleteAdventureBlock)
    .mockReset()
    .mockResolvedValue({ complete: true, processed: 1, ...totals(), sceneWordCount: 2 });
  vi.mocked(api.verifyAdventureBlockCount)
    .mockReset()
    .mockResolvedValue({ complete: true, processed: 2, ...totals() });
  vi.mocked(api.getAdventureBlockCountStatus)
    .mockReset()
    .mockResolvedValue({
      ...totals(),
      sceneWordCount: null,
      needsVerification: true,
      repairable: true,
    });
  const restored = '<p>Outra versão guardada</p>';
  historySource = {
    target: { kind: 'adventure', id: 'adventure' },
    resource: document.resource,
    title: document.title,
    content: restored,
    contentHash: await blockContentHash(restored),
    sourceToken: 'a'.repeat(64),
    revision: 7,
    sceneWordCount: 9,
  };
});
const editor = (blockId = 'block-a') => (
  <MemoryRouter>
    <AdventureBlockEditor adventureId="adventure" sceneId="scene" blockId={blockId} />
  </MemoryRouter>
);
it('lista metadados paginados preserva a lista em erro e rejeita mudança estrutural sem misturar páginas', async () => {
  vi.mocked(api.listAdventureBlocks)
    .mockResolvedValueOnce({ items: [main], nextCursor: 'next', ...totals() })
    .mockRejectedValueOnce(new Error('Página offline'))
    .mockResolvedValueOnce({
      items: [summary()],
      nextCursor: null,
      ...totals(),
      structureRevision: 99,
    });
  const view = renderHook(() => useAdventureBlocks('adventure', 'scene', false));
  await waitFor(() => expect(view.result.current.loading).toBe(false));
  await act(() => view.result.current.loadMore());
  expect(view.result.current.page?.items).toEqual([main]);
  expect(view.result.current.moreError).toContain('Página offline');
  await act(() => view.result.current.loadMore());
  expect(view.result.current.moreError).toContain('ordem dos blocos mudou');
  expect(view.result.current.page?.items).toEqual([main]);
});
it('reserva antes da mutação e confirma o mesmo recibo incerto sem alterar audiência no payload', async () => {
  vi.mocked(api.duplicateAdventureBlock).mockRejectedValueOnce(
    Object.assign(new Error('offline'), { code: 'functions/unavailable' }),
  );
  const events: string[] = [],
    onPending = vi.fn((pending: boolean) => {
      events.push(pending ? 'pending' : 'clear');
    });
  const onResult = vi.fn();
  const view = renderHook(() =>
    useAdventureBlockMutation('adventure', 'scene', {
      onPendingChange: onPending,
      onResult,
      runExclusive: async (work) => {
        events.push('reserve');
        return work();
      },
    }),
  );
  const operation = {
    method: 'duplicateAdventureBlock' as const,
    input: {
      adventureId: 'adventure',
      resource: document.resource,
      operationId: 'stable-copy',
      expectedRevision: 2,
    },
  };
  await act(() => view.result.current.execute(operation));
  expect(events.indexOf('reserve')).toBeLessThan(events.indexOf('pending'));
  expect(view.result.current.pending).toEqual(operation);
  expect(onResult).not.toHaveBeenCalled();
  await act(() => view.result.current.recover());
  expect(api.duplicateAdventureBlock).toHaveBeenNthCalledWith(2, operation.input);
  expect(view.result.current.pending).toBeNull();
  expect(onPending).toHaveBeenLastCalledWith(false);
  expect(onResult).toHaveBeenCalledTimes(1);
});
it('verificação parcial mantém total desconhecido e só informa totais após completar o checkpoint', async () => {
  const last = deferred<AdventureBlockVerificationProgress>();
  vi.mocked(api.verifyAdventureBlockCount)
    .mockResolvedValueOnce({ complete: false, processed: 25, ...totals(), sceneWordCount: null })
    .mockReturnValueOnce(last.promise);
  const onResult = vi.fn();
  const view = renderHook(() => useAdventureBlockMutation('adventure', 'scene', { onResult }));
  let pending!: Promise<unknown>;
  act(() => {
    pending = view.result.current.execute({
      method: 'verifyAdventureBlockCount',
      input: {
        adventureId: 'adventure',
        sceneId: 'scene',
        operationId: 'stable-count',
        expectedSceneRevision: 4,
        limit: 25,
      },
    });
  });
  await waitFor(() => expect(view.result.current.verificationProcessed).toBe(25));
  expect(view.result.current.verifying).toBe(true);
  expect(onResult).not.toHaveBeenCalled();
  await act(async () => {
    last.resolve({ complete: true, processed: 28, ...totals(), sceneWordCount: 12 });
    await pending;
  });
  expect(onResult).toHaveBeenCalledTimes(1);
  expect(vi.mocked(api.verifyAdventureBlockCount).mock.calls[0]).toEqual(
    vi.mocked(api.verifyAdventureBlockCount).mock.calls[1],
  );
  expect(view.result.current.pending).toBeNull();
});
it('conflito de verificação não troca o total nem repete com um novo identificador', async () => {
  const onResult = vi.fn();
  vi.mocked(api.verifyAdventureBlockCount).mockRejectedValue(
    Object.assign(new Error('A cena mudou'), { code: 'functions/failed-precondition' }),
  );
  const view = renderHook(() => useAdventureBlockMutation('adventure', 'scene', { onResult }));
  await act(() =>
    view.result.current.execute({
      method: 'verifyAdventureBlockCount',
      input: {
        adventureId: 'adventure',
        sceneId: 'scene',
        operationId: 'observed-count',
        expectedSceneRevision: 4,
      },
    }),
  );
  expect(view.result.current.conflict).toBe(true);
  expect(view.result.current.pending).toBeNull();
  expect(onResult).not.toHaveBeenCalled();
  expect(api.verifyAdventureBlockCount).toHaveBeenCalledTimes(1);
});
it('mostra principal e bloco na mesma cena e cria um novo bloco privado por padrão', async () => {
  render(
    <MemoryRouter>
      <AdventureBlockNavigator adventureId="adventure" sceneId="scene" />
    </MemoryRouter>,
  );
  expect(await screen.findByRole('link', { name: 'Texto principal' })).toHaveAttribute(
    'href',
    '/adventures/adventure/scenes/scene',
  );
  expect(screen.getByRole('link', { name: 'Pista do cais' })).toHaveAttribute(
    'href',
    '/adventures/adventure/scenes/scene/blocks/block-a',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Novo bloco' }));
  const dialog = screen.getByRole('dialog', { name: 'Novo bloco da cena' });
  expect(within(dialog).getByLabelText('Audiência do bloco')).toHaveTextContent(
    'Privado do criador',
  );
  await userEvent.type(within(dialog).getByLabelText('Título do bloco'), 'Pista secreta');
  await userEvent.click(within(dialog).getByRole('button', { name: 'Confirmar bloco' }));
  await waitFor(() => expect(api.createAdventureBlock).toHaveBeenCalledTimes(1));
  const input = vi.mocked(api.createAdventureBlock).mock.calls[0]![0];
  expect(input).toMatchObject({
    adventureId: 'adventure',
    sceneId: 'scene',
    title: 'Pista secreta',
    audience: 'creator',
    narrativeType: 'scene',
  });
  expect(input).not.toHaveProperty('wordCount');
});
it('editar audiência não envia corpo; duplicação e movimento preservam contrato autoritativo', async () => {
  render(
    <MemoryRouter>
      <AdventureBlockNavigator adventureId="adventure" sceneId="scene" />
    </MemoryRouter>,
  );
  await screen.findByRole('link', { name: 'Pista do cais' });
  await userEvent.click(screen.getByRole('button', { name: 'Opções de Pista do cais' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Editar detalhes' }));
  await chooseDropdown(userEvent, screen.getByLabelText('Audiência do bloco'), 'Jogadores');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar bloco' }));
  await waitFor(() => expect(api.updateAdventureBlock).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.updateAdventureBlock).mock.calls[0]![0].patch).toEqual({
    title: 'Pista do cais',
    narrativeType: 'clue',
    audience: 'players',
  });
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Opções de Pista do cais' }));
  await userEvent.click(await screen.findByRole('menuitem', { name: 'Duplicar bloco' }));
  expect(screen.getByRole('dialog')).toHaveTextContent('preserva texto, tipo e audiência');
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar bloco' }));
  await waitFor(() => expect(api.duplicateAdventureBlock).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.duplicateAdventureBlock).mock.calls[0]![0]).not.toHaveProperty('audience');
  await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  await userEvent.click(screen.getByRole('button', { name: 'Subir Pista do cais' }));
  await waitFor(() => expect(api.moveAdventureBlock).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.moveAdventureBlock).mock.calls[0]![0]).toMatchObject({
    direction: 'up',
    expectedRevision: 2,
    expectedStructureRevision: 3,
  });
});
it('principal não oferece exclusão nem arquivo individual', async () => {
  render(
    <MemoryRouter>
      <AdventureBlockNavigator adventureId="adventure" sceneId="scene" />
    </MemoryRouter>,
  );
  await screen.findByRole('link', { name: 'Texto principal' });
  await userEvent.click(screen.getByRole('button', { name: 'Opções de Texto principal' }));
  expect(screen.queryByRole('menuitem', { name: 'Excluir bloco' })).not.toBeInTheDocument();
  expect(screen.queryByRole('menuitem', { name: 'Arquivar bloco' })).not.toBeInTheDocument();
  expect(screen.getByRole('menuitem', { name: 'Duplicar bloco' })).toBeVisible();
});
it('autosave de bloco usa sua revisão e próxima edição usa a revisão confirmada', async () => {
  const view = renderHook(() => useAdventureBlockDraft('owner', 'adventure', document));
  act(() => view.result.current.change('<p>Primeira edição</p>'));
  await act(() => view.result.current.save());
  expect(api.updateAdventureBlock).toHaveBeenLastCalledWith(
    expect.objectContaining({
      resource: { kind: 'block', id: 'block-a' },
      expectedRevision: 2,
      patch: { content: '<p>Primeira edição</p>' },
    }),
  );
  act(() => view.result.current.change('<p>Outra edição</p>'));
  await act(() => view.result.current.save());
  expect(vi.mocked(api.updateAdventureBlock).mock.calls[1]![0].expectedRevision).toBe(3);
  expect(view.result.current.document.content).toBe('<p>Outra edição</p>');
  expect(readAdventureBlockDraft('owner', 'adventure', 'scene', document.resource)).toBeNull();
});
it('resposta incerta bloqueia nova edição e conserva o mesmo pedido até reconciliação', async () => {
  vi.mocked(api.updateAdventureBlock).mockRejectedValueOnce(
    Object.assign(new Error('Não confirmado'), { code: 'functions/unavailable' }),
  );
  const view = renderHook(() => useAdventureBlockDraft('owner', 'adventure', document));
  act(() => view.result.current.change('Texto capturado'));
  await act(() => view.result.current.save());
  const first = vi.mocked(api.updateAdventureBlock).mock.calls[0]![0];
  act(() => view.result.current.change('Não pode substituir pedido incerto'));
  expect(view.result.current.content).toBe('Texto capturado');
  expect(readPendingAdventureBlockOperation('owner', 'adventure', 'scene')?.input).toEqual(first);
  await act(() => view.result.current.mutation.recover());
  expect(api.updateAdventureBlock).toHaveBeenNthCalledWith(2, first);
  expect(view.result.current.getConfirmedContent()).toBe('Texto capturado');
});
it('conflito conserva texto local e só adota nova revisão após comparação explícita', async () => {
  vi.mocked(api.updateAdventureBlock).mockRejectedValueOnce(
    Object.assign(new Error('Outra revisão'), { code: 'functions/failed-precondition' }),
  );
  const view = renderHook(() => useAdventureBlockDraft('owner', 'adventure', document));
  act(() => view.result.current.change('Meu rascunho'));
  await act(() => view.result.current.save());
  expect(view.result.current.status).toBe('conflict');
  document = {
    ...document,
    revision: 8,
    content: 'Texto remoto',
    bodyHash: await blockContentHash('Texto remoto'),
  };
  await act(() => view.result.current.compare());
  expect(view.result.current.content).toBe('Meu rascunho');
  act(() => view.result.current.resolve(true));
  await act(() => view.result.current.save());
  expect(vi.mocked(api.updateAdventureBlock).mock.calls[1]![0]).toMatchObject({
    expectedRevision: 8,
    patch: { content: 'Meu rascunho' },
  });
});
it('metadados de outra base não adotam revisão nem permitem sobrescrever prosa remota', async () => {
  const original = document,
    remoteContent = '<p>Texto alterado em outro dispositivo</p>',
    remoteHash = await blockContentHash(remoteContent);
  vi.mocked(api.updateAdventureBlock).mockResolvedValueOnce({
    block: { ...summary(), revision: 5, title: 'Título remoto', bodyHash: remoteHash },
    ...totals(),
    sceneRevision: 7,
  });
  const view = renderHook(() => useAdventureBlockDraft('owner', 'adventure', original));
  await act(() =>
    view.result.current.mutation.execute({
      method: 'updateAdventureBlock',
      input: {
        adventureId: 'adventure',
        resource: original.resource,
        expectedRevision: 4,
        operationId: 'observed-metadata',
        patch: { title: 'Título remoto' },
      },
    }),
  );
  expect(view.result.current.content).toBe(original.content);
  expect(view.result.current.document.revision).toBe(original.revision);
  expect(view.result.current.document.bodyHash).toBe(original.bodyHash);
  expect(view.result.current.status).toBe('conflict');
  expect(view.result.current.getConfirmedContent()).toBeNull();
  act(() => view.result.current.change('<p>Meu texto local preservado</p>'));
  await act(() => view.result.current.save());
  expect(api.updateAdventureBlock).toHaveBeenCalledTimes(1);
  expect(readAdventureBlockDraft('owner', 'adventure', 'scene', original.resource)?.content).toBe(
    '<p>Meu texto local preservado</p>',
  );
  document = {
    ...original,
    revision: 5,
    title: 'Título remoto',
    content: remoteContent,
    bodyHash: remoteHash,
  };
  await act(() => view.result.current.compare());
  act(() => view.result.current.resolve(true));
  await act(() => view.result.current.save());
  expect(api.updateAdventureBlock).toHaveBeenCalledTimes(2);
  expect(vi.mocked(api.updateAdventureBlock).mock.calls[1]![0]).toMatchObject({
    expectedRevision: 5,
    patch: { content: '<p>Meu texto local preservado</p>' },
  });
});
it('metadados da mesma base aceitam a revisão real para a próxima edição', async () => {
  vi.mocked(api.updateAdventureBlock).mockResolvedValueOnce({
    block: { ...summary(), revision: 5, title: 'Título novo' },
    ...totals(),
    sceneRevision: 7,
  });
  const view = renderHook(() => useAdventureBlockDraft('owner', 'adventure', document));
  await act(() =>
    view.result.current.mutation.execute({
      method: 'updateAdventureBlock',
      input: {
        adventureId: 'adventure',
        resource: document.resource,
        expectedRevision: 4,
        operationId: 'same-base-metadata',
        patch: { title: 'Título novo' },
      },
    }),
  );
  expect(view.result.current.status).toBe('saved');
  expect(view.result.current.getConfirmedContent()).toBe(document.content);
  expect(view.result.current.document.revision).toBe(5);
  act(() => view.result.current.change('<p>Nova escrita na mesma base</p>'));
  await act(() => view.result.current.save());
  expect(vi.mocked(api.updateAdventureBlock).mock.calls[1]![0].expectedRevision).toBe(5);
});
it('rascunho recuperado mantém identidade e revisão da base, sem aplicar automaticamente', async () => {
  writeAdventureBlockDraft('owner', 'adventure', 'scene', document.resource, {
    content: 'Rascunho privado',
    revision: 1,
    savedAt: 10,
  });
  render(editor());
  expect(
    await screen.findByText('Há um rascunho local diferente do texto confirmado.'),
  ).toBeVisible();
  expect(
    screen.queryByRole('textbox', { name: 'Área de escrita do bloco' }),
  ).not.toBeInTheDocument();
  expect(api.updateAdventureBlock).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Recuperar rascunho do bloco' }));
  expect(await screen.findByRole('textbox', { name: 'Área de escrita do bloco' })).toHaveValue(
    'Rascunho privado',
  );
  expect(screen.getByText('Conflito de revisão')).toBeVisible();
});
it('editor extra mantém contagem do bloco e da cena separadas e restauração recebe revisão real', async () => {
  document = { ...document, audience: 'gm' };
  render(editor());
  await screen.findByRole('textbox', { name: 'Área de escrita do bloco' });
  expect(
    screen.getByText('3 palavras confirmadas neste bloco · 5 palavras confirmadas na cena.'),
  ).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Histórico do bloco' }));
  expect(screen.getByText('Audiência atual: Mestre')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Restaurar ponto do bloco' }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'Área de escrita do bloco' })).toHaveValue(
      historySource.content,
    ),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Fechar histórico de teste' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Área de escrita do bloco' }), {
    target: { value: 'Texto após restaurar' },
  });
  await waitFor(() => expect(api.updateAdventureBlock).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.updateAdventureBlock).mock.calls[0]![0].expectedRevision).toBe(7);
});
it('restauração atualiza a lista de blocos antes da próxima ação sem inventar revisão da cena', async () => {
  render(editor());
  await screen.findByRole('textbox', { name: 'Área de escrita do bloco' });
  await screen.findByRole('link', { name: 'Pista do cais' });
  const restoredBlock = {
    ...summary(),
    revision: 7,
    bodyHash: historySource.contentHash,
    wordCount: 4,
  };
  vi.mocked(api.listAdventureBlocks).mockResolvedValue({
    items: [main, restoredBlock],
    nextCursor: null,
    ...totals(),
    sceneRevision: 10,
    sceneWordCount: 9,
    structureRevision: 8,
  });
  vi.mocked(api.moveAdventureBlock).mockResolvedValue({
    block: restoredBlock,
    ...totals(),
    sceneRevision: 11,
    sceneWordCount: 9,
    structureRevision: 9,
  });
  await userEvent.click(screen.getByRole('button', { name: 'Histórico do bloco' }));
  await userEvent.click(screen.getByRole('button', { name: 'Restaurar ponto do bloco' }));
  await userEvent.click(screen.getByRole('button', { name: 'Fechar histórico de teste' }));
  await waitFor(() => expect(api.listAdventureBlocks).toHaveBeenCalledTimes(2));
  const navigator = screen.getByRole('region', { name: 'Blocos da cena' });
  expect(within(navigator).getByText('9 palavras confirmadas na cena.')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Subir Pista do cais' }));
  await waitFor(() => expect(api.moveAdventureBlock).toHaveBeenCalledTimes(1));
  expect(vi.mocked(api.moveAdventureBlock).mock.calls[0]![0]).toMatchObject({
    expectedRevision: 7,
    expectedStructureRevision: 8,
  });
  expect(screen.getByRole('textbox', { name: 'Área de escrita do bloco' })).toHaveValue(
    historySource.content,
  );
});
it.each(['account', 'block'] as const)(
  'confirmação tardia após troca de %s não substitui o documento aberto',
  async (change) => {
    const pending = deferred<AdventureBlockMutation>();
    vi.mocked(api.updateAdventureBlock).mockReturnValueOnce(pending.promise);
    const view = render(editor());
    const field = await screen.findByRole('textbox', { name: 'Área de escrita do bloco' });
    fireEvent.change(field, { target: { value: 'Segredo A' } });
    await waitFor(() => expect(api.updateAdventureBlock).toHaveBeenCalledTimes(1));
    const old = summary();
    if (change === 'account') {
      auth.user = { uid: 'other-owner', credits: 5 };
      vi.mocked(api.getAdventureBlock).mockResolvedValue(null);
      view.rerender(editor());
      await screen.findByText('Bloco indisponível');
    } else {
      document = {
        ...document,
        resource: { kind: 'block', id: 'block-b' },
        title: 'Outro bloco',
        content: 'Texto B',
        bodyHash: await blockContentHash('Texto B'),
      };
      view.rerender(editor('block-b'));
      await waitFor(() =>
        expect(screen.getByRole('textbox', { name: 'Área de escrita do bloco' })).toHaveValue(
          'Texto B',
        ),
      );
    }
    await act(async () => {
      pending.resolve({
        block: { ...old, bodyHash: await blockContentHash('Segredo A'), revision: 3 },
        ...totals(),
      });
      await pending.promise;
    });
    if (change === 'account')
      expect(
        screen.queryByRole('textbox', { name: 'Área de escrita do bloco' }),
      ).not.toBeInTheDocument();
    else
      expect(screen.getByRole('textbox', { name: 'Área de escrita do bloco' })).toHaveValue(
        'Texto B',
      );
    expect(screen.queryByDisplayValue('Segredo A')).not.toBeInTheDocument();
  },
);
it('recuperação sem cache usa só metadados e mantém o checkpoint até confirmar o total', async () => {
  const done = deferred<AdventureBlockVerificationProgress>();
  vi.mocked(api.verifyAdventureBlockCount)
    .mockResolvedValueOnce({ complete: false, processed: 25, ...totals(), sceneWordCount: null })
    .mockReturnValueOnce(done.promise);
  const onRecovered = vi.fn(() => {
    expect(readPendingAdventureBlockOperation('owner', 'adventure', 'scene')).toBeNull();
  });
  render(
    <AdventureBlockCountRecovery
      adventureId="adventure"
      sceneId="scene"
      onRecovered={onRecovered}
    />,
  );
  expect(await screen.findByText('O total atual ainda não pôde ser confirmado.')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Verificar contagem' }));
  await screen.findByText('Verificando metadados: 25 blocos conferidos.');
  expect(onRecovered).not.toHaveBeenCalled();
  expect(api.getAdventureBlock).not.toHaveBeenCalled();
  expect(api.listAdventureBlocks).not.toHaveBeenCalled();
  expect(vi.mocked(api.verifyAdventureBlockCount).mock.calls[0]![0]).toMatchObject({
    expectedSceneRevision: 4,
    limit: 25,
  });
  expect(vi.mocked(api.verifyAdventureBlockCount).mock.calls[1]).toEqual(
    vi.mocked(api.verifyAdventureBlockCount).mock.calls[0],
  );
  await act(async () => {
    done.resolve({ complete: true, processed: 28, ...totals(), sceneWordCount: 12 });
    await done.promise;
  });
  await waitFor(() => expect(onRecovered).toHaveBeenCalledTimes(1));
});
it('metadados não reparáveis não oferecem total zerado nem iniciam mutação', async () => {
  vi.mocked(api.getAdventureBlockCountStatus).mockResolvedValue({
    ...totals(),
    sceneWordCount: null,
    needsVerification: true,
    repairable: false,
  });
  render(<AdventureBlockCountRecovery adventureId="adventure" sceneId="scene" />);
  expect(await screen.findByRole('button', { name: 'Verificar contagem' })).toBeDisabled();
  expect(screen.getByText(/Há metadados indisponíveis/)).toBeVisible();
  expect(screen.queryByText(/0 palavras/)).not.toBeInTheDocument();
  expect(api.verifyAdventureBlockCount).not.toHaveBeenCalled();
});
it('conflito no reparo exige conferir a revisão antes de novo pedido', async () => {
  vi.mocked(api.verifyAdventureBlockCount).mockRejectedValueOnce(
    Object.assign(new Error('Mudou'), { code: 'functions/failed-precondition' }),
  );
  const view = render(<AdventureBlockCountRecovery adventureId="adventure" sceneId="scene" />);
  await userEvent.click(await screen.findByRole('button', { name: 'Verificar contagem' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Verificar contagem' })).toBeDisabled(),
  );
  expect(api.verifyAdventureBlockCount).toHaveBeenCalledTimes(1);
  vi.mocked(api.getAdventureBlockCountStatus).mockResolvedValue({
    ...totals(),
    sceneRevision: 9,
    sceneWordCount: null,
    needsVerification: true,
    repairable: true,
  });
  await userEvent.click(screen.getByRole('button', { name: 'Conferir situação atual' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Verificar contagem' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Verificar contagem' }));
  await waitFor(() => expect(api.verifyAdventureBlockCount).toHaveBeenCalledTimes(2));
  expect(vi.mocked(api.verifyAdventureBlockCount).mock.calls[1]![0].expectedSceneRevision).toBe(9);
  view.unmount();
});
it('reparo tardio de outra conta não abre a cena na conta atual', async () => {
  const done = deferred<AdventureBlockVerificationProgress>();
  vi.mocked(api.verifyAdventureBlockCount).mockReturnValueOnce(done.promise);
  const onRecovered = vi.fn();
  const component = (
    <AdventureBlockCountRecovery
      adventureId="adventure"
      sceneId="scene"
      onRecovered={onRecovered}
    />
  );
  const view = render(component);
  await userEvent.click(await screen.findByRole('button', { name: 'Verificar contagem' }));
  await waitFor(() => expect(api.verifyAdventureBlockCount).toHaveBeenCalledTimes(1));
  auth.user = { uid: 'other-owner', credits: 5 };
  vi.mocked(api.getAdventureBlockCountStatus).mockResolvedValue(null);
  view.rerender(
    <AdventureBlockCountRecovery
      adventureId="adventure"
      sceneId="scene"
      onRecovered={onRecovered}
    />,
  );
  await act(async () => {
    done.resolve({ complete: true, processed: 2, ...totals() });
    await done.promise;
  });
  expect(await screen.findByText('Cena indisponível')).toBeVisible();
  expect(onRecovered).not.toHaveBeenCalled();
});
