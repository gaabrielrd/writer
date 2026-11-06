import { beforeEach, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ContractInferencePanel } from '../components/ContractInferencePanel';
import { editorialFields, type EditorialContract } from '../model/editorial';
import type { LiteraryProposalResponse, StartLiteraryProposal } from '../model/proposal';
const transport = vi.hoisted(() => ({
  invoke: vi.fn<(method: string, input: unknown) => Promise<unknown>>(),
}));
vi.mock('@/shared/api/domainCallable', () => ({
  getFunctions: vi.fn(),
  httpsCallable: (_fn: unknown, name: string) => (input: unknown) =>
    transport.invoke(name, input).then((data) => ({ data })),
}));
vi.mock('@/shared/lib', async (original) => ({
  ...(await original<typeof import('@/shared/lib')>()),
  getFirebaseApp: vi.fn(),
}));
const contract: EditorialContract = {
  schemaVersion: 1,
  fields: Object.fromEntries(
    Object.keys(editorialFields).map((key) => [
      key,
      key === 'premise' ? 'Uma carta transforma a confiança.' : '',
    ]),
  ) as EditorialContract['fields'],
  decisions: [
    {
      id: 'proposal',
      text: 'Preservar a dúvida.',
      category: 'hypothesis',
      status: 'proposal',
      source: 'chapter',
      supersedes: null,
    },
  ],
};
const completed = (operationId = 'infer-existing-book-001'): LiteraryProposalResponse => ({
  operationId,
  state: 'done',
  result: {
    plan: {
      kind: 'bookOverview',
      title: 'Inferência',
      status: 'proposal',
      fields: {},
      references: [],
    },
    contractProposal: contract,
    rationale: 'A carta orienta o conflito.',
    findings: [
      {
        sourceId: 'chapter',
        quote: 'A carta chegou.',
        problem: 'A intenção permanece incerta.',
        severity: 'warning',
        action: 'Conferir com o autor.',
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
const sent = () => {
  const input = transport.invoke.mock.calls.find(([name]) => name === 'startLiteraryProposal')?.[1];
  if (!input) throw new Error('Nenhuma inferência enviada.');
  return input as StartLiteraryProposal;
};
beforeEach(() => {
  vi.clearAllMocks();
  transport.invoke.mockImplementation((name, input) => {
    if (name === 'listLiteraryReferences')
      return Promise.resolve({
        items: [
          {
            label: 'A carta',
            reference: {
              kind: 'chapter',
              id: 'chapter',
              scopeId: 'book',
              sourceToken: 'a'.repeat(64),
              revision: 2,
              purpose: 'source',
            },
          },
        ],
        nextAfterId: null,
      });
    if (name === 'startLiteraryProposal')
      return Promise.resolve(completed((input as StartLiteraryProposal).operationId));
    if (name === 'getLiteraryProposal')
      return Promise.resolve(completed((input as { operationId: string }).operationId));
    if (name === 'cancelLiteraryProposal')
      return Promise.resolve({
        operationId: (input as { operationId: string }).operationId,
        state: 'canceled',
      });
    if (name === 'listLiteraryProposals')
      return Promise.resolve({
        items: [
          { operationId: 'saved-inference-0001', mode: 'contract', state: 'done', createdAt: 1 },
          { operationId: 'other-proposal-0001', mode: 'propose', state: 'done', createdAt: 2 },
        ],
        nextAfterId: null,
      });
    return Promise.reject(new Error('Método inesperado: ' + name));
  });
});
const mount = async (captureGeneration?: () => unknown) => {
  const onUse = vi.fn();
  render(
    <ContractInferencePanel
      bookId="book"
      revision={3}
      disabled={false}
      onUse={onUse}
      captureGeneration={captureGeneration}
    />,
  );
  await userEvent.click(
    screen.getByText('Recuperar a direção editorial a partir de uma obra existente'),
  );
  return onUse;
};
const select = async () => {
  await userEvent.click(screen.getByRole('button', { name: 'Consultar fontes' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Incluir A carta' }));
};
it('requires explicit sources and leaves AI hypotheses as proposals until the author explicitly applies the rechecked result', async () => {
  const capture = vi.fn(() => ({ model: 'frozen-model' })),
    onUse = await mount(capture);
  expect(screen.getByRole('button', { name: 'Propor direção editorial' })).toBeDisabled();
  await select();
  fireEvent.change(screen.getByLabelText('Orientação para inferir o contrato'), {
    target: { value: 'Identifique somente lacunas.' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Propor direção editorial' }));
  await screen.findByRole('heading', { name: 'Direção editorial proposta' });
  expect(onUse).not.toHaveBeenCalled();
  expect(screen.getByText('Preservar a dúvida. · Proposta da IA')).toBeInTheDocument();
  expect(screen.getByText('A carta chegou.')).toBeInTheDocument();
  expect(sent()).toMatchObject({
    target: { kind: 'book', id: 'book' },
    mode: 'contract',
    expectedRevision: 3,
    instruction: 'Identifique somente lacunas.',
    generation: { model: 'frozen-model' },
    plan: { status: 'proposal', references: [{ id: 'chapter', revision: 2, purpose: 'source' }] },
  });
  expect(capture).toHaveBeenCalledOnce();
  await userEvent.click(
    screen.getByRole('button', { name: 'Adicionar propostas às lacunas do rascunho' }),
  );
  await waitFor(() => expect(onUse).toHaveBeenCalledWith(contract));
  expect(transport.invoke).toHaveBeenCalledWith('getLiteraryProposal', {
    target: { kind: 'book', id: 'book' },
    operationId: sent().operationId,
  });
});
it('a source change discovered during final inspection blocks applying the previously displayed inference', async () => {
  const onUse = await mount();
  await select();
  await userEvent.click(screen.getByRole('button', { name: 'Propor direção editorial' }));
  await screen.findByRole('heading', { name: 'Direção editorial proposta' });
  transport.invoke.mockResolvedValueOnce({ operationId: sent().operationId, state: 'stale' });
  await userEvent.click(
    screen.getByRole('button', { name: 'Adicionar propostas às lacunas do rascunho' }),
  );
  await screen.findByText('As fontes mudaram. Confira-as antes de inferir novamente.');
  expect(onUse).not.toHaveBeenCalled();
  expect(
    transport.invoke.mock.calls.filter(([name]) => name === 'startLiteraryProposal'),
  ).toHaveLength(1);
});
it('cancellation fences a held producer and its late completion cannot revive or apply the discarded proposal', async () => {
  let resolve!: (response: LiteraryProposalResponse) => void;
  const held = new Promise<LiteraryProposalResponse>((done) => {
    resolve = done;
  });
  const onUse = await mount();
  await select();
  transport.invoke.mockReturnValueOnce(held);
  await userEvent.click(screen.getByRole('button', { name: 'Propor direção editorial' }));
  const id = sent().operationId;
  await userEvent.click(
    await screen.findByRole('button', { name: 'Cancelar inferência pendente' }),
  );
  await screen.findByText('Inferência cancelada.');
  await act(async () => {
    resolve(completed(id));
    await held;
  });
  expect(
    screen.queryByRole('heading', { name: 'Direção editorial proposta' }),
  ).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Propor direção editorial' })).not.toBeDisabled();
  expect(onUse).not.toHaveBeenCalled();
  expect(transport.invoke).toHaveBeenCalledWith('cancelLiteraryProposal', {
    target: { kind: 'book', id: 'book' },
    operationId: id,
  });
});
it('lost generation acknowledgement is recovered by status without a second model request and history excludes other proposal modes', async () => {
  await mount();
  await select();
  transport.invoke.mockRejectedValueOnce(new Error('Resposta perdida'));
  await userEvent.click(screen.getByRole('button', { name: 'Propor direção editorial' }));
  await screen.findByText('Resposta perdida');
  await userEvent.click(screen.getByRole('button', { name: 'Consultar inferência pendente' }));
  await screen.findByRole('heading', { name: 'Direção editorial proposta' });
  expect(
    transport.invoke.mock.calls.filter(([name]) => name === 'startLiteraryProposal'),
  ).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar inferências anteriores' }));
  const history = await screen.findAllByRole('button', { name: /^Consultar inferência de / });
  expect(history).toHaveLength(1);
  const first = history[0];
  if (!first) throw new Error('Histórico ausente.');
  await userEvent.click(first);
  expect(transport.invoke).toHaveBeenCalledWith('getLiteraryProposal', {
    target: { kind: 'book', id: 'book' },
    operationId: 'saved-inference-0001',
  });
});
