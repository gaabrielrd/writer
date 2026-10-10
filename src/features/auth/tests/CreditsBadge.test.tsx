import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreditsBadge } from '../components/CreditsBadge';

describe('CreditsBadge', () => {
  it('shows only the count, with credit and plan details on focus or touch', async () => {
    render(<CreditsBadge credits={150} tier="free" />);
    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.queryByText('créditos')).not.toBeInTheDocument();
    const trigger = screen.getByRole('button', { name: '150 créditos de IA, plano free' });
    await userEvent.tab();
    expect(trigger).toHaveFocus();
    expect(await screen.findByRole('tooltip')).toHaveTextContent('150 créditos de IA · Plano FREE');
    await userEvent.keyboard('{Escape}');
    expect(screen.queryByRole('tooltip')).not.toBeInTheDocument();
    await userEvent.click(trigger);
    expect(await screen.findByRole('tooltip')).toBeInTheDocument();
  });
});
