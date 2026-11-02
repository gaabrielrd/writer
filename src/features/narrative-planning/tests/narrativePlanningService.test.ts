import { beforeEach, expect, it, vi } from 'vitest';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as api from '../services/narrativePlanningService';
import { target } from './narrativeFixtures';
const app = vi.hoisted(() => ({ name: 'authenticated-app' }));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => app }));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn().mockReturnValue({}),
  httpsCallable: vi.fn(),
}));
const call = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  call.mockReset().mockResolvedValue({ data: { confirmed: true } });
  vi.mocked(httpsCallable).mockReturnValue(call as never);
});
const base = { target, operationId: 'stable' };
const source = { kind: 'arc' as const, id: 'arc' };
const reference = { kind: 'book' as const, scopeId: 'book', entityId: 'lia' };
const cases: [string, () => Promise<unknown>, unknown][] = [
  ['getNarrativeContext', () => api.getNarrativeContext({ target }), { target }],
  [
    'createNarrativeItem',
    () =>
      api.createNarrativeItem({
        ...base,
        resource: { kind: 'event' },
        title: 'Evento',
        dateLabel: 'Ontem',
      }),
    { ...base, resource: { kind: 'event' }, title: 'Evento', dateLabel: 'Ontem' },
  ],
  [
    'updateNarrativeItem',
    () =>
      api.updateNarrativeItem({
        ...base,
        source,
        expectedRevision: 3,
        patch: { objective: 'Luz' },
      }),
    { ...base, source, expectedRevision: 3, patch: { objective: 'Luz' } },
  ],
  ['getNarrativeItem', () => api.getNarrativeItem({ target, source }), { target, source }],
  [
    'listNarrativeItems',
    () =>
      api.listNarrativeItems({
        target,
        resource: { kind: 'milestone', arcId: 'arc' },
        cursor: 'cursor',
        limit: 25,
      }),
    { target, resource: { kind: 'milestone', arcId: 'arc' }, cursor: 'cursor', limit: 25 },
  ],
  [
    'moveNarrativeItem',
    () =>
      api.moveNarrativeItem({
        ...base,
        source,
        expectedRevision: 3,
        expectedStructureRevision: 4,
        beforeId: 'neighbor',
      }),
    { ...base, source, expectedRevision: 3, expectedStructureRevision: 4, beforeId: 'neighbor' },
  ],
  [
    'deleteNarrativeItem',
    () => api.deleteNarrativeItem({ ...base, source, expectedRevision: 3, limit: 50 }),
    { ...base, source, expectedRevision: 3, limit: 50 },
  ],
  [
    'setNarrativeReference',
    () =>
      api.setNarrativeReference({
        ...base,
        source,
        expectedRevision: 3,
        reference: { kind: 'lore', reference },
        remove: true,
      }),
    { ...base, source, expectedRevision: 3, reference: { kind: 'lore', reference }, remove: true },
  ],
  [
    'listNarrativeReferences',
    () => api.listNarrativeReferences({ target, source, cursor: 'cursor', limit: 25 }),
    { target, source, cursor: 'cursor', limit: 25 },
  ],
  [
    'listNarrativeLoreOptions',
    () => api.listNarrativeLoreOptions({ target, scope: 'book', cursor: 'cursor', limit: 25 }),
    { target, scope: 'book', cursor: 'cursor', limit: 25 },
  ],
  [
    'listEntityScenes',
    () => api.listEntityScenes({ target, reference, cursor: 'cursor', limit: 25 }),
    { target, reference, cursor: 'cursor', limit: 25 },
  ],
  [
    'listEntityNarrativeItems',
    () => api.listEntityNarrativeItems({ target, reference, cursor: 'cursor', limit: 25 }),
    { target, reference, cursor: 'cursor', limit: 25 },
  ],
  [
    'prepareEntitySceneIndex',
    () => api.prepareEntitySceneIndex({ ...base, limit: 50 }),
    { ...base, limit: 50 },
  ],
  [
    'rebalanceNarrativeRanks',
    () => api.rebalanceNarrativeRanks({ ...base, resource: { kind: 'arc' }, limit: 50 }),
    { ...base, resource: { kind: 'arc' }, limit: 50 },
  ],
  ['getNarrativeJob', () => api.getNarrativeJob(base), base],
];
it.each(cases)(
  '%s conserva alvo, CAS/cursor e resposta no app autenticado',
  async (name, invoke, input) => {
    expect(await invoke()).toEqual({ confirmed: true });
    expect(getFunctions).toHaveBeenCalledWith(app, 'us-central1');
    expect(httpsCallable).toHaveBeenCalledWith({}, name);
    expect(call).toHaveBeenCalledWith(input);
  },
);
it.each(['internal', 'unavailable', 'deadline-exceeded', 'cancelled'])(
  'transporte %s mantém código/causa com mensagem recuperável',
  async (code) => {
    const failure = Object.assign(new Error(code), { code: 'functions/' + code });
    call.mockRejectedValue(failure);
    await expect(api.getNarrativeContext({ target })).rejects.toMatchObject({
      code: 'functions/' + code,
      cause: failure,
      message: 'Não foi possível confirmar esta operação. Tente novamente.',
    });
  },
);
it('mantém erro de validação e trata causa desconhecida', async () => {
  const failure = Object.assign(new Error('Título obrigatório.'), {
    code: 'functions/invalid-argument',
  });
  call.mockRejectedValueOnce(failure).mockRejectedValueOnce(null);
  await expect(
    api.createNarrativeItem({ ...base, resource: { kind: 'arc' }, title: '' }),
  ).rejects.toBe(failure);
  await expect(api.getNarrativeContext({ target })).rejects.toThrow(
    'Não foi possível acessar o planejamento',
  );
});
