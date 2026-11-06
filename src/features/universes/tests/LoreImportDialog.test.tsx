import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { chooseDropdown } from '@/test/dropdown';
import { LoreImportDialog } from '../components/LoreImportDialog';
import * as service from '../services/loreImportService';
import type { LoreImportReview } from '../model/loreImport';
vi.mock('../services/loreImportService', () => ({
  getPendingLoreImport: vi.fn(),
  clearPendingLoreImport: vi.fn(),
  rememberLoreImport: vi.fn(),
  getLoreImport: vi.fn(),
  getLoreImportTarget: vi.fn(),
  advanceLoreImport: vi.fn(),
  saveLoreImportReview: vi.fn(),
  applyLoreImport: vi.fn(),
  cancelLoreImport: vi.fn(),
  uploadLoreImport: vi.fn(),
}));
const candidate = {
  id: 'candidate',
  name: 'Arthur',
  category: 'character' as const,
  aliases: [],
  summary: 'O rei voltou',
  details: 'Novo texto.',
  evidence: 'Arthur voltou.',
  fileName: 'lore.pdf',
  page: 3,
};
const review: LoreImportReview = {
  id: 'session',
  universeId: 'world',
  state: 'ready',
  cursor: 1,
  total: 1,
  cost: 1,
  candidates: [candidate],
  existing: [{ id: 'arthur', name: 'Arthur', aliases: [], category: 'character' }],
};
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(service.getPendingLoreImport).mockReturnValue('session');
  vi.mocked(service.getLoreImport).mockResolvedValue(structuredClone(review));
  vi.mocked(service.getLoreImportTarget).mockResolvedValue({
    id: 'arthur',
    name: 'Arthur',
    category: 'character',
    aliases: [],
    summary: 'O rei antigo',
    details: 'Texto anterior.',
  });
  vi.mocked(service.applyLoreImport).mockResolvedValue({
    universeId: 'world',
    created: 0,
    updated: 1,
  });
});
it('shows evidence, requires explicit target, edits removals and previews diff before applying', async () => {
  const user = userEvent.setup();
  const onSuccess = vi.fn();
  render(
    <LoreImportDialog uid="author" universeId="world" onClose={vi.fn()} onSuccess={onSuccess} />,
  );
  expect(await screen.findByText('Fonte: lore.pdf, página 3')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Confirmar:/ })).toBeDisabled();
  await chooseDropdown(user, screen.getByLabelText('Destino de Arthur'), 'Atualizar: Arthur');
  expect(await screen.findByText('Resumo — Alterado')).toBeInTheDocument();
  await user.click(screen.getByText('Revisar campos de Arthur'));
  expect(screen.getByLabelText('Detalhes')).toHaveValue('Novo texto.');
  await user.clear(screen.getByLabelText('Detalhes'));
  expect(screen.getByText('Detalhes — Removido')).toBeInTheDocument();
  expect(screen.getAllByText('Texto anterior.').length).toBeGreaterThan(0);
  await user.click(screen.getByRole('button', { name: 'Confirmar: 0 novas e 1 atualizada' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('world'));
  expect(service.saveLoreImportReview).toHaveBeenCalledBefore(vi.mocked(service.applyLoreImport));
  expect(vi.mocked(service.applyLoreImport).mock.calls[0]?.[0].changes[0]).toMatchObject({
    targetId: 'arthur',
    input: { details: '' },
  });
});
it('shows every source page covered by an evidence excerpt', async () => {
  vi.mocked(service.getLoreImport).mockResolvedValue({
    ...review,
    version: 2,
    candidates: [{ ...candidate, pages: [3, 4] }],
  });
  render(
    <LoreImportDialog uid="author" universeId="world" onClose={vi.fn()} onSuccess={vi.fn()} />,
  );
  expect(await screen.findByText('Fonte: lore.pdf, páginas 3, 4')).toBeInTheDocument();
});
it('continues analysis from the server batch cursor without applying automatically', async () => {
  vi.mocked(service.getLoreImport).mockResolvedValue({
    ...review,
    state: 'analyzing',
    cursor: 0,
    total: 5,
  });
  vi.mocked(service.advanceLoreImport)
    .mockResolvedValueOnce({ ...review, state: 'analyzing', cursor: 3, total: 5 })
    .mockResolvedValueOnce({ ...review, cursor: 5, total: 5 });
  const user = userEvent.setup();
  render(
    <LoreImportDialog uid="author" universeId="world" onClose={vi.fn()} onSuccess={vi.fn()} />,
  );
  await user.click(await screen.findByRole('button', { name: 'Continuar análise' }));
  await screen.findByText('Fonte: lore.pdf, página 3');
  expect(service.advanceLoreImport).toHaveBeenNthCalledWith(1, 'session', 0);
  expect(service.advanceLoreImport).toHaveBeenNthCalledWith(2, 'session', 3);
  expect(service.advanceLoreImport).toHaveBeenCalledTimes(2);
  expect(service.applyLoreImport).not.toHaveBeenCalled();
});

