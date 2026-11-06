import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { LiteraryProposalPanel } from '../components/LiteraryProposalPanel';
import type { LiteraryPlan } from '../model/planning';
import type { LiteraryProposalResponse } from '../model/proposal';
import * as api from '../services/literaryProposalService';
vi.mock('../services/literaryProposalService', () => ({
  startLiteraryProposal: vi.fn(),
  cancelLiteraryProposal: vi.fn(),
  getLiteraryProposal: vi.fn(),
  listLiteraryProposals: vi.fn(),
}));
const draft: LiteraryPlan = {
  kind: 'chapterBrief',
  title: 'A carta',
  status: 'working',
  fields: { objective: 'Revelar a carta' },
  references: [],
};
const completed = (): LiteraryProposalResponse => ({
  operationId: 'proposal',
  state: 'done',
  inputPlan: structuredClone(draft),
  sources: [{ id: 'plan:support', label: 'Visão do livro', revision: 2 }],
  generation: { effective: { model: 'modelo congelado' } },
  result: {
    plan: {
      ...draft,
      fields: { objective: 'Revelar a carta e sua consequência' },
      status: 'proposal',
    },
    rationale: 'Proposta para o autor conferir',
    findings: [
      {
        sourceId: 'plan:support',
        quote: 'A carta',
        problem: 'Conferir a consequência',
        severity: 'warning',
        action: 'Comparar com a cena',
      },
    ],
    coverage: {
      scope: 'selected-sources',
      completeForSelection: true,
      wholeBook: false,
      documentCount: 1,
    },
  },
});
function mount() {
  const onUse = vi.fn(),
    captureGeneration = vi.fn(() => ({ frozen: true }));
  render(
    <LiteraryProposalPanel
      bookId="book"
      draft={draft}
      revision={3}
      schema={{ chapterBrief: { label: 'Ficha', fields: { objective: 'Objetivo' } } }}
      plans={[
        {
          id: 'support',
          title: 'Visão do livro',
          kind: 'bookOverview',
          revision: 2,
          status: 'approved',
        },
      ]}
      disabled={false}
      captureGeneration={captureGeneration}
      onUse={onUse}
    />,
  );
  return { onUse, captureGeneration };
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(api.startLiteraryProposal).mockResolvedValue(completed());
  vi.mocked(api.getLiteraryProposal).mockResolvedValue(completed());
});
it('freezes the authored draft, instructions and explicit sources before generating and applies only after a fresh check', async () => {
  const f = mount();
  expect(api.startLiteraryProposal).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('combobox', { name: 'Planejamento de apoio' }));
  await userEvent.click(screen.getByRole('option', { name: 'Visão do livro' }));
  await userEvent.click(screen.getByRole('button', { name: 'Incluir como fonte' }));
  await userEvent.click(screen.getByRole('button', { name: 'Remover fonte' }));
  await userEvent.click(screen.getByRole('combobox', { name: 'Planejamento de apoio' }));
  await userEvent.click(screen.getByRole('option', { name: 'Visão do livro' }));
  await userEvent.click(screen.getByRole('button', { name: 'Incluir como fonte' }));
  fireEvent.change(screen.getByLabelText('Orientação para esta análise'), {
    target: { value: 'Preservar o mistério' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Gerar proposta' }));
  await screen.findByText('Proposta para o autor conferir');
  expect(screen.getByText('Conferir a consequência')).toBeVisible();
  expect(f.onUse).not.toHaveBeenCalled();
  expect(api.startLiteraryProposal).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      target: { kind: 'book', id: 'book' },
      plan: draft,
      expectedRevision: 3,
      sourcePlanIds: ['support'],
      instruction: 'Preservar o mistério',
      generation: { frozen: true },
      mode: 'propose',
    }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Usar proposta no rascunho' }));
  await waitFor(() => expect(f.onUse).toHaveBeenCalledExactlyOnceWith(completed().result!.plan));
  expect(api.getLiteraryProposal).toHaveBeenCalledExactlyOnceWith('book', 'proposal');
});
it('lists and paginates historical analyses without producing or accepting anything', async () => {
  vi.mocked(api.listLiteraryProposals)
    .mockResolvedValueOnce({
      items: [{ operationId: 'old', state: 'done', createdAt: 1, mode: 'audit' }],
      nextAfterId: 'cursor',
    })
    .mockResolvedValueOnce({ items: [], nextAfterId: null });
  const f = mount();
  await userEvent.click(screen.getByRole('button', { name: 'Consultar análises anteriores' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mais análises' }));
  await waitFor(() => expect(api.listLiteraryProposals).toHaveBeenLastCalledWith('book', 'cursor'));
  await userEvent.click(screen.getByRole('button', { name: /^Consultar análise de/ }));
  await screen.findByText('Proposta para o autor conferir');
  expect(api.getLiteraryProposal).toHaveBeenCalledWith('book', 'old');
  expect(api.startLiteraryProposal).not.toHaveBeenCalled();
  expect(f.onUse).not.toHaveBeenCalled();
});
it('queries an uncertain generation and never turns the consultation into another generation', async () => {
  vi.mocked(api.startLiteraryProposal).mockRejectedValueOnce(new Error('Resultado incerto'));
  vi.mocked(api.getLiteraryProposal)
    .mockResolvedValueOnce({ operationId: 'pending', state: 'unconfirmed' })
    .mockResolvedValueOnce(completed());
  mount();
  await userEvent.click(screen.getByRole('button', { name: 'Auditar planejamento' }));
  await screen.findByText('Resultado incerto');
  expect(screen.getByRole('button', { name: 'Gerar proposta' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Consultar resultado pendente' }));
  await screen.findByText(/A consulta não reenvia a geração/);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar resultado pendente' }));
  await screen.findByText('Proposta para o autor conferir');
  expect(api.startLiteraryProposal).toHaveBeenCalledOnce();
  expect(vi.mocked(api.startLiteraryProposal).mock.calls[0]![0].mode).toBe('audit');
});
it('fences a canceled producer so a late proposal cannot reappear', async () => {
  let finish!: (value: LiteraryProposalResponse) => void;
  vi.mocked(api.startLiteraryProposal).mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  vi.mocked(api.cancelLiteraryProposal).mockResolvedValue({
    operationId: 'proposal',
    state: 'canceled',
  });
  const f = mount();
  await userEvent.click(screen.getByRole('button', { name: 'Gerar proposta' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Cancelar análise pendente' }));
  await screen.findByText('Análise cancelada. Você pode preparar outro pedido.');
  await act(async () => {
    finish(completed());
    await Promise.resolve();
  });
  expect(screen.queryByRole('region', { name: 'Proposta para revisão' })).not.toBeInTheDocument();
  expect(f.onUse).not.toHaveBeenCalled();
});
it('refuses a proposal whose source became stale during the final authorization', async () => {
  const f = mount();
  await userEvent.click(screen.getByRole('button', { name: 'Gerar proposta' }));
  await screen.findByText('Proposta para o autor conferir');
  vi.mocked(api.getLiteraryProposal).mockResolvedValueOnce({
    operationId: 'proposal',
    state: 'stale',
  });
  await userEvent.click(screen.getByRole('button', { name: 'Usar proposta no rascunho' }));
  await screen.findByText('As fontes mudaram; confira o planejamento antes de gerar novamente.');
  expect(f.onUse).not.toHaveBeenCalled();
});
it('rejects a foreign input draft and leaves definitive request failures editable', async () => {
  vi.mocked(api.startLiteraryProposal)
    .mockRejectedValueOnce(
      Object.assign(new Error('Sem acesso'), { code: 'functions/permission-denied' }),
    )
    .mockResolvedValueOnce(completed());
  const f = mount();
  await userEvent.click(screen.getByRole('button', { name: 'Gerar proposta' }));
  await screen.findByText('Sem acesso');
  expect(screen.getByLabelText('Orientação para esta análise')).toBeEnabled();
  await userEvent.click(screen.getByRole('button', { name: 'Gerar proposta' }));
  await screen.findByText('Proposta para o autor conferir');
  vi.mocked(api.getLiteraryProposal).mockResolvedValueOnce({
    ...completed(),
    inputPlan: { ...draft, title: 'Outro rascunho' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Usar proposta no rascunho' }));
  await screen.findByText(
    'O rascunho mudou depois deste pedido. Compare a proposta com suas alterações.',
  );
  expect(f.onUse).not.toHaveBeenCalled();
});
