import { beforeEach, expect, it, vi } from 'vitest';
import * as api from '../services/adventureLoreCallables';
import { subscribeAdventureLoreHints } from '../services/adventureLoreContext';
import { adventureId, identity, row, contextToken, save } from './adventureLoreFixtures';
type Snapshot = {
  exists: () => boolean;
  data: () => Record<string, unknown>;
  metadata: { fromCache: boolean };
};
type Listener = {
  path: string;
  changed: (snapshot: Snapshot) => void;
  failed: (cause: Error) => void;
  stop: ReturnType<typeof vi.fn>;
};
interface AdapterState {
  listeners: Listener[];
  calls: { name: string; input: unknown }[];
  regions: unknown[][];
  failure: Error | null;
}
const state = vi.hoisted<AdapterState>(() => ({
  listeners: [],
  calls: [],
  regions: [],
  failure: null,
}));
vi.mock('@/shared/lib', () => ({ firestore: {}, getFirebaseApp: () => 'app' }));
vi.mock('firebase/firestore', () => ({
  doc: (_db: unknown, ...segments: string[]) => segments.join('/'),
  onSnapshot: (
    path: string,
    _options: unknown,
    changed: Listener['changed'],
    failed: Listener['failed'],
  ) => {
    const stop = vi.fn();
    state.listeners.push({ path, changed, failed, stop });
    return stop;
  },
}));
vi.mock('firebase/functions', () => ({
  getFunctions: (...args: unknown[]) => {
    state.regions.push(args);
    return 'functions';
  },
  httpsCallable: (_functions: unknown, name: string) => (input: unknown) => {
    state.calls.push({ name, input });
    return state.failure ? Promise.reject(state.failure) : Promise.resolve({ data: { ok: true } });
  },
}));
const snapshot = (value: Record<string, unknown> | null, fromCache = false): Snapshot => ({
  exists: () => value !== null,
  data: () => value ?? {},
  metadata: { fromCache },
});
beforeEach(() => {
  state.listeners = [];
  state.calls = [];
  state.regions = [];
  state.failure = null;
});
it('os cinco transportes preservam nome, pedido e região sem substituir contratos', async () => {
  const get = {
    adventureId,
    adventureToken: identity.adventureToken,
    reference: row.reference,
    expectedContextToken: contextToken,
    expectedEntityToken: row.entityToken,
  };
  await api.listAdventureLore({ adventureId, scope: 'adventure', limit: 25 });
  await api.getAdventureLore(get);
  await api.saveAdventureLore(save);
  const { entity: _entity, ...header } = save;
  void _entity;
  await api.deleteAdventureLore(header);
  await api.resolveAdventureLoreOperation({
    ...header,
    action: 'save',
    requestHash: 'f'.repeat(64),
    intent: 'cancel',
  });
  expect(state.calls.map((call) => call.name)).toEqual([
    'listAdventureLore',
    'getAdventureLore',
    'saveAdventureLore',
    'deleteAdventureLore',
    'resolveAdventureLoreOperation',
  ]);
  expect(state.calls[1]?.input).toBe(get);
  expect(state.calls[2]?.input).toBe(save);
  expect(state.regions).toEqual(Array(5).fill(['app', 'us-central1']));
});
it('erros callable conservam code/details para classificar conflito e incerteza', async () => {
  state.failure = Object.assign(new Error('Conflito'), {
    code: 'functions/failed-precondition',
    details: { reason: 'revision-conflict' },
  });
  await expect(api.listAdventureLore({ adventureId, scope: 'adventure' })).rejects.toBe(
    state.failure,
  );
});
it('hints observam raízes sem autorizar cache, desligam associação velha e ignoram respostas tardias', () => {
  const hint = vi.fn(),
    stop = subscribeAdventureLoreHints({ ownerId: 'owner', adventureId }, hint),
    root = state.listeners[0]!;
  expect(root.path).toBe('adventures/' + adventureId);
  root.changed(
    snapshot({ ownerId: 'owner', universeId: 'world', details: 'NUNCA RETORNADO' }, true),
  );
  expect(hint).toHaveBeenLastCalledWith('root');
  expect(state.listeners).toHaveLength(1);
  root.changed(snapshot({ ownerId: 'owner', universeId: 'world' }));
  const world = state.listeners[1]!;
  expect(world.path).toBe('universes/world');
  world.changed(snapshot({ name: 'MUNDO PRIVADO' }));
  expect(hint).toHaveBeenLastCalledWith('universe');
  root.changed(snapshot({ ownerId: 'owner', universeId: 'other' }));
  expect(world.stop).toHaveBeenCalledOnce();
  const before = hint.mock.calls.length;
  world.changed(snapshot({ name: 'NOME ANTIGO' }));
  world.failed(new Error('late'));
  expect(hint).toHaveBeenCalledTimes(before);
  const other = state.listeners[2]!;
  other.failed(new Error('denied'));
  expect(hint).toHaveBeenLastCalledWith('universe');
  root.changed(snapshot({ ownerId: 'intruder', universeId: 'world' }));
  expect(other.stop).toHaveBeenCalledOnce();
  root.failed(new Error('missing'));
  expect(hint).toHaveBeenLastCalledWith('root');
  stop();
  expect(root.stop).toHaveBeenCalledOnce();
  const closed = hint.mock.calls.length;
  root.changed(snapshot(null));
  root.failed(new Error('late'));
  expect(hint).toHaveBeenCalledTimes(closed);
  expect(hint.mock.calls.flat().every((value) => value === 'root' || value === 'universe')).toBe(
    true,
  );
});
it('raiz ausente ou deleting não cria observador de universo; limpeza é independente', () => {
  const hint = vi.fn(),
    stop = subscribeAdventureLoreHints({ ownerId: 'owner', adventureId }, hint),
    root = state.listeners[0]!;
  root.changed(snapshot(null));
  root.changed(snapshot({ ownerId: 'owner', universeId: 'world', deleting: true }));
  expect(state.listeners).toHaveLength(1);
  stop();
});
