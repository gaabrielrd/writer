import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { RichEditor } from '../components/RichEditor';
import type { LoreEntity } from '@/features/lore';

describe('RichEditor', () => {
  const mockEntities: LoreEntity[] = [
    {
      id: 'e-1',
      bookId: 'b-1',
      name: 'Rei Arthur',
      aliases: ['Arthur', 'Pendragon'],
      category: 'character',
      summary: 'Soberano da Bretanha',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'e-2',
      bookId: 'b-1',
      name: 'Excalibur',
      aliases: [],
      category: 'concept',
      summary: 'A lâmina lendária',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  it('permite digitar texto e usar botoes de formatacao da barra', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    const onToggleSidebar = vi.fn();
    const onSelectEntity = vi.fn();

    render(
      <RichEditor
        content="Era uma vez"
        onChange={onChange}
        entities={mockEntities}
        onSelectEntity={onSelectEntity}
        isSidebarOpen={false}
        onToggleSidebar={onToggleSidebar}
      />,
    );

    const textarea = screen.getByLabelText(/área de escrita do capítulo/i);
    expect(textarea).toHaveValue('Era uma vez');

    // Título Principal
    await user.click(screen.getByLabelText('Título Principal'));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('# '));

    // Subtítulo
    await user.click(screen.getByLabelText('Subtítulo'));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('## '));

    // Negrito
    await user.click(screen.getByLabelText('Negrito'));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('**texto**'));

    // Itálico
    await user.click(screen.getByLabelText('Itálico'));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('*texto*'));

    // Citação
    await user.click(screen.getByLabelText('Citação'));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('> '));

    // Diálogo
    await user.click(screen.getByLabelText('Travessão de Diálogo'));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('— '));

    // Mencionar Lore
    await user.click(screen.getByLabelText('Mencionar Lore'));
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('@'));

    // Abrir Sidebar
    await user.click(screen.getByRole('button', { name: /compêndio/i }));
    expect(onToggleSidebar).toHaveBeenCalled();
  });

  it('suporta atalhos de teclado Ctrl+B e Ctrl+I', async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();

    render(
      <RichEditor
        content="Texto de teste"
        onChange={onChange}
        entities={mockEntities}
        onSelectEntity={vi.fn()}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText(/área de escrita do capítulo/i);
    textarea.focus();

    await user.keyboard('{Control>}b{/Control}');
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('**texto**'));

    await user.keyboard('{Control>}i{/Control}');
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('*texto*'));
  });

  it('alterna para modo de leitura com lore e renderiza headings e tooltips', async () => {
    const user = userEvent.setup();
    const onSelectEntity = vi.fn();

    const { rerender } = render(
      <RichEditor
        content={`# Capítulo I\n\n## O Início\n\nRei Arthur empunhou a espada Excalibur diante de todos.`}
        onChange={vi.fn()}
        entities={mockEntities}
        onSelectEntity={onSelectEntity}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />,
    );

    // Clicar no pill do resumo de lore
    const arthurPill = screen.getByTitle('Clique para abrir a ficha de Rei Arthur');
    await user.click(arthurPill);
    expect(onSelectEntity).toHaveBeenCalledWith(mockEntities[0]);

    // Alternar para modo Leitura com Lore
    await user.click(screen.getByRole('button', { name: /leitura com lore/i }));

    expect(screen.getByText('Capítulo I')).toBeInTheDocument();
    expect(screen.getByText('O Início')).toBeInTheDocument();

    const arthurBtns = screen.getAllByRole('button', { name: 'Rei Arthur' });
    const highlightBtn = arthurBtns[arthurBtns.length - 1];
    if (highlightBtn) await user.click(highlightBtn);
    expect(onSelectEntity).toHaveBeenCalledWith(mockEntities[0]);

    // Testar visualização vazia
    rerender(
      <RichEditor
        content=""
        onChange={vi.fn()}
        entities={mockEntities}
        onSelectEntity={onSelectEntity}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />,
    );
    expect(screen.getByText('Nenhum texto escrito ainda.')).toBeInTheDocument();
  });

  it('navega no menu de mencao com ArrowDown, ArrowUp, Escape e Enter', async () => {
    const user = userEvent.setup();
    let currentContent = 'Conheci @';
    const onChange = vi.fn((newText: string) => {
      currentContent = newText;
    });

    const { rerender } = render(
      <RichEditor
        content={currentContent}
        onChange={onChange}
        entities={mockEntities}
        onSelectEntity={vi.fn()}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />,
    );

    const textarea = screen.getByLabelText(/área de escrita do capítulo/i);
    await user.type(textarea, 'art');

    rerender(
      <RichEditor
        content="Conheci @art"
        onChange={onChange}
        entities={mockEntities}
        onSelectEntity={vi.fn()}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />,
    );

    expect(screen.getByRole('listbox')).toBeInTheDocument();

    // Navegação com setas
    await user.keyboard('{ArrowDown}');
    await user.keyboard('{ArrowUp}');

    // Pressiona Enter para inserir menção
    await user.keyboard('{Enter}');
    expect(onChange).toHaveBeenCalledWith(expect.stringContaining('Rei Arthur'));

    // Testar Escape para fechar
    rerender(
      <RichEditor
        content="Outro @"
        onChange={onChange}
        entities={mockEntities}
        onSelectEntity={vi.fn()}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />,
    );

    await user.type(textarea, 'e');
    rerender(
      <RichEditor
        content="Outro @e"
        onChange={onChange}
        entities={mockEntities}
        onSelectEntity={vi.fn()}
        isSidebarOpen={false}
        onToggleSidebar={vi.fn()}
      />,
    );

    expect(screen.getByRole('listbox')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });
});
