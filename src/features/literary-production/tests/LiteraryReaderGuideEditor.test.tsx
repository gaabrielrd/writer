import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LiteraryReaderGuideEditor } from '../components/LiteraryReaderGuideEditor';
import * as api from '../services/literaryPublicationService';
vi.mock('../services/literaryPublicationService', async (original) => ({
  ...(await original<typeof api>()),
  listLiteraryPublicationGuide: vi.fn(),
  getLiteraryPublicationGuideEntry: vi.fn(),
  getLiteraryPublicationGuideVersion: vi.fn(),
  saveLiteraryPublicationGuideEntry: vi.fn(),
  resolvePublicationRecovery: vi.fn(),
}));
const job: api.LiteraryPublication = {
  jobId: 'edition',
  progressRevision: 1,
  title: 'Livro',
  authorName: 'Autora',
  integrationId: 'integration',
  policy: 'book',
  unitId: null,
  state: 'prepared',
  phase: null,
  candidates: 1,
  verifiedCandidates: 1,
  chapterCount: 1,
  compiledChapters: 1,
  unitCount: 1,
  verifiedUnits: 1,
  verifiedChapters: 1,
  actCount: 0,
  wordCount: 10,
  removalCount: 0,
  removalHash: 'r'.repeat(64),
  manifestHash: 'm'.repeat(64),
  guideRevision: 0,
  guideCount: 1,
  verifiedGuideEntries: 0,
  guideHash: null,
  editionHash: null,
  createdAt: 1,
  preparedAt: 2,
  publishedAt: null,
  revisionId: 'revision',
  publicationUrl: null,
  publicationConfirmed: false,
  message: null,
};
const entry = (revision = 1): api.GuideEntry => ({
  id: 'identity',
  revision,
  deleted: false,
  updatedAt: 1,
  guide: {
    ...api.emptyReaderGuide(),
    name: 'Ana',
    summary: 'Observa a praça.',
    revealAfterChapterId: 'chapter',
    evidence: [{ chapterId: 'chapter', quote: 'Ana observa a praça.' }],
  },
});
const mount = (state: api.LiteraryPublication['state'] = 'prepared') => {
  const onSaved = vi.fn(),
    onPreview = vi.fn(),
    onWorkChange = vi.fn();
  render(
    <LiteraryReaderGuideEditor
      bookId="book"
      actorId="author"
      job={{ ...job, state }}
      chapters={[{ chapterId: 'chapter', index: 0, title: 'A praça', actId: null, compiled: true }]}
      onSaved={onSaved}
      onPreview={onPreview}
      onWorkChange={onWorkChange}
    />,
  );
  return { onSaved, onPreview, onWorkChange };
};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.listLiteraryPublicationGuide).mockResolvedValue({
    items: [entry()],
    guideRevision: 1,
    guideCount: 1,
    nextAfterId: null,
  });
  vi.mocked(api.getLiteraryPublicationGuideEntry).mockResolvedValue(entry());
  vi.mocked(api.resolvePublicationRecovery).mockResolvedValue(null);
  vi.mocked(api.saveLiteraryPublicationGuideEntry).mockImplementation((input) =>
    Promise.resolve({
      ...entry(input.expectedRevision + 1),
      guide: input.guide,
      deleted: input.guide === null,
    }),
  );
});
const savedInput = (index = 0) => {
  const value = vi.mocked(api.saveLiteraryPublicationGuideEntry).mock.calls[index]?.[0];
  if (!value) throw new Error('O pedido esperado não foi enviado.');
  return value;
};
const open = async () =>
  userEvent.click(await screen.findByRole('button', { name: 'Abrir entrada Ana' }));
