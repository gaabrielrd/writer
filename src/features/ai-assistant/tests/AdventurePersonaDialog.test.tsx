import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, expect, it, vi } from 'vitest';
import { chooseDropdown } from '@/test/dropdown';
import { AdventurePersonaDialog } from '../components/AdventurePersonaDialog';
import { createAdventurePersonaService } from '../services/editorChatPersonaService';
import { subscribePersonas } from '../services/personaService';
import type {
  EditorChatOperationRow,
  EditorChatPersonaBinding,
  EditorChatReceipt,
  EditorChatResolution,
} from '../model/editorChat';
import { hash, rowFor, requestFor } from './editorChatTestFixtures';
vi.mock('../services/editorChatPersonaService', () => ({ createAdventurePersonaService: vi.fn() }));
vi.mock('../services/personaService', () => ({ subscribePersonas: vi.fn() }));

const binding = (sceneId: string | null = null): EditorChatPersonaBinding => ({
  schemaVersion: 1,
  ownerId: 'user',
  adventureId: 'adventure',
  adventureToken: hash('1'),
  sceneId,
  sceneToken: sceneId === null ? null : hash('d'),
  personaRevision: 1,
  bindingToken: hash('7'),
  value: sceneId === null ? { personaId: null } : { personaComplement: null },
  updatedAt: 1,
});
const receipt = (current: EditorChatPersonaBinding): EditorChatReceipt => ({
  schemaVersion: 1,
  action: 'setAdventurePersonaBinding',
  operationId: 'operation',
  requestHash: hash('a'),
  outcome: 'confirmed',
  confirmedAt: 1,
  result: {
    kind: 'persona-binding',
    adventureId: current.adventureId,
    adventureToken: current.adventureToken,
    sceneId: current.sceneId,
    sceneToken: current.sceneToken,
    personaRevision: current.personaRevision,
    bindingToken: current.bindingToken,
  },
});
function session(sceneId: string | null = null) {
  const base = binding(),
    selected = binding(sceneId);
  return {
    load: vi.fn().mockResolvedValue({ base, binding: selected }),
    save: vi.fn().mockResolvedValue({ receipt: receipt(selected), current: selected }),
    recover: vi
      .fn<(intent: 'observe' | 'cancel') => Promise<EditorChatResolution>>()
      .mockResolvedValue({ state: 'unknown', receipt: null }),
    pending: vi.fn<() => EditorChatOperationRow | null>().mockReturnValue(null),
    subscribe: vi.fn<(listener: () => void) => () => void>().mockReturnValue(vi.fn()),
    dispose: vi.fn(),
  };
}
let current: ReturnType<typeof session>;
beforeEach(() => {
  vi.clearAllMocks();
  current = session();
  vi.mocked(createAdventurePersonaService).mockReturnValue(current);
  vi.mocked(subscribePersonas).mockImplementation((_uid, onData) => {
    onData([]);
    return vi.fn();
  });
});
const props = () => ({
  uid: 'user',
  adventureId: 'adventure',
  sceneId: null,
  onClose: vi.fn(),
  onChanged: vi.fn(),
  onPendingChange: vi.fn(),
});

it('loads the root before scenes, shows an unassigned base and saves an explicit choice', async () => {
  const user = userEvent.setup(),
    p = props();
  render(<AdventurePersonaDialog {...p} />);
  expect(screen.getByText('Carregando vínculo da persona...')).toBeVisible();
  expect(await screen.findByText('Sem persona base')).toBeVisible();
  expect(screen.getByText('Base da aventura')).toBeVisible();
  expect(createAdventurePersonaService).toHaveBeenCalledWith(
    expect.objectContaining({ uid: 'user', adventureId: 'adventure', sceneId: null }),
  );
  await chooseDropdown(user, screen.getByLabelText('Persona base'), 'O Incisivo');
  await user.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
  await waitFor(() => expect(current.save).toHaveBeenCalledWith({ personaId: 'preset-incisive' }));
  expect(p.onChanged).toHaveBeenCalledTimes(1);
  expect(p.onClose).toHaveBeenCalledTimes(1);
  expect(p.onPendingChange).toHaveBeenCalledWith(true);
  expect(p.onPendingChange).toHaveBeenLastCalledWith(false);
});

