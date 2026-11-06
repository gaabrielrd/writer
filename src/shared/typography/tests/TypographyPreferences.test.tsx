import { useState } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { renderWithProviders, screen } from '@/test/render';
import { chooseDropdown } from '@/test/dropdown';
import { TypographyProvider } from '../TypographyProvider';
import { TypographyPreferences } from '../../ui/TypographyPreferences';
import { readTypography } from '../../services/typographyStorage';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});
const root = document.documentElement;
function Editor() {
  const [text, setText] = useState('Meu manuscrito');
  return (
    <textarea
      aria-label="Rascunho do capítulo"
      value={text}
      onChange={(e) => setText(e.target.value)}
    />
  );
}
function Session({ uid = 'author' }: { uid?: string | null }) {
  return (
    <TypographyProvider uid={uid}>
      <TypographyPreferences />
      <Editor />
    </TypographyProvider>
  );
}

it('prévia e cancelamento não persistem e a troca de fonte não remonta o editor', async () => {
  const { user, unmount } = renderWithProviders(<Session />);
  const editor = screen.getByLabelText('Rascunho do capítulo');
  await user.type(editor, ' novo');
  await chooseDropdown(user, screen.getByLabelText('Preset de fontes'), 'Poético');
  expect(root.style.getPropertyValue('--font-display')).toContain('Cormorant Garamond');
  expect(readTypography('author').preset).toBe('classic');
  expect(screen.getByLabelText('Rascunho do capítulo')).toBe(editor);
  expect(editor).toHaveValue('Meu manuscrito novo');
  await user.click(screen.getByRole('button', { name: 'Cancelar prévia' }));
  expect(root.style.getPropertyValue('--font-display')).toContain('Libre Baskerville');
  await chooseDropdown(user, screen.getByLabelText('Preset de fontes'), 'Romance humanista');
  unmount();
  expect(root).not.toHaveAttribute('data-typography-preset');
  expect(readTypography('author').preset).toBe('classic');
});

it('personaliza o preset observado, salva e recupera os três papéis após remontar', async () => {
  const { user, unmount } = renderWithProviders(<Session />);
  await chooseDropdown(user, screen.getByLabelText('Preset de fontes'), 'Leitura digital');
  await chooseDropdown(user, screen.getByLabelText('Fonte dos títulos'), 'EB Garamond');
  expect(screen.getByLabelText('Preset de fontes')).toHaveTextContent('Personalizado');
  expect(screen.getByLabelText('Fonte do editor de texto')).toHaveTextContent('Literata');
  await chooseDropdown(user, screen.getByLabelText('Fonte da interface'), 'Nunito Sans');
  await chooseDropdown(user, screen.getByLabelText('Fonte do editor de texto'), 'Crimson Pro');
  await user.click(screen.getByRole('button', { name: 'Salvar fontes' }));
  expect(screen.getByRole('status')).toHaveTextContent('Fontes salvas');
  unmount();
  renderWithProviders(<Session />);
  expect(root.style.getPropertyValue('--font-display')).toContain('EB Garamond');
  expect(root.style.getPropertyValue('--font-sans')).toContain('Nunito Sans');
  expect(root.style.getPropertyValue('--font-reading')).toContain('Crimson Pro');
  expect(screen.getByRole('button', { name: 'Salvar fontes' })).toBeDisabled();
});

it('retira a prévia ao trocar de conta e recupera somente a escolha da conta original', async () => {
  const { user, rerender } = renderWithProviders(<Session />);
  await chooseDropdown(user, screen.getByLabelText('Preset de fontes'), 'Romance humanista');
  await user.click(screen.getByRole('button', { name: 'Salvar fontes' }));
  await chooseDropdown(user, screen.getByLabelText('Preset de fontes'), 'Poético');
  rerender(<Session uid="other" />);
  expect(root).toHaveAttribute('data-typography-preset', 'classic');
  rerender(<Session />);
  expect(root).toHaveAttribute('data-typography-preset', 'romance');
  rerender(<Session uid={null} />);
  expect(root).toHaveAttribute('data-typography-preset', 'classic');
});

it('não anuncia sucesso se o armazenamento falhar e mantém a prévia para tentar de novo', async () => {
  const { user } = renderWithProviders(<Session />);
  await chooseDropdown(user, screen.getByLabelText('Preset de fontes'), 'Contemporâneo acolhedor');
  const storage = vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
    throw new Error('quota');
  });
  await user.click(screen.getByRole('button', { name: 'Salvar fontes' }));
  expect(screen.getByRole('alert')).toHaveTextContent('Não foi possível salvar');
  expect(root).toHaveAttribute('data-typography-preset', 'contemporary');
  expect(readTypography('author').preset).toBe('classic');
  storage.mockRestore();
  await user.click(screen.getByRole('button', { name: 'Salvar fontes' }));
  expect(readTypography('author').preset).toBe('contemporary');
});
