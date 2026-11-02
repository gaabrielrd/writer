import { createHash } from 'node:crypto';
import type {
  SessionSceneBlockSummary,
  SessionSceneReadScope,
  SessionSceneBlocksPage,
  SessionSceneReadWindow,
  SessionScenePlanItem,
  SessionSceneBlockItem,
  SessionSceneImage,
  SessionSceneReferenceRow,
} from '../model/sessionSceneReference';
import { envelope, scope, context } from './referenceTestHelpers';
export const sceneKey = '1'.repeat(64),
  mainKey = '2'.repeat(64),
  extraKey = '3'.repeat(64),
  imageKey = '4'.repeat(64);
export const scene = {
  kind: 'scene' as const,
  sourceKey: sceneKey,
  title: 'Portão do inverno',
  stage: null,
  archived: false,
};
export const sceneRow: SessionSceneReferenceRow = {
  id: 'scene-reference-0001',
  revision: 1,
  createdAt: 1000,
  updatedAt: 1000,
  available: true,
  target: scene,
};
export const sceneScope: SessionSceneReadScope = {
  ...scope,
  referenceId: sceneRow.id,
  expectedRevision: 1,
  expectedReferenceCollectionRevision: 1,
  sourceContext: context,
};
export const sceneEnvelope = {
  ...envelope,
  referenceId: sceneRow.id,
  referenceRevision: 1,
  sourceContext: context,
};
export const main: SessionSceneBlockSummary = {
  kind: 'block',
  sourceKey: mainKey,
  parentKey: sceneKey,
  title: 'Texto principal',
  orderKey: '2',
  type: 'scene',
  audience: 'creator',
  role: 'main',
  archived: false,
  ownArchived: null,
};
export const extra: SessionSceneBlockSummary = {
  ...main,
  sourceKey: extraKey,
  title: 'Pista secreta',
  orderKey: '1',
  role: 'additional',
  ownArchived: false,
  audience: 'gm',
  type: 'clue',
};
export function blockPage(
  items: SessionSceneBlockSummary[] = [extra, main],
  nextCursor: string | null = null,
): SessionSceneBlocksPage {
  return { ...sceneEnvelope, scene, items, nextCursor };
}
export function contentWindow(
  item: Omit<SessionScenePlanItem, 'fields'> | Omit<SessionSceneBlockItem, 'fields'>,
  texts: Record<string, string>,
  blockKey: string | null = null,
): SessionSceneReadWindow {
  const fields = Object.entries(texts).map(([field, content]) => ({
    field,
    sha256: createHash('sha256').update(content).digest('hex'),
    bytes: Buffer.byteLength(content),
    chunkCount: 1,
  }));
  return {
    ...sceneEnvelope,
    blockKey,
    resourceKey: item.sourceKey,
    resourceKind: blockKey ? 'block' : 'scene-plan',
    material: {
      item: { ...item, fields },
      chunks: Object.entries(texts).map(([field, content]) => ({ field, index: 0, content })),
      nextCursor: null,
    },
  };
}
export const plan = () =>
  contentWindow(
    { kind: 'scene-plan', sourceKey: sceneKey, title: scene.title, stage: null, archived: false },
    { objective: 'Entrar na torre', conflict: 'A ponte caiu' },
  );
export const mainBody = () =>
  contentWindow(
    {
      ...main,
      image: { imageKey, alt: 'Portão sob neve', caption: 'Ilustração capturada' },
    },
    { content: '<p>Principal único 🐉</p>' },
    mainKey,
  );
export const extraBody = () =>
  contentWindow({ ...extra, image: null }, { content: '<p>Segredo do mestre</p>' }, extraKey);
export const image: SessionSceneImage = {
  ...sceneEnvelope,
  blockKey: mainKey,
  imageKey,
  dataUrl: 'data:image/webp;base64,AAAA',
};
