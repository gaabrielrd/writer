import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import {
  ADVENTURE_RESOURCE_DEFINITIONS as definitions,
  ADVENTURE_RESOURCE_KINDS as kinds,
  type AdventureResourceKind,
} from '../../../../functions/src/adventureBackupResourceDefinitions.mjs';
import { validatePortableUniverseOrigin } from '../../../../functions/src/portableUniverseOrigin.mjs';
import {
  INVENTORY_FAMILIES,
  closed,
  invalid,
  validId,
  validHash,
  validCount,
  compareIds,
  source,
  matches,
  countsCopy,
  type AdventureInventoryApi,
  type AdventureInventorySource,
  type AdventureInventoryScope,
  type AdventureInventoryItem,
  type AdventureInventoryMethod,
  type AdventureInventoryProof,
} from './adventureInventoryContracts';
export interface AdventureInventoryOptions {
  /** Must throw when the captured account or project context is no longer current. */
  guard: () => void;
  signal?: AbortSignal;
  source?: AdventureInventorySource;
  visit?: (scope: AdventureInventoryScope, item: AdventureInventoryItem) => Promise<void>;
}
const methods: Readonly<
  Record<Exclude<AdventureInventoryScope['family'], 'universe'>, AdventureInventoryMethod>
> = {
  structure: 'listAdventureBackupStructure',
  resources: 'listAdventureBackupResources',
  lore: 'listAdventureBackupLore',
  personas: 'listAdventureBackupPersonaBindings',
  history: 'listAdventureBackupHistory',
  images: 'listAdventureBackupImageBindings',
};
const encoder = new TextEncoder();
function row(value: unknown, scope: AdventureInventoryScope): AdventureInventoryItem {
  const keys =
    scope.family === 'images'
      ? ['id', 'imageId', 'bindingToken']
      : [
          'id',
          ...(scope.family === 'resources'
            ? ['present']
            : scope.family === 'lore'
              ? ['deleted']
              : scope.family === 'personas'
                ? ['personaId']
                : scope.kind === 'version-chunk'
                  ? ['ordinal']
                  : []),
          'itemToken',
        ];
  if (
    !closed(value, keys) ||
    !validId(value.id) ||
    !validHash(value[scope.family === 'images' ? 'bindingToken' : 'itemToken'])
  )
    invalid();
  if (
    scope.family === 'resources' &&
    (typeof value.present !== 'boolean' ||
      (value.present === false &&
        definitions[scope.kind as AdventureResourceKind]?.optional !== true))
  )
    invalid();
  if (scope.family === 'lore' && typeof value.deleted !== 'boolean') invalid();
  for (const key of scope.family === 'images'
    ? ['imageId']
    : scope.family === 'personas'
      ? ['personaId']
      : []) {
    if (value[key] !== null && !validId(value[key])) invalid();
  }
  if (scope.kind === 'version-chunk' && !validCount(value.ordinal)) invalid();
  return Object.freeze(
    Object.fromEntries(keys.map((k) => [k, value[k]])),
  ) as AdventureInventoryItem;
}
/** Metadata-only traversal. This proof never certifies text, image bytes or a complete archive. */
export async function scanAdventureBackupInventory(
  adventureId: string,
  api: AdventureInventoryApi,
  options: AdventureInventoryOptions,
): Promise<AdventureInventoryProof> {
  if (
    !validId(adventureId) ||
    typeof api?.call !== 'function' ||
    typeof options?.guard !== 'function'
  )
    invalid();
  const invoke = api.call.bind(api),
    guard = options.guard,
    signal = options.signal,
    visit = options.visit;
  const expected =
    options.source === undefined ? undefined : source(options.source, adventureId).sourceToken;
  const check = () => {
    guard();
    signal?.throwIfAborted();
  };
  const call = async (method: AdventureInventoryMethod, input: Record<string, unknown>) => {
    check();
    const result = await invoke(method, Object.freeze({ ...input }));
    check();
    return result;
  };
  check();
  const anchor = source(
    await call('getAdventureBackupSource', {
      adventureId,
      ...(expected === undefined ? {} : { expectedSourceToken: expected }),
    }),
    adventureId,
    expected,
  );
  const hash = sha256.create(),
    counts = countsCopy();
  let views = 0;
  const fold = (value: unknown) => {
    hash.update(encoder.encode(JSON.stringify(value) + '\n'));
  };
  fold(['writer-adventure-inventory-v1', anchor]);
  async function walk(scope: AdventureInventoryScope, depth = 0): Promise<void> {
    check();
    if (depth > 1 || scope.family === 'universe') invalid();
    const frozen = Object.freeze({ ...scope }),
      descriptor = Object.fromEntries(Object.entries(frozen).filter(([k]) => k !== 'family'));
    fold(['view', descriptor, scope.family]);
    views++;
    if (!validCount(views)) invalid();
    let cursor: string | null = null,
      last: string | null = null;
    const definition =
      scope.family === 'resources' ? definitions[scope.kind as AdventureResourceKind] : undefined;
    if (scope.family === 'resources' && !definition) invalid();
    const singleton =
      scope.family === 'personas' && scope.scope === 'adventure'
        ? adventureId
        : definition?.singleton;
    do {
      const raw = await call(methods[scope.family], {
        adventureId,
        sourceToken: anchor.sourceToken,
        ...descriptor,
        cursor,
        limit: 50,
      });
      const keys = [
        'schemaVersion',
        'adventureId',
        'sourceToken',
        ...Object.keys(descriptor),
        'items',
        'nextCursor',
      ];
      if (
        !closed(raw, keys) ||
        !matches(raw, anchor) ||
        !Object.entries(descriptor).every(([k, v]) => raw[k] === v) ||
        !Array.isArray(raw.items) ||
        raw.items.length > 50 ||
        (raw.nextCursor !== null &&
          (typeof raw.nextCursor !== 'string' ||
            !raw.nextCursor ||
            raw.nextCursor.length > 16000 ||
            raw.items.length !== 50 ||
            raw.nextCursor === cursor))
      )
        invalid();
      if (singleton && (raw.items.length !== 1 || raw.nextCursor !== null)) invalid();
      // Detach the complete page before the first consumer await.
      const items = raw.items.map((value) => row(value, frozen));
      const next: string | null = raw.nextCursor;
      for (const item of items) {
        check();
        if (
          (last !== null && compareIds(last, item.id) >= 0) ||
          (typeof singleton === 'string' && item.id !== singleton)
        )
          invalid();
        last = item.id;
        fold(['item', item]);
        counts[scope.family]++;
        if (!validCount(counts[scope.family])) invalid();
        if (visit) {
          await visit(frozen, item);
          check();
        }
        if (scope.family === 'resources') {
          for (const child of kinds.filter((k) => definitions[k].parent === definition!.path)) {
            await walk({ family: 'resources', kind: child, parentId: item.id }, depth + 1);
          }
        }
        if (scope.family === 'history' && scope.kind === 'version') {
          await walk(
            {
              family: 'history',
              kind: 'version-chunk',
              parentId: item.id,
              parentToken: item.itemToken as string,
            },
            depth + 1,
          );
        }
      }
      cursor = next;
    } while (cursor !== null);
  }
  await walk({ family: 'structure', kind: 'part' });
  for (const kind of kinds.filter((k) => !definitions[k].parent))
    await walk({ family: 'resources', kind, parentId: null });
  for (const kind of ['lore', 'lore-body']) await walk({ family: 'lore', kind });
  for (const scope of ['adventure', 'scene'] as const) await walk({ family: 'personas', scope });
  await walk({ family: 'history', kind: 'version', parentId: null, parentToken: null });
  for (const kind of ['scene', 'block']) await walk({ family: 'images', kind });
  const universe = await call('getAdventureBackupUniverse', {
    adventureId,
    sourceToken: anchor.sourceToken,
  });
  if (
    !closed(universe, ['schemaVersion', 'adventureId', 'sourceToken', 'origin', 'universeToken']) ||
    !matches(universe, anchor) ||
    !validHash(universe.universeToken)
  )
    invalid();
  let origin;
  try {
    origin = validatePortableUniverseOrigin(universe.origin);
  } catch {
    invalid();
  }
  if (origin.kind === 'reference') Object.freeze(origin.created);
  Object.freeze(origin);
  const item = Object.freeze({ id: adventureId, origin, universeToken: universe.universeToken });
  fold(['view', { family: 'universe' }]);
  fold(['item', item]);
  views++;
  counts.universe++;
  if (visit) {
    await visit(Object.freeze({ family: 'universe' }), item);
    check();
  }
  source(
    await call('getAdventureBackupSource', {
      adventureId,
      expectedSourceToken: anchor.sourceToken,
    }),
    adventureId,
    anchor.sourceToken,
  );
  fold(['totals', counts, views]);
  check();
  return Object.freeze({
    validation: 'inventory-only',
    source: anchor,
    digest: bytesToHex(hash.digest()),
    counts: Object.freeze(counts),
    views,
  });
}
/** Call after every content section; it verifies metadata inventory only, not independent Storage bytes. */
export async function verifyAdventureBackupInventory(
  proof: AdventureInventoryProof,
  api: AdventureInventoryApi,
  options: Omit<AdventureInventoryOptions, 'source' | 'visit'>,
): Promise<void> {
  if (
    !closed(proof, ['validation', 'source', 'digest', 'counts', 'views']) ||
    proof.validation !== 'inventory-only' ||
    !validHash(proof.digest) ||
    !validCount(proof.views)
  )
    invalid();
  const anchor = source(proof.source, proof.source?.adventureId),
    counts = countsCopy(proof.counts),
    digest = proof.digest,
    views = proof.views;
  const current = await scanAdventureBackupInventory(anchor.adventureId, api, {
    guard: options.guard,
    signal: options.signal,
    source: anchor,
  });
  if (
    current.digest !== digest ||
    current.views !== views ||
    INVENTORY_FAMILIES.some((k) => current.counts[k] !== counts[k])
  )
    invalid();
}
