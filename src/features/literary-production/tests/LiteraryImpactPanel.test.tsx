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