it('retains the selected persona after a CAS failure and does not reload or retry automatically', async () => {
  const user = userEvent.setup(),
    p = props();
  current.save.mockRejectedValueOnce(new Error('O vínculo mudou; confira a confirmação.'));
  render(<AdventurePersonaDialog {...p} />);
  await chooseDropdown(user, await screen.findByLabelText('Persona base'), 'O Incisivo');
  await user.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
  expect(await screen.findByText('O vínculo mudou; confira a confirmação.')).toBeVisible();
  expect(screen.getByLabelText('Persona base')).toHaveTextContent('O Incisivo');
  expect(current.load).toHaveBeenCalledTimes(1);
  expect(current.save).toHaveBeenCalledTimes(1);
  expect(p.onClose).not.toHaveBeenCalled();
  expect(p.onChanged).not.toHaveBeenCalled();
});

it('edits a scene complement and zero override with adventure labels; blocks inherit without a new layer', async () => {
  const user = userEvent.setup(),
    p = { ...props(), sceneId: 'scene' };
  current = session('scene');
  current.load.mockResolvedValue({
    base: { ...binding(), value: { personaId: 'preset-atmospheric' } },
    binding: binding('scene'),
  });
  vi.mocked(createAdventurePersonaService).mockReturnValue(current);
  render(<AdventurePersonaDialog {...p} />);
  await chooseDropdown(user, await screen.findByLabelText('Persona complementar'), 'O Inquietante');
  expect(screen.getByText('Base da aventura')).toBeVisible();
  expect(screen.getByText('Complemento da cena')).toBeVisible();
  expect(screen.getByText(/Os blocos desta cena herdam/)).toBeVisible();
  const inherited = screen.getByRole('progressbar', { name: 'Tensão' });
  expect(
    within(inherited.closest('article')!).getByText('Aventura', { exact: true }),
  ).toBeVisible();
  await chooseDropdown(user, screen.getByLabelText('Aplicação de Tensão'), 'Definir na cena');
  fireEvent.change(screen.getByRole('slider', { name: 'Tensão' }), { target: { value: '0' } });
  expect(screen.getByText('Ajuste da cena')).toBeVisible();
  await user.click(screen.getByText('Orientações efetivas'));
  expect(screen.getByText(/Persona da aventura: O Atmosférico/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
  await waitFor(() =>
    expect(current.save).toHaveBeenCalledWith({
      personaComplement: {
        personaId: 'preset-unsettling',
        overrides: [{ traitId: 'tension', value: 0 }],
      },
    }),
  );
});

it('keeps the live form and offers explicit observe/cancel for uncertain metadata without replay', async () => {
  const user = userEvent.setup(),
    p = props();
  let pending: EditorChatOperationRow | null = null;
  current.pending.mockImplementation(() => pending);
  current.save.mockImplementationOnce(async () => {
    pending = { ...rowFor(await requestFor('setAdventurePersonaBinding')), state: 'uncertain' };
    throw new Error('Resposta não confirmada');
  });
  current.recover.mockImplementation((intent) => {
    if (intent === 'observe') return Promise.resolve({ state: 'unknown', receipt: null });
    const original = pending!;
    pending = null;
    return Promise.resolve({
      state: 'settled',
      receipt: {
        schemaVersion: 1,
        operationId: original.operationId,
        action: original.action,
        requestHash: original.requestHash,
        confirmedAt: 2,
        outcome: 'canceled',
        result: { kind: 'fence' },
      },
    });
  });
  render(<AdventurePersonaDialog {...p} />);
  await chooseDropdown(user, await screen.findByLabelText('Persona base'), 'O Incisivo');
  await user.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
  expect(await screen.findByText('Resposta não confirmada')).toBeVisible();
  expect(p.onPendingChange).toHaveBeenLastCalledWith(true);
  await user.click(screen.getByRole('button', { name: 'Conferir pendência' }));
  expect(await screen.findByText(/Nenhum vínculo foi reenviado/)).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Cancelar pendência' }));
  expect(await screen.findByText('Pedido cancelado. Sua seleção foi mantida.')).toBeVisible();
  expect(screen.getByLabelText('Persona base')).toHaveTextContent('O Incisivo');
  expect(current.save).toHaveBeenCalledTimes(1);
  expect(current.load).toHaveBeenCalledTimes(1);
  expect(current.recover.mock.calls).toEqual([['observe'], ['cancel']]);
  expect(p.onPendingChange).toHaveBeenLastCalledWith(false);
  expect(p.onClose).not.toHaveBeenCalled();
});

it('does not replace adjustments on a confirmed historical receipt or on an explicit confirmation reload', async () => {
  const user = userEvent.setup(),
    p = props();
  let pending: EditorChatOperationRow | null = rowFor(
    await requestFor('setAdventurePersonaBinding'),
  );
  current.pending.mockImplementation(() => pending);
  current.recover.mockImplementation(() => {
    pending = null;
    return Promise.resolve({ state: 'settled', receipt: receipt(binding()) });
  });
  render(<AdventurePersonaDialog {...p} />);
  await chooseDropdown(user, await screen.findByLabelText('Persona base'), 'O Incisivo');
  await user.click(screen.getByRole('button', { name: 'Conferir pendência' }));
  expect(await screen.findByText(/Pedido confirmado. Confira o vínculo atual/)).toBeVisible();
  expect(screen.getByLabelText('Persona base')).toHaveTextContent('O Incisivo');
  expect(current.load).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole('button', { name: 'Conferir vínculo atual e manter ajustes' }));
  expect(
    await screen.findByText(/Vínculo atual conferido. Sua seleção e seus ajustes foram mantidos/),
  ).toBeVisible();
  expect(screen.getByLabelText('Persona base')).toHaveTextContent('O Incisivo');
  expect(current.load).toHaveBeenCalledTimes(2);
  expect(current.save).not.toHaveBeenCalled();
  expect(p.onClose).not.toHaveBeenCalled();
});

it('shows a retryable load error and ignores the old actor response after changing UID', async () => {
  const p = props();
  current.load.mockRejectedValueOnce(new Error('Consulta indisponível'));
  const view = render(<AdventurePersonaDialog {...p} />);
  expect(await screen.findByText('Consulta indisponível')).toBeVisible();
  const old = current,
    next = session();
  let deliver!: (value: {
    base: EditorChatPersonaBinding;
    binding: EditorChatPersonaBinding;
  }) => void;
  next.load.mockReturnValueOnce(
    new Promise((resolve) => {
      deliver = resolve;
    }),
  );
  vi.mocked(createAdventurePersonaService).mockReturnValue(next);
  fireEvent.click(screen.getByRole('button', { name: 'Tentar novamente' }));
  expect(old.dispose).toHaveBeenCalled();
  await waitFor(() => expect(next.load).toHaveBeenCalledTimes(1));
  const other = session();
  vi.mocked(createAdventurePersonaService).mockReturnValue(other);
  view.rerender(<AdventurePersonaDialog {...p} uid="other" />);
  expect(await screen.findByText('Sem persona base')).toBeVisible();
  act(() =>
    deliver({
      base: { ...binding(), value: { personaId: 'preset-incisive' } },
      binding: binding(),
    }),
  );
  expect(screen.getByLabelText('Persona base')).toHaveTextContent('Sem persona');
  expect(next.dispose).toHaveBeenCalled();
  expect(other.save).not.toHaveBeenCalled();
});

it('hides the former actor profile when the service invalidates authorization', async () => {
  const p = props();
  render(<AdventurePersonaDialog {...p} />);
  await screen.findByText('Sem persona base');
  act(() => vi.mocked(createAdventurePersonaService).mock.calls[0]![0].onInvalidated?.());
  expect(screen.getByText('A conta mudou. Feche esta janela e abra novamente.')).toBeVisible();
  expect(screen.queryByLabelText('Persona base')).not.toBeInTheDocument();
  expect(current.save).not.toHaveBeenCalled();
});

it('can resolve original operation metadata even when the adventure getter is unavailable', async () => {
  const user = userEvent.setup(),
    p = props();
  let pending: EditorChatOperationRow | null = rowFor(
    await requestFor('setAdventurePersonaBinding'),
  );
  current.pending.mockImplementation(() => pending);
  current.load.mockRejectedValueOnce(new Error('Aventura indisponível'));
  current.recover.mockImplementation(() => {
    const original = pending!;
    pending = null;
    return Promise.resolve({
      state: 'settled',
      receipt: {
        schemaVersion: 1,
        operationId: original.operationId,
        action: original.action,
        requestHash: original.requestHash,
        outcome: 'canceled',
        confirmedAt: 2,
        result: { kind: 'fence' },
      },
    });
  });
  render(<AdventurePersonaDialog {...p} />);
  expect(await screen.findByText('Aventura indisponível')).toBeVisible();
  await user.keyboard('{Escape}');
  expect(p.onClose).not.toHaveBeenCalled();
  await user.click(await screen.findByRole('button', { name: 'Cancelar pendência' }));
  expect(await screen.findByText('Pedido cancelado. Sua seleção foi mantida.')).toBeVisible();
  expect(current.save).not.toHaveBeenCalled();
  expect(current.recover).toHaveBeenCalledWith('cancel');
  expect(p.onPendingChange).toHaveBeenLastCalledWith(false);
});

it('keeps uncertain metadata guarded through Escape and Cancel until the original request is resolved', async () => {
  const user = userEvent.setup(),
    p = props();
  let pending: EditorChatOperationRow | null = {
    ...rowFor(await requestFor('setAdventurePersonaBinding')),
    state: 'uncertain',
  };
  current.pending.mockImplementation(() => pending);
  current.recover.mockImplementation(() => {
    const original = pending!;
    pending = null;
    return Promise.resolve({
      state: 'settled',
      receipt: {
        schemaVersion: 1,
        operationId: original.operationId,
        action: original.action,
        requestHash: original.requestHash,
        outcome: 'canceled',
        confirmedAt: 2,
        result: { kind: 'fence' },
      },
    });
  });
  render(<AdventurePersonaDialog {...p} />);
  await screen.findByRole('button', { name: 'Cancelar pendência' });
  await user.keyboard('{Escape}');
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(p.onClose).not.toHaveBeenCalled();
  expect(
    await screen.findByText('Confira ou cancele o pedido pendente antes de fechar esta janela.'),
  ).toBeVisible();
  expect(p.onPendingChange).toHaveBeenLastCalledWith(true);
  await user.click(screen.getByRole('button', { name: 'Cancelar pendência' }));
  expect(await screen.findByText('Pedido cancelado. Sua seleção foi mantida.')).toBeVisible();
  await user.click(screen.getByRole('button', { name: 'Cancelar' }));
  expect(p.onClose).toHaveBeenCalledTimes(1);
  expect(p.onPendingChange).toHaveBeenLastCalledWith(false);
  expect(current.save).not.toHaveBeenCalled();
});

it('can close persona when another tab owns a foreign chat request, preserving that row for the workspace', async () => {
  const user = userEvent.setup(),
    p = { ...props(), sceneId: 'scene' };
  current = session('scene');
  vi.mocked(createAdventurePersonaService).mockReturnValue(current);
  render(<AdventurePersonaDialog {...p} />);
  await screen.findByLabelText('Persona complementar');
  const foreign = {
    ...rowFor(await requestFor('prepareContext')),
    target: { kind: 'adventure' as const, id: 'adventure' },
    resource: { kind: 'scene' as const, id: 'scene' },
  };
  current.pending.mockReturnValue(foreign);
  act(() => current.subscribe.mock.calls[0]![0]());
  expect(await screen.findByText(/Abra o chat para conferir esta pendência/)).toBeVisible();
  await user.keyboard('{Escape}');
  expect(p.onClose).toHaveBeenCalledTimes(1);
  expect(current.pending()).toBe(foreign);
  expect(current.recover).not.toHaveBeenCalled();
  expect(current.save).not.toHaveBeenCalled();
});

it('keeps the caller busy when a settled journal notification arrives before save finishes', async () => {
  const user = userEvent.setup(),
    p = props();
  let finish!: (result: { current: EditorChatPersonaBinding; receipt: EditorChatReceipt }) => void;
  current.save.mockReturnValueOnce(
    new Promise((resolve) => {
      finish = resolve;
    }),
  );
  render(<AdventurePersonaDialog {...p} />);
  await screen.findByLabelText('Persona base');
  await user.click(screen.getByRole('button', { name: 'Salvar vínculo' }));
  act(() => current.subscribe.mock.calls[0]![0]());
  expect(p.onPendingChange).toHaveBeenLastCalledWith(true);
  await act(() => {
    finish({ current: binding(), receipt: receipt(binding()) });
    return Promise.resolve();
  });
  await waitFor(() => expect(p.onPendingChange).toHaveBeenLastCalledWith(false));
  expect(p.onClose).toHaveBeenCalledTimes(1);
});
