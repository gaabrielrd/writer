import { beforeEach, expect, it, vi } from 'vitest';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as api from '../services/sceneService';
import { target } from './sceneFixtures';
const app = vi.hoisted(() => ({ name: 'auth-app' }));
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
const cases: [string, () => Promise<unknown>, unknown][] = [
  [
    'createScene',
    () => api.createScene({ ...base, title: 'Cena', parentId: null }),
    { ...base, title: 'Cena', parentId: null },
  ],
  [
    'updateScene',
    () =>
      api.updateScene({
        ...base,
        sceneId: 'scene',
        expectedRevision: 1,
        patch: { content: 'Texto' },
      }),
    { ...base, sceneId: 'scene', expectedRevision: 1, patch: { content: 'Texto' } },
  ],
  [
    'moveScene',
    () =>
      api.moveScene({
        ...base,
        sceneId: 'scene',
        expectedRevision: 1,
        parentId: 'chapter',
        expectedSourceStructureRevision: 1,
        expectedTargetStructureRevision: 2,
        beforeId: 'neighbor',
      }),
    {
      ...base,
      sceneId: 'scene',
      expectedRevision: 1,
      parentId: 'chapter',
      expectedSourceStructureRevision: 1,
      expectedTargetStructureRevision: 2,
      beforeId: 'neighbor',
    },
  ],
  [
    'archiveScene',
    () => api.archiveScene({ ...base, sceneId: 'scene', expectedRevision: 1, archived: true }),
    { ...base, sceneId: 'scene', expectedRevision: 1, archived: true },
  ],
  ['getScene', () => api.getScene({ target, sceneId: 'scene' }), { target, sceneId: 'scene' }],
  [
    'listScenes',
    () =>
      api.listScenes({
        target,
        parentId: null,
        stage: 'all',
        archived: false,
        cursor: 'opaque',
        limit: 25,
      }),
    { target, parentId: null, stage: 'all', archived: false, cursor: 'opaque', limit: 25 },
  ],
  [
    'listSceneGroups',
    () => api.listSceneGroups({ target, cursor: 'opaque', limit: 50 }),
    { target, cursor: 'opaque', limit: 50 },
  ],
  [
    'getSceneGroup',
    () => api.getSceneGroup({ target, parentId: null }),
    { target, parentId: null },
  ],
  [
    'createSceneGroup',
    () => api.createSceneGroup({ ...base, title: 'Capítulo', actId: 'act' }),
    { ...base, title: 'Capítulo', actId: 'act' },
  ],
  [
    'convertChapterToScenes',
    () =>
      api.convertChapterToScenes({
        ...base,
        parentId: 'chapter',
        expectedSourceVersion: 'fingerprint',
      }),
    { ...base, parentId: 'chapter', expectedSourceVersion: 'fingerprint' },
  ],
  [
    'setSceneReference',
    () =>
      api.setSceneReference({
        ...base,
        sceneId: 'scene',
        expectedRevision: 1,
        reference: { kind: 'book', scopeId: 'book', entityId: 'lia' },
        remove: true,
      }),
    {
      ...base,
      sceneId: 'scene',
      expectedRevision: 1,
      reference: { kind: 'book', scopeId: 'book', entityId: 'lia' },
      remove: true,
    },
  ],
  [
    'listSceneReferences',
    () => api.listSceneReferences({ target, sceneId: 'scene', cursor: 'next', limit: 25 }),
    { target, sceneId: 'scene', cursor: 'next', limit: 25 },
  ],
  [
    'readSceneAssembly',
    () =>
      api.readSceneAssembly({
        target,
        parentId: 'chapter',
        expectedAssemblyRevision: 3,
        cursor: 'next',
        limit: 50,
      }),
    { target, parentId: 'chapter', expectedAssemblyRevision: 3, cursor: 'next', limit: 50 },
  ],
  [
    'rebalanceSceneRanks',
    () => api.rebalanceSceneRanks({ ...base, parentId: null, limit: 50 }),
    { ...base, parentId: null, limit: 50 },
  ],
  [
    'deleteSceneGroup',
    () => api.deleteSceneGroup({ ...base, parentId: 'chapter', expectedUpdatedAt: 100, limit: 50 }),
    { ...base, parentId: 'chapter', expectedUpdatedAt: 100, limit: 50 },
  ],
  [
    'deleteSceneGroups',
    () =>
      api.deleteSceneGroups({
        ...base,
        groups: [{ id: 'chapter', expectedUpdatedAt: 100 }],
        limit: 50,
      }),
    { ...base, groups: [{ id: 'chapter', expectedUpdatedAt: 100 }], limit: 50 },
  ],
  ['deleteSceneBook', () => api.deleteSceneBook({ ...base, limit: 50 }), { ...base, limit: 50 }],
  [
    'listSceneSources',
    () => api.listSceneSources({ target, expectedProjectRevision: 3, limit: 25 }),
    { target, expectedProjectRevision: 3, limit: 25 },
  ],
  ['getSceneJob', () => api.getSceneJob(base), base],
];
it.each(cases)(
  '%s preserva pedido tipado e resposta no app autenticado',
  async (name, invoke, input) => {
    expect(await invoke()).toEqual({ confirmed: true });
    expect(getFunctions).toHaveBeenCalledWith(app, 'us-central1');
    expect(httpsCallable).toHaveBeenCalledWith({}, name);
    expect(call).toHaveBeenCalledWith(input);
  },
);
it.each(['internal', 'unavailable', 'deadline-exceeded', 'cancelled'])(
  'traduz transporte %s preservando código e causa',
  async (code) => {
    const failure = Object.assign(new Error(code), { code: 'functions/' + code });
    call.mockRejectedValue(failure);
    await expect(api.createScene({ ...base, title: 'Cena' })).rejects.toMatchObject({
      code: 'functions/' + code,
      cause: failure,
      message: 'Não foi possível confirmar esta operação. Tente novamente.',
    });
  },
);
it('preserva erro de validação e trata causa desconhecida', async () => {
  const validation = Object.assign(new Error('Título inválido'), {
    code: 'functions/invalid-argument',
  });
  call.mockRejectedValueOnce(validation).mockRejectedValueOnce(null);
  await expect(api.createScene({ ...base, title: '' })).rejects.toBe(validation);
  await expect(api.getScene({ target, sceneId: 'scene' })).rejects.toThrow(
    'Não foi possível acessar as cenas',
  );
});
