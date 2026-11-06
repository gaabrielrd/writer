import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BookEditorialHistoryBrowser } from '../components/BookEditorialHistoryBrowser';
const api = vi.hoisted(() => ({ list: vi.fn(), read: vi.fn() }));
vi.mock('../services/bookEditorialHistoryApi', () => ({
  listEditorialHistory: api.list,
  readEditorialHistory: api.read,
}));
const row = {
  id: 'a'.repeat(64),
  recordKind: 'book-editorial-artifact',
  artifact: { kind: 'contract', revision: 1, availability: 'included', role: null },
  byteLength: 12,
  chunkCount: 1,
  contentHash: 'b'.repeat(64),
};
beforeEach(() => {
  api.list.mockReset().mockResolvedValue({ items: [row], next: null });
  api.read.mockReset().mockResolvedValue('Original privado 🌙');
});
it('informa o estado vazio da consulta', async () => {
  api.list.mockResolvedValue({ items: [], next: null });
  render(<BookEditorialHistoryBrowser bookId="book" guard={() => {}} />);
  expect(await screen.findByText('Nenhum registro original disponível')).toBeVisible();
});
it('lê somente por escolha explícita e mantém o original somente leitura', async () => {
  render(<BookEditorialHistoryBrowser bookId="book" guard={() => {}} />);
  const button = await screen.findByRole('button', { name: 'Contrato · versão 1' });
  expect(api.read).not.toHaveBeenCalled();
  await userEvent.click(button);
  expect(await screen.findByLabelText('Conteúdo original preservado')).toHaveValue(
    'Original privado 🌙',
  );
  expect(screen.getByLabelText('Conteúdo original preservado')).toHaveAttribute('readonly');
});
it('acrescenta outra página sem perder os itens anteriores', async () => {
  api.list.mockResolvedValueOnce({ items: [row], next: 'page-two' }).mockResolvedValueOnce({
    items: [{ ...row, id: 'c'.repeat(64), artifact: { ...row.artifact, kind: 'plan' } }],
    next: null,
  });
  render(<BookEditorialHistoryBrowser bookId="book" guard={() => {}} />);
  await userEvent.click(await screen.findByRole('button', { name: 'Mais registros' }));
  expect(await screen.findByRole('button', { name: 'Plano · versão 1' })).toBeVisible();
  expect(screen.getByRole('button', { name: 'Contrato · versão 1' })).toBeVisible();
  expect(api.list).toHaveBeenLastCalledWith('book', 'page-two', expect.any(Function));
});
it('oferece nova consulta após erro sem aplicar conteúdo', async () => {
  api.list.mockRejectedValueOnce(Error('Origem indisponível'));
  render(<BookEditorialHistoryBrowser bookId="book" guard={() => {}} />);
  expect(await screen.findByText('Origem indisponível')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(await screen.findByRole('button', { name: 'Contrato · versão 1' })).toBeVisible();
  expect(api.read).not.toHaveBeenCalled();
});
