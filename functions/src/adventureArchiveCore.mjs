import {
  ADVENTURE_RESOURCE_DEFINITIONS,
  ADVENTURE_RESOURCE_KINDS,
} from './adventureBackupResourceDefinitions.mjs';
export const ADVENTURE_CORE_SECTIONS = Object.freeze([
  'structure',
  'resources',
  'lore',
  'personas',
  'universe',
]);
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
const count = (v) => Number.isSafeInteger(v) && v >= 0;
function invalid() {
  throw new TypeError('Contrato de dados centrais inválido.');
}
function id(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    ['.', '..'].includes(value) ||
    Array.from(value).some(
      (c) => c === '/' || c === '\\' || c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127,
    ) ||
    encoder.encode(value).length > 1500 ||
    decoder.decode(encoder.encode(value)) !== value
  )
    invalid();
  return value;
}
async function address(parts) {
  return Array.from(
    new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(JSON.stringify(parts)))),
    (v) => v.toString(16).padStart(2, '0'),
  ).join('');
}
/** Stable file identities; input tokens, owner IDs and operational provenance are not encoded. */
export async function adventureCoreRecordIdentity(scope, value) {
  const native = id(value);
  if (scope?.family === 'structure') {
    if (!['adventure', 'part'].includes(scope.kind)) invalid();
    return {
      kind: scope.kind === 'adventure' ? 'adventure-metadata' : 'adventure-part',
      id: native,
    };
  }
  if (scope?.family === 'resources') {
    if (!Object.hasOwn(ADVENTURE_RESOURCE_DEFINITIONS, scope.kind)) invalid();
    const definition = ADVENTURE_RESOURCE_DEFINITIONS[scope.kind];
    if (definition.parent) id(scope.parentId);
    else if (scope.parentId !== null) invalid();
    return {
      kind: 'adventure-resource',
      id: await address([
        'writer-adventure-core-v1',
        'resources',
        scope.kind,
        scope.parentId,
        native,
      ]),
    };
  }
  if (scope?.family === 'lore') {
    if (!['lore', 'lore-body'].includes(scope.kind)) invalid();
    return { kind: scope.kind === 'lore' ? 'adventure-lore' : 'adventure-lore-body', id: native };
  }
  if (scope?.family === 'personas') {
    if (!['adventure', 'scene'].includes(scope.scope)) invalid();
    return {
      kind: 'adventure-persona',
      id: await address(['writer-adventure-core-v1', 'personas', scope.scope, native]),
    };
  }
  if (scope?.family === 'universe') return { kind: 'adventure-universe', id: native };
  invalid();
}
export function adventureCoreCounts(section) {
  const keys =
    section === 'resources'
      ? ADVENTURE_RESOURCE_KINDS
      : section === 'lore'
        ? ['lore', 'lore-body']
        : section === 'personas'
          ? ['adventure', 'scene']
          : null;
  if (!keys) invalid();
  return Object.fromEntries(keys.map((k) => [k, 0]));
}
export function adventureCoreManifest(section, units, digest, counts) {
  const expected = adventureCoreCounts(section);
  if (
    !count(units) ||
    typeof digest !== 'string' ||
    !/^[a-f0-9]{64}$/.test(digest) ||
    !counts ||
    typeof counts !== 'object' ||
    Array.isArray(counts) ||
    Object.keys(expected).length !== Object.keys(counts).length ||
    !Object.keys(expected).every((k) => Object.hasOwn(counts, k) && count(counts[k]))
  )
    invalid();
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (!count(total) || total !== units) invalid();
  return {
    schemaVersion: 1,
    section,
    units,
    counts: Object.fromEntries(Object.keys(expected).map((k) => [k, counts[k]])),
    digest,
  };
}
export function adventureNullPersona(scope, bindingId) {
  if (!['adventure', 'scene'].includes(scope)) invalid();
  return {
    schemaVersion: 1,
    kind: 'persona',
    scope,
    bindingId: id(bindingId),
    personaId: null,
    profile: null,
  };
}

export function adventureCoreDigestSeed(section) {
  if (!ADVENTURE_CORE_SECTIONS.includes(section)) invalid();
  return 'writer-adventure-core-v1:' + section + '\n';
}
export function adventureCoreDigestLine(identity, manifest) {
  if (
    !identity ||
    typeof identity.kind !== 'string' ||
    !identity.kind ||
    !manifest ||
    !count(manifest.byteLength) ||
    manifest.byteLength < 1 ||
    !count(manifest.chunkCount) ||
    manifest.chunkCount !== Math.ceil(manifest.byteLength / 65536) ||
    typeof manifest.contentHash !== 'string' ||
    !/^[a-f0-9]{64}$/.test(manifest.contentHash)
  )
    invalid();
  return (
    JSON.stringify([
      'unit',
      identity.kind,
      id(identity.id),
      manifest.byteLength,
      manifest.chunkCount,
      manifest.contentHash,
    ]) + '\n'
  );
}
