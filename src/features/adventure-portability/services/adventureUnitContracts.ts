import {
  ADVENTURE_RESOURCE_DEFINITIONS as definitions,
  type AdventureResourceKind,
} from '../../../../functions/src/adventureBackupResourceDefinitions.mjs';
import {
  closed,
  validId,
  validHash,
  validCount,
  source,
  matches,
  type AdventureInventorySource,
  type AdventureInventoryScope,
  type AdventureInventoryItem,
} from './adventureInventoryContracts';
export type AdventureUnitMethod =
  | 'readAdventureBackupStructure'
  | 'readAdventureBackupResource'
  | 'readAdventureBackupLore'
  | 'readAdventureBackupPersona'
  | 'readAdventureBackupHistory';
export interface AdventureUnitApi {
  call(method: AdventureUnitMethod, input: Readonly<Record<string, unknown>>): Promise<unknown>;
}
export interface AdventureUnitProof {
  readonly validation: 'unit-bytes-only';
  readonly source: AdventureInventorySource;
  readonly scope: AdventureInventoryScope;
  readonly item: AdventureInventoryItem;
  readonly byteLength: number;
  readonly chunkCount: number;
  readonly contentHash: string;
}
export interface AdventureUnitOptions {
  guard: () => void;
  signal?: AbortSignal;
}
export class AdventureUnitError extends Error {
  readonly code = 'adventure-backup-invalid-unit';
  constructor() {
    super('Não foi possível conferir todos os bytes da unidade. Faça um novo backup.');
    this.name = 'AdventureUnitError';
  }
}
export function unitInvalid(): never {
  throw new AdventureUnitError();
}
export const UNIT_CHUNK_BYTES = 65536;
export function captureUnit(
  input: AdventureInventorySource,
  scope: AdventureInventoryScope,
  item: AdventureInventoryItem,
) {
  let anchor: AdventureInventorySource;
  try {
    anchor = source(input, input?.adventureId);
  } catch {
    unitInvalid();
  }
  if (!validId(anchor.adventureId)) unitInvalid();
  const family = scope?.family;
  let keys: string[],
    method: AdventureUnitMethod,
    itemKeys = ['id', 'itemToken'];
  switch (family) {
    case 'structure':
      keys = ['family', 'kind'];
      method = 'readAdventureBackupStructure';
      if (!['adventure', 'part'].includes(scope.kind ?? '')) unitInvalid();
      break;
    case 'resources': {
      keys = ['family', 'kind', 'parentId'];
      method = 'readAdventureBackupResource';
      itemKeys = ['id', 'present', 'itemToken'];
      if (typeof scope.kind !== 'string' || !Object.hasOwn(definitions, scope.kind)) unitInvalid();
      const definition = definitions[scope.kind as AdventureResourceKind];
      if (
        !definition ||
        (definition.parent ? !validId(scope.parentId) : scope.parentId !== null) ||
        typeof item?.present !== 'boolean' ||
        (item.present === false && definition.optional !== true) ||
        (typeof definition.singleton === 'string' && item.id !== definition.singleton)
      )
        unitInvalid();
      break;
    }
    case 'lore':
      keys = ['family', 'kind'];
      method = 'readAdventureBackupLore';
      itemKeys = ['id', 'deleted', 'itemToken'];
      if (
        !['lore', 'lore-body'].includes(scope.kind ?? '') ||
        typeof item?.deleted !== 'boolean' ||
        (scope.kind === 'lore-body' && item.deleted)
      )
        unitInvalid();
      break;
    case 'personas':
      keys = ['family', 'scope'];
      method = 'readAdventureBackupPersona';
      itemKeys = ['id', 'personaId', 'itemToken'];
      if (
        !['adventure', 'scene'].includes(scope.scope ?? '') ||
        !validId(item?.personaId) ||
        (scope.scope === 'adventure' && item.id !== anchor.adventureId)
      )
        unitInvalid();
      break;
    case 'history':
      keys = ['family', 'kind', 'parentId', 'parentToken'];
      method = 'readAdventureBackupHistory';
      if (scope.kind === 'version') {
        if (scope.parentId !== null || scope.parentToken !== null) unitInvalid();
      } else if (scope.kind === 'version-chunk') {
        itemKeys = ['id', 'ordinal', 'itemToken'];
        if (!validId(scope.parentId) || !validHash(scope.parentToken) || !validCount(item?.ordinal))
          unitInvalid();
      } else unitInvalid();
      break;
    default:
      unitInvalid();
  }
  if (
    !closed(scope, keys) ||
    !closed(item, itemKeys) ||
    !validId(item.id) ||
    !validHash(item.itemToken)
  )
    unitInvalid();
  if (
    family === 'structure' &&
    scope.kind === 'adventure' &&
    (item.id !== anchor.adventureId || item.itemToken !== anchor.sourceToken)
  )
    unitInvalid();
  const frozenScope = Object.freeze(
    Object.fromEntries(keys.map((k) => [k, scope[k]])),
  ) as unknown as AdventureInventoryScope;
  const frozenItem = Object.freeze(
    Object.fromEntries(itemKeys.map((k) => [k, item[k]])),
  ) as AdventureInventoryItem;
  const descriptor = Object.freeze(
    Object.fromEntries(keys.filter((k) => k !== 'family').map((k) => [k, scope[k]])),
  );
  return { anchor, scope: frozenScope, item: frozenItem, descriptor, method };
}
export interface UnitManifest {
  readonly byteLength: number;
  readonly chunkCount: number;
  readonly contentHash: string;
}
export function unitPart(
  value: unknown,
  ref: ReturnType<typeof captureUnit>,
  index: number,
  first?: UnitManifest,
): { bytes: Uint8Array; manifest: UnitManifest } {
  const keys = [
    'schemaVersion',
    'adventureId',
    'sourceToken',
    ...Object.keys(ref.descriptor),
    'id',
    'itemToken',
    'index',
    'chunkCount',
    'byteLength',
    'contentHash',
    'chunkBase64',
    ...(ref.scope.family === 'resources' ? ['present'] : []),
  ];
  if (
    !closed(value, keys) ||
    !matches(value, ref.anchor) ||
    !Object.entries(ref.descriptor).every(([k, v]) => value[k] === v) ||
    value.id !== ref.item.id ||
    value.itemToken !== ref.item.itemToken ||
    value.index !== index ||
    (ref.scope.family === 'resources' && value.present !== ref.item.present) ||
    !validCount(value.byteLength) ||
    value.byteLength < 1 ||
    !validCount(value.chunkCount) ||
    value.chunkCount < 1 ||
    value.chunkCount > 0xffffffff ||
    value.chunkCount !== Math.ceil(value.byteLength / UNIT_CHUNK_BYTES) ||
    index >= value.chunkCount ||
    !validHash(value.contentHash) ||
    (first &&
      (value.byteLength !== first.byteLength ||
        value.chunkCount !== first.chunkCount ||
        value.contentHash !== first.contentHash)) ||
    typeof value.chunkBase64 !== 'string' ||
    value.chunkBase64.length > 4 * Math.ceil(UNIT_CHUNK_BYTES / 3) ||
    !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.chunkBase64)
  )
    unitInvalid();
  const binary = atob(value.chunkBase64);
  if (btoa(binary) !== value.chunkBase64) unitInvalid();
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  if (bytes.length !== Math.min(UNIT_CHUNK_BYTES, value.byteLength - index * UNIT_CHUNK_BYTES))
    unitInvalid();
  return {
    bytes,
    manifest: Object.freeze({
      byteLength: value.byteLength,
      chunkCount: value.chunkCount,
      contentHash: value.contentHash,
    }),
  };
}
