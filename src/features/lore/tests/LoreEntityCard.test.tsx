import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoreEntityCard } from '../components/LoreEntityCard';
import type { LoreEntity } from '../model/loreEntity';

describe('LoreEntityCard', () => {
  const mockEntity: LoreEntity = {
    id: 'e-1',
    bookId: 'b-1',
    name: 'Camelot',
    aliases: ['Cidadela Dourada'],
    category: 'location',
    summary: 'A lendária fortaleza dos reis.',
    details: 'Muralhas impenetráveis.',
    relations: [{ targetEntityId: 'e-2', relationType: 'Capital de' }],
    isPublic: true,
    createdAt: 1000,
    updatedAt: 1000,
  };

  it('renderiza os dados da entidade e acoes', async () => {
    const user = userEvent.setup();
    const onView = vi.fn();
    const onEdit = vi.fn();
    const onDelete = vi.fn();

    render(
      <LoreEntityCard entity={mockEntity} onView={onView} onEdit={onEdit} onDelete={onDelete} />,
    );

    expect(screen.getByRole('heading', { name: 'Camelot' })).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();
    expect(screen.getByText(/Cidadela Dourada/)).toBeInTheDocument();
    expect(screen.getByText('A lendária fortaleza dos reis.')).toBeInTheDocument();
    expect(screen.getByText(/relação vinculada/i)).toBeInTheDocument();
    expect(screen.getByText('Público')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /ver ficha/i }));
    expect(onView).toHaveBeenCalledWith(mockEntity);

    await user.click(screen.getByLabelText('Editar Camelot'));
    expect(onEdit).toHaveBeenCalledWith(mockEntity);

    await user.click(screen.getByLabelText('Excluir Camelot'));
    expect(onDelete).toHaveBeenCalledWith('e-1');
  });

  it('renderiza indicador de entidade privada', () => {
    const privateEntity: LoreEntity = {
      ...mockEntity,
      isPublic: false,
      aliases: [],
      relations: [],
    };

    render(
      <LoreEntityCard
        entity={privateEntity}
        onView={vi.fn()}
        onEdit={vi.fn()}
        onDelete={vi.fn()}
      />,
    );

    expect(screen.getByText('Privado')).toBeInTheDocument();
  });
});