it('new universe validates aggregate file selection and creates only selected entries', async () => {
  vi.mocked(service.getPendingLoreImport).mockReturnValue(null);
  vi.mocked(service.uploadLoreImport).mockResolvedValue({
    ...review,
    universeId: null,
    existing: [],
  });
  const user = userEvent.setup();
  render(<LoreImportDialog uid="author" onClose={vi.fn()} onSuccess={vi.fn()} />);
  await user.upload(screen.getByLabelText('Arquivos para importar'), [
    new File(['Arthur voltou.'], 'lore.txt'),
    new File(['Um reino.'], 'reino.md'),
  ]);
  await user.click(screen.getByRole('button', { name: 'Analisar arquivos' }));
  await user.type(await screen.findByLabelText('Nome do universo'), 'Atlas');
  await user.click(screen.getByRole('button', { name: 'Criar universo com 1 entrada' }));
  await waitFor(() => expect(service.applyLoreImport).toHaveBeenCalled());
  expect(
    vi.mocked(service.uploadLoreImport).mock.calls[0]?.[0].files.map((file) => file.name),
  ).toEqual(['lore.txt', 'reino.md']);
});
it('uncertain apply freezes exact submission and retries without another operation identity', async () => {
  vi.mocked(service.getLoreImport).mockResolvedValue({ ...review, existing: [] });
  vi.mocked(service.applyLoreImport)
    .mockRejectedValueOnce(new Error('Conexão perdida'))
    .mockResolvedValue({ universeId: 'world', created: 1, updated: 0 });
  const user = userEvent.setup();
  render(
    <LoreImportDialog uid="author" universeId="world" onClose={vi.fn()} onSuccess={vi.fn()} />,
  );
  await user.click(
    await screen.findByRole('button', { name: 'Confirmar: 1 nova e 0 atualizadas' }),
  );
  expect(await screen.findByText('Conexão perdida')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Retomar confirmação' }));
  await waitFor(() => expect(service.applyLoreImport).toHaveBeenCalledTimes(2));
  expect(vi.mocked(service.applyLoreImport).mock.calls[0]![0]).toEqual(
    vi.mocked(service.applyLoreImport).mock.calls[1]![0],
  );
});
it('cancel requires explicit discard and never calls apply', async () => {
  const user = userEvent.setup();
  const onClose = vi.fn();
  render(
    <LoreImportDialog uid="author" universeId="world" onClose={onClose} onSuccess={vi.fn()} />,
  );
  await screen.findByText('Fonte: lore.pdf, página 3');
  await user.click(screen.getByRole('button', { name: 'Descartar importação' }));
  expect(service.cancelLoreImport).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Confirmar descarte' }));
  await waitFor(() => expect(onClose).toHaveBeenCalled());
  expect(service.applyLoreImport).not.toHaveBeenCalled();
});

it('guides file selection, adds files across selections and removes one without sending anything', async () => {
  vi.mocked(service.getPendingLoreImport).mockReturnValue(null);
  const user = userEvent.setup();
  render(<LoreImportDialog uid="author" onClose={vi.fn()} onSuccess={vi.fn()} />);
  const steps = screen.getByRole('list', { name: 'Etapas da importação' });
  expect(within(steps).getByText('Arquivos')).toHaveAttribute('aria-current', 'step');
  expect(screen.getByRole('button', { name: 'Analisar arquivos' })).toBeDisabled();
  const input = screen.getByLabelText('Arquivos para importar');
  await user.upload(input, new File(['a'.repeat(1500)], 'reino.txt'));
  await user.upload(input, new File(['b'.repeat(2500)], 'personagens.md'));
  expect(screen.getByText('2 de 50 arquivos')).toBeInTheDocument();
  expect(screen.getByText('4 KB de 10 MB')).toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Remover reino.txt' }));
  expect(screen.queryByText('reino.txt')).not.toBeInTheDocument();
  expect(screen.getByText('personagens.md')).toBeInTheDocument();
  expect(screen.getByText('2,5 KB de 10 MB')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Analisar arquivos' })).toBeEnabled();
  expect(service.uploadLoreImport).not.toHaveBeenCalled();
  expect(service.applyLoreImport).not.toHaveBeenCalled();
});

it('accepts dropped documents and preserves the selection when an unsupported or oversized batch is dropped', () => {
  vi.mocked(service.getPendingLoreImport).mockReturnValue(null);
  render(<LoreImportDialog uid="author" onClose={vi.fn()} onSuccess={vi.fn()} />);
  const zone = screen.getByText('Arraste seus arquivos para cá').parentElement!;
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['Reino'], 'atlas.md')] } });
  expect(screen.getByText('atlas.md')).toBeInTheDocument();
  fireEvent.drop(zone, { dataTransfer: { files: [new File(['imagem'], 'mapa.png')] } });
  expect(screen.getByRole('alert')).toHaveTextContent('Use PDF, TXT ou Markdown.');
  expect(screen.getByText('1 de 50 arquivos')).toBeInTheDocument();
  fireEvent.drop(zone, {
    dataTransfer: { files: [new File(['a'.repeat(10_000_000)], 'grande.txt')] },
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'O total dos arquivos deve ser de até 10 MB.',
  );
  expect(screen.queryByText('grande.txt')).not.toBeInTheDocument();
  expect(screen.getByText('atlas.md')).toBeInTheDocument();
});

