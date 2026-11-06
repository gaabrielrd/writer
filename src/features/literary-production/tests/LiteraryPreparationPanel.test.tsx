import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryPreparationPanel } from '../components/LiteraryPreparationPanel';
import { listLiteraryReferences } from '../services/literaryPlanningService';
import * as preparationApi from '../services/literaryPreparationService';
import {
  getLiteraryPreparationContext,
  getLiteraryPreparationGate,
  saveLiteraryPreparationGate,
  type PreparationContext,
} from '../services/literaryPreparationService';
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'author' } }) }));
vi.mock('../services/literaryPlanningService', () => ({ listLiteraryReferences: vi.fn() }));
vi.mock('../components/LiteraryReviewPanel', () => ({ LiteraryReviewPanel: () => null }));
vi.mock('../components/LiteraryProsePanel', () => ({ LiteraryProsePanel: () => null }));
vi.mock('../components/WritingSourcePicker', () => ({
  WritingSourcePicker: ({
    onChange,
    disabled,
  }: {
    onChange: (ids: string[]) => void;
    disabled: boolean;
  }) => (
    <button disabled={disabled} onClick={() => onChange(['brief', 'scenes', 'world'])}>
      Escolher pacote do capítulo
    </button>
  ),
}));
vi.mock('../services/literaryPreparationService', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../services/literaryPreparationService')>();
  return {
    ...actual,
    getLiteraryPreparationContext: vi.fn(),
    getLiteraryPreparationGate: vi.fn(),
    saveLiteraryPreparationGate: vi.fn(),
    listLiteraryPreparationGateVersions: vi.fn(),
  };
});
const context = (): PreparationContext => ({
  snapshot: {
    version: 1,
    stateToken: 'a'.repeat(64),
    mode: 'chat',
    instruction: 'Preserve o POV.',
    manifest: {
      version: 1,
      target: { kind: 'book', id: 'book' },
      resource: { kind: 'chapter', id: 'chapter' },
      bookToken: 'b'.repeat(64),
      selection: 'explicit',
      contractRevision: 1,
      planIds: ['brief', 'scenes', 'world'],
      plans: [],
      references: [],
    },
    documents: [],
    coverage: {
      scope: 'selected-editorial-sources',
      completeForSelection: true,
      wholeBook: false,
      omittedFields: [],
    },
  },
  documents: [
    { id: 'plan:brief', label: 'Ficha da carta', revision: 1, text: 'A carta muda a confiança.' },
  ],
  criteria: {},
});
beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(listLiteraryReferences).mockResolvedValue({
    items: [
      {
        label: 'A carta',
        reference: {
          kind: 'chapter',
          id: 'chapter',
          scopeId: null,
          sourceToken: 'c'.repeat(64),
          revision: 1,
          purpose: 'subject',
        },
      },
    ],
    nextAfterId: null,
  });
  vi.mocked(getLiteraryPreparationContext).mockResolvedValue(context());
  vi.mocked(getLiteraryPreparationGate).mockResolvedValue(null);
});
async function selectChapter(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: 'Consultar capítulos' }));
  await user.click(await screen.findByRole('combobox', { name: 'Capítulo em preparação' }));
  await user.click(await screen.findByRole('option', { name: 'A carta' }));
  await user.click(screen.getByRole('button', { name: 'Escolher pacote do capítulo' }));
  await user.click(screen.getByRole('button', { name: 'Capturar fontes da preparação' }));
  await screen.findByLabelText('Observações e próximo passo');
}
it('keeps preparation pending without inventing author acceptance and preserves the exact uncertain request', async () => {
  const user = userEvent.setup();
  vi.mocked(saveLiteraryPreparationGate)
    .mockRejectedValueOnce(new Error('Resposta incerta'))
    .mockResolvedValueOnce({ chapterId: 'chapter', revision: 1, updatedAt: 400 });
  render(<LiteraryPreparationPanel bookId="book" />);
  await selectChapter(user);
  await user.type(
    screen.getByLabelText('Observações e próximo passo'),
    'Conferir a travessia antes de escrever.',
  );
  await user.click(screen.getByRole('button', { name: 'Salvar verificação e evidências' }));
  await user.click(await screen.findByRole('button', { name: 'Recuperar o mesmo salvamento' }));
  await waitFor(() => expect(saveLiteraryPreparationGate).toHaveBeenCalledTimes(2));
  const [first, second] = vi.mocked(saveLiteraryPreparationGate).mock.calls;
  if (!first) throw new Error('Salvamento não registrado.');
  expect(first).toEqual(second);
  expect(first[0].gate.authorAccepted).toBe(false);
  expect(first[0].gate.criteria.every((item) => item.result === 'gap')).toBe(true);
  expect(first[0].gate.notes).toBe('Conferir a travessia antes de escrever.');
  expect(first[1]).toBe('author');
});
it('a failed recapture preserves authored observations and evidence for correction', async () => {
  const user = userEvent.setup();
  render(<LiteraryPreparationPanel bookId="book" />);
  await selectChapter(user);
  await user.type(
    screen.getByLabelText('Observações e próximo passo'),
    'Atravessar na maré baixa.',
  );
  vi.mocked(getLiteraryPreparationContext).mockRejectedValueOnce(new Error('Uma fonte mudou.'));
  await user.click(screen.getByRole('button', { name: 'Capturar fontes da preparação' }));
  await screen.findByText('Uma fonte mudou.');
  expect(screen.getByLabelText('Observações e próximo passo')).toHaveValue(
    'Atravessar na maré baixa.',
  );
  expect(saveLiteraryPreparationGate).not.toHaveBeenCalled();
});
it('records explicit criterion assessments, literal evidence and author acceptance together', async () => {
  vi.mocked(saveLiteraryPreparationGate).mockResolvedValue({
    chapterId: 'chapter',
    revision: 1,
    updatedAt: 1,
  });
  render(<LiteraryPreparationPanel bookId="book" />);
  await selectChapter(userEvent.setup());
  for (const label of Object.values(preparationApi.LITERARY_GATE_CRITERIA)) {
    const result = screen.getByLabelText('Resultado: ' + label);
    const section = within(result.closest('section')!);
    await userEvent.click(result);
    await userEvent.click(screen.getByRole('option', { name: 'Atendido' }));
    fireEvent.change(section.getByLabelText('Justificativa, correção ou pendência'), {
      target: { value: `Conferi: ${label}` },
    });
    fireEvent.click(section.getByRole('button', { name: 'Adicionar evidência' }));
    await userEvent.click(section.getByLabelText('Fonte da evidência'));
    await userEvent.click(screen.getByRole('option', { name: 'Ficha da carta' }));
    fireEvent.change(section.getByLabelText('Citação literal da fonte'), {
      target: { value: 'A carta muda a confiança.' },
    });
  }
  const first = within(
    screen.getByLabelText('Resultado: Função singular e transformação').closest('section')!,
  );
  fireEvent.click(first.getByRole('button', { name: 'Remover evidência' }));
  fireEvent.click(first.getByRole('button', { name: 'Adicionar evidência' }));
  fireEvent.change(first.getByLabelText('Citação literal da fonte'), {
    target: { value: 'A carta muda a confiança.' },
  });
  await userEvent.click(screen.getByRole('combobox', { name: 'Aceite autoral da preparação' }));
  await userEvent.click(screen.getByRole('option', { name: 'Aceito esta preparação' }));
  fireEvent.change(screen.getByLabelText('Observações e próximo passo'), {
    target: { value: 'Conferência concluída pelo autor.' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Salvar verificação e evidências' }));
  await waitFor(() => expect(saveLiteraryPreparationGate).toHaveBeenCalledOnce());
  const input = vi.mocked(saveLiteraryPreparationGate).mock.calls[0]![0];
  expect(input.gate.authorAccepted).toBe(true);
  expect(input.gate.criteria).toHaveLength(14);
  expect(
    input.gate.criteria.every(
      (item) =>
        item.result === 'pass' &&
        item.rationale.startsWith('Conferi:') &&
        item.evidence[0]?.quote === 'A carta muda a confiança.',
    ),
  ).toBe(true);
  expect(input.stateToken).toBe(context().snapshot.stateToken);
  await screen.findByText(/Verificação salva na revisão 1/);
});

it('compares historical preparation without replacing the saved baseline or the author draft', async () => {
  const gate: preparationApi.LiteraryGate = {
    criteria: Object.keys(preparationApi.LITERARY_GATE_CRITERIA).map((id) => ({
      id,
      result: 'gap',
      rationale: 'Pendência anterior',
      evidence: [{ documentId: 'plan:brief', quote: 'A carta muda a confiança.' }],
    })),
    notes: 'Notas antigas',
    authorAccepted: false,
  };
  const saved: preparationApi.PreparationGateState = {
    schemaVersion: 1,
    chapterId: 'chapter',
    revision: 2,
    updatedAt: 2,
    stateToken: context().snapshot.stateToken,
    manifest: context().snapshot.manifest,
    gate,
    ready: false,
    authorAccepted: false,
    assessment: 'author',
    current: true,
    recordedReady: false,
    recordedAuthorAccepted: false,
  };
  vi.mocked(getLiteraryPreparationGate).mockImplementation((_book, _chapter, revision) =>
    Promise.resolve({ ...saved, revision: revision ?? saved.revision }),
  );
  vi.mocked(preparationApi.listLiteraryPreparationGateVersions)
    .mockResolvedValueOnce({
      items: [{ chapterId: 'chapter', revision: 2, updatedAt: 2 }],
      nextBeforeRevision: 2,
    })
    .mockResolvedValueOnce({
      items: [{ chapterId: 'chapter', revision: 1, updatedAt: 1 }],
      nextBeforeRevision: null,
    });
  render(<LiteraryPreparationPanel bookId="book" />);
  await selectChapter(userEvent.setup());
  fireEvent.change(screen.getByLabelText('Observações e próximo passo'), {
    target: { value: 'Rascunho a descartar' },
  });
  await userEvent.click(
    screen.getByRole('button', { name: 'Descartar alterações da verificação' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Consultar verificação salva' }));
  await screen.findByText('Verificação salva carregada. Capture as fontes para editar.');
  await userEvent.click(screen.getByRole('button', { name: 'Consultar histórico da preparação' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Versões anteriores' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Ver revisão 1' }));
  const historical = await screen.findByRole('region', { name: 'Verificação histórica' });
  expect(within(historical).getAllByText('Pendência anterior')).toHaveLength(14);
  expect(within(historical).getAllByText('A carta muda a confiança.')).toHaveLength(14);
  expect(getLiteraryPreparationGate).toHaveBeenLastCalledWith('book', 'chapter', 1);
  expect(saveLiteraryPreparationGate).not.toHaveBeenCalled();
});

it('paginates chapter choices without producing preparation or overwriting a dirty draft', async () => {
  const first = await vi.mocked(listLiteraryReferences).getMockImplementation()!('book', 'chapter');
  vi.mocked(listLiteraryReferences)
    .mockResolvedValueOnce({ ...first, nextAfterId: 'cursor' })
    .mockResolvedValueOnce({ items: [], nextAfterId: null });
  render(<LiteraryPreparationPanel bookId="book" />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar capítulos' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mais capítulos' }));
  await waitFor(() =>
    expect(listLiteraryReferences).toHaveBeenLastCalledWith('book', 'chapter', 'cursor', 'subject'),
  );
  expect(getLiteraryPreparationContext).not.toHaveBeenCalled();
  expect(saveLiteraryPreparationGate).not.toHaveBeenCalled();
});
