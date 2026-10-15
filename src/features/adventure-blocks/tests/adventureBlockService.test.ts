import { beforeEach, expect, it, vi } from 'vitest';
import { getFunctions, httpsCallable } from 'firebase/functions';
import * as api from '../services/adventureBlockService';
import * as preview from '../services/adventurePreviewCallables';
import { blockAudience, adventureBlockPath } from '../model/adventureBlock';
import {
  clearPendingAdventureBlockOperation,
  readPendingAdventureBlockOperation,
  writePendingAdventureBlockOperation,
  readAdventureBlockDraft,
  writeAdventureBlockDraft,
  clearAdventureBlockDraft,
} from '../services/adventureBlockRecovery';
const app = vi.hoisted(() => ({ name: 'owner-app' }));
vi.mock('@/shared/lib', () => ({ getFirebaseApp: () => app }));
vi.mock('firebase/functions', () => ({
  getFunctions: vi.fn().mockReturnValue({}),
  httpsCallable: vi.fn(),
}));
const call = vi.fn();
beforeEach(() => {
  vi.clearAllMocks();
  call.mockReset().mockResolvedValue({ data: null });
  vi.mocked(httpsCallable).mockReturnValue(call as never);
});
it('mantém as dez operações na fronteira autenticada, sem enviar palavras ou autoridade do cliente', async () => {
  const resource = { kind: 'block' as const, id: 'block' };
  const base = { adventureId: 'adventure', operationId: 'stable' };
  await api.listAdventureBlocks({
    adventureId: 'adventure',
    sceneId: 'scene',
    cursor: 'next',
    limit: 25,
  });
  expect(call).toHaveBeenLastCalledWith({
    adventureId: 'adventure',
    sceneId: 'scene',
    cursor: 'next',
    limit: 25,
  });
  await api.getAdventureBlock({ adventureId: 'adventure', resource });
  expect(call).toHaveBeenLastCalledWith({ adventureId: 'adventure', resource });
  await api.createAdventureBlock({ ...base, sceneId: 'scene', title: 'Pista' });
  expect(call).toHaveBeenLastCalledWith({ ...base, sceneId: 'scene', title: 'Pista' });
  await api.updateAdventureBlock({
    ...base,
    resource,
    expectedRevision: 2,
    patch: { content: '<p>Texto</p>' },
  });
  expect(call).toHaveBeenLastCalledWith({
    ...base,
    resource,
    expectedRevision: 2,
    patch: { content: '<p>Texto</p>' },
  });
  await api.duplicateAdventureBlock({ ...base, resource, expectedRevision: 2 });
  await api.moveAdventureBlock({
    ...base,
    resource,
    expectedRevision: 2,
    expectedStructureRevision: 4,
    direction: 'up',
  });
  await api.archiveAdventureBlock({
    ...base,
    blockId: 'block',
    expectedRevision: 2,
    archived: true,
  });
  await api.deleteAdventureBlock({ ...base, blockId: 'block', expectedRevision: 2 });
  await api.verifyAdventureBlockCount({
    ...base,
    sceneId: 'scene',
    expectedSceneRevision: 4,
    limit: 25,
  });
  expect(call).toHaveBeenLastCalledWith({
    ...base,
    sceneId: 'scene',
    expectedSceneRevision: 4,
    limit: 25,
  });
  await api.getAdventureBlockCountStatus({ adventureId: 'adventure', sceneId: 'scene' });
  expect(call).toHaveBeenLastCalledWith({ adventureId: 'adventure', sceneId: 'scene' });
  expect(httpsCallable).toHaveBeenCalledTimes(10);
  expect(getFunctions).toHaveBeenCalledWith(app, 'us-central1');
});
it('preserva erro definitivo e identifica transporte incerto para repetir o recibo', async () => {
  const failure = Object.assign(new Error('A revisão mudou'), {
    code: 'functions/failed-precondition',
  });
  call.mockRejectedValueOnce(failure).mockRejectedValueOnce(null);
  await expect(
    api.getAdventureBlock({ adventureId: 'adventure', resource: { kind: 'block', id: 'block' } }),
  ).rejects.toBe(failure);
  await expect(
    api.listAdventureBlocks({ adventureId: 'adventure', sceneId: 'scene' }),
  ).rejects.toMatchObject({ code: 'functions/unavailable' });
});
it('transporte de prévia separa os quatro endpoints e envia apenas o contrato observado', async () => {
  const resource = { kind: 'block' as const, id: 'block' };
  await preview.getAdventureBlockImage({ adventureId: 'adventure', resource });
  expect(call).toHaveBeenLastCalledWith({ adventureId: 'adventure', resource });
  await preview.setAdventureBlockImage({
    adventureId: 'adventure',
    resource,
    operationId: 'same-image',
    expectedRevision: 4,
    image: { imageId: 'image', alt: 'Mapa', caption: 'Porto' },
  });
  expect(call).toHaveBeenLastCalledWith({
    adventureId: 'adventure',
    resource,
    operationId: 'same-image',
    expectedRevision: 4,
    image: { imageId: 'image', alt: 'Mapa', caption: 'Porto' },
  });
  await preview.readAdventureScenePreview({
    adventureId: 'adventure',
    sceneId: 'scene',
    audience: 'players',
    cursor: 'opaque',
    limit: 25,
  });
  expect(call).toHaveBeenLastCalledWith({
    adventureId: 'adventure',
    sceneId: 'scene',
    audience: 'players',
    cursor: 'opaque',
    limit: 25,
  });
  await preview.readAdventurePreviewImage({
    adventureId: 'adventure',
    sceneId: 'scene',
    audience: 'players',
    projectionToken: 'a'.repeat(64),
    imageKey: 'allowed',
  });
  expect(call).toHaveBeenLastCalledWith({
    adventureId: 'adventure',
    sceneId: 'scene',
    audience: 'players',
    projectionToken: 'a'.repeat(64),
    imageKey: 'allowed',
  });
  expect(httpsCallable).toHaveBeenCalledTimes(4);
});
it('fila de cena inclui UID e mantém ordem após rejeição da operação anterior', async () => {
  let reject!: (cause: Error) => void;
  const first = api.runAdventureBlockOperation(
    'owner',
    'adventure',
    'scene',
    () =>
      new Promise<never>((_resolve, fail) => {
        reject = fail;
      }),
  );
  const next = vi.fn().mockResolvedValue('next');
  const second = api.runAdventureBlockOperation('owner', 'adventure', 'scene', next);
  await expect(
    api.runAdventureBlockOperation('other', 'adventure', 'scene', () => Promise.resolve('other')),
  ).resolves.toBe('other');
  expect(next).not.toHaveBeenCalled();
  reject(new Error('offline'));
  await expect(first).rejects.toThrow('offline');
  await expect(second).resolves.toBe('next');
});
it('rascunhos são isolados por UID, aventura, cena e bloco, sem limpar texto mais recente', () => {
  const resource = { kind: 'block' as const, id: 'block' };
  expect(
    writeAdventureBlockDraft('owner', 'adventure', 'scene', resource, {
      content: 'Texto',
      revision: 2,
      savedAt: 10,
    }),
  ).toBe(true);
  expect(readAdventureBlockDraft('owner', 'adventure', 'scene', resource)?.content).toBe('Texto');
  for (const [uid, adventure, scene, id] of [
    ['other', 'adventure', 'scene', 'block'],
    ['owner', 'other', 'scene', 'block'],
    ['owner', 'adventure', 'other', 'block'],
    ['owner', 'adventure', 'scene', 'other'],
  ])
    expect(
      readAdventureBlockDraft(uid!, adventure!, scene!, { kind: 'block', id: id! }),
    ).toBeNull();
  clearAdventureBlockDraft('owner', 'adventure', 'scene', resource, 'Old');
  expect(readAdventureBlockDraft('owner', 'adventure', 'scene', resource)).not.toBeNull();
  clearAdventureBlockDraft('owner', 'adventure', 'scene', resource, 'Texto');
  expect(readAdventureBlockDraft('owner', 'adventure', 'scene', resource)).toBeNull();
});
it('guarda payload original incerto e impede outra operação na mesma cena', () => {
  const operation = {
    method: 'updateAdventureBlock' as const,
    input: {
      adventureId: 'adventure',
      resource: { kind: 'block' as const, id: 'block' },
      operationId: 'stable',
      expectedRevision: 2,
      patch: { content: 'Meu texto' },
    },
  };
  writePendingAdventureBlockOperation('owner', 'adventure', 'scene', operation);
  expect(readPendingAdventureBlockOperation('owner', 'adventure', 'scene')).toEqual(operation);
  expect(readPendingAdventureBlockOperation('other', 'adventure', 'scene')).toBeNull();
  expect(() =>
    writePendingAdventureBlockOperation('owner', 'adventure', 'scene', {
      ...operation,
      input: { ...operation.input, operationId: 'new' },
    }),
  ).toThrow('operação pendente');
  clearPendingAdventureBlockOperation('owner', 'adventure', 'scene', 'new');
  expect(readPendingAdventureBlockOperation('owner', 'adventure', 'scene')).toEqual(operation);
  clearPendingAdventureBlockOperation('owner', 'adventure', 'scene', 'stable');
  expect(readPendingAdventureBlockOperation('owner', 'adventure', 'scene')).toBeNull();
});
it('padrão sem classificação é privado e rotas mantêm cena/bloco distintos', () => {
  expect(blockAudience(undefined)).toBe('creator');
  expect(blockAudience('public')).toBe('creator');
  expect(blockAudience('gm')).toBe('gm');
  expect(blockAudience('players')).toBe('players');
  expect(adventureBlockPath('a', 's', { kind: 'scene', id: 's' })).toBe('/adventures/a/scenes/s');
  expect(adventureBlockPath('a', 's', { kind: 'block', id: 'x y' })).toBe(
    '/adventures/a/scenes/s/blocks/x%20y',
  );
});