it('blocks new work until an existing import has been recovered', async () => {
  let finish!: (value: LoreImportReview) => void;
  vi.mocked(service.getLoreImport).mockReturnValue(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  const user = userEvent.setup();
  render(
    <LoreImportDialog uid="author" universeId="world" onClose={vi.fn()} onSuccess={vi.fn()} />,
  );
  expect(screen.getByText('Recuperando sua importação…')).toBeInTheDocument();
  expect(screen.queryByLabelText('Arquivos para importar')).not.toBeInTheDocument();
  await user.click(screen.getByRole('button', { name: 'Analisar arquivos' }));
  expect(service.uploadLoreImport).not.toHaveBeenCalled();
  finish(review);
  expect(await screen.findByText('Revise as fichas sugeridas')).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Analisar arquivos' })).not.toBeInTheDocument();
});

it('recovers from a failed lookup with file selection and clear retry guidance', async () => {
  vi.mocked(service.getLoreImport).mockRejectedValue(new Error('Offline'));
  render(
    <LoreImportDialog uid="author" universeId="world" onClose={vi.fn()} onSuccess={vi.fn()} />,
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Selecione os mesmos arquivos para retomar',
  );
  expect(await screen.findByRole('button', { name: 'Escolher arquivos' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Analisar arquivos' })).toBeDisabled();
});

it('shows the actual completed chunks of paused analysis and does not resume without a click', async () => {
  vi.mocked(service.getLoreImport).mockResolvedValue({
    ...review,
    state: 'analyzing',
    cursor: 3,
    total: 8,
  });
  render(
    <LoreImportDialog uid="author" universeId="world" onClose={vi.fn()} onSuccess={vi.fn()} />,
  );
  const progress = await screen.findByRole('progressbar', { name: 'Trechos analisados' });
  expect(progress).toHaveAttribute('value', '3');
  expect(progress).toHaveAttribute('max', '8');
  expect(screen.getByText('3 de 8 trechos concluídos')).toBeInTheDocument();
  expect(screen.queryByLabelText('Arquivos para importar')).not.toBeInTheDocument();
  expect(service.advanceLoreImport).not.toHaveBeenCalled();
});

it('keeps the empty review understandable and confirmation disabled', async () => {
  vi.mocked(service.getLoreImport).mockResolvedValue({ ...review, candidates: [] });
  render(
    <LoreImportDialog uid="author" universeId="world" onClose={vi.fn()} onSuccess={vi.fn()} />,
  );
  expect(await screen.findByText('Nenhum elemento de lore identificado')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /^Confirmar:/ })).toBeDisabled();
  expect(screen.getByText('1 crédito na confirmação do lote')).toBeInTheDocument();
});
