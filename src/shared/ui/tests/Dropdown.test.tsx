import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { BookOpen, MoreHorizontal } from 'lucide-react';
import { renderWithProviders, screen, waitFor, fireEvent } from '@/test/render';
import { chooseDropdown } from '@/test/dropdown';
import { Button, Dialog, Dropdown, DropdownItem, DropdownLabel } from '../index';

const options = [
  { value: '', label: 'Sem categoria' },
  {
    value: 'book',
    label: 'Livro de ficção',
    icon: <BookOpen className="icon icon-sm" aria-hidden="true" />,
  },
  { value: 'disabled', label: 'Indisponível', disabled: true },
  { value: 0, label: 'Sépia', searchText: 'pergaminho' },
];

describe('Dropdown compartilhado', () => {
  it('seleciona valores vazios e numéricos, mostra ícone e envia valor no formulário', async () => {
    const changed = vi.fn();
    const { user, container } = renderWithProviders(
      <form>
        <Dropdown
          mode="select"
          label="Categoria"
          name="category"
          options={options}
          onValueChange={changed}
        />
      </form>,
    );
    const trigger = screen.getByRole('combobox', { name: 'Categoria' });
    expect(trigger).toHaveTextContent('Sem categoria');
    await chooseDropdown(user, trigger, 'Livro de ficção');
    expect(trigger.querySelector('svg')).toBeInTheDocument();
    expect(trigger).toHaveFocus();
    expect(changed).toHaveBeenLastCalledWith('book');
    await chooseDropdown(user, trigger, 'Sépia');
    expect(changed).toHaveBeenLastCalledWith('0');
    expect(new FormData(container.querySelector('form')!).get('category')).toBe('0');
    await chooseDropdown(user, trigger, 'Sem categoria');
    expect(changed).toHaveBeenLastCalledWith('');
  });

  it('preserva valor controlado e atualiza o label quando as opções mudam', async () => {
    const changed = vi.fn();
    const { user, rerender } = renderWithProviders(
      <Dropdown
        mode="select"
        label="Categoria"
        options={options}
        value="book"
        onValueChange={changed}
      />,
    );
    await chooseDropdown(user, screen.getByLabelText('Categoria'), 'Sépia');
    expect(changed).toHaveBeenCalledWith('0');
    expect(screen.getByLabelText('Categoria')).toHaveTextContent('Livro de ficção');
    rerender(
      <Dropdown
        mode="select"
        label="Categoria"
        options={[{ value: 'book', label: 'Livro atualizado' }]}
        value="book"
      />,
    );
    expect(screen.getByLabelText('Categoria')).toHaveTextContent('Livro atualizado');
  });

  it('filtra ignorando acentos, preserva espaços, mostra vazio e limpa busca ao reabrir', async () => {
    const { user } = renderWithProviders(
      <Dropdown mode="select" label="Categoria" options={options} searchable />,
    );
    const trigger = screen.getByLabelText('Categoria');
    await user.click(trigger);
    const filter = screen.getByRole('textbox', { name: 'Buscar em Categoria' });
    await waitFor(() => expect(filter).toHaveFocus());
    await user.type(filter, 'livro de ficcao');
    expect(screen.getAllByRole('option')).toHaveLength(1);
    await user.clear(filter);
    await user.type(filter, 'pergaminho');
    expect(screen.getByRole('option')).toHaveTextContent('Sépia');
    await user.clear(filter);
    await user.type(filter, 'inexistente');
    expect(screen.getByRole('status')).toHaveTextContent('Nenhuma opção encontrada.');
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
    await user.click(trigger);
    expect(screen.getByRole('textbox')).toHaveValue('');
    expect(screen.getAllByRole('option')).toHaveLength(options.length);
  });

  it('navega da busca por setas e seleciona com Enter', async () => {
    const changed = vi.fn();
    const { user } = renderWithProviders(
      <Dropdown
        mode="select"
        label="Categoria"
        options={options}
        searchable
        onValueChange={changed}
      />,
    );
    await user.click(screen.getByLabelText('Categoria'));
    await user.type(screen.getByRole('textbox'), 'sepia');
    await user.keyboard('{ArrowDown}{Enter}');
    expect(changed).toHaveBeenCalledWith('0');
    expect(screen.getByLabelText('Categoria')).toHaveFocus();
  });

  it('executa callbacks em ações sem mudar o ícone ou label do botão', async () => {
    const callback = vi.fn();
    const action = vi.fn();
    const { user } = renderWithProviders(
      <Dropdown
        label="Ações"
        icon={<BookOpen className="icon" aria-hidden="true" />}
        options={[
          { value: 'export', label: 'Exportar', onSelect: callback },
          { value: 'delete', label: 'Excluir', disabled: true, variant: 'destructive' },
        ]}
        onAction={action}
        contentClassName="custom-menu"
        itemClassName="custom-item"
        variant="outline"
        size="sm"
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Ações' });
    await user.click(trigger);
    expect(screen.getByRole('menu')).toHaveClass('custom-menu');
    expect(screen.getByRole('menuitem', { name: 'Exportar' })).toHaveClass('custom-item');
    expect(screen.getByRole('menuitem', { name: 'Excluir' })).toHaveAttribute('data-disabled');
    await user.click(screen.getByRole('menuitem', { name: 'Excluir' }));
    expect(callback).not.toHaveBeenCalled();
    expect(action).not.toHaveBeenCalled();
    await user.click(screen.getByRole('menuitem', { name: 'Exportar' }));
    expect(callback).toHaveBeenCalledTimes(1);
    expect(action).toHaveBeenCalledWith('export');
    expect(trigger).toHaveTextContent('Ações');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('oferece ação apenas com ícone e busca por ações', async () => {
    const action = vi.fn();
    const { user } = renderWithProviders(
      <Dropdown
        mode="action"
        label="Opções"
        iconOnly
        icon={<MoreHorizontal className="icon" aria-hidden="true" />}
        options={[{ value: 'edit', label: 'Editar' }]}
        onAction={action}
        searchable
      />,
    );
    const trigger = screen.getByRole('button', { name: 'Opções' });
    expect(trigger).toHaveTextContent('');
    await user.click(trigger);
    await user.type(screen.getByRole('textbox'), 'editar');
    await user.keyboard('{ArrowUp}{Enter}');
    expect(action).toHaveBeenCalledTimes(1);
    expect(trigger).toHaveTextContent('');
  });

  it('pula opções desabilitadas ao navegar por teclado', async () => {
    const { user } = renderWithProviders(
      <Dropdown mode="select" label="Categoria" options={options} />,
    );
    screen.getByLabelText('Categoria').focus();
    await user.keyboard('{ArrowDown}');
    await waitFor(() =>
      expect(screen.getByRole('option', { name: 'Sem categoria' })).toHaveFocus(),
    );
    await user.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(screen.getByLabelText('Categoria')).toHaveTextContent('Sépia');
  });

  it('associa erro e hint, mantém id único e não abre controles desabilitados', async () => {
    const { user, rerender } = renderWithProviders(
      <>
        <Dropdown mode="select" label="Categoria" options={options} error="Escolha uma categoria" />
        <Dropdown mode="select" label="Categoria" options={options} disabled hint="Ajuda" />
      </>,
    );
    const first = screen.getAllByLabelText('Categoria')[0]!;
    const disabled = screen.getAllByLabelText('Categoria')[1]!;
    expect(disabled).toBeDisabled();
    expect(first.id).not.toBe(disabled.id);
    expect(first).toHaveAttribute('aria-invalid', 'true');
    expect(first).toHaveAccessibleDescription('Escolha uma categoria');
    expect(disabled).toHaveAccessibleDescription('Ajuda');
    await user.click(disabled);
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
    rerender(<Dropdown mode="select" label="Vazio" options={[]} placeholder="Escolha..." />);
    await user.click(screen.getByLabelText('Vazio'));
    expect(screen.getByRole('status')).toHaveTextContent('Nenhuma opção encontrada.');
  });

  it('preserva o diálogo pai com Escape e restaura foco ao fechar o menu', async () => {
    function Example() {
      const [open, setOpen] = useState(true);
      return (
        <Dialog open={open} title="Formulário" onClose={() => setOpen(false)}>
          <Dropdown mode="select" label="Categoria" searchable options={options} />
        </Dialog>
      );
    }
    const { user } = renderWithProviders(<Example />);
    const trigger = screen.getByLabelText('Categoria');
    await user.click(trigger);
    await user.keyboard('{Escape}');
    expect(screen.getByRole('dialog', { name: 'Formulário' })).toBeInTheDocument();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('mantém composição com links e fecha por Tab ou clique externo', async () => {
    const { user } = renderWithProviders(
      <>
        <Button>Fora</Button>
        <Dropdown label="Conta" trigger={<Button>Conta</Button>}>
          <DropdownLabel>Email</DropdownLabel>
          <DropdownItem asChild>
            <a href="#perfil">Perfil</a>
          </DropdownItem>
        </Dropdown>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Conta' }));
    expect(screen.getByRole('menuitem', { name: 'Perfil' })).toHaveAttribute('href', '#perfil');
    await user.keyboard('{Tab}');
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Conta' }));
    fireEvent.pointerDown(document.body);
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
  });

  it('executa ação que abre diálogo após fechar o menu e restaura o foco ao gatilho', async () => {
    function Example() {
      const [open, setOpen] = useState(false);
      return (
        <>
          <Dropdown label="Conta" trigger={<Button>Conta</Button>}>
            <DropdownItem onSelect={() => setOpen(true)}>Configurar</DropdownItem>
          </Dropdown>
          <Dialog open={open} title="Configurações" onClose={() => setOpen(false)}>
            <Button onClick={() => setOpen(false)}>Concluir</Button>
          </Dialog>
        </>
      );
    }
    const { user } = renderWithProviders(<Example />);
    const trigger = screen.getByRole('button', { name: 'Conta' });
    await user.click(trigger);
    await user.click(screen.getByRole('menuitem', { name: 'Configurar' }));
    expect(await screen.findByRole('dialog', { name: 'Configurações' })).toBeInTheDocument();
    expect(screen.queryByRole('menu')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Concluir' }));
    await waitFor(() => expect(trigger).toHaveFocus());
    expect(document.body).not.toHaveStyle({ pointerEvents: 'none' });
  });
});
