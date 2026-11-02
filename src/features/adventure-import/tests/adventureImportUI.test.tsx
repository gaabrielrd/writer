import { StrictMode } from 'react';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import * as documents from '@/features/document-import';
import * as rpc from '../services/adventureImportCallables';
import * as keyRpc from '../services/adventureImportKeyClient';
import { AdventureImportDialog } from '../components/AdventureImportDialog';
import { AdventureImportPreparations } from '../components/AdventureImportPreparations';
import {
  installImportRecoveryHarness,
  installImportServer,
  review,
  id,
  adventureId,
  deferred,
} from './importTestHelpers';
import {
  compareLocalAdventureImport,
  newImportRecord,
  importJournal,
} from '../services/adventureImportRecovery';
const auth = vi.hoisted(() => ({ user: { uid: 'owner-fixture' } }));
vi.mock('@/features/auth', () => ({ useAuth: () => auth }));
vi.mock('@/features/universes', () => ({ UniverseSelect: () => <p>Universo opcional</p> }));
vi.mock('@/features/document-import', async (original) => ({
  ...(await original<typeof import('@/features/document-import')>()),
  parseDocumentFile: vi.fn(),
  openPdfPreview: vi.fn(),
  PdfPagePreview: ({ pageNumber }: { pageNumber: number }) => (
    <div role="img" aria-label={'Página original ' + pageNumber} />
  ),
}));
vi.mock('../services/adventureImportCallables');
vi.mock('../services/adventureImportKeyClient');
let server: Awaited<ReturnType<typeof installImportServer>>;
beforeEach(async () => {
  vi.resetAllMocks();
  auth.user = { uid: 'owner-fixture' };
  installImportRecoveryHarness();
  server = await installImportServer();
  vi.mocked(documents.parseDocumentFile).mockResolvedValue({
    title: 'Aventura do teste',
    chapters: review.sections.map((s, i) => documents.createParsedChapter(s.title, s.content, i)),
    totalWords: 5,
  });
});
async function upload(name = 'aventura.md') {
  const file = new File(['fixture-source\n'], name);
  Object.defineProperty(file, 'arrayBuffer', {
    value: () => Promise.resolve(new TextEncoder().encode('fixture-source\n').buffer),
  });
  fireEvent.change(screen.getByLabelText('Arquivo da aventura'), { target: { files: [file] } });
  await screen.findByLabelText('Título da aventura');
}
it('confere, renomeia e escolhe antes de criar nova aventura privada', async () => {
  const activated = vi.fn();
  render(<AdventureImportDialog open onClose={vi.fn()} onActivated={activated} />);
  await upload();
  expect(screen.getByText('2 seções encontradas; 2 selecionadas.')).toBeVisible();
  await userEvent.clear(screen.getByLabelText('Título da seção 1'));
  await userEvent.type(screen.getByLabelText('Título da seção 1'), 'O retorno');
  await userEvent.click(screen.getByLabelText('Selecionar seção 2'));
  expect(rpc.startAdventureImport).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
  await waitFor(() => expect(activated).toHaveBeenCalled());
  expect(rpc.startAdventureImport).toHaveBeenCalledWith(
    expect.objectContaining({
      sectionCount: 1,
      project: { title: 'Aventura do teste', synopsis: '', universeId: null },
    }),
  );
  expect(rpc.appendAdventureImportSection).toHaveBeenCalledWith(
    expect.objectContaining({
      index: 0,
      section: { title: 'O retorno', content: review.sections[0]!.content.trim() },
    }),
  );
});
it('divide Markdown por blocos e une somente adjacentes de seleção igual', async () => {
  vi.mocked(documents.parseDocumentFile).mockResolvedValueOnce({
    title: 'Revisão',
    chapters: [
      documents.createParsedChapter(
        'Primeira',
        '<p>Uma cena.</p><blockquote>Segredo.</blockquote>',
        0,
      ),
      documents.createParsedChapter('Segunda', '<p>Fim.</p>', 1),
    ],
    totalWords: 5,
  });
  render(<AdventureImportDialog open onClose={vi.fn()} onActivated={vi.fn()} />);
  await upload();
  await userEvent.click(screen.getAllByRole('button', { name: 'Conferir conteúdo' })[0]!);
  await userEvent.click(screen.getByRole('combobox', { name: 'Dividir antes do trecho' }));
  await userEvent.click(screen.getByRole('option', { name: '2. Segredo.' }));
  await userEvent.click(screen.getByRole('button', { name: 'Dividir seção' }));
  expect(screen.getByText('3 seções encontradas; 3 selecionadas.')).toBeVisible();
  await userEvent.click(screen.getByLabelText('Selecionar seção 2'));
  expect(screen.queryByRole('button', { name: 'Unir à próxima seção' })).not.toBeInTheDocument();
  expect(screen.getByText(/selecione ou desmarque as duas/)).toBeVisible();
  await userEvent.click(screen.getByLabelText('Selecionar seção 2'));
  await userEvent.click(screen.getByRole('button', { name: 'Unir à próxima seção' }));
  expect(screen.getByText('2 seções encontradas; 2 selecionadas.')).toBeVisible();
  expect(screen.getByRole('textbox', { name: 'Texto importado de Primeira' })).toHaveTextContent(
    'Segredo.',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Desmarcar todas' }));
  expect(screen.getByRole('button', { name: 'Confirmar importação' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Selecionar todas' }));
  expect(screen.getByRole('button', { name: 'Confirmar importação' })).toBeEnabled();
});
it('cancelar análise aborta e ignora retorno tardio sem criar job', async () => {
  const held = deferred<documents.DocumentParseResult>(),
    close = vi.fn();
  vi.mocked(documents.parseDocumentFile).mockImplementationOnce((_file, options) => {
    options?.onProgress?.(2, 9);
    return held.promise;
  });
  render(<AdventureImportDialog open onClose={close} onActivated={vi.fn()} />);
  const file = new File(['x'], 'a.pdf');
  fireEvent.change(screen.getByLabelText('Arquivo da aventura'), { target: { files: [file] } });
  expect(await screen.findByText('Página 2 de 9')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Fechar conferência' }));
  expect(close).toHaveBeenCalledOnce();
  await act(async () => {
    held.resolve({ title: 'Tardio', chapters: [], totalWords: 0 });
    await Promise.resolve();
  });
  expect(screen.queryByLabelText('Título da aventura')).not.toBeInTheDocument();
  expect(rpc.startAdventureImport).not.toHaveBeenCalled();
});
it('erro de formato permite outro arquivo e preflight mantém revisão editável', async () => {
  render(<AdventureImportDialog open onClose={vi.fn()} onActivated={vi.fn()} />);
  fireEvent.change(screen.getByLabelText('Arquivo da aventura'), {
    target: { files: [new File(['x'], 'arquivo.exe')] },
  });
  expect(await screen.findByText(/Formato não suportado/)).toBeVisible();
  await upload();
  await userEvent.clear(screen.getByLabelText('Título da seção 1'));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
  expect(await screen.findByText(/contrato da importação/)).toBeVisible();
  expect(rpc.startAdventureImport).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Título da seção 1')).toBeVisible();
});
it('após resposta perdida retoma o snapshot e verifica o mesmo pedido', async () => {
  server.failAfter('append');
  const onActivated = vi.fn();
  render(<AdventureImportDialog open onClose={vi.fn()} onActivated={onActivated} />);
  await upload();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
  expect(await screen.findByText('Resposta perdida')).toBeVisible();
  const originalAppend = vi.mocked(rpc.appendAdventureImportSection).mock.calls[0]![0];
  const readProgress = vi.mocked(rpc.getAdventureImport).getMockImplementation()!;
  const verification = deferred<void>();
  vi.mocked(rpc.getAdventureImport).mockImplementationOnce(async (input) => {
    await verification.promise;
    return readProgress(input);
  });
  await userEvent.click(screen.getByRole('button', { name: 'Verificar pedido' }));
  await waitFor(() => expect(screen.queryByText('Resposta perdida')).not.toBeInTheDocument());
  const resume = screen.getByRole('button', { name: 'Retomar importação' });
  // Clearing the old error starts verification; it does not mean the controls are ready.
  expect(resume).toBeDisabled();
  await userEvent.click(resume);
  expect(rpc.appendAdventureImportSection).toHaveBeenCalledOnce();
  expect(rpc.activateAdventureImport).not.toHaveBeenCalled();
  await act(async () => {
    verification.resolve(undefined);
    await verification.promise;
  });
  await waitFor(() => expect(resume).toBeEnabled());
  expect(vi.mocked(rpc.appendAdventureImportSection).mock.calls[1]![0]).toEqual(originalAppend);
  await userEvent.click(resume);
  await waitFor(() => expect(rpc.activateAdventureImport).toHaveBeenCalledOnce());
  await waitFor(() => expect(onActivated).toHaveBeenCalledOnce());
  expect(onActivated).toHaveBeenCalledWith(adventureId);
});
it('preparação sem snapshot pode ser cancelada após escolha explícita', async () => {
  render(<AdventureImportDialog open importId={id} onClose={vi.fn()} onActivated={vi.fn()} />);
  expect(await screen.findByText(/Ainda não há cópia protegida/)).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar importação' }));
  expect(rpc.cancelAdventureImport).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Continuar preparando' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar importação' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
  expect(await screen.findByText(/Importação cancelada:/)).toBeVisible();
});
it('reconstrói revisão explícita depois de preparar sem seal', async () => {
  render(<AdventureImportDialog open importId={id} onClose={vi.fn()} onActivated={vi.fn()} />);
  await screen.findByText(/Ainda não há cópia protegida/);
  await userEvent.click(screen.getByRole('button', { name: 'Reconstruir a mesma revisão' }));
  expect(screen.getByLabelText('Arquivo da aventura')).toBeVisible();
  await upload();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
  expect(await screen.findByText(/contrato da importação/)).toBeVisible();
  expect(rpc.appendAdventureImportSection).not.toHaveBeenCalled();
});
it('troca de conta durante chave pendente não revela revisão nem envia append', async () => {
  const held = deferred<Awaited<ReturnType<typeof keyRpc.getAdventureImportRecoveryKey>>>();
  vi.mocked(keyRpc.getAdventureImportRecoveryKey).mockReturnValueOnce(held.promise);
  const tree = render(<AdventureImportDialog open onClose={vi.fn()} onActivated={vi.fn()} />);
  await upload();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
  await waitFor(() => expect(keyRpc.getAdventureImportRecoveryKey).toHaveBeenCalled());
  auth.user = { uid: 'another-owner' };
  tree.rerender(<AdventureImportDialog open onClose={vi.fn()} onActivated={vi.fn()} />);
  await act(async () => {
    held.reject(new Error('Chave antiga'));
    await Promise.resolve();
  });
  expect(screen.queryByText('Chave antiga')).not.toBeInTheDocument();
  expect(rpc.appendAdventureImportSection).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Arquivo da aventura')).toBeVisible();
});
it('painel descobre journal local antes de existir job remoto e resolve por metadata', async () => {
  vi.mocked(rpc.listAdventureImports).mockResolvedValue({ items: [], nextCursor: null });
  const record = newImportRecord('owner-fixture', id);
  record.journal = importJournal('owner-fixture', id, 'startAdventureImport', id, 'd'.repeat(64));
  await compareLocalAdventureImport('owner-fixture', id, null, record, () => {});
  render(<AdventureImportPreparations onActivated={vi.fn()} />);
  await screen.findByText('Pedido local aguardando confirmação');
  await userEvent.click(screen.getByRole('button', { name: 'Retomar importação' }));
  const dialog = await screen.findByRole('dialog', { name: 'Importar aventura' });
  await userEvent.click(within(dialog).getByRole('button', { name: 'Verificar pedido' }));
  await waitFor(() =>
    expect(rpc.resolveAdventureImportStart).toHaveBeenCalledWith({
      operationId: id,
      requestHash: 'd'.repeat(64),
      intent: 'cancel',
    }),
  );
});
it('painel continua janela vazia, carrega próxima página e preserva erro com retry', async () => {
  vi.mocked(rpc.listAdventureImports)
    .mockResolvedValueOnce({ items: [], nextCursor: 'next' })
    .mockRejectedValueOnce(new Error('Falha da página'))
    .mockResolvedValue({ items: [], nextCursor: null });
  render(<AdventureImportPreparations onActivated={vi.fn()} />);
  await screen.findByText(/Há outra janela/);
  await userEvent.click(screen.getByRole('button', { name: 'Carregar mais importações' }));
  expect(await screen.findByText('Falha da página')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByText('Nenhuma importação pendente')).toBeVisible();
});

it('reanexa somente o mesmo PDF após reload sem alterar snapshot ou retomar', async () => {
  server.set({ source: { ...review.source, mediaType: 'application/pdf' } });
  const destroy = vi.fn();
  vi.mocked(documents.openPdfPreview).mockResolvedValue({ pageCount: 3, render: vi.fn(), destroy });
  render(<AdventureImportDialog open importId={id} onClose={vi.fn()} onActivated={vi.fn()} />);
  await screen.findByLabelText('PDF original para conferência');
  const wrong = new File(['outro'], 'outro.pdf');
  Object.defineProperty(wrong, 'arrayBuffer', {
    value: () => Promise.resolve(new TextEncoder().encode('outro').buffer),
  });
  fireEvent.change(screen.getByLabelText('PDF original para conferência'), {
    target: { files: [wrong] },
  });
  expect(await screen.findByText(/não corresponde ao arquivo original/)).toBeVisible();
  expect(documents.openPdfPreview).not.toHaveBeenCalled();
  const same = new File(['fixture-source\n'], 'original.pdf');
  Object.defineProperty(same, 'arrayBuffer', {
    value: () => Promise.resolve(new TextEncoder().encode('fixture-source\n').buffer),
  });
  fireEvent.change(screen.getByLabelText('PDF original para conferência'), {
    target: { files: [same] },
  });
  expect(await screen.findByRole('img', { name: 'Página original 1' })).toBeVisible();
  expect(destroy).toHaveBeenCalledOnce();
  await userEvent.click(screen.getByRole('combobox', { name: 'Página original do PDF' }));
  await userEvent.click(screen.getByRole('option', { name: 'Página 3' }));
  expect(await screen.findByRole('img', { name: 'Página original 3' })).toBeVisible();
  expect(rpc.appendAdventureImportSection).not.toHaveBeenCalled();
  expect(keyRpc.getAdventureImportRecoveryKey).not.toHaveBeenCalled();
});
it('não anuncia preservação antes da chave e do seal durável', async () => {
  const held = deferred<Awaited<ReturnType<typeof keyRpc.getAdventureImportRecoveryKey>>>();
  vi.mocked(keyRpc.getAdventureImportRecoveryKey).mockReturnValueOnce(held.promise);
  render(<AdventureImportDialog open onClose={vi.fn()} onActivated={vi.fn()} />);
  await upload();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar importação' }));
  await waitFor(() => expect(keyRpc.getAdventureImportRecoveryKey).toHaveBeenCalled());
  expect(screen.queryByText(/A preparação foi preservada/)).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Fechar preparação' })).toBeVisible();
  expect(rpc.appendAdventureImportSection).not.toHaveBeenCalled();
  await act(async () => {
    held.reject(new Error('Chave indisponível'));
    await Promise.resolve();
  });
  expect(await screen.findByText('Chave indisponível')).toBeVisible();
});

it('reabre preparação em StrictMode sem deixar a retomada travada no carregamento', async () => {
  const held = deferred<Awaited<ReturnType<typeof rpc.getAdventureImport>>>();
  vi.mocked(rpc.getAdventureImport).mockReturnValueOnce(held.promise);
  render(
    <StrictMode>
      <AdventureImportDialog open importId={id} onClose={vi.fn()} onActivated={vi.fn()} />
    </StrictMode>,
  );
  await waitFor(() => expect(rpc.getAdventureImport).toHaveBeenCalledOnce());
  expect(screen.getByRole('button', { name: 'Retomar importação' })).toBeDisabled();
  await act(async () => {
    held.resolve(server.progress());
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Retomar importação' })).toBeEnabled(),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Retomar importação' }));
  expect(await screen.findByText(/Esta preparação ainda não tem cópia protegida/)).toBeVisible();
  expect(screen.getByRole('button', { name: 'Retomar importação' })).toBeEnabled();
  expect(rpc.appendAdventureImportSection).not.toHaveBeenCalled();
});
