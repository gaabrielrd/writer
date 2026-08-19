import { render, screen, fireEvent } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { OutOfCreditsDialog } from '../components/OutOfCreditsDialog';

describe('OutOfCreditsDialog component', () => {
  it('exibe informacoes sobre creditos esgotados e dispara navegacao para BYOK', () => {
    const onClose = vi.fn();
    const onOpenBYOKSettings = vi.fn();

    render(
      <OutOfCreditsDialog open={true} onClose={onClose} onOpenBYOKSettings={onOpenBYOKSettings} />,
    );

    expect(screen.getByText('Seus créditos de IA acabaram')).toBeInTheDocument();
    expect(screen.getByText(/Você consumiu todos os seus créditos gratuitos/i)).toBeInTheDocument();

    const configBtn = screen.getByRole('button', {
      name: /configurar chave de api/i,
    });
    fireEvent.click(configBtn);

    expect(onClose).toHaveBeenCalled();
    expect(onOpenBYOKSettings).toHaveBeenCalled();
  });
});
