import { useState } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { expect, it, vi } from 'vitest';
import { LiteraryProductionPanel } from '../components/LiteraryProductionPanel';

type WorkProps = { onWorkChange?: (value: { dirty: boolean; pending: boolean }) => void };
function DraftChild({ name, onWorkChange }: WorkProps & { name: string }) {
  const [value, setValue] = useState('');
  return (
    <section aria-label={'Painel ' + name}>
      <input
        aria-label={'Rascunho ' + name}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          onWorkChange?.({ dirty: !!event.target.value, pending: false });
        }}
      />
      <button onClick={() => onWorkChange?.({ dirty: false, pending: true })}>
        Aguardar {name}
      </button>
      <button onClick={() => onWorkChange?.({ dirty: false, pending: false })}>
        Concluir {name}
      </button>
    </section>
  );
}
vi.mock('../components/LiteraryDraftGuard', () => ({
  LiteraryDraftGuard: ({ dirty, pending }: { dirty: boolean; pending: boolean }) => (
    <p role="status">
      Proteção: {dirty ? 'rascunho' : 'limpo'} · {pending ? 'pendente' : 'livre'}
    </p>
  ),
}));
vi.mock('../components/LiteraryRecoveryPanel', () => ({
  LiteraryRecoveryPanel: () => <p>Recuperação sempre disponível</p>,
}));
vi.mock('../components/EditorialContractPanel', () => ({
  EditorialContractPanel: (props: WorkProps) => <DraftChild name="contrato" {...props} />,
}));
vi.mock('../components/LiteraryPlanningPanel', () => ({
  LiteraryPlanningPanel: (props: WorkProps) => <DraftChild name="planejamento" {...props} />,
}));
vi.mock('../components/LiteraryPreparationPanel', () => ({
  LiteraryPreparationPanel: (props: WorkProps) => <DraftChild name="preparação" {...props} />,
}));
vi.mock('../components/LiterarySequencePanel', () => ({
  LiterarySequencePanel: (props: WorkProps) => <DraftChild name="sequência" {...props} />,
}));
vi.mock('../components/LiteraryIntegrationPanel', () => ({
  LiteraryIntegrationPanel: (props: WorkProps) => <DraftChild name="integração" {...props} />,
}));
vi.mock('../components/LiteraryProgressPanel', () => ({
  LiteraryProgressPanel: (props: WorkProps) => <DraftChild name="progresso" {...props} />,
}));
vi.mock('../components/LiteraryImpactPanel', () => ({
  LiteraryImpactPanel: (props: WorkProps) => <DraftChild name="impacto" {...props} />,
}));
vi.mock('../components/LiteraryPublicationPanel', () => ({
  LiteraryPublicationPanel: (props: WorkProps) => <DraftChild name="publicação" {...props} />,
}));
vi.mock('../components/LiteraryBookMapPanel', () => ({
  LiteraryBookMapPanel: () => <p>Mapa consultado</p>,
}));

it('mounts other areas only on demand and preserves every unsent draft when switching areas', async () => {
  render(<LiteraryProductionPanel bookId="book" />);
  expect(screen.getByText('Recuperação sempre disponível')).toBeVisible();
  expect(screen.queryByLabelText('Rascunho planejamento')).not.toBeInTheDocument();
  for (const [label, name] of [
    ['Contrato e decisões', 'contrato'],
    ['Planejamento', 'planejamento'],
    ['Preparação do capítulo', 'preparação'],
    ['Sequência de capítulos', 'sequência'],
    ['Integração de atos e livro', 'integração'],
    ['Progresso por artefato', 'progresso'],
    ['Impacto editorial', 'impacto'],
    ['Publicação', 'publicação'],
  ] as const) {
    await userEvent.click(screen.getByRole('button', { name: label }));
    await userEvent.type(screen.getByLabelText('Rascunho ' + name), 'Intenção ' + name);
    expect(screen.getByRole('status')).toHaveTextContent('Proteção: rascunho · livre');
    await userEvent.click(screen.getByRole('button', { name: 'Mapa global do livro' }));
    expect(screen.getByText('Mapa consultado')).toBeVisible();
    await userEvent.click(screen.getByRole('button', { name: label }));
    expect(screen.getByLabelText('Rascunho ' + name)).toHaveValue('Intenção ' + name);
    await userEvent.clear(screen.getByLabelText('Rascunho ' + name));
    await userEvent.click(screen.getByRole('button', { name: 'Aguardar ' + name }));
    expect(screen.getByRole('status')).toHaveTextContent('Proteção: limpo · pendente');
    await userEvent.click(screen.getByRole('button', { name: 'Concluir ' + name }));
    expect(screen.getByRole('status')).toHaveTextContent('Proteção: limpo · livre');
  }
});
it('opens a publication deep link while keeping the contract and recovery available', async () => {
  render(<LiteraryProductionPanel bookId="book" initialView="publication" />);
  expect(screen.getByLabelText('Rascunho publicação')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Publicação' })).toHaveAttribute(
    'aria-pressed',
    'true',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Contrato e decisões' }));
  expect(screen.getByLabelText('Rascunho contrato')).toBeVisible();
  expect(screen.getByText('Recuperação sempre disponível')).toBeVisible();
});
