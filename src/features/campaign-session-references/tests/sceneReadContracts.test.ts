import { createHash, webcrypto } from 'node:crypto';
import { beforeEach, expect, it, vi } from 'vitest';
import * as calls from '../services/sessionReferenceCallables';
import {
  readCompleteSessionScene,
  validateSceneBlocks,
  validateSceneImage,
  validateSceneWindow,
} from '../services/sessionSceneReferenceService';
import { validatePending, validatePage } from '../services/sessionReferenceService';
import type { SessionSceneReadWindow } from '../model/sessionSceneReference';
import { uid, context, operation, scope, envelope, deferred } from './referenceTestHelpers';
import {
  sceneScope,
  sceneKey,
  mainKey,
  scene,
  main,
  extra,
  blockPage,
  plan,
  mainBody,
  image,
} from './sceneReferenceHelpers';
vi.mock('../services/sessionReferenceCallables', () => ({
  readCampaignSessionSceneReference: vi.fn(),
}));
beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal('crypto', webcrypto);
});
it('recompõe Unicode somente após último gate, ordem, tamanho e hash, sem usar loader B', async () => {
  const full = '🐉'.repeat(20000),
    first = mainBody(),
    second = mainBody();
  for (const page of [first, second]) {
    page.material!.item.fields = [
      {
        field: 'content',
        sha256: createHash('sha256').update(full).digest('hex'),
        bytes: Buffer.byteLength(full),
        chunkCount: 2,
      },
    ];
  }
  first.material!.chunks = [{ field: 'content', index: 0, content: full.slice(0, 32768) }];
  first.material!.nextCursor = 'second';
  second.material!.chunks = [{ field: 'content', index: 1, content: full.slice(32768) }];
  vi.mocked(calls.readCampaignSessionSceneReference)
    .mockResolvedValueOnce(first)
    .mockResolvedValueOnce(second);
  const observe = vi.fn();
  const result = await readCompleteSessionScene(
    { ...sceneScope, blockKey: mainKey },
    uid,
    sceneKey,
    () => true,
    observe,
  );
  expect(result?.fields.content).toBe(full);
  expect(observe).toHaveBeenCalledTimes(2);
  expect(calls.readCampaignSessionSceneReference).toHaveBeenLastCalledWith({
    ...sceneScope,
    blockKey: mainKey,
    cursor: 'second',
    limit: 4,
  });
});
it.each([
  'empty-cursor',
  'extra-chunks',
  'hash',
  'index',
  'identity',
  'projection',
  'private-field',
] as const)('rejeita composição %s e nunca entrega texto parcial', async (kind) => {
  const value = mainBody();
  if (kind === 'empty-cursor') {
    value.material!.chunks = [];
    value.material!.nextCursor = 'unbounded-new-cursor';
  }
  if (kind === 'extra-chunks')
    value.material!.chunks.push({ ...value.material!.chunks[0]!, index: 1 });
  if (kind === 'hash') value.material!.item.fields[0]!.sha256 = 'f'.repeat(64);
  if (kind === 'index') value.material!.chunks[0]!.index = 1;
  if (kind === 'identity') value.blockKey = 'e'.repeat(64);
  if (kind === 'projection') value.sourceContext = { ...context, projectionToken: 'e'.repeat(64) };
  if (kind === 'private-field')
    Object.assign(value.material!.item.fields[0]!, { bodySourceKey: sceneKey });
  vi.mocked(calls.readCampaignSessionSceneReference).mockResolvedValue(value);
  await expect(
    readCompleteSessionScene(
      { ...sceneScope, blockKey: mainKey },
      uid,
      sceneKey,
      () => true,
      vi.fn(),
    ),
  ).rejects.toThrow();
  expect(calls.readCampaignSessionSceneReference).toHaveBeenCalledOnce();
});
it('novo contexto em página vazia ainda é observado antes da falha e invalida operação criptográfica em voo', async () => {
  const value = mainBody();
  value.sourceContext = { ...context, projectionToken: 'e'.repeat(64) };
  value.material!.chunks = [];
  vi.mocked(calls.readCampaignSessionSceneReference).mockResolvedValue(value);
  let active = true;
  const observe = vi.fn(() => {
    active = false;
  });
  await expect(
    readCompleteSessionScene(
      { ...sceneScope, blockKey: mainKey },
      uid,
      sceneKey,
      () => active,
      observe,
    ),
  ).rejects.toThrow();
  expect(observe).toHaveBeenCalledOnce();
  expect(active).toBe(false);
});
it('troca de seleção durante GET ou hash não publica texto; ausência não reexpõe chave privada da cena', async () => {
  const held = deferred<SessionSceneReadWindow>();
  let active = true;
  vi.mocked(calls.readCampaignSessionSceneReference).mockReturnValue(held.promise);
  const reading = readCompleteSessionScene(sceneScope, uid, sceneKey, () => active, vi.fn());
  active = false;
  held.resolve(plan());
  expect(await reading).toBeNull();
  const unavailable = { ...plan(), resourceKey: null, material: null };
  validateSceneWindow(unavailable, uid, sceneScope, sceneKey);
  expect(() =>
    validateSceneWindow({ ...unavailable, resourceKey: sceneKey }, uid, sceneScope, sceneKey),
  ).toThrow();
});
it('contratos distinguem principal/adicional, wrong parent, arquivo efetivo e plano sem content', () => {
  validateSceneBlocks(blockPage(), uid, sceneScope, sceneKey);
  validateSceneWindow(plan(), uid, sceneScope, sceneKey);
  expect(() =>
    validateSceneBlocks(blockPage([{ ...main, ownArchived: false }]), uid, sceneScope, sceneKey),
  ).toThrow();
  expect(() =>
    validateSceneBlocks(blockPage([{ ...extra, ownArchived: null }]), uid, sceneScope, sceneKey),
  ).toThrow();
  expect(() =>
    validateSceneBlocks(
      blockPage([{ ...main, parentKey: 'f'.repeat(64) }]),
      uid,
      sceneScope,
      sceneKey,
    ),
  ).toThrow();
  expect(() =>
    validateSceneBlocks(
      blockPage([{ ...extra, ownArchived: true, archived: false }]),
      uid,
      sceneScope,
      sceneKey,
    ),
  ).toThrow();
  const invalidPlan = plan();
  invalidPlan.material!.item.fields[0]!.field = 'content';
  expect(() => validateSceneWindow(invalidPlan, uid, sceneScope, sceneKey)).toThrow();
});
it('imagem só aceita bloco/metadado/contexto observados, WebP limitado e ausência null dupla', () => {
  const input = { ...sceneScope, blockKey: mainKey };
  expect(validateSceneImage(image, uid, input, image.imageKey!)).toBe(image.dataUrl);
  expect(() =>
    validateSceneImage({ ...image, imageKey: 'f'.repeat(64) }, uid, input, image.imageKey!),
  ).toThrow();
  expect(() =>
    validateSceneImage(
      { ...image, dataUrl: 'https://storage.invalid/secret' },
      uid,
      input,
      image.imageKey!,
    ),
  ).toThrow();
  expect(() =>
    validateSceneImage({ ...image, dataUrl: null }, uid, input, image.imageKey!),
  ).toThrow();
  expect(
    validateSceneImage({ ...image, imageKey: null, dataUrl: null }, uid, input, image.imageKey!),
  ).toBeNull();
  expect(() =>
    validateSceneImage(
      { ...image, dataUrl: 'data:image/webp;base64,' + 'AAAA'.repeat(524289) },
      uid,
      input,
      image.imageKey!,
    ),
  ).toThrow();
});
it('DTO scene fechado não é LoreCandidate; journal antigo continua válido e scene futuro é preservado', () => {
  validatePending(operation, uid, scope.campaignId);
  const op = {
    ...operation,
    request: { ...operation.request, target: { kind: 'scene' as const, sourceKey: sceneKey } },
  };
  validatePending(op, uid, scope.campaignId);
  const page = {
    ...envelope,
    sourceContext: context,
    view: 'candidates' as const,
    items: [scene],
    nextCursor: null,
  };
  validatePage(page, uid, scope, 'candidates', 'scene');
  expect(() => validatePage(page, uid, scope, 'candidates')).toThrow();
  expect(() =>
    validatePending(
      {
        ...op,
        request: { ...op.request, target: { ...op.request.target, title: 'copiado' } },
      } as typeof op,
      uid,
      scope.campaignId,
    ),
  ).toThrow();
});
