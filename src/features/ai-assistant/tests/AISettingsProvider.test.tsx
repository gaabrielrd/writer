import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, useLocation } from 'react-router';
import { describe, expect, it } from 'vitest';
import { Button } from '@/shared/ui';
import { AISettingsProvider } from '../components/AISettingsProvider';
import { useAISettings } from '../hooks/useAISettings';

function Controls() {
  const open = useAISettings();
  const location = useLocation();
  return (
    <>
      <Button onClick={open}>Configuração geral</Button>
      <Button onClick={() => open('provider')}>Modelo</Button>
      <Button onClick={() => open('personas')}>Personas</Button>
      <output aria-label="Rota atual">{location.pathname + location.search}</output>
      <output aria-label="Origem">
        {(location.state as { returnTo?: string } | null)?.returnTo}
      </output>
    </>
  );
}
describe('navegação das configurações de IA', () => {
  it.each([
    ['Configuração geral', '/settings/ai'],
    ['Modelo', '/settings/ai?tab=provider'],
    ['Personas', '/settings/ai?tab=personas'],
  ])('abre %s preservando a origem do editor', async (label, path) => {
    render(
      <MemoryRouter initialEntries={['/books/b/editor/c?origem=livro']}>
        <AISettingsProvider>
          <Controls />
        </AISettingsProvider>
      </MemoryRouter>,
    );
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByLabelText('Rota atual')).toHaveTextContent(path);
    expect(screen.getByLabelText('Origem')).toHaveTextContent('/books/b/editor/c?origem=livro');
  });
});
