import { createElement, StrictMode } from 'react';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { it, expect, vi, beforeEach } from 'vitest';
const m = vi.hoisted(() => ({
  inspect: vi.fn(),
  begin: vi.fn(),
  get: vi.fn(),
  resume: vi.fn(),
  read: vi.fn(),
  prep: vi.fn(),
  pending: vi.fn(),
  review: vi.fn(),
  activate: vi.fn(),
  advance: vi.fn(),
  cancel: vi.fn(),
  reconcile: vi.fn(),
  has: vi.fn(),
  discard: vi.fn(),
  account: 'author',
  current: null,
  final: null,
}));
vi.mock('../services/inspectBookRestoreFile', () => ({
  inspectBookRestoreFile: (...a) => m.inspect(...a),
}));
vi.mock('../services/bookRestoreStartSession', () => ({
  createBookRestoreStartSession: () => ({
    begin: (...a) => m.begin(...a),
    get: (...a) => m.get(...a),
    resume: (...a) => m.resume(...a),
    resolveStartForCancellation: async () => ({ kind: 'absent' }),
  }),
}));
vi.mock('../services/bookRestoreBootstrapStore', () => ({
  readStoredBookRestoreStart: (...a) => m.read(...a),
}));
vi.mock('../services/bookRestoreUploadDriver', () => ({
  createBookRestoreUploadDriver: () => ({
    step: async () => ({ kind: 'paused', progress: m.current }),
  }),
}));
vi.mock('../services/bookRestorePreparationDriver', () => ({
  createBookRestorePreparationDriver: () => ({ step: (...a) => m.prep(...a) }),
}));
vi.mock('../services/bookRestorePreparationJournal', () => ({
  createBookRestorePreparationJournal: () => ({}),
}));
vi.mock('../services/bookRestorePreparationCallables', () => ({ bookRestorePreparationApi: {} }));
vi.mock('../services/bookRestoreEffectSession', () => ({
  createBookRestoreEffectSession: () => ({
    pending: (...a) => m.pending(...a),
    review: (...a) => m.review(...a),
    activate: (...a) => m.activate(...a),
    advance: (...a) => m.advance(...a),
    cancel: (...a) => m.cancel(...a),
    reconcile: (...a) => m.reconcile(...a),
    resume: async () => ({ kind: 'confirmed' }),
  }),
}));
vi.mock('../services/bookRestoreLocalRecovery', () => ({
  checkBookRestoreAccount: (owner) => {
    if (m.account !== owner) throw Error('Inactive account');
  },
  hasBookRestoreLocalRecovery: (...a) => m.has(...a),
  discardBookRestoreLocalRecovery: (...a) => m.discard(...a),
}));
import { BookRestoreDialog } from '../components/BookRestoreDialog.tsx';
const source = {
  format: 'writer-book-archive',
  version: 1,
  byteLength: 12,
  sha256: 'a'.repeat(64),
};
const local = {
  reviewHash: 'b'.repeat(64),
  review: {
    schemaVersion: 1,
    source,
    totals: { acts: 1, chapters: 2, versions: 3, profiles: 1 },
    warnings: {
      missingDates: 0,
      danglingLocalReferences: 0,
      externalReferences: 0,
      orphanGroups: 0,
      legacyCover: false,
    },
    legacy: null,
  },
};
const props = () => ({
  open: true,
  ownerId: 'author',
  onClose: vi.fn(),
  onOpenBook: vi.fn(async () => {}),
});
const view = (p) => render(createElement(BookRestoreDialog, p));
beforeEach(() => {
  vi.resetAllMocks();
  m.account = 'author';
  m.current = {
    schemaVersion: 1,
    ownerId: 'author',
    restoreId: 'restore-dialog-0001',
    jobToken: 'c'.repeat(64),
    bookId: 'book',
    state: 'uploaded',
    source,
    reviewHash: 'b'.repeat(64),
    keyId: 'd'.repeat(64),
    checkpoint: 1,
    recoveryReady: true,
    uploadedBytes: 12,
    preparation: null,
  };
  m.final = {
    schemaVersion: 1,
    bookId: 'book',
    checkpoint: 2,
    reviewToken: 'e'.repeat(64),
    summary: {
      titlePreview: 'Minha obra',
      titleTruncated: false,
      visibility: 'private',
      counts: { acts: 1, chapters: 2, words: 10, lore: 1, scenes: 1, versions: 3, profiles: 1 },
      universe: { originKind: 'none', observed: 'none', universeId: null },
      cover: { kind: 'none' },
      draft: { outcome: 'version' },
    },
  };
  m.inspect.mockResolvedValue(local);
  m.read.mockResolvedValue(null);
  m.pending.mockResolvedValue(null);
  m.get.mockImplementation(async () => structuredClone(m.current));
  m.resume.mockResolvedValue({ kind: 'absent' });
  m.begin.mockImplementation(async () => ({
    kind: 'confirmed',
    progress: structuredClone(m.current),
  }));
  m.prep.mockImplementation(async () => {
    m.current = {
      ...m.current,
      state: 'content-verified',
      checkpoint: 2,
      preparation: { schemaVersion: 13, phase: 'activation-ready' },
    };
    return { kind: 'paused', reason: 'review-required', progress: structuredClone(m.current) };
  });
  m.review.mockImplementation(async () => structuredClone(m.final));
  m.activate.mockImplementation(async () => {
    m.current = { ...m.current, state: 'activated', checkpoint: 3, recoveryReady: false };
    return { kind: 'confirmed' };
  });
  m.advance.mockImplementation(async () => ({
    kind: m.current.state === 'cancelled' ? 'cancelled' : 'complete',
    job: structuredClone(m.current),
  }));
  m.cancel.mockImplementation(async () => {
    m.current = { ...m.current, state: 'cancelled' };
  });
  m.reconcile.mockResolvedValue({ kind: 'idle' });
  m.has.mockResolvedValue(false);
  m.discard.mockResolvedValue(undefined);
});
async function select() {
  await userEvent.upload(
    screen.getByLabelText('Selecionar backup'),
    new File(['bytes'], 'meu.writer'),
  );
}
it('file review prepares without activation; the explicit final confirmation uses the displayed review', async () => {
  view(props());
  expect(screen.getByRole('button', { name: 'Preparar cópia' })).toBeDisabled();
  await select();
  expect(await screen.findByRole('region', { name: 'Revisão do backup' })).toHaveTextContent(
    'Versões de texto',
  );
  await userEvent.click(screen.getByRole('button', { name: 'Preparar cópia' }));
  const final = await screen.findByRole('region', { name: 'Revisão da cópia privada' });
  expect(final).toHaveTextContent('Minha obra');
  expect(final).toHaveTextContent('rascunho será preservado como versão');
  expect(m.activate).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Criar cópia privada' }));
  await screen.findByRole('button', { name: 'Abrir livro' });
  expect(m.activate).toHaveBeenCalledExactlyOnceWith(m.final);
  expect(m.advance).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Retomar' }));
  await screen.findByText('Cópia privada pronta.');
});
it('lost start keeps the same attempt and retry does not allocate a second start', async () => {
  m.begin.mockRejectedValueOnce(Error('Resposta perdida'));
  view(props());
  await select();
  await userEvent.click(screen.getByRole('button', { name: 'Preparar cópia' }));
  expect(await screen.findByText(/Resposta perdida/)).toBeInTheDocument();
  expect(screen.queryByRole('button', { name: 'Preparar cópia' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Retomar' }));
  await screen.findByRole('region', { name: 'Revisão da cópia privada' });
  expect(m.begin).toHaveBeenCalledTimes(1);
  expect(m.activate).not.toHaveBeenCalled();
});
it('legacy missing history and draft separation are explained before preparing', async () => {
  m.inspect.mockResolvedValue({
    ...local,
    review: {
      ...local.review,
      legacy: { publicationDiscarded: true },
      source: { ...source, format: 'writer-book-backup', version: 1 },
    },
  });
  view(props());
  await select();
  expect(await screen.findByRole('region', { name: 'Revisão do backup' })).toHaveTextContent(
    'não registra histórico nem progresso',
  );
  expect(screen.getByText(/publicação anterior não será restaurada/)).toBeInTheDocument();
});
it('initial load in StrictMode only reads and never activates or cancels', async () => {
  render(
    createElement(
      StrictMode,
      null,
      createElement(BookRestoreDialog, { ...props(), restoreId: m.current.restoreId }),
    ),
  );
  await screen.findByText('Preparação disponível para retomar.');
  expect(m.get).toHaveBeenCalledTimes(1);
  expect(m.activate).not.toHaveBeenCalled();
  expect(m.cancel).not.toHaveBeenCalled();
});
it('upload resumption refuses a different file and clears the old local review', async () => {
  m.current = { ...m.current, state: 'uploading' };
  view({ ...props(), restoreId: m.current.restoreId });
  await screen.findByText('Selecione o mesmo backup e retome o envio.');
  m.inspect.mockResolvedValue({
    ...local,
    review: { ...local.review, source: { ...source, sha256: 'f'.repeat(64) } },
  });
  await userEvent.upload(
    screen.getByLabelText('Selecionar o mesmo backup'),
    new File(['other'], 'outro.writer'),
  );
  await screen.findByText('Não foi possível concluir');
  expect(screen.queryByRole('region', { name: 'Revisão do backup' })).not.toBeInTheDocument();
  expect(m.begin).not.toHaveBeenCalled();
  expect(m.activate).not.toHaveBeenCalled();
});
it('cancel and protected local discard each require their own explicit confirmation', async () => {
  const p = props(),
    r = view({ ...p, restoreId: m.current.restoreId });
  await screen.findByText('Preparação disponível para retomar.');
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar preparação' }));
  expect(m.cancel).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Voltar' }));
  expect(m.cancel).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Cancelar preparação' }));
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar cancelamento' }));
  await screen.findByText('Preparação cancelada.');
  expect(m.cancel).toHaveBeenCalledTimes(1);
  r.unmount();
  m.current = { ...m.current, state: 'activated' };
  m.has.mockResolvedValue(true);
  view({ ...props(), restoreId: m.current.restoreId });
  await screen.findByRole('button', { name: 'Remover recuperação local' });
  await userEvent.click(screen.getByRole('button', { name: 'Remover recuperação local' }));
  expect(m.discard).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Confirmar remoção local' }));
  await screen.findByText('Recuperação local removida. O projeto foi preservado.');
  expect(m.discard).toHaveBeenCalledTimes(1);
});
it('a pending terminal intent hides new activation and verification preserves an unknown request', async () => {
  m.current = {
    ...m.current,
    state: 'content-verified',
    preparation: { phase: 'activation-ready' },
  };
  m.pending.mockResolvedValue({ intent: { action: 'activateBookRestore' } });
  m.reconcile.mockResolvedValue({ kind: 'unconfirmed' });
  view({ ...props(), restoreId: m.current.restoreId });
  await screen.findByText(/Há um pedido aguardando confirmação/);
  expect(screen.queryByRole('button', { name: 'Criar cópia privada' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Verificar pedido' }));
  await screen.findByText('O pedido continua sem confirmação. A tentativa foi preservada.');
  expect(m.activate).not.toHaveBeenCalled();
});
it('closing while preparation awaits suppresses the response and further units', async () => {
  let release;
  m.prep.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const r = view(props());
  await select();
  await userEvent.click(screen.getByRole('button', { name: 'Preparar cópia' }));
  await waitFor(() => expect(m.prep).toHaveBeenCalledTimes(1));
  r.unmount();
  await act(async () => {
    release({ kind: 'advanced', progress: m.current });
  });
  expect(m.prep).toHaveBeenCalledTimes(1);
  expect(m.review).not.toHaveBeenCalled();
  expect(m.activate).not.toHaveBeenCalled();
});
it('pause finishes the current unit and does not start the next one', async () => {
  let release;
  m.prep.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  view(props());
  await select();
  await userEvent.click(screen.getByRole('button', { name: 'Preparar cópia' }));
  await waitFor(() => expect(m.prep).toHaveBeenCalledTimes(1));
  await userEvent.click(screen.getByRole('button', { name: 'Pausar' }));
  await act(async () => {
    release({ kind: 'advanced', progress: m.current });
  });
  await screen.findByText('Preparação pausada. Você pode retomar depois.');
  expect(m.prep).toHaveBeenCalledTimes(1);
  expect(m.activate).not.toHaveBeenCalled();
});
it('account change during inspection cannot publish or adopt its result', async () => {
  let release;
  m.inspect.mockImplementation(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const p = props(),
    r = view(p);
  await select();
  m.account = 'other';
  r.rerender(createElement(BookRestoreDialog, { ...p, ownerId: 'other' }));
  await act(async () => {
    release(local);
  });
  expect(screen.queryByRole('region', { name: 'Revisão do backup' })).not.toBeInTheDocument();
  expect(m.begin).not.toHaveBeenCalled();
});
it('opening an activated copy forwards the lifetime guard and reports missing access without losing the job', async () => {
  m.current = { ...m.current, state: 'activated' };
  const p = props();
  p.onOpenBook.mockRejectedValue(Error('Livro indisponível'));
  view({ ...p, restoreId: m.current.restoreId });
  await screen.findByRole('button', { name: 'Abrir livro' });
  await userEvent.click(screen.getByRole('button', { name: 'Abrir livro' }));
  await screen.findByText(/Livro indisponível/);
  expect(p.onOpenBook).toHaveBeenCalledWith('book', expect.any(Function));
  expect(m.advance).not.toHaveBeenCalled();
  expect(screen.getByRole('button', { name: 'Retomar' })).toBeInTheDocument();
});

it('lost activation hides a new confirmation and offers only the recorded retry', async () => {
  m.current = {
    ...m.current,
    state: 'content-verified',
    preparation: { phase: 'activation-ready' },
  };
  m.activate.mockRejectedValueOnce(Error('Resposta perdida após criar'));
  view({ ...props(), restoreId: m.current.restoreId });
  await screen.findByRole('button', { name: 'Criar cópia privada' });
  await userEvent.click(screen.getByRole('button', { name: 'Criar cópia privada' }));
  await screen.findByText(/Resposta perdida após criar/);
  expect(screen.queryByRole('button', { name: 'Criar cópia privada' })).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retomar' })).toBeInTheDocument();
  expect(m.activate).toHaveBeenCalledTimes(1);
});

it('retired stale activation presents a changed universe review and requires another explicit confirmation', async () => {
  m.current = {
    ...m.current,
    state: 'content-verified',
    preparation: { phase: 'activation-ready' },
  };
  m.activate.mockImplementationOnce(async () => {
    m.current = { ...m.current, checkpoint: m.current.checkpoint + 1 };
    m.final = {
      ...m.final,
      checkpoint: m.current.checkpoint,
      reviewToken: 'f'.repeat(64),
      summary: {
        ...m.final.summary,
        universe: { originKind: 'reference', observed: 'unavailable', universeId: null },
      },
    };
    return { kind: 'retired' };
  });
  view({ ...props(), restoreId: m.current.restoreId });
  const old = structuredClone(m.final);
  await userEvent.click(await screen.findByRole('button', { name: 'Criar cópia privada' }));
  const region = await screen.findByRole('region', { name: 'Revisão da cópia privada' });
  await waitFor(() => expect(region).toHaveTextContent(/indisponível/));
  expect(m.activate).toHaveBeenCalledExactlyOnceWith(old);
  expect(screen.queryByRole('button', { name: 'Abrir livro' })).not.toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Criar cópia privada' }));
  await screen.findByRole('button', { name: 'Abrir livro' });
  expect(m.activate).toHaveBeenLastCalledWith(m.final);
  expect(m.activate).toHaveBeenCalledTimes(2);
});
