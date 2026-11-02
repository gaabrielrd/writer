import { verifyCampaignBaseFields } from '@/features/campaign-bases';
import type { CampaignBaseChunk, CampaignBaseManifest } from '@/features/campaign-bases';
import type {
  SessionSceneReadScope,
  SessionSceneReadEnvelope,
  SessionSceneBlockSummary,
  SessionSceneProjectedItem,
  SessionSceneBlocksPage,
  SessionSceneReadWindow,
  SessionSceneImage,
  ReadSessionSceneInput,
} from '../model/sessionSceneReference';
import {
  canonical,
  fail,
  hash,
  integer,
  keys,
  source,
  validateEnvelope,
  validateSceneCandidate,
} from './sessionReferenceService';
import { readCampaignSessionSceneReference } from './sessionReferenceCallables';
export type ObserveSessionScene = (value: SessionSceneReadEnvelope) => void;
export function validateSceneEnvelope(
  value: SessionSceneReadEnvelope,
  uid: string,
  input: SessionSceneReadScope,
  observe?: ObserveSessionScene,
) {
  validateEnvelope(value, uid, input);
  source(value.sourceContext);
  if (value.referenceId !== input.referenceId || value.referenceRevision !== input.expectedRevision)
    fail();
  observe?.(value);
  if (
    value.referenceCollectionRevision !== input.expectedReferenceCollectionRevision ||
    (value.sourceContext !== null &&
      canonical(value.sourceContext) !== canonical(input.sourceContext))
  )
    fail('O acesso ou os vínculos da sessão mudaram. Consulte novamente.');
}
const envelopeKeys = [
  'schemaVersion',
  'ownerId',
  'campaignId',
  'campaignToken',
  'sessionId',
  'sessionRevision',
  'referenceCollectionRevision',
  'referenceId',
  'referenceRevision',
  'sourceContext',
];
const blockKeys = [
  'kind',
  'sourceKey',
  'parentKey',
  'title',
  'orderKey',
  'type',
  'audience',
  'role',
  'archived',
  'ownArchived',
];
const narrativeTypes = [
  'introduction',
  'preparation',
  'scene',
  'location',
  'quest',
  'clue',
  'ending',
];
export function validateSceneBlock(
  value: SessionSceneBlockSummary,
  sceneKey: string,
  allowItem = false,
) {
  keys(value, [...blockKeys, ...(allowItem ? ['fields', 'image'] : [])]);
  if (
    value.kind !== 'block' ||
    !hash(value.sourceKey) ||
    value.parentKey !== sceneKey ||
    typeof value.title !== 'string' ||
    typeof value.orderKey !== 'string' ||
    !value.orderKey ||
    !narrativeTypes.includes(value.type) ||
    !['creator', 'gm', 'players'].includes(value.audience) ||
    !['main', 'additional'].includes(value.role) ||
    typeof value.archived !== 'boolean' ||
    (value.role === 'main' ? value.ownArchived !== null : typeof value.ownArchived !== 'boolean') ||
    (value.ownArchived === true && !value.archived)
  )
    fail();
}
function cursor(value: unknown): asserts value is string | null {
  if (value !== null && (typeof value !== 'string' || !value || value.length > 12000)) fail();
}
function manifests(value: CampaignBaseManifest[], allowed: string[]) {
  if (!Array.isArray(value) || value.length > allowed.length) fail();
  const seen = new Set<string>();
  let bytes = 0;
  for (const field of value) {
    keys(field, ['field', 'sha256', 'bytes', 'chunkCount']);
    if (
      !allowed.includes(field.field) ||
      seen.has(field.field) ||
      !hash(field.sha256) ||
      !integer(field.bytes) ||
      !integer(field.chunkCount, 1) ||
      field.chunkCount > Math.max(1, Math.ceil(field.bytes / (65536 - 3)))
    )
      fail();
    seen.add(field.field);
    bytes += field.bytes;
  }
  if (bytes > 2 * 1024 * 1024) fail();
}
export function validateSceneBlocks(
  value: SessionSceneBlocksPage,
  uid: string,
  input: SessionSceneReadScope,
  sceneKey: string,
  observe?: ObserveSessionScene,
) {
  validateSceneEnvelope(value, uid, input, observe);
  keys(value, [...envelopeKeys, 'scene', 'items', 'nextCursor']);
  cursor(value.nextCursor);
  if (!Array.isArray(value.items) || value.items.length > 50) fail();
  if (value.scene === null) {
    if (value.items.length || value.nextCursor !== null) fail();
    return;
  }
  validateSceneCandidate(value.scene);
  if (value.scene.sourceKey !== sceneKey || value.sourceContext === null) fail();
  const seen = new Set<string>();
  for (const block of value.items) {
    validateSceneBlock(block, sceneKey);
    if (
      seen.has(block.sourceKey) ||
      (block.role === 'main' && block.archived !== value.scene.archived) ||
      (block.role === 'additional' &&
        block.archived !== (value.scene.archived || block.ownArchived))
    )
      fail();
    seen.add(block.sourceKey);
  }
}
export function validateSceneWindow(
  value: SessionSceneReadWindow,
  uid: string,
  input: ReadSessionSceneInput,
  sceneKey: string,
  observe?: ObserveSessionScene,
) {
  validateSceneEnvelope(value, uid, input, observe);
  keys(value, [...envelopeKeys, 'blockKey', 'resourceKey', 'resourceKind', 'material']);
  const kind = input.blockKey ? 'block' : 'scene-plan';
  if (value.blockKey !== (input.blockKey ?? null) || value.resourceKind !== kind) fail();
  if (value.material === null) {
    if (value.resourceKey !== null) fail();
    return;
  }
  if (value.sourceContext === null || value.resourceKey !== (input.blockKey ?? sceneKey)) fail();
  keys(value.material, ['item', 'chunks', 'nextCursor']);
  cursor(value.material.nextCursor);
  const item = value.material.item;
  if (item.sourceKey !== value.resourceKey || item.kind !== kind) fail();
  if (item.kind === 'scene-plan') {
    keys(item, ['kind', 'sourceKey', 'title', 'stage', 'archived', 'fields']);
    if (
      typeof item.title !== 'string' ||
      (item.stage !== null && typeof item.stage !== 'string') ||
      typeof item.archived !== 'boolean'
    )
      fail();
    manifests(item.fields, ['objective', 'conflict', 'pointOfView']);
  } else {
    validateSceneBlock(item, sceneKey, true);
    manifests(item.fields, ['content']);
    if (item.fields.length !== 1) fail();
    if (item.image !== null) {
      keys(item.image, ['imageKey', 'alt', 'caption']);
      if (
        !hash(item.image.imageKey) ||
        typeof item.image.alt !== 'string' ||
        typeof item.image.caption !== 'string'
      )
        fail();
    }
  }
  if (!Array.isArray(value.material.chunks) || value.material.chunks.length > 8) fail();
  for (const chunk of value.material.chunks) {
    keys(chunk, ['field', 'index', 'content']);
    if (!integer(chunk.index) || typeof chunk.content !== 'string') fail();
    const bytes = new TextEncoder().encode(chunk.content);
    if (
      bytes.byteLength > 65536 ||
      new TextDecoder('utf-8', { fatal: true }).decode(bytes) !== chunk.content
    )
      fail();
  }
}
export async function readCompleteSessionScene(
  input: ReadSessionSceneInput,
  uid: string,
  sceneKey: string,
  active: () => boolean,
  observe: ObserveSessionScene,
): Promise<{ item: SessionSceneProjectedItem; fields: Record<string, string> } | null> {
  let first: SessionSceneProjectedItem | null = null,
    next: string | null = null;
  const chunks: CampaignBaseChunk[] = [],
    seen = new Set<string>();
  do {
    if (!active()) return null;
    const page = await readCampaignSessionSceneReference({
      ...input,
      ...(next ? { cursor: next } : {}),
      limit: 4,
    });
    if (!active()) return null;
    validateSceneWindow(page, uid, input, sceneKey, observe);
    if (!active()) return null;
    if (!page.material) return null;
    if (first && canonical(first) !== canonical(page.material.item))
      fail('O conteúdo da cena mudou durante a leitura. Consulte novamente.');
    first ??= page.material.item;
    const total = first.fields.reduce((sum, f) => sum + f.chunkCount, 0);
    if (chunks.length + page.material.chunks.length > total) fail();
    chunks.push(...page.material.chunks);
    next = page.material.nextCursor;
    if (next !== null) {
      if (!page.material.chunks.length || chunks.length >= total)
        fail('A leitura do texto não avançou dentro do manifesto confirmado.');
      if (seen.has(next)) fail();
      seen.add(next);
    }
  } while (next !== null);
  if (!first) return null;
  const fields = await verifyCampaignBaseFields(first.fields, chunks, active);
  return active() ? { item: first, fields } : null;
}
export function validateSceneImage(
  value: SessionSceneImage,
  uid: string,
  input: SessionSceneReadScope & { blockKey: string },
  imageKey: string,
  observe?: ObserveSessionScene,
): string | null {
  validateSceneEnvelope(value, uid, input, observe);
  keys(value, [...envelopeKeys, 'blockKey', 'imageKey', 'dataUrl']);
  if (value.blockKey !== input.blockKey) fail();
  if (value.dataUrl === null) {
    if (value.imageKey !== null) fail();
    return null;
  }
  if (
    value.sourceContext === null ||
    value.imageKey !== imageKey ||
    typeof value.dataUrl !== 'string' ||
    !/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value.dataUrl)
  )
    fail();
  const encoded = value.dataUrl.slice(value.dataUrl.indexOf(',') + 1),
    bytes = (encoded.length * 3) / 4 - (encoded.endsWith('==') ? 2 : encoded.endsWith('=') ? 1 : 0);
  if (encoded.length % 4 || bytes > 1.5 * 1024 * 1024) fail();
  return value.dataUrl;
}
