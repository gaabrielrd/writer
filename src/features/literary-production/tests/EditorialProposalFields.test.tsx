import { useState } from 'react';
import { expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { EditorialProposalFields } from '../components/EditorialProposalFields';
import type { EditorialContract } from '../model/editorial';

it('author can add and remove a proposal publication unit without losing the literary draft', async () => {
  const saved = vi.fn<(contract: EditorialContract) => void>();
  function Form() {
    const [value, setValue] = useState<EditorialContract>();
    return (
      <EditorialProposalFields
        value={value}
        disabled={false}
        onChange={(next) => {
          setValue(next);
          saved(next);
        }}
      />
    );
  }
  render(<Form />);
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar direção editorial' }));
  await userEvent.type(screen.getByLabelText('Premissa'), 'Uma carta chega tarde.');
  await userEvent.click(screen.getByLabelText('Unidade de publicação do contrato'));
  await userEvent.click(await screen.findByRole('option', { name: 'Capítulo' }));
  expect(saved.mock.lastCall?.[0].publicationPolicy).toEqual({ version: 1, unit: 'chapter' });
  await userEvent.click(screen.getByLabelText('Unidade de publicação do contrato'));
  await userEvent.click(await screen.findByRole('option', { name: 'Sem unidade definida' }));
  expect(saved.mock.lastCall?.[0]).not.toHaveProperty('publicationPolicy');
  expect(screen.getByLabelText('Premissa')).toHaveValue('Uma carta chega tarde.');
});

it('author explicitly requires publication and preserves it between chapter and act without losing prose', async () => {
  const changed = vi.fn<(contract: EditorialContract) => void>();
  function Form() {
    const [value, setValue] = useState<EditorialContract>();
    return (
      <EditorialProposalFields
        value={value}
        disabled={false}
        onChange={(next) => {
          setValue(next);
          changed(next);
        }}
      />
    );
  }
  render(<Form />);
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar direção editorial' }));
  await userEvent.type(screen.getByLabelText('Premissa'), 'A carta muda a casa.');
  await userEvent.click(screen.getByLabelText('Unidade de publicação do contrato'));
  await userEvent.click(await screen.findByRole('option', { name: 'Capítulo' }));
  await userEvent.click(screen.getByLabelText('Publicação antes de avançar o ciclo'));
  await userEvent.click(
    await screen.findByRole('option', { name: 'Exigir publicação da unidade anterior' }),
  );
  expect(changed.mock.calls.at(-1)?.[0].publicationPolicy).toEqual({
    version: 1,
    unit: 'chapter',
    requirePreviousPublication: true,
  });
  await userEvent.click(screen.getByLabelText('Unidade de publicação do contrato'));
  await userEvent.click(await screen.findByRole('option', { name: 'Ato' }));
  expect(changed.mock.calls.at(-1)?.[0].publicationPolicy).toEqual({
    version: 1,
    unit: 'act',
    requirePreviousPublication: true,
  });
  expect(screen.getByLabelText('Premissa')).toHaveValue('A carta muda a casa.');
  await userEvent.click(screen.getByLabelText('Unidade de publicação do contrato'));
  await userEvent.click(await screen.findByRole('option', { name: 'Livro inteiro' }));
  expect(changed.mock.calls.at(-1)?.[0].publicationPolicy).toEqual({ version: 1, unit: 'book' });
  expect(screen.queryByLabelText('Publicação antes de avançar o ciclo')).not.toBeInTheDocument();
  expect(screen.getByText(/Livro inteiro não exige publicação predecessora/)).toBeInTheDocument();
});
