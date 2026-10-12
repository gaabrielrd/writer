import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { FormSection } from '../FormSection';
import { Input } from '../Input';

describe('FormSection', () => {
  it('opens by keyboard, keeps entered fields and returns to its disclosure', async () => {
    const user = userEvent.setup();
    render(
      <FormSection title="Notas" description="Opcional">
        <Input label="Nota" />
      </FormSection>,
    );
    const trigger = screen.getByRole('button', { name: /Notas/ });
    expect(trigger).toHaveAttribute('aria-expanded', 'false');
    await user.tab();
    expect(trigger).toHaveFocus();
    await user.keyboard('{Enter}');
    expect(trigger).toHaveAttribute('aria-expanded', 'true');
    await user.type(screen.getByLabelText('Nota'), 'Meu rascunho');
    await user.click(trigger);
    expect(screen.getByLabelText('Nota')).not.toBeVisible();
    await user.keyboard(' ');
    expect(screen.getByLabelText('Nota')).toHaveValue('Meu rascunho');
  });

  it('supports controlled opening and blocks changes while busy', async () => {
    const user = userEvent.setup();
    const change = vi.fn();
    const view = render(
      <FormSection title="Capa" open onOpenChange={change}>
        Prévia
      </FormSection>,
    );
    await user.click(screen.getByRole('button', { name: 'Capa' }));
    expect(change).toHaveBeenCalledWith(false);
    expect(screen.getByText('Prévia')).toBeVisible();
    view.rerender(
      <FormSection title="Capa" open={false} disabled onOpenChange={change}>
        Prévia
      </FormSection>,
    );
    expect(screen.getByText('Prévia')).not.toBeVisible();
    expect(screen.getByRole('button', { name: 'Capa' })).toBeDisabled();
  });
});
