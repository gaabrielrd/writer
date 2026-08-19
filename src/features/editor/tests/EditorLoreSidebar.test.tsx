import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorLoreSidebar } from '../components/EditorLoreSidebar';
import type { LoreEntity } from '@/features/lore';

describe('EditorLoreSidebar', () => {
  const mockEntities: LoreEntity[] = [
    {
      id: 'e-1',
      bookId: 'b-1',
      name: 'Merlin',
      aliases: ['O Mago'],
      category: 'character',
      summary: 'Arquimago da corte',
      details: 'Grande conhecedor dos segredos antigos',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'e-2',
      bookId: 'b-1',
      name: 'Avalon',
      aliases: ['Ilha Sagrada'],
      category: 'location',
      summary: 'Ilha envolta em brumas',
      details: 'Santuário lendário',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  it('renderiza entidades, filtra por busca e por categoria', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onCreateEntity = vi.fn().mockResolvedValue(undefined);
    const onUpdateEntity = vi.fn().mockResolvedValue(undefined);

    render(
      <EditorLoreSidebar
        isOpen={true}
        entities={mockEntities}
        selectedEntityId="e-1"
        onClose={onClose}
        onCreateEntity={onCreateEntity}
        onUpdateEntity={onUpdateEntity}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Compêndio de Lore' })).toBeInTheDocument();
    expect(screen.getByText('Merlin')).toBeInTheDocument();
    expect(screen.getByText('Avalon')).toBeInTheDocument();

    // Filtros por categoria
    await user.click(screen.getByRole('button', { name: 'Personagens' }));
    expect(screen.getByText('Merlin')).toBeInTheDocument();
    expect(screen.queryByText('Avalon')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Locais' }));
    expect(screen.getByText('Avalon')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Conceitos' }));
    expect(screen.getByText('Nenhuma entidade encontrada.')).toBeInTheDocument();

    // Resetar filtro
    await user.click(screen.getByRole('button', { name: 'Todos' }));
    expect(screen.getByText('Avalon')).toBeInTheDocument();

    // Busca por termo
    await user.type(screen.getByLabelText(/buscar no compêndio/i), 'Brumas');
    expect(screen.queryByText('Merlin')).not.toBeInTheDocument();
    expect(screen.getByText('Avalon')).toBeInTheDocument();

    // Fechar sidebar
    await user.click(screen.getByLabelText('Fechar painel de lore'));
    expect(onClose).toHaveBeenCalled();
  });

  it('cria entidade via formulario de criacao', async () => {
    const user = userEvent.setup();
    const onCreateEntity = vi.fn().mockResolvedValue(undefined);

    render(
      <EditorLoreSidebar
        isOpen={true}
        entities={mockEntities}
        onClose={vi.fn()}
        onCreateEntity={onCreateEntity}
        onUpdateEntity={vi.fn()}
      />,
    );

    // Abrir criação
    await user.click(screen.getByRole('button', { name: /nova entidade/i }));
    expect(
      screen.getByRole('heading', { name: /cadastrar nova entidade no compêndio/i }),
    ).toBeInTheDocument();

    await user.type(screen.getByLabelText(/nome da entidade/i), 'Galahad');
    await user.type(screen.getByLabelText(/resumo curto/i), 'Cavaleiro puro');
    await user.click(screen.getByRole('button', { name: 'Cadastrar Entidade' }));

    expect(onCreateEntity).toHaveBeenCalledWith(
      expect.objectContaining({
        name: 'Galahad',
        summary: 'Cavaleiro puro',
      }),
    );
  });

  it('edita entidade via botao Editar e via Drawer', async () => {
    const user = userEvent.setup();
    const onUpdateEntity = vi.fn().mockResolvedValue(undefined);

    render(
      <EditorLoreSidebar
        isOpen={true}
        entities={mockEntities}
        onClose={vi.fn()}
        onCreateEntity={vi.fn()}
        onUpdateEntity={onUpdateEntity}
      />,
    );

    // Editar diretamente do card
    const editBtns = screen.getAllByRole('button', { name: 'Editar' });
    const editBtn = editBtns[0];
    if (editBtn) await user.click(editBtn);

    expect(screen.getByRole('heading', { name: /editar entidade: merlin/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/resumo curto/i), ' atualizado');
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));

    expect(onUpdateEntity).toHaveBeenCalledWith('e-1', expect.objectContaining({ name: 'Merlin' }));

    // Abrir visualização de ficha e editar pelo Drawer
    const viewButtons = screen.getAllByRole('button', { name: /ver ficha/i });
    const viewBtn = viewButtons[0];
    if (viewBtn) await user.click(viewBtn);

    expect(screen.getByText('Grande conhecedor dos segredos antigos')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /editar ficha/i }));
    expect(screen.getByRole('heading', { name: /editar entidade: merlin/i })).toBeInTheDocument();
  });

  it('retorna null quando isOpen e falso', () => {
    const { container } = render(
      <EditorLoreSidebar
        isOpen={false}
        entities={mockEntities}
        onClose={vi.fn()}
        onCreateEntity={vi.fn()}
        onUpdateEntity={vi.fn()}
      />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
