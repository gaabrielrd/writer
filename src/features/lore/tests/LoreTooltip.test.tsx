import { describe, expect, it } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoreTooltip } from '../components/LoreTooltip';
import type { LoreEntity } from '../model/loreEntity';

describe('LoreTooltip', () => {
  const mockEntity: LoreEntity = {
    id: 'e-1',
    bookId: 'b-1',
    name: 'Rei Arthur',
    aliases: ['Pendragon'],
    category: 'character',
    summary: 'Monarca da Távola Redonda.',
    details: 'Portador da Excalibur.',
    relations: [],
    isPublic: true,
    createdAt: 1000,
    updatedAt: 1000,
  };

  it('renderiza o texto filho e abre o tooltip no hover ou foco', async () => {
    const user = userEvent.setup();

    render(
      <LoreTooltip entity={mockEntity}>
        <span>Arthur</span>
      </LoreTooltip>,
    );

    expect(screen.getByText('Arthur')).toBeInTheDocument();
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    const trigger = screen.getByRole('button', { name: /ver resumo de rei arthur/i });

    // Hover
    await user.hover(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    expect(screen.getByText('Monarca da Távola Redonda.')).toBeInTheDocument();
    expect(screen.getByText(/Pendragon/)).toBeInTheDocument();

    await user.unhover(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();

    // Focus & Blur via fireEvent
    fireEvent.focus(trigger);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();

    fireEvent.blur(trigger);
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
  });
});
