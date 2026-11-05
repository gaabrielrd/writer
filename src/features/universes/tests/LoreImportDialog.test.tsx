import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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
  await user.click(screen.getByRole('button', { name: 'Confirmar: 0 novas e 1 atualizadas' }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith('world'));
  expect(service.saveLoreImportReview).toHaveBeenCalledBefore(vi.mocked(service.applyLoreImport));
  expect(vi.mocked(service.applyLoreImport).mock.calls[0]?.[0].changes[0]).toMatchObject({
    targetId: 'arthur',
    input: { details: '' },
  });
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
  await user.click(screen.getByRole('button', { name: 'Criar universo com 1 entradas' }));
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
    await screen.findByRole('button', { name: 'Confirmar: 1 novas e 0 atualizadas' }),
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
