import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CreditsBadge } from '../components/CreditsBadge';

describe('CreditsBadge', () => {
  it('exibe o saldo de creditos e o tier', () => {
    render(<CreditsBadge credits={150} tier="free" />);

    expect(screen.getByText('150')).toBeInTheDocument();
    expect(screen.getByText('créditos')).toBeInTheDocument();
    expect(screen.getByText('(free)')).toBeInTheDocument();
  });
});
