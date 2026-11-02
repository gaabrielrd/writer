import { beforeEach, expect, it, vi } from 'vitest';
import * as service from '../services/workProgressService';
const wire = vi.hoisted(() => ({
  request: vi.fn<(name: string, input: unknown) => Promise<{ data: unknown }>>(),
}));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => ({ app: 'writer' }) }));
vi.mock('firebase/functions', () => ({
  getFunctions: () => ({ region: 'us-central1' }),
  httpsCallable: (_client: unknown, name: string) => (input: unknown) => wire.request(name, input),
}));
beforeEach(() => {
  vi.clearAllMocks();
  wire.request.mockResolvedValue({ data: { accepted: true } });
});
const target = { kind: 'adventure' as const, id: 'project' };
const cases = [
  { name: 'getWorkProgress', input: { target }, run: () => service.getWorkProgress({ target }) },
  {
    name: 'updateWorkProgress',
    input: { target, operationId: 'op', expectedRevision: 1, patch: { wordGoal: 100 } },
    run: () =>
      service.updateWorkProgress({
        target,
        operationId: 'op',
        expectedRevision: 1,
        patch: { wordGoal: 100 },
      }),
  },
  {
    name: 'prepareWorkWordCount',
    input: { target, operationId: 'op', limit: 25 },
    run: () => service.prepareWorkWordCount({ target, operationId: 'op', limit: 25 }),
  },
  {
    name: 'listWorkChecklist',
    input: { target, filter: 'pending', limit: 25, cursor: 'next' },
    run: () => service.listWorkChecklist({ target, filter: 'pending', limit: 25, cursor: 'next' }),
  },
  {
    name: 'createWorkChecklistItem',
    input: { target, operationId: 'op', title: 'Pistas' },
    run: () => service.createWorkChecklistItem({ target, operationId: 'op', title: 'Pistas' }),
  },
  {
    name: 'updateWorkChecklistItem',
    input: {
      target,
      id: 'task',
      operationId: 'op',
      expectedRevision: 1,
      patch: { completed: true },
    },
    run: () =>
      service.updateWorkChecklistItem({
        target,
        id: 'task',
        operationId: 'op',
        expectedRevision: 1,
        patch: { completed: true },
      }),
  },
  {
    name: 'deleteWorkChecklistItem',
    input: { target, id: 'task', operationId: 'op', expectedRevision: 1 },
    run: () =>
      service.deleteWorkChecklistItem({
        target,
        id: 'task',
        operationId: 'op',
        expectedRevision: 1,
      }),
  },
  { name: 'getWorkPreferences', input: {}, run: () => service.getWorkPreferences() },
  {
    name: 'saveWorkPreferences',
    input: { operationId: 'op', expectedRevision: 0, timeZone: 'UTC' },
    run: () =>
      service.saveWorkPreferences({ operationId: 'op', expectedRevision: 0, timeZone: 'UTC' }),
  },
  {
    name: 'recordWorkActivity',
    input: {
      target,
      resource: { kind: 'scene', id: 'scene' },
      operationId: 'op',
      expectedActivityRevision: 3,
    },
    run: () =>
      service.recordWorkActivity({
        target,
        resource: { kind: 'scene', id: 'scene' },
        operationId: 'op',
        expectedActivityRevision: 3,
      }),
  },
  { name: 'listWorkResume', input: {}, run: () => service.listWorkResume() },
  {
    name: 'resolveWorkResume',
    input: { target },
    run: () => service.resolveWorkResume({ target }),
  },
];
it.each(cases)(
  'transmite contrato $name sem campos privados adicionais',
  async ({ name, input, run }) => {
    await expect(run()).resolves.toEqual({ accepted: true });
    expect(wire.request).toHaveBeenCalledWith(name, input);
  },
);
it.each(['internal', 'unavailable', 'deadline-exceeded', 'cancelled'])(
  'traduz transporte %s preservando código/cause',
  async (code) => {
    const cause = Object.assign(new Error(code), { code: 'functions/' + code });
    wire.request.mockRejectedValue(cause);
    await expect(service.getWorkProgress({ target })).rejects.toMatchObject({
      message: 'Não foi possível confirmar esta operação. Tente novamente.',
      code: 'functions/' + code,
      cause,
    });
  },
);
it('preserva validação e details de conflito do servidor', async () => {
  const cause = Object.assign(new Error('Meta inválida'), {
    code: 'functions/invalid-argument',
    details: { reason: 'invalid-goal' },
  });
  wire.request.mockRejectedValue(cause);
  await expect(
    service.updateWorkProgress({
      target,
      operationId: 'op',
      expectedRevision: 1,
      patch: { wordGoal: 0 },
    }),
  ).rejects.toBe(cause);
  wire.request.mockRejectedValue('transport');
  await expect(service.getWorkPreferences()).rejects.toThrow('acessar seu progresso');
});
