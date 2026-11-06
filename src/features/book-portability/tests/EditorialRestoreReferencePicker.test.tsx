import { useState } from 'react';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import {
  EditorialRestoreReferencePicker,
  type SelectedEditorialReference,
} from '../components/EditorialRestoreReferencePicker';
import { listLiteraryReferences, listLiteraryVolumeBooks } from '@/features/literary-production';
vi.mock('@/features/literary-production', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/features/literary-production')>();
  return {
    referenceLabels: actual.referenceLabels,
    listLiteraryReferences: vi.fn(),
    listLiteraryVolumeBooks: vi.fn(),
  };
});
const ref = {
  kind: 'chapter' as const,
  id: 'chapter',
  scopeId: 'book',
  sourceToken: 'a'.repeat(64),
  revision: 1,
  purpose: 'source' as const,
};
const choice = { reference: ref, label: 'Capítulo da carta' };
function Picker({
  changed,
  initial = [],
  guard = () => {},
}: {
  changed: (value: SelectedEditorialReference[]) => void;
  initial?: SelectedEditorialReference[];
  guard?: () => void;
}) {
  const [value, setValue] = useState(initial);
  return (
    <EditorialRestoreReferencePicker
      bookId="book"
      disabled={false}
      value={value}
      guard={guard}
      onChange={(next) => {
        setValue(next);
        changed(next);
      }}
    />
  );
}
async function choose(label: string, option: string) {
  await userEvent.click(screen.getByRole('combobox', { name: label }));
  await userEvent.click(screen.getByRole('option', { name: option }));
}
beforeEach(() => {
  vi.resetAllMocks();
});
it('paginates authorized references, prevents duplicate links and removes only the chosen native reference', async () => {
  vi.mocked(listLiteraryReferences)
    .mockResolvedValueOnce({ items: [choice], nextAfterId: 'cursor' })
    .mockResolvedValueOnce({
      items: [{ ...choice, reference: { ...ref, id: 'second' }, label: 'Capítulo seguinte' }],
      nextAfterId: null,
    });
  const changed = vi.fn(),
    guard = vi.fn();
  render(<Picker changed={changed} guard={guard} />);
  expect(listLiteraryReferences).not.toHaveBeenCalled();
  await choose('Função da referência', 'Unidade que este plano prepara');
  await userEvent.click(screen.getByRole('button', { name: 'Consultar referências atuais' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Vincular Capítulo da carta' }));
  expect(changed).toHaveBeenLastCalledWith([choice]);
  expect(screen.getByRole('button', { name: 'Vincular Capítulo da carta' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Mais referências' }));
  await screen.findByRole('button', { name: 'Vincular Capítulo seguinte' });
  await userEvent.click(screen.getByRole('button', { name: 'Remover referência' }));
  expect(changed).toHaveBeenLastCalledWith([]);
  expect(listLiteraryReferences).toHaveBeenLastCalledWith(
    'book',
    'chapter',
    'cursor',
    'subject',
    undefined,
  );
  expect(guard).toHaveBeenCalledTimes(4);
});
it('keeps the historical token until explicitly adopting the current version', async () => {
  const current = { ...ref, revision: 2, sourceToken: 'b'.repeat(64) };
  const changed = vi.fn();
  render(
    <Picker
      changed={changed}
      initial={[{ ...choice, changed: true, currentReference: current, available: true }]}
    />,
  );
  expect(changed).not.toHaveBeenCalled();
  expect(screen.getByText('Requer nova seleção ou atualização.')).toBeVisible();
  await userEvent.click(screen.getByRole('button', { name: 'Usar versão atual desta fonte' }));
  expect(changed).toHaveBeenLastCalledWith([
    { reference: current, label: choice.label, available: true, changed: false },
  ]);
  expect(screen.queryByText('Requer nova seleção ou atualização.')).not.toBeInTheDocument();
});
it('paginates volumes and sends their explicit book and unit scope without treating them as local references', async () => {
  vi.mocked(listLiteraryVolumeBooks)
    .mockResolvedValueOnce({
      items: [{ id: 'volume-one', title: 'Primeiro volume' }],
      nextAfterId: 'vol-cursor',
    })
    .mockResolvedValueOnce({
      items: [{ id: 'volume-two', title: 'Segundo volume' }],
      nextAfterId: null,
    });
  vi.mocked(listLiteraryReferences).mockResolvedValue({ items: [], nextAfterId: null });
  const changed = vi.fn();
  render(<Picker changed={changed} />);
  await choose('Tipo de referência', 'Unidade de outro volume');
  expect(screen.getByRole('button', { name: 'Consultar referências atuais' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Consultar meus volumes' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mais volumes' }));
  await choose('Volume de origem', 'Segundo volume');
  await choose('Unidade de origem', 'Cena');
  await userEvent.click(screen.getByRole('button', { name: 'Consultar referências atuais' }));
  await screen.findByText('Nenhuma referência disponível');
  expect(listLiteraryReferences).toHaveBeenLastCalledWith('book', 'volumeUnit', null, 'source', {
    bookId: 'volume-two',
    kind: 'scene',
  });
  expect(listLiteraryVolumeBooks).toHaveBeenLastCalledWith('book', 'vol-cursor');
  expect(changed).not.toHaveBeenCalled();
});
it('does not expose a reply after account revocation and preserves the original selection', async () => {
  vi.mocked(listLiteraryReferences).mockResolvedValue({ items: [choice], nextAfterId: null });
  const guard = vi
    .fn()
    .mockImplementationOnce(() => {})
    .mockImplementation(() => {
      throw new Error('Conta alterada');
    });
  const changed = vi.fn();
  render(<Picker changed={changed} guard={guard} />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar referências atuais' }));
  await screen.findByText('Conta alterada');
  expect(
    screen.queryByRole('button', { name: 'Vincular Capítulo da carta' }),
  ).not.toBeInTheDocument();
  expect(changed).not.toHaveBeenCalled();
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Consultar referências atuais' })).toBeEnabled(),
  );
});
