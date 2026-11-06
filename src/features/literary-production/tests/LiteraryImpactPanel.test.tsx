import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { LiteraryImpactPanel } from '../components/LiteraryImpactPanel';
import * as api from '../services/literaryImpactService';
import * as planning from '../services/literaryPlanningService';
import * as storage from '../services/literaryImpactStorage';
import {
  impactStart,
  impactFrame,
  impactScope,
  impactHash,
  impactLocks,
  deferred,
} from './impactFixtures';
import type { ImpactResolution, ImpactCheck } from '../model/impact';
const actor = vi.hoisted(() => ({ uid: 'author' }));
vi.mock('@/features/auth', () => ({ useAuth: () => ({ user: { uid: actor.uid } }) }));
vi.mock('../services/literaryImpactService', () => ({
  getLiteraryImpactScope: vi.fn(),
  startLiteraryImpact: vi.fn(),
  getLiteraryImpact: vi.fn(),
  listLiteraryImpacts: vi.fn(),
  advanceLiteraryImpact: vi.fn(),
  resolveLiteraryImpact: vi.fn(),
  cancelLiteraryImpact: vi.fn(),
  getLiteraryImpactOperation: vi.fn(),
  cancelLiteraryImpactOperation: vi.fn(),
  readLiteraryImpactPage: vi.fn(),
  impactRequestHash: vi.fn(),
}));
vi.mock('../services/literaryPlanningService', () => ({
  listLiteraryVolumeBooks: vi.fn(),
  listLiteraryPlans: vi.fn(),
  listLiteraryReferences: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  actor.uid = 'author';
  localStorage.clear();
  vi.stubGlobal('navigator', { locks: impactLocks() });
  vi.mocked(api.impactRequestHash).mockResolvedValue(impactHash);
  vi.mocked(api.getLiteraryImpactScope).mockResolvedValue(impactScope);
  vi.mocked(api.startLiteraryImpact).mockImplementation((input) =>
    Promise.resolve({
      ...impactFrame,
      jobId: input.jobId,
    }),
  );
  vi.mocked(api.getLiteraryImpact).mockImplementation((_book, id) =>
    Promise.resolve({
      ...impactFrame,
      jobId: id,
      phase: 'partial',
    }),
  );
  vi.mocked(api.listLiteraryImpacts).mockResolvedValue({ items: [], nextAfterId: null });
  vi.mocked(planning.listLiteraryVolumeBooks).mockResolvedValue({
    items: [{ id: 'other', title: 'O segundo volume' }],
    nextAfterId: null,
  });
});
afterEach(() => vi.unstubAllGlobals());
it('opening and source discovery are read-only; a reviewed scope requires a separate keyboard confirmation to start', async () => {
  const user = userEvent.setup();
  render(<LiteraryImpactPanel bookId="book" />);
  expect(api.getLiteraryImpactScope).not.toHaveBeenCalled();
  expect(api.startLiteraryImpact).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Consultar outros livros' }));
  expect(await screen.findByRole('button', { name: 'O segundo volume' })).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Conferir escopo' }));
  const dialog = await screen.findByRole('dialog');
  expect(api.getLiteraryImpactScope).toHaveBeenCalledTimes(1);
  expect(api.startLiteraryImpact).not.toHaveBeenCalled();
  expect(localStorage.length).toBe(0);
  within(dialog).getByRole('button', { name: 'Registrar mapa' }).focus();
  await user.keyboard('{Enter}');
  await waitFor(() => expect(api.startLiteraryImpact).toHaveBeenCalledTimes(1));
  await waitFor(() => expect(storage.readImpactJournal('author', 'book')?.pending).toBeNull());
  expect(api.advanceLiteraryImpact).not.toHaveBeenCalled();
  expect(screen.getByText(/cobertura da busca tem lacunas/)).toBeVisible();
});
it('reopening an uncertain start does not send or query it until the author explicitly consults', async () => {
  const original = await storage.reserveImpactJournal('author', impactStart);
  const user = userEvent.setup();
  vi.mocked(api.getLiteraryImpactOperation).mockResolvedValue({ status: 'unknown' });
  render(<LiteraryImpactPanel bookId="book" />);
  expect(api.getLiteraryImpact).not.toHaveBeenCalled();
  expect(api.getLiteraryImpactOperation).not.toHaveBeenCalled();
  expect(api.startLiteraryImpact).not.toHaveBeenCalled();
  await user.click(screen.getByRole('button', { name: 'Consultar resultado original' }));
  expect(await screen.findByText(/servidor ainda não confirmou/)).toBeVisible();
  expect(api.startLiteraryImpact).not.toHaveBeenCalled();
  expect(storage.readImpactJournal('author', 'book')).toEqual(original);
});
it('private resolution notes never enter the local journal and pending requests remain discoverable when the actor changes', async () => {
  await storage.adoptImpactJournal('author', 'book', impactFrame);
  const check: ImpactCheck = {
    id: 'check',
    jobId: impactFrame.jobId,
    from: impactStart.sources[0]!,
    to: { kind: 'chapter', id: 'chapter', scopeKind: 'book', scopeId: 'book' },
    relation: 'source',
    sourceLabel: 'A cidade',
    targetLabel: 'A primeira travessia',
    observationToken: 'e'.repeat(64),
    facts: { status: 'unverified', sourceIdentityVerified: false, versionMatches: null },
  };
  vi.mocked(api.readLiteraryImpactPage).mockResolvedValue({
    items: [check],
    nextAfterId: null,
    labelsAreCurrent: true,
    semanticCompleteness: false,
    publicationReady: false,
  });
  const response = deferred<ImpactResolution>();
  vi.mocked(api.resolveLiteraryImpact).mockReturnValue(response.promise);
  const user = userEvent.setup(),
    view = render(<LiteraryImpactPanel bookId="book" />);
  await user.click(screen.getByRole('button', { name: 'Consultar estado atual' }));
  await user.click(await screen.findByRole('button', { name: 'Consultar vínculos' }));
  await user.click(await screen.findByRole('button', { name: 'Revisar este vínculo' }));
  await user.type(screen.getByLabelText('Justificativa'), 'PRIVATE AUTHOR REASON');
  await user.type(screen.getByLabelText('Evidência da decisão'), 'PRIVATE AUTHOR EVIDENCE');
  await user.click(screen.getByRole('button', { name: 'Salvar resolução' }));
  await waitFor(() => expect(api.resolveLiteraryImpact).toHaveBeenCalledTimes(1));
  const original = storage.readImpactJournal('author', 'book');
  expect(original?.pending?.kind).toBe('resolve');
  expect(JSON.stringify(original)).not.toContain('PRIVATE');
  actor.uid = 'other';
  view.rerender(<LiteraryImpactPanel bookId="book" />);
  expect(screen.queryByDisplayValue('PRIVATE AUTHOR REASON')).not.toBeInTheDocument();
  await act(async () => {
    response.resolve({
      jobId: impactFrame.jobId,
      decisionId: 'decision',
      decisionRevision: 1,
      revision: 2,
      status: 'needs-review',
      publicationReady: false,
    });
    await response.promise;
  });
  expect(storage.readImpactJournal('author', 'book')).toEqual(original);
  expect(storage.readImpactJournal('other', 'book')).toBeNull();
});
it('malformed local recovery is reported and its original bytes survive opening', () => {
  const key = 'writer:literary-impact:author:book',
    raw = JSON.stringify({ version: 1, rationale: 'unexpected body' });
  localStorage.setItem(key, raw);
  render(<LiteraryImpactPanel bookId="book" />);
  expect(screen.getByText(/acompanhamento do mapa está inválido/)).toBeVisible();
  expect(localStorage.getItem(key)).toBe(raw);
  expect(api.startLiteraryImpact).not.toHaveBeenCalled();
  expect(api.cancelLiteraryImpact).not.toHaveBeenCalled();
});

it('a complete registered census is distinguished from historical or semantic completeness', async () => {
  await storage.adoptImpactJournal('author', 'book', impactFrame);
  vi.mocked(api.getLiteraryImpact).mockResolvedValue({
    ...impactFrame,
    phase: 'done',
    coverage: { complete: true },
  });
  const user = userEvent.setup();
  render(<LiteraryImpactPanel bookId="book" />);
  await user.click(screen.getByRole('button', { name: 'Consultar estado atual' }));
  expect(
    await screen.findByText(/inventário das dependências registradas foi conferido/),
  ).toBeVisible();
  expect(
    screen.getByText(
      /Relações implícitas e origens sem registro histórico exigem análise editorial própria/,
    ),
  ).toBeVisible();
  expect(api.advanceLiteraryImpact).not.toHaveBeenCalled();
});
it('paginates saved maps and adopts then releases only their local tracking after a fresh scope check', async () => {
  vi.mocked(api.listLiteraryImpacts)
    .mockResolvedValueOnce({ items: [impactFrame], nextAfterId: 'cursor' })
    .mockResolvedValueOnce({ items: [impactFrame], nextAfterId: null });
  render(<LiteraryImpactPanel bookId="book" />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar mapas existentes' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Mais mapas existentes' }));
  await waitFor(() => expect(api.listLiteraryImpacts).toHaveBeenLastCalledWith('book', 'cursor'));
  expect(screen.getAllByRole('button', { name: 'Acompanhar este mapa' })).toHaveLength(1);
  await userEvent.click(screen.getByRole('button', { name: 'Acompanhar este mapa' }));
  await screen.findByText('Mapa acompanhado neste navegador');
  expect(api.getLiteraryImpact).toHaveBeenCalledWith(
    'book',
    impactFrame.jobId,
    impactFrame.originToken,
  );
  await userEvent.click(screen.getByRole('button', { name: 'Liberar acompanhamento local' }));
  await waitFor(() => expect(storage.readImpactJournal('author', 'book')).toBeNull());
  expect(api.startLiteraryImpact).not.toHaveBeenCalled();
  expect(api.cancelLiteraryImpact).not.toHaveBeenCalled();
});
it('keeps selection changes reversible and confirms scope only after explicit book and source choices', async () => {
  vi.mocked(planning.listLiteraryPlans).mockResolvedValue({
    schema: {},
    items: [
      {
        id: 'plan',
        title: 'Ficha de preparação',
        kind: 'chapterBrief',
        revision: 1,
        status: 'approved',
      },
    ],
    nextAfterId: null,
    projectUpdatedAt: 1,
  });
  render(<LiteraryImpactPanel bookId="book" />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar outros livros' }));
  await userEvent.click(await screen.findByRole('button', { name: 'O segundo volume' }));
  await userEvent.click(screen.getByRole('combobox', { name: 'Livro da fonte' }));
  await userEvent.click(screen.getByRole('option', { name: 'O segundo volume' }));
  await userEvent.click(screen.getByRole('combobox', { name: 'Tipo de fonte' }));
  await userEvent.click(screen.getByRole('option', { name: 'Ficha de planejamento' }));
  await userEvent.click(screen.getByRole('button', { name: 'Consultar fontes' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Ficha de preparação · O segundo volume' }),
  );
  await userEvent.click(
    screen.getByRole('button', { name: 'Remover fonte Ficha de preparação · O segundo volume' }),
  );
  await userEvent.click(screen.getByRole('button', { name: 'Descartar alterações da seleção' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Continuar selecionando' }));
  await userEvent.click(screen.getByRole('button', { name: 'Descartar alterações da seleção' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Descartar seleção', exact: true }),
  );
  expect(screen.getByRole('combobox', { name: 'Livro da fonte' })).toHaveTextContent('Este livro');
  expect(api.getLiteraryImpactScope).not.toHaveBeenCalled();
  expect(api.startLiteraryImpact).not.toHaveBeenCalled();
});
it('reads propagation, resources and author notes as separate paginated projections', async () => {
  await storage.adoptImpactJournal('author', 'book', impactFrame);
  const metadata = {
    labelsAreCurrent: true as const,
    semanticCompleteness: false as const,
    publicationReady: false as const,
  };
  vi.mocked(api.readLiteraryImpactPage)
    .mockResolvedValueOnce({
      ...metadata,
      items: [
        {
          id: 'visit',
          observationToken: 'a'.repeat(64),
          label: 'Capítulo visitado',
          visit: {
            node: impactStart.sources[0]!,
            source: impactStart.sources[0]!,
            effect: 'dependency-check',
            depth: 2,
          },
        },
      ],
      nextAfterId: null,
    })
    .mockResolvedValueOnce({
      ...metadata,
      items: [
        {
          id: 'node',
          observationToken: 'a'.repeat(64),
          label: 'Livro observado',
          node: impactStart.sources[0]!,
        },
      ],
      nextAfterId: null,
    })
    .mockResolvedValueOnce({
      ...metadata,
      items: [
        {
          id: 'decision',
          jobId: impactFrame.jobId,
          checkId: 'check',
          observationToken: 'a'.repeat(64),
          revision: 1,
          status: 'reviewed',
          rationale: 'Conferido pelo autor',
          evidence: [{ note: 'Evidência privada' }],
          updatedAt: 1,
        },
      ],
      nextAfterId: null,
    });
  render(<LiteraryImpactPanel bookId="book" />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar estado atual' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Consultar propagação' }));
  await screen.findByText('Capítulo visitado');
  await userEvent.click(screen.getByRole('button', { name: 'Consultar recursos' }));
  await screen.findByText('Livro observado');
  await userEvent.click(screen.getByRole('button', { name: 'Consultar notas próprias' }));
  await screen.findByText('Evidência privada');
  expect(screen.getByText('Conferido pelo autor')).toBeVisible();
  expect(api.resolveLiteraryImpact).not.toHaveBeenCalled();
});
it('saves only explicit private resolution notes and requires confirmation to discard the session draft', async () => {
  await storage.adoptImpactJournal('author', 'book', impactFrame);
  const check: ImpactCheck = {
    id: 'check',
    jobId: impactFrame.jobId,
    from: impactStart.sources[0]!,
    to: { kind: 'chapter', id: 'chapter', scopeKind: 'book', scopeId: 'book' },
    relation: 'source',
    sourceLabel: 'Livro',
    targetLabel: 'A carta',
    observationToken: 'e'.repeat(64),
    facts: { status: 'unverified', sourceIdentityVerified: false, versionMatches: null },
  };
  vi.mocked(api.readLiteraryImpactPage).mockResolvedValue({
    items: [check],
    nextAfterId: null,
    labelsAreCurrent: true,
    semanticCompleteness: false,
    publicationReady: false,
  });
  vi.mocked(api.resolveLiteraryImpact).mockResolvedValue({
    jobId: impactFrame.jobId,
    decisionId: 'decision',
    decisionRevision: 1,
    revision: 2,
    status: 'reviewed',
    publicationReady: false,
  });
  render(<LiteraryImpactPanel bookId="book" />);
  await userEvent.click(screen.getByRole('button', { name: 'Consultar estado atual' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Consultar vínculos' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Revisar este vínculo' }));
  await userEvent.click(screen.getByRole('combobox', { name: 'Decisão do autor' }));
  await userEvent.click(screen.getByRole('option', { name: 'Revisado pelo autor' }));
  await userEvent.type(screen.getByLabelText('Justificativa'), 'Conferi a relação.');
  await userEvent.type(screen.getByLabelText('Evidência da decisão'), 'Capítulo salvo.');
  await userEvent.click(screen.getByRole('button', { name: 'Adicionar evidência' }));
  await userEvent.type(screen.getByLabelText('Evidência adicional 1'), 'Nota temporária');
  await userEvent.click(screen.getByRole('button', { name: 'Remover evidência 2' }));
  await userEvent.click(screen.getByRole('button', { name: 'Salvar resolução' }));
  await screen.findByText(/Resolução salva. Consulte os vínculos/);
  expect(api.resolveLiteraryImpact).toHaveBeenCalledWith(
    expect.objectContaining({
      checkId: 'check',
      expectedDecisionRevision: 0,
      status: 'reviewed',
      rationale: 'Conferi a relação.',
      evidence: [{ note: 'Capítulo salvo.' }],
    }),
  );
  expect(JSON.stringify(storage.readImpactJournal('author', 'book'))).not.toContain(
    'Conferi a relação.',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Fechar rascunho da resolução' }));
  await userEvent.click(await screen.findByRole('button', { name: 'Continuar revisando' }));
  expect(screen.getByLabelText('Justificativa')).toHaveValue('Conferi a relação.');
  await userEvent.click(screen.getByRole('button', { name: 'Fechar rascunho da resolução' }));
  await userEvent.click(
    await screen.findByRole('button', { name: 'Fechar rascunho', exact: true }),
  );
  expect(screen.queryByLabelText('Justificativa')).not.toBeInTheDocument();
});
