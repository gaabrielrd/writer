import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryPlanningPanel } from '../components/LiteraryPlanningPanel';
import type {
  LiteraryPlanState,
  LiteraryPlanPage,
  LiteraryReference,
  SaveLiteraryPlan,
} from '../model/planning';
import { listLiteraryPendingOperations } from '../services/literaryRecoveryStorage';
const transport = vi.hoisted(() => ({
  invoke: vi.fn<(method: string, input: unknown) => Promise<unknown>>(),
}));
const actor = vi.hoisted(() => ({ uid: 'author' }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: actor.uid } }) }));
vi.mock('@/shared/api/domainCallable', () => ({
  getFunctions: vi.fn(),
  httpsCallable: (_functions: unknown, method: string) => (input: unknown) =>
    transport.invoke(method, input).then((data) => ({ data })),
}));
vi.mock('@/shared/lib', async (original) => ({
  ...(await original<typeof import('@/shared/lib')>()),
  getFirebaseApp: vi.fn(),
}));
vi.mock('../components/LiteraryProposalPanel', () => ({ LiteraryProposalPanel: () => null }));
const reference = (revision = 1): LiteraryReference => ({
  kind: 'chapter',
  id: 'chapter',
  scopeId: 'book',
  sourceToken: String(revision).repeat(64),
  revision,
  purpose: 'source',
});
const state = (revision = 1): LiteraryPlanState => ({
  schemaVersion: 1,
  id: 'brief',
  revision,
  createdAt: 1,
  updatedAt: revision,
  plan: {
    kind: 'chapterBrief',
    title: 'A carta',
    status: 'approved',
    fields: { objective: 'A carta transforma a confiança.', ending: 'Uma escolha.' },
    references: [reference()],
  },
  sources: [
    {
      reference: reference(),
      currentReference: reference(2),
      label: 'Capítulo da carta',
      available: true,
      changed: true,
    },
  ],
});
const page: LiteraryPlanPage = {
  schema: {
    bookOverview: { label: 'Visão do livro', fields: { premise: 'Premissa' } },
    chapterBrief: {
      label: 'Ficha de capítulo',
      fields: { objective: 'Objetivo', ending: 'Encerramento' },
    },
  },
  items: [{ id: 'brief', title: 'A carta', kind: 'chapterBrief', status: 'approved', revision: 1 }],
  nextAfterId: null,
  projectUpdatedAt: 1,
};
const request = () => {
  const call = transport.invoke.mock.calls.find(([method]) => method === 'saveLiteraryPlan');
  if (!call) throw new Error('O documento não foi enviado.');
  return call[1] as SaveLiteraryPlan;
};
beforeEach(() => {
  vi.clearAllMocks();
  actor.uid = 'author';
  localStorage.clear();
  transport.invoke.mockImplementation((method, input) => {
    if (method === 'listLiteraryPlans') return Promise.resolve(structuredClone(page));
    if (method === 'getLiteraryPlan') return Promise.resolve(state());
    if (method === 'listLiteraryPlanVersions')
      return Promise.resolve({
        items: [{ id: 'brief', revision: 1, updatedAt: 1 }],
        nextBeforeRevision: null,
      });
    if (method === 'getLiteraryPlanVersion')
      return Promise.resolve({
        ...state(),
        plan: { ...state().plan, fields: { objective: 'Intenção antiga.', ending: '' } },
      });
    if (method === 'listLiteraryReferences')
      return Promise.resolve({
        items: [{ reference: { ...reference(), purpose: 'subject' }, label: 'Capítulo da carta' }],
        nextAfterId: null,
      });
    if (method === 'saveLiteraryPlan') {
      const value = input as SaveLiteraryPlan;
      return Promise.resolve({ id: value.id, revision: value.expectedRevision + 1, updatedAt: 3 });
    }
    return Promise.reject(new Error('Método inesperado: ' + method));
  });
});
const mount = () => {
  const onWorkChange = vi.fn();
  render(<LiteraryPlanningPanel bookId="book" onWorkChange={onWorkChange} />);
  return onWorkChange;
};
const open = async () => userEvent.click(await screen.findByRole('button', { name: 'A carta' }));
it('reconciles a changed source only in the draft, resets approval, and saves with the original CAS revision', async () => {
  const onWorkChange = mount();
  await open();
  await userEvent.click(
    screen.getByRole('button', { name: 'Usar referência atual e revisar ficha' }),
  );
  expect(screen.getByLabelText('Objetivo')).toHaveValue('A carta transforma a confiança.');
  expect(
    transport.invoke.mock.calls.filter(([method]) => method === 'saveLiteraryPlan'),
  ).toHaveLength(0);
  await waitFor(() =>
    expect(onWorkChange).toHaveBeenLastCalledWith({ dirty: true, pending: false }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Salvar documento' }));
  await screen.findByText('Documento salvo como revisão 2.');
  expect(request()).toMatchObject({
    target: { kind: 'book', id: 'book' },
    id: 'brief',
    expectedRevision: 1,
    plan: { status: 'working', fields: state().plan.fields, references: [reference(2)] },
  });
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
});
it('an uncertain save freezes the form, retains metadata only, and retries the exact same intent', async () => {
  mount();
  await open();
  fireEvent.change(screen.getByLabelText('Objetivo'), {
    target: { value: 'CONTEÚDO PRIVADO DO RASCUNHO' },
  });
  const original = transport.invoke.getMockImplementation();
  if (!original) throw new Error('Transporte indisponível.');
  transport.invoke.mockImplementationOnce((method, input) =>
    method === 'saveLiteraryPlan'
      ? Promise.reject(new Error('Resposta perdida'))
      : original(method, input),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Salvar documento' }));
  await screen.findByText('Resposta perdida');
  expect(screen.getByLabelText('Objetivo')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Fechar rascunho sem salvar' })).toBeDisabled();
  const first = structuredClone(request()),
    pending = listLiteraryPendingOperations('author', 'book');
  expect(pending).toHaveLength(1);
  expect(pending[0]).toMatchObject({
    actorId: 'author',
    bookId: 'book',
    id: 'brief',
    expectedRevision: 1,
  });
  expect(JSON.stringify(pending)).not.toContain('CONTEÚDO PRIVADO');
  await userEvent.click(screen.getByRole('button', { name: 'Recuperar salvamento' }));
  await screen.findByText('Documento salvo como revisão 2.');
  expect(
    transport.invoke.mock.calls
      .filter(([method]) => method === 'saveLiteraryPlan')
      .map(([, input]) => input),
  ).toEqual([first, first]);
  expect(listLiteraryPendingOperations('author', 'book')).toEqual([]);
});
it('comparison and historical inspection preserve the draft until explicit replacement', async () => {
  mount();
  await open();
  fireEvent.change(screen.getByLabelText('Objetivo'), {
    target: { value: 'Minha intenção atual.' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Comparar com servidor' }));
  const comparison = await screen.findByRole('region', { name: 'Comparação com documento salvo' });
  expect(within(comparison).getByText('A carta transforma a confiança.')).toBeInTheDocument();
  expect(screen.getByLabelText('Objetivo')).toHaveValue('Minha intenção atual.');
  await userEvent.click(screen.getByRole('button', { name: 'Manter rascunho' }));
  await userEvent.click(screen.getByRole('button', { name: 'Consultar versões' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Consultar revisão 1' }));
  const history = await screen.findByRole('region', { name: 'Planejamento histórico' });
  expect(within(history).getByText('Intenção antiga.')).toBeInTheDocument();
  expect(screen.getByLabelText('Objetivo')).toHaveValue('Minha intenção atual.');
  await userEvent.click(screen.getByRole('button', { name: 'Fechar consulta' }));
  await userEvent.click(screen.getByRole('button', { name: 'Comparar com servidor' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Descartar rascunho e abrir este documento' }),
  );
  expect(screen.getByLabelText('Objetivo')).toHaveValue('A carta transforma a confiança.');
  expect(
    transport.invoke.mock.calls.filter(([method]) => method === 'saveLiteraryPlan'),
  ).toHaveLength(0);
});
it('new architecture uses explicit native subject links and never treats a linked chapter as read prose', async () => {
  mount();
  await screen.findByRole('button', { name: 'A carta' });
  await userEvent.click(screen.getByRole('button', { name: 'Preparar documento' }));
  fireEvent.change(screen.getByLabelText('Título do documento'), {
    target: { value: 'Visão da obra' },
  });
  fireEvent.change(screen.getByLabelText('Premissa'), { target: { value: 'O custo de confiar.' } });
  await userEvent.click(screen.getByRole('button', { name: 'Consultar referências' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Vincular Capítulo da carta' }));
  expect(screen.getByRole('button', { name: 'Vincular Capítulo da carta' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Salvar documento' }));
  await screen.findByText('Documento salvo como revisão 1.');
  expect(request()).toMatchObject({
    expectedRevision: 0,
    plan: {
      kind: 'bookOverview',
      status: 'working',
      fields: { premise: 'O custo de confiar.' },
      references: [{ ...reference(), purpose: 'subject' }],
    },
  });
  expect(transport.invoke).toHaveBeenCalledWith('listLiteraryReferences', {
    target: { kind: 'book', id: 'book' },
    kind: 'chapter',
    purpose: 'subject',
    afterId: null,
    limit: 25,
  });
});

it('selects and paginates an explicitly owned volume, preserving book and native unit identity in a saved plan', async () => {
  const user = userEvent.setup();
  const original = transport.invoke.getMockImplementation()!;
  const volumeRef: LiteraryReference = {
    kind: 'volumeUnit',
    id: JSON.stringify(['volume-a', 'chapter', 'same']),
    scopeId: 'volume-a',
    purpose: 'source',
    sourceToken: 'a'.repeat(64),
    revision: 10,
  };
  transport.invoke.mockImplementation((method, input) => {
    if (method === 'listLiteraryVolumeBooks')
      return Promise.resolve({
        items: [{ id: 'volume-a', title: 'O primeiro porto' }],
        nextAfterId: null,
      });
    if (method === 'listLiteraryReferences' && (input as { kind: string }).kind === 'volumeUnit')
      return Promise.resolve({
        items: [{ reference: volumeRef, label: 'O primeiro porto · Capítulo · A carta' }],
        nextAfterId: null,
      });
    return original(method, input);
  });
  mount();
  await open();
  await user.click(screen.getByRole('combobox', { name: 'Origem da referência' }));
  await user.click(screen.getByRole('option', { name: 'Unidade de outro volume' }));
  expect(screen.getByRole('combobox', { name: 'Tipo de vínculo' })).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Consultar referências' })).toBeDisabled();
  await user.click(screen.getByRole('button', { name: 'Consultar meus volumes' }));
  await user.click(await screen.findByRole('combobox', { name: 'Volume de origem' }));
  await user.click(screen.getByRole('option', { name: /O primeiro porto/ }));
  await user.click(screen.getByRole('button', { name: 'Consultar referências' }));
  expect(transport.invoke).toHaveBeenCalledWith(
    'listLiteraryReferences',
    expect.objectContaining({
      target: { kind: 'book', id: 'book' },
      kind: 'volumeUnit',
      sourceBookId: 'volume-a',
      unitKind: 'chapter',
      purpose: 'source',
    }),
  );
  await user.click(
    await screen.findByRole('button', { name: 'Vincular O primeiro porto · Capítulo · A carta' }),
  );
  await user.click(screen.getByRole('button', { name: 'Salvar documento' }));
  await screen.findByText('Documento salvo como revisão 2.');
  expect(request().plan.references).toContainEqual(volumeRef);
  expect(screen.getByLabelText('Objetivo')).toHaveValue('A carta transforma a confiança.');
});
it('does not expose a delayed private volume list after the authenticated account changes', async () => {
  const user = userEvent.setup();
  const original = transport.invoke.getMockImplementation()!;
  let release!: (value: unknown) => void;
  transport.invoke.mockImplementation((method, input) => {
    if (method === 'listLiteraryVolumeBooks')
      return new Promise((done) => {
        release = done;
      });
    if (method === 'listLiteraryPlans' && actor.uid !== 'author')
      return Promise.reject(new Error('Projeto indisponível.'));
    return original(method, input);
  });
  const { rerender } = render(<LiteraryPlanningPanel bookId="book" />);
  await open();
  await user.click(screen.getByRole('combobox', { name: 'Origem da referência' }));
  await user.click(screen.getByRole('option', { name: 'Unidade de outro volume' }));
  await user.click(screen.getByRole('button', { name: 'Consultar meus volumes' }));
  actor.uid = 'other';
  rerender(<LiteraryPlanningPanel bookId="book" />);
  release({ items: [{ id: 'private-source', title: 'Private former volume' }], nextAfterId: null });
  await screen.findAllByText('Projeto indisponível.');
  expect(screen.queryByText(/Private former volume/)).not.toBeInTheDocument();
  expect(screen.queryByRole('combobox', { name: 'Volume de origem' })).not.toBeInTheDocument();
});
