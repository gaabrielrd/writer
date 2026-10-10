import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@/test/render';
import userEvent from '@testing-library/user-event';
import { ReaderLoreTooltip } from '../components/ReaderLoreTooltip';
import type { PublicLoreEntity } from '../model/publicBook';

const entity: PublicLoreEntity = {
  id: 'lia',
  name: 'Lia',
  aliases: [],
  category: 'character',
  summary: 'Uma cartógrafa.',
  isPublic: true,
};

describe('ReaderLoreTooltip dismissal', () => {
  it('dismisses a hover-only tooltip with Escape while keyboard focus is elsewhere', async () => {
    const user = userEvent.setup();
    render(
      <>
        <button type="button">Outro controle</button>
        <ReaderLoreTooltip entity={entity}>Lia</ReaderLoreTooltip>
      </>,
    );
    await user.click(screen.getByRole('button', { name: 'Outro controle' }));
    const term = screen.getByRole('button', { name: 'Ver resumo de Lia' });
    await user.hover(term);
    expect(screen.getByRole('tooltip')).toHaveTextContent('Uma cartógrafa.');
    expect(screen.getByRole('button', { name: 'Outro controle' })).toHaveFocus();
    await user.keyboard('{ArrowDown}');
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outro controle' })).toHaveFocus();
    await user.unhover(term);
    await user.hover(term);
    expect(screen.getByRole('tooltip')).toBeInTheDocument();
  });

  it('removes its Escape listener on unmount', async () => {
    const user = userEvent.setup();
    const add = vi.spyOn(window, 'addEventListener');
    const remove = vi.spyOn(window, 'removeEventListener');
    try {
      const { unmount } = render(<ReaderLoreTooltip entity={entity}>Lia</ReaderLoreTooltip>);
      await user.hover(screen.getByRole('button', { name: 'Ver resumo de Lia' }));
      const listener = add.mock.calls.find(([event]) => event === 'keydown')?.[1];
      expect(listener).toBeDefined();
      unmount();
      expect(remove).toHaveBeenCalledWith('keydown', listener);
    } finally {
      add.mockRestore();
      remove.mockRestore();
    }
  });
});
