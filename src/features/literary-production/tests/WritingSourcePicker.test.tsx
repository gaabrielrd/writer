import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { WritingSourcePicker } from '../components/WritingSourcePicker';
import { listLiteraryPlans } from '../services/literaryPlanningService';
vi.mock('../services/literaryPlanningService', () => ({ listLiteraryPlans: vi.fn() }));
const page = {
  schema: {},
  items: [
    {
      id: 'plan',
      title: 'Ficha da carta',
      kind: 'chapterBrief',
      status: 'approved' as const,
      revision: 1,
    },
  ],
  nextAfterId: 'cursor',
  projectUpdatedAt: 1,
};
function Picker({ changed }: { changed: (value: string[] | undefined) => void }) {
  const [value, setValue] = useState<string[] | undefined>();
  return (
    <WritingSourcePicker
      bookId="book"
      value={value}
      onChange={(next) => {
        setValue(next);
        changed(next);
      }}
    />
  );
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listLiteraryPlans)
    .mockResolvedValueOnce(page)
    .mockResolvedValueOnce({ ...page, items: [], nextAfterId: null });
});
it('keeps automatic selection until the author chooses sources, paginates and removes an explicit source', async () => {
  const changed = vi.fn();
  render(<Picker changed={changed} />);
  expect(listLiteraryPlans).not.toHaveBeenCalled();
  await userEvent.click(screen.getByText('Planejamento usado pela IA'));
  await userEvent.click(screen.getByRole('combobox', { name: 'Seleção de planejamento' }));
  await userEvent.click(screen.getByRole('option', { name: 'Escolher fontes' }));
  expect(changed).toHaveBeenLastCalledWith([]);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar planejamentos' }));
  await userEvent.click(
    await screen.findByRole('combobox', { name: 'Planejamento para o contexto' }),
  );
  await userEvent.click(screen.getByRole('option', { name: 'Ficha da carta' }));
  await userEvent.click(screen.getByRole('button', { name: 'Incluir no contexto' }));
  expect(changed).toHaveBeenLastCalledWith(['plan']);
  await userEvent.click(screen.getByRole('button', { name: 'Mais planejamentos' }));
  await waitFor(() => expect(listLiteraryPlans).toHaveBeenLastCalledWith('book', 'cursor'));
  await userEvent.click(screen.getByRole('button', { name: 'Remover fonte' }));
  expect(changed).toHaveBeenLastCalledWith([]);
  await userEvent.click(screen.getByRole('combobox', { name: 'Seleção de planejamento' }));
  await userEvent.click(screen.getByRole('option', { name: 'Automática por unidade' }));
  expect(changed).toHaveBeenLastCalledWith(undefined);
});
it('preserves the explicit selection after a read failure and disables producers when the host is locked', async () => {
  vi.mocked(listLiteraryPlans).mockReset().mockRejectedValue(new Error('Fontes indisponíveis'));
  const changed = vi.fn();
  const view = render(<WritingSourcePicker bookId="book" value={['plan']} onChange={changed} />);
  await userEvent.click(screen.getByText('Planejamento usado pela IA'));
  await userEvent.click(screen.getByRole('button', { name: 'Consultar planejamentos' }));
  await screen.findByText('Fontes indisponíveis');
  expect(changed).not.toHaveBeenCalled();
  view.rerender(<WritingSourcePicker bookId="book" value={['plan']} onChange={changed} disabled />);
  expect(screen.getByRole('button', { name: 'Consultar planejamentos' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Remover fonte' })).toBeDisabled();
});
