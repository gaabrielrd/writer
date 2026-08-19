import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoreDrawer } from '../components/LoreDrawer';
import type { LoreEntity } from '../model/loreEntity';

describe('LoreDrawer', () => {
  const targetEntity: LoreEntity = {
    id: 'e-2',
    bookId: 'b-1',
    name: 'Camelot',
    aliases: [],
    category: 'location',
    summary: 'A capital dourada.',
    details: '',
    relations: [],
    isPublic: true,
    createdAt: 1000,
    updatedAt: 1000,
  };

  const mainEntity: LoreEntity = {
    id: 'e-1',
    bookId: 'b-1',
    name: 'Rei Arthur',
    aliases: ['Pendragon'],
    category: 'character',
    summary: 'Monarca da Bretanha.',
    details: 'Liderou os cavaleiros na defesa do reino.',
    relations: [
      { targetEntityId: 'e-2', relationType: 'Governante de', description: 'Fundou a corte' },
    ],
    isPublic: true,
    createdAt: 1000,
    updatedAt: 1000,
  };

  it('renderiza os detalhes completos, resolve o nome da relacao e permite editar', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    const onEdit = vi.fn();

    render(
      <LoreDrawer
        entity={mainEntity}
        allEntities={[mainEntity, targetEntity]}
        open={true}
        onClose={onClose}
        onEdit={onEdit}
      />,
    );

    expect(screen.getByRole('heading', { name: 'Rei Arthur' })).toBeInTheDocument();
    expect(screen.getByText('Monarca da Bretanha.')).toBeInTheDocument();
    expect(screen.getByText('Liderou os cavaleiros na defesa do reino.')).toBeInTheDocument();
    expect(screen.getByText('Pendragon')).toBeInTheDocument();
    expect(screen.getByText('Governante de')).toBeInTheDocument();
    expect(screen.getByText('Camelot')).toBeInTheDocument();
    expect(screen.getByText('— Fundou a corte')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /editar ficha/i }));
    expect(onEdit).toHaveBeenCalledWith(mainEntity);
    expect(onClose).toHaveBeenCalled();
  });

  it('retorna null se fechado ou sem entidade', () => {
    const { container } = render(
      <LoreDrawer entity={null} allEntities={[]} open={false} onClose={vi.fn()} onEdit={vi.fn()} />,
    );

    expect(container).toBeEmptyDOMElement();
  });
});
