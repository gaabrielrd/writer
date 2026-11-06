import { beforeEach, describe, it, expect, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { LiteraryProgressPanel } from '../components/LiteraryProgressPanel';
import type { ProgressDetail, ProgressPage } from '../services/literaryProgressService';
import { getLiteraryOperation } from '../services/literaryProductionService';
import userEvent from '@testing-library/user-event';
const api = vi.hoisted(() => ({ list: vi.fn(), get: vi.fn(), save: vi.fn() }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: 'author' } }) }));
vi.mock('../services/literaryProgressService', () => ({
  listLiteraryProgressArtifacts: api.list,
  getLiteraryProgressArtifact: api.get,
  saveLiteraryProgressNote: api.save,
  progressStages: [
    { value: 'planning', label: 'Planejamento' },
    { value: 'review', label: 'Revisão' },
  ],
}));
vi.mock('../services/literaryProductionService', () => ({ getLiteraryOperation: vi.fn() }));
const artifact: ProgressDetail['artifact'] = {
  stage: 'planning',
  id: 'brief',
  collection: 'literaryPlans',
  nativeOrigin: 'a'.repeat(64),
  sourceToken: 'b'.repeat(64),
  noteId: 'c'.repeat(64),
  resource: { kind: 'chapter', id: 'chapter' },
  title: 'A carta',
  kind: 'chapterBrief',
  state: 'approved',
  revision: 2,
  createdAt: 1,
  updatedAt: 10,
  completedAt: null,
  authorAccepted: false,
  preservationState: null,
  versionId: null,
  counters: {},
  active: false,
  sourceCurrentness: 'not-rechecked',
  qualityCertified: false,
  publicationCertified: false,
};
const detail: ProgressDetail = {
  artifact,
  note: {
    id: artifact.noteId,
    revision: 1,
    blockers: [],
    nextStep: 'Conferir cena.',
    updatedAt: 10,
    artifactChanged: false,
  },
};
const page = (title = 'A carta'): ProgressPage => ({
  stage: 'planning',
  items: [
    {
      ...artifact,
      title,
      note: {
        revision: 1,
        updatedAt: 10,
        blockerCount: 0,
        hasNextStep: true,
        artifactChanged: false,
      },
    },
  ],
  nextAfterId: null,
  wholeBookComplete: false,
  sourceCurrentness: 'not-rechecked',
});
beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  api.list.mockReset().mockResolvedValue(page());
  api.get.mockReset().mockResolvedValue(detail);
  api.save
    .mockReset()
    .mockResolvedValue({ ...detail.note, revision: 2, nextStep: 'Rever a escolha.' });
});
async function open() {
  fireEvent.click(await screen.findByRole('button', { name: 'Consultar artefato A carta' }));
  await screen.findByLabelText('Próximo passo');
}
describe('progresso por artefato', () => {
  it('paginates one stage before explicitly selecting another and never treats empty stages as completed', async () => {
    api.list
      .mockResolvedValueOnce({ ...page(), nextAfterId: 'next' })
      .mockResolvedValueOnce({ ...page(), items: [], nextAfterId: null })
      .mockResolvedValueOnce({ ...page(), stage: 'review', items: [] });
    render(<LiteraryProgressPanel bookId="book" />);
    fireEvent.click(await screen.findByRole('button', { name: 'Mais registros' }));
    await waitFor(() => expect(api.list).toHaveBeenCalledTimes(2));
    expect(api.list.mock.calls[1]).toEqual(['book', 'planning', 'next']);
    await userEvent.click(screen.getByRole('combobox', { name: 'Etapa do trabalho' }));
    await userEvent.click(screen.getByRole('option', { name: 'Revisão' }));
    await screen.findByText('Nenhum artefato registrado nesta etapa');
    expect(api.list.mock.calls[2]).toEqual(['book', 'review', null]);
    expect(api.save).not.toHaveBeenCalled();
  });
  it('normalizes explicit blocker lines while preserving the next step and artifact identity', async () => {
    render(<LiteraryProgressPanel bookId="book" />);
    await open();
    fireEvent.change(screen.getByLabelText('Bloqueios deste artefato — um por linha'), {
      target: { value: '  Rever motivação  \n\n Conferir ordem ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar próximo passo e bloqueios' }));
    await screen.findByText('Bloqueios e próximo passo salvos.');
    expect(api.save.mock.calls[0]![0]).toMatchObject({
      notes: { blockers: ['Rever motivação', 'Conferir ordem'], nextStep: 'Conferir cena.' },
    });
  });
  it('queries an uncertain save and rejects a receipt from another artifact before adopting the confirmed note', async () => {
    api.save.mockRejectedValueOnce(new Error('Sem resposta'));
    vi.mocked(getLiteraryOperation)
      .mockResolvedValueOnce({ state: 'unconfirmed' })
      .mockResolvedValueOnce({
        state: 'confirmed',
        kind: 'progress',
        id: 'another',
        revision: 2,
        updatedAt: 2,
        noOp: false,
      })
      .mockResolvedValueOnce({
        state: 'confirmed',
        kind: 'progress',
        id: artifact.noteId,
        revision: 2,
        updatedAt: 2,
        noOp: false,
      });
    render(<LiteraryProgressPanel bookId="book" />);
    await open();
    fireEvent.change(screen.getByLabelText('Próximo passo'), {
      target: { value: 'Rascunho privado.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar próximo passo e bloqueios' }));
    await screen.findByText('Sem resposta');
    fireEvent.click(screen.getByRole('button', { name: 'Consultar salvamento' }));
    await screen.findByText(/Salvamento ainda sem confirmação/);
    fireEvent.click(screen.getByRole('button', { name: 'Consultar salvamento' }));
    await screen.findByText('A confirmação não corresponde a esta anotação. Preserve a pendência.');
    expect(screen.getByLabelText('Próximo passo')).toHaveValue('Rascunho privado.');
    api.get.mockResolvedValueOnce({
      ...detail,
      note: { ...detail.note, revision: 2, nextStep: 'Nota confirmada.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Consultar salvamento' }));
    await screen.findByText('Salvamento confirmado; anotação atual recuperada.');
    expect(screen.getByLabelText('Próximo passo')).toHaveValue('Nota confirmada.');
    expect(api.save).toHaveBeenCalledOnce();
  });
  it('shows the saved stage without claiming a complete book or published quality', async () => {
    render(<LiteraryProgressPanel bookId="book" />);
    await open();
    expect(screen.getByText('Aprovado')).toBeInTheDocument();
    expect(screen.getByText(/As fontes ainda precisam ser reconferidas/)).toBeInTheDocument();
    expect(screen.queryByText(/100%/)).not.toBeInTheDocument();
    expect(screen.getByLabelText('Próximo passo')).toHaveValue('Conferir cena.');
  });
  it('retains an uncertain save and retries the exact operation without replacing the draft', async () => {
    api.save.mockRejectedValueOnce(new Error('Conexão interrompida.'));
    const onWorkChange = vi.fn();
    render(<LiteraryProgressPanel bookId="book" onWorkChange={onWorkChange} />);
    await open();
    fireEvent.change(screen.getByLabelText('Próximo passo'), {
      target: { value: 'Rever a escolha.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar próximo passo e bloqueios' }));
    await screen.findByText('Conexão interrompida.');
    expect(screen.getByLabelText('Próximo passo')).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Repetir o mesmo salvamento' }));
    await screen.findByText('Bloqueios e próximo passo salvos.');
    expect(api.save).toHaveBeenCalledTimes(2);
    expect(api.save.mock.calls[1]).toEqual(api.save.mock.calls[0]);
    expect(api.save.mock.calls[0]![0]).toMatchObject({
      sourceToken: artifact.sourceToken,
      expectedRevision: 1,
      notes: { nextStep: 'Rever a escolha.' },
    });
    await waitFor(() =>
      expect(onWorkChange).toHaveBeenLastCalledWith({ dirty: false, pending: false }),
    );
  });
  it('requires explicit comparison before using another saved revision and preserves the author draft', async () => {
    api.save.mockRejectedValueOnce(
      Object.assign(new Error('Registro alterado.'), { code: 'functions/failed-precondition' }),
    );
    render(<LiteraryProgressPanel bookId="book" />);
    await open();
    fireEvent.change(screen.getByLabelText('Próximo passo'), {
      target: { value: 'Meu próximo passo.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar próximo passo e bloqueios' }));
    await screen.findByText('Registro alterado.');
    api.get.mockResolvedValueOnce({
      artifact: { ...artifact, sourceToken: 'd'.repeat(64) },
      note: { ...detail.note, revision: 2, nextStep: 'Outra anotação salva.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Comparar com o registro atual' }));
    await screen.findByText('Outra anotação salva.');
    expect(screen.getByLabelText('Próximo passo')).toHaveValue('Meu próximo passo.');
    fireEvent.click(
      screen.getByRole('button', { name: 'Usar esta versão como base e preservar meu rascunho' }),
    );
    api.save.mockResolvedValueOnce({ ...detail.note, revision: 3, nextStep: 'Meu próximo passo.' });
    fireEvent.click(screen.getByRole('button', { name: 'Salvar próximo passo e bloqueios' }));
    await screen.findByText('Bloqueios e próximo passo salvos.');
    expect(api.save.mock.calls[1]![0]).toMatchObject({
      sourceToken: 'd'.repeat(64),
      expectedRevision: 2,
      notes: { nextStep: 'Meu próximo passo.' },
    });
  });
  it('covers loading, failure and retry with an empty artifact stage', async () => {
    api.list
      .mockRejectedValueOnce(new Error('Consulta indisponível.'))
      .mockResolvedValueOnce({ ...page(), items: [] });
    render(<LiteraryProgressPanel bookId="book" />);
    expect(screen.getByRole('status')).toBeInTheDocument();
    await screen.findByText('Consulta indisponível.');
    fireEvent.click(screen.getByRole('button', { name: /Tentar novamente/i }));
    await screen.findByText('Nenhum artefato registrado nesta etapa');
  });
  it('discards a late response from the previous book', async () => {
    let resolve!: (value: ProgressPage) => void;
    const old = new Promise<ProgressPage>((done) => {
      resolve = done;
    });
    api.list.mockImplementationOnce(() => old).mockResolvedValueOnce(page('Outro livro'));
    const view = render(<LiteraryProgressPanel bookId="old-book" />);
    view.rerender(<LiteraryProgressPanel bookId="new-book" />);
    await screen.findByText('Outro livro');
    await act(async () => {
      resolve(page('Livro anterior'));
      await old;
    });
    expect(screen.queryByText('Livro anterior')).not.toBeInTheDocument();
  });
});
