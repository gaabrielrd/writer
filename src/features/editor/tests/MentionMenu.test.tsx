import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MentionMenu } from '../components/MentionMenu';
import type { LoreEntity } from '@/features/lore';

describe('MentionMenu', () => {
  const mockEntities: LoreEntity[] = [
    {
      id: 'e-1',
      bookId: 'b-1',
      name: 'Arthur Pendragon',
      aliases: ['Rei'],
      category: 'character',
      summary: 'Soberano da Távola Redonda',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: 'e-2',
      bookId: 'b-1',
      name: 'Camelot',
      aliases: [],
      category: 'location',
      summary: 'A capital fortificada',
      details: '',
      relations: [],
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1000,
    },
  ];

  it('renderiza a lista de sugestoes com badges e seleciona por clique', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    const onHoverIndex = vi.fn();

    render(
      <MentionMenu
        entities={mockEntities}
        query="art"
        selectedIndex={0}
        onSelect={onSelect}
        onHoverIndex={onHoverIndex}
      />,
    );

    expect(screen.getByText('Arthur Pendragon')).toBeInTheDocument();
    expect(screen.getByText('Personagem')).toBeInTheDocument();
    expect(screen.getByText('Camelot')).toBeInTheDocument();
    expect(screen.getByText('Local')).toBeInTheDocument();

    const firstOption = screen.getByRole('option', { name: /arthur pendragon/i });
    await user.hover(firstOption);
    expect(onHoverIndex).toHaveBeenCalledWith(0);

    await user.click(firstOption);
    expect(onSelect).toHaveBeenCalledWith(mockEntities[0]);
  });

  it('exibe mensagem quando nao ha entidades', () => {
    render(
      <MentionMenu
        entities={[]}
        query="inexistente"
        selectedIndex={0}
        onSelect={vi.fn()}
        onHoverIndex={vi.fn()}
      />,
    );

    expect(screen.getByText('Nenhuma entidade encontrada')).toBeInTheDocument();
  });
});
