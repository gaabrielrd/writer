import { act, fireEvent, render, screen } from '../../../test/render';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NoteList } from '../components/NoteList';

describe('NoteList', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => vi.restoreAllMocks());

  it('adiciona e remove uma nota pelo fluxo visível', async () => {
    const user = userEvent.setup();
    render(<NoteList />);

    await user.type(screen.getByPlaceholderText('Nova nota...'), 'Minha nota');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    expect(screen.getByText('Minha nota')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Remover nota: Minha nota' }));
    expect(screen.queryByText('Minha nota')).not.toBeInTheDocument();
    expect(screen.getByText(/Nenhuma nota ainda/)).toBeInTheDocument();
  });

  it('apresenta erro de validação sem alterar o armazenamento', async () => {
    const user = userEvent.setup();
    render(<NoteList />);
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(screen.getByText('O título da nota é obrigatório.')).toBeInTheDocument();
    expect(localStorage.getItem('notes:list')).toBeNull();
  });

  it('associa o erro ao campo e o remove quando o título é corrigido', async () => {
    const user = userEvent.setup();
    render(<NoteList />);
    const input = screen.getByRole('textbox', { name: 'Título da nota' });

    await user.click(screen.getByRole('button', { name: 'Adicionar' }));
    const error = screen.getByText('O título da nota é obrigatório.');
    expect(input).toHaveAttribute('aria-describedby', error.id);

    await user.type(input, 'Título válido');
    expect(screen.queryByText('O título da nota é obrigatório.')).not.toBeInTheDocument();
    expect(input).not.toHaveAttribute('aria-describedby');
  });

  it('apresenta dados corrompidos sem sobrescrevê-los', () => {
    localStorage.setItem('notes:list', '{corrompido');
    render(<NoteList />);

    expect(screen.getByRole('alert')).toHaveTextContent(
      'O conteúdo salvo de notas está corrompido',
    );
    expect(localStorage.getItem('notes:list')).toBe('{corrompido');
  });

  it('não atualiza a tela quando a persistência falha', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('quota', 'QuotaExceededError');
    });
    render(<NoteList />);

    fireEvent.change(screen.getByPlaceholderText('Nova nota...'), { target: { value: 'Falha' } });
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar');
    expect(screen.queryByText('Falha')).not.toBeInTheDocument();
  });

  it('sincroniza alterações recebidas de outra aba', async () => {
    render(<NoteList />);
    const note = { id: 'externa', title: 'Outra aba', createdAt: 123 };
    localStorage.setItem('notes:list', JSON.stringify({ version: 1, revision: 2, notes: [note] }));
    await act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'notes:list' })));

    expect(screen.getByText('Outra aba')).toBeInTheDocument();
  });

  it('apresenta falha recebida durante a sincronização entre abas', async () => {
    render(<NoteList />);
    localStorage.setItem('notes:list', '{corrompido');

    await act(() => window.dispatchEvent(new StorageEvent('storage', { key: 'notes:list' })));

    expect(screen.getByRole('alert')).toHaveTextContent(
      'O conteúdo salvo de notas está corrompido',
    );
  });

  it('recarrega a lista quando detecta conflito de revisão', async () => {
    const user = userEvent.setup();
    render(<NoteList />);
    const external = { id: 'externa', title: 'Alteração externa', createdAt: 123 };
    localStorage.setItem(
      'notes:list',
      JSON.stringify({ version: 1, revision: 1, notes: [external] }),
    );

    await user.type(screen.getByRole('textbox', { name: 'Título da nota' }), 'Minha nota');
    await user.click(screen.getByRole('button', { name: 'Adicionar' }));

    expect(screen.getByRole('alert')).toHaveTextContent('alteradas em outra aba');
    expect(screen.getByText('Alteração externa')).toBeInTheDocument();
    expect(screen.queryByText('Minha nota')).not.toBeInTheDocument();
  });

  it('reconcilia a tela quando a nota já não existe no armazenamento', async () => {
    const user = userEvent.setup();
    const note = { id: 'removida', title: 'Já removida', createdAt: 123 };
    localStorage.setItem('notes:list', JSON.stringify({ version: 1, revision: 1, notes: [note] }));
    render(<NoteList />);
    localStorage.setItem('notes:list', JSON.stringify({ version: 1, revision: 1, notes: [] }));

    await user.click(screen.getByRole('button', { name: 'Remover nota: Já removida' }));

    expect(screen.queryByText('Já removida')).not.toBeInTheDocument();
    expect(screen.getByText(/Nenhuma nota ainda/)).toBeInTheDocument();
  });
});