it('saves only explicit public fields with the reviewed edition and native identity, and previews the cited chapter', async () => {
  const { onSaved, onPreview } = mount();
  await open();
  fireEvent.change(screen.getByLabelText('Resumo público'), {
    target: { value: 'Aguarda uma carta.' },
  });
  fireEvent.change(screen.getByLabelText('Apelidos e grafias — um por linha'), {
    target: { value: '  Aninha \n\n Ana A. ' },
  });
  await userEvent.click(screen.getByRole('button', { name: 'Ver texto da fonte 1' }));
  expect(onPreview).toHaveBeenCalledWith('chapter');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar entrada pública' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(savedInput()).toMatchObject({
    target: { kind: 'book', id: 'book' },
    jobId: 'edition',
    id: 'identity',
    expectedRevision: 1,
    expectedManifestHash: job.manifestHash,
    guide: { summary: 'Aguarda uma carta.', aliases: ['Aninha', 'Ana A.'] },
  });
  expect(vi.mocked(api.saveLiteraryPublicationGuideEntry).mock.calls[0]?.[1]).toBe('author');
  expect(screen.getByLabelText('Resumo público')).toHaveValue('Aguarda uma carta.');
  expect(screen.getByRole('button', { name: 'Salvar entrada pública' })).toBeDisabled();
});
it('locks an uncertain save and repeats the exact operation instead of creating another identity or overwriting the draft', async () => {
  vi.mocked(api.saveLiteraryPublicationGuideEntry).mockRejectedValueOnce(
    new Error('Resposta perdida'),
  );
  const { onSaved } = mount();
  await open();
  fireEvent.change(screen.getByLabelText('Nome público'), { target: { value: 'Ana da praça' } });
  await userEvent.click(screen.getByRole('button', { name: 'Salvar entrada pública' }));
  await screen.findByText('Resposta perdida');
  expect(screen.getByLabelText('Nome público')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Nova entrada pública' })).toBeDisabled();
  const first = structuredClone(savedInput());
  await userEvent.click(screen.getByRole('button', { name: 'Consultar salvamento da entrada' }));
  await screen.findByText(/Entrada ainda sem confirmação/);
  await userEvent.click(screen.getByRole('button', { name: 'Repetir o mesmo salvamento do guia' }));
  await waitFor(() => expect(onSaved).toHaveBeenCalledOnce());
  expect(vi.mocked(api.saveLiteraryPublicationGuideEntry).mock.calls[1]).toEqual([first, 'author']);
});
it('a conflict allows comparison with the current revision while retaining the authored draft and updates CAS only explicitly', async () => {
  vi.mocked(api.saveLiteraryPublicationGuideEntry).mockRejectedValueOnce(
    Object.assign(new Error('Versão mudou'), { code: 'functions/failed-precondition' }),
  );
  mount();
  await open();
  fireEvent.change(screen.getByLabelText('Resumo público'), { target: { value: 'Minha versão' } });
  await userEvent.click(screen.getByRole('button', { name: 'Salvar entrada pública' }));
  await screen.findByText('Versão mudou');
  expect(screen.getByLabelText('Resumo público')).not.toBeDisabled();
  vi.mocked(api.getLiteraryPublicationGuideEntry).mockResolvedValue(entry(4));
  await userEvent.click(screen.getByRole('button', { name: 'Comparar entrada atual' }));
  await screen.findByText('Versão atual · revisão 4');
  expect(screen.getAllByLabelText('Resumo público')[0]).toHaveValue('Minha versão');
  await userEvent.click(
    screen.getByRole('button', { name: 'Usar esta revisão como base e preservar meu rascunho' }),
  );
  expect(screen.getByLabelText('Resumo público')).toHaveValue('Minha versão');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar entrada pública' }));
  await waitFor(() => expect(api.saveLiteraryPublicationGuideEntry).toHaveBeenCalledTimes(2));
  expect(savedInput(1)).toMatchObject({
    expectedRevision: 4,
    guide: { summary: 'Minha versão' },
  });
});
it('verified editions remain readable while all mutations are disabled', async () => {
  mount('verified');
  await open();
  expect(screen.getByLabelText('Nome público')).toHaveValue('Ana');
  expect(screen.getByLabelText('Nome público')).toBeDisabled();
  expect(screen.getByRole('button', { name: 'Nova entrada pública' })).toBeDisabled();
  await userEvent.click(screen.getByRole('button', { name: 'Opções da entrada' }));
  expect(
    await screen.findByRole('menuitem', { name: 'Remover entrada desta edição' }),
  ).toHaveAttribute('aria-disabled', 'true');
  expect(api.saveLiteraryPublicationGuideEntry).not.toHaveBeenCalled();
});
it('recovers the exact accepted revision after a missing acknowledgement without replaying the save', async () => {
  vi.mocked(api.saveLiteraryPublicationGuideEntry).mockRejectedValueOnce(
    new Error('Resposta perdida'),
  );
  vi.mocked(api.resolvePublicationRecovery).mockResolvedValue({
    state: 'confirmed',
    kind: 'publicationGuide',
    id: 'identity',
    revision: 2,
    updatedAt: 2,
    noOp: false,
  });
  vi.mocked(api.getLiteraryPublicationGuideVersion).mockResolvedValue({
    ...entry(2),
    guide: { ...entry().guide!, summary: 'Versão aceita' },
  });
  const { onSaved } = mount();
  await open();
  fireEvent.change(screen.getByLabelText('Resumo público'), { target: { value: 'Versão aceita' } });
  await userEvent.click(screen.getByRole('button', { name: 'Salvar entrada pública' }));
  await screen.findByText('Resposta perdida');
  await userEvent.click(screen.getByRole('button', { name: 'Consultar salvamento da entrada' }));
  await screen.findByText('A versão exata deste pedido foi recuperada.');
  expect(api.getLiteraryPublicationGuideVersion).toHaveBeenCalledWith(
    'book',
    'edition',
    'identity',
    2,
  );
  expect(api.saveLiteraryPublicationGuideEntry).toHaveBeenCalledTimes(1);
  expect(screen.getByLabelText('Resumo público')).toHaveValue('Versão aceita');
  expect(onSaved).toHaveBeenCalledOnce();
});
it('keeps independent evidence, uncertainty and reveal chapters for facts, relationships and appearances in the saved entry', async () => {
  const choose = async (label: string, option: string) => {
    await userEvent.click(screen.getByLabelText(label));
    await userEvent.click(await screen.findByRole('option', { name: option }));
  };
  const change = (label: string, value: string) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  mount();
  await open();
  change('Distinção entre homônimos', 'Moradora da praça');
  await choose('Categoria pública', 'Pessoa ou personagem');
  await choose('Certeza do resumo', 'Informação incerta');
  await choose('Liberar a entrada a partir do capítulo', 'A praça');
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar fonte do resumo' }));
  await choose('Capítulo da fonte 2', 'A praça');
  change('Citação literal do resumo 2', 'A carta chegou.');
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar fato público' }));
  change('Fato público 1', 'Pode estar esperando uma carta.');
  await choose('Certeza do fato 1', 'Informação incerta');
  await choose('Capítulo do fato 1', 'A praça');
  change('Citação do fato 1', 'Talvez esperasse uma carta.');
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar relação' }));
  await choose('Identidade relacionada 1', 'Ana');
  change('Relação pública 1', 'Recorda a si mesma.');
  await choose('Certeza da relação 1', 'Informação incerta');
  await choose('Capítulo da relação 1', 'A praça');
  change('Citação da relação 1', 'Não lembrava quem era.');
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar aparição ou menção' }));
  await choose('Tipo da aparição 1', 'Transmissão documental');
  await choose('Capítulo da aparição 1', 'A praça');
  change('Citação da aparição 1', 'A carta dizia Ana.');
  await userEvent.click(screen.getByRole('button', { name: 'Salvar entrada pública' }));
  await waitFor(() => expect(api.saveLiteraryPublicationGuideEntry).toHaveBeenCalledOnce());
  expect(savedInput().guide).toMatchObject({
    disambiguation: 'Moradora da praça',
    certainty: 'uncertain',
    evidence: [
      { chapterId: 'chapter', quote: 'Ana observa a praça.' },
      { chapterId: 'chapter', quote: 'A carta chegou.' },
    ],
    facts: [
      {
        chapterId: 'chapter',
        text: 'Pode estar esperando uma carta.',
        certainty: 'uncertain',
        quote: 'Talvez esperasse uma carta.',
      },
    ],
    relationships: [
      {
        targetId: 'identity',
        description: 'Recorda a si mesma.',
        chapterId: 'chapter',
        certainty: 'uncertain',
        quote: 'Não lembrava quem era.',
      },
    ],
    appearances: [{ kind: 'document', chapterId: 'chapter', quote: 'A carta dizia Ana.' }],
  });
});
