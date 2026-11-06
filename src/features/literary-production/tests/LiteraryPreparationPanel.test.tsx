import { beforeEach, expect, it, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryPreparationPanel } from '../components/LiteraryPreparationPanel';
import { listLiteraryReferences } from '../services/literaryPlanningService';
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
