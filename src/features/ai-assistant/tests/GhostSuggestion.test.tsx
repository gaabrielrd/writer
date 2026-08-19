import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { GhostSuggestion } from '../components/GhostSuggestion';

describe('GhostSuggestion component', () => {
  it('renderiza o texto da sugestao e lida com aceite e descarte', () => {
    const onAccept = vi.fn();
    const onDiscard = vi.fn();

    render(
      <GhostSuggestion
        suggestion="e a sombra desapareceu no horizonte."
        onAccept={onAccept}
        onDiscard={onDiscard}
      />,
    );

    expect(screen.getByText('e a sombra desapareceu no horizonte.')).toBeInTheDocument();

    const acceptBtn = screen.getByRole('button', { name: /aceitar/i });
    fireEvent.click(acceptBtn);
    expect(onAccept).toHaveBeenCalled();

    const discardBtn = screen.getByRole('button', { name: /descartar/i });
    fireEvent.click(discardBtn);
    expect(onDiscard).toHaveBeenCalled();
  });

  it('nao renderiza nada quando nao ha sugestao', () => {
    const { container } = render(
      <GhostSuggestion suggestion="" onAccept={vi.fn()} onDiscard={vi.fn()} />,
    );

    expect(container.firstChild).toBeNull();
  });
});
