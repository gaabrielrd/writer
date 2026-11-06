import { readLiteraryArchitectureTargetId } from './literaryArchitectureProtocol.mjs';
// Pure dependency traversal. Locators and captured versions are metadata, never grants.
// Reading current sources and checking their native identity belongs to the server.
export const LITERARY_IMPACT_KINDS = Object.freeze([
  'book',
  'act',
  'chapter',
  'scene',
  'arc',
  'arcMilestone',
  'architecture',
  'event',
  'localLore',
  'globalLore',
  'contract',
  'plan',
  'preparation',
  'draft',
  'milestone',
  'review',
  'prose',
  'integration',
  'finding',
  'publication',
  'publicationPart',
  'readerGuide',
  'workflow',
  'sequence',
  'inspection',
  'generation',
  'chat',
  'autocomplete',
  'persona',
  'personaBinding',
]);
export const LITERARY_IMPACT_RELATIONS = Object.freeze([
  'source',
  'composition',
  'subject',
  'narrative',
  'target',
  'preserves',
]);
const effects = ['changed', 'dependency-check', 'association-check', 'preservation-check'];
const encoder = new TextEncoder();
const fail = () => {
  throw new TypeError('Dependência editorial inválida.');
};
function closed(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    ![Object.prototype, null].includes(Object.getPrototypeOf(value)) ||
    Reflect.ownKeys(value).length !== keys.length
  )
    fail();
  for (const key of keys)
    if (
      !Object.hasOwn(value, key) ||
      !Object.hasOwn(Object.getOwnPropertyDescriptor(value, key), 'value')
    )
      fail();
}
function id(value, max = 1500) {
  if (
    typeof value !== 'string' ||
    !value ||
    !value.isWellFormed() ||
    value.includes('/') ||
    ['.', '..'].includes(value) ||
    encoder.encode(value).length > max
  )
    fail();
  return value;
}
function integer(value) {
  if (!Number.isSafeInteger(value) || value < 0) fail();
  return value;
}
const hash = (value) => {
  if (typeof value !== 'string' || !/^[a-f0-9]{64}$/.test(value)) fail();
  return value;
};
const one = (value, options) => {
  if (!options.includes(value)) fail();
  return value;
};
export function literaryImpactArcMilestoneId(arcId, milestoneId) {
  return JSON.stringify([id(arcId), id(milestoneId)]);
}
export function literaryImpactPersonaBindingId(scopeKind, scopeId) {
  return JSON.stringify([one(scopeKind, ['book', 'chapter']), id(scopeId)]);
}
export function readLiteraryImpactPersonaBindingId(value) {
  nodeId('personaBinding', value);
  const [scopeKind, scopeId] = JSON.parse(value);
  return { scopeKind, scopeId };
}
function nodeId(kind, value) {
  if (kind === 'readerGuide') {
    id(value, 12000);
    let pair;
    try {
      pair = JSON.parse(value);
    } catch {
      fail();
    }
    if (
      !Array.isArray(pair) ||
      pair.length !== 2 ||
      JSON.stringify(pair.map((part) => id(part))) !== value
    )
      fail();
    return value;
  }
  if (kind === 'architecture') {
    readLiteraryArchitectureTargetId(value);
    return value;
  }
  if (!['arcMilestone', 'personaBinding'].includes(kind)) return id(value);
  id(value, 12000);
  let pair;
  try {
    pair = JSON.parse(value);
  } catch {
    fail();
  }
  if (
    !Array.isArray(pair) ||
    pair.length !== 2 ||
    (kind === 'arcMilestone'
      ? literaryImpactArcMilestoneId(pair[0], pair[1])
      : literaryImpactPersonaBindingId(pair[0], pair[1])) !== value
  )
    fail();
  return value;
}
export function normalizeLiteraryImpactNode(value) {
  closed(value, ['kind', 'id', 'scopeKind', 'scopeId']);
  const result = {
    kind: one(value.kind, LITERARY_IMPACT_KINDS),
    id: nodeId(value.kind, value.id),
    scopeKind: one(value.scopeKind, ['book', 'universe', 'user']),
    scopeId: id(value.scopeId),
  };
  if (
    (result.kind === 'globalLore' && result.scopeKind !== 'universe') ||
    (result.kind === 'persona' && result.scopeKind !== 'user') ||
    (!['globalLore', 'persona'].includes(result.kind) && result.scopeKind !== 'book')
  )
    fail();
  return result;
}
export function literaryImpactNodeKey(value) {
  const node = normalizeLiteraryImpactNode(value);
  // Tuples keep homonyms, cross-volume chapter IDs, and local/global entities separate.
  return JSON.stringify([node.scopeKind, node.scopeId, node.kind, node.id]);
}
function record(value) {
  closed(value, ['collection', 'id']);
  return { collection: id(value.collection), id: id(value.id) };
}
function capture(value) {
  if (value === null) return null;
  closed(value, [
    ...(Object.hasOwn(value, 'scheme') ? ['scheme'] : []),
    'originToken',
    'identityToken',
    'versionToken',
    'revision',
  ]);
  const result = {
    scheme: one(value.scheme ?? 'unknown', [
      'unknown',
      'reference',
      'writing-plan',
      'editorial-revision',
      'history-source',
      'content-hash',
      'finding-target',
      'architecture-source',
      'prose-assembly',
      'persona-profile',
      'persona-binding',
      'native-chat-target',
      'native-chat-lore',
      'native-chat-turn',
      'application-source',
      'native-chat-application-source',
      'legacy-chat-application-source',
      'artifact-origin',
      'integration-chapter',
      'publication-integration',
      'integration-unit',
      'sequence-workflow',
      'guide-dependency',
    ]),
    originToken: value.originToken === null ? null : hash(value.originToken),
    identityToken: value.identityToken === null ? null : hash(value.identityToken),
    versionToken: value.versionToken === null ? null : hash(value.versionToken),
    revision: value.revision === null ? null : integer(value.revision),
  };
  if (
    result.originToken === null &&
    result.identityToken === null &&
    result.versionToken === null &&
    result.revision === null
  )
    fail();
  return result;
}
export function normalizeLiteraryImpactLink(value) {
  closed(value, ['from', 'to', 'relation', 'record', 'capture']);
  const result = {
    from: normalizeLiteraryImpactNode(value.from),
    to: normalizeLiteraryImpactNode(value.to),
    relation: one(value.relation, LITERARY_IMPACT_RELATIONS),
    record: record(value.record),
    capture: capture(value.capture),
  };
  if (literaryImpactNodeKey(result.from) === literaryImpactNodeKey(result.to)) fail();
  return result;
}
export function literaryImpactLinkKey(value) {
  const link = normalizeLiteraryImpactLink(value);
  return JSON.stringify([
    literaryImpactNodeKey(link.from),
    literaryImpactNodeKey(link.to),
    link.relation,
    link.record.collection,
    link.record.id,
    link.capture,
  ]);
}
export function normalizeLiteraryImpactVisit(value) {
  closed(value, ['node', 'source', 'effect', 'depth']);
  const result = {
    node: normalizeLiteraryImpactNode(value.node),
    source: normalizeLiteraryImpactNode(value.source),
    effect: one(value.effect, effects),
    depth: integer(value.depth),
  };
  if (
    result.effect === 'changed' &&
    (result.depth !== 0 ||
      literaryImpactNodeKey(result.node) !== literaryImpactNodeKey(result.source))
  )
    fail();
  if (result.effect !== 'changed' && result.depth === 0) fail();
  return result;
}
export function literaryImpactVisitKey(value) {
  const visit = normalizeLiteraryImpactVisit(value);
  // Depth is deliberately absent. A cycle cannot create infinitely many visit IDs.
  // The durable walker must admit each key once and paginate every adjacency list.
  return JSON.stringify([
    literaryImpactNodeKey(visit.source),
    literaryImpactNodeKey(visit.node),
    visit.effect,
  ]);
}
function nextEffect(effect, relation) {
  // An association on any earlier hop remains uncertain throughout the path.
  if (effect === 'association-check' || ['subject', 'narrative', 'target'].includes(relation))
    return 'association-check';
  // A current-source edit does not mutate or destroy an immutable preserved version.
  if (effect === 'preservation-check' || relation === 'preserves') return 'preservation-check';
  return 'dependency-check';
}
export function advanceLiteraryImpactVisit(value, rawLinks) {
  const visit = normalizeLiteraryImpactVisit(value);
  if (!Array.isArray(rawLinks) || rawLinks.length > 64) fail();
  const current = literaryImpactNodeKey(visit.node),
    seen = new Set(),
    result = [];
  for (const raw of rawLinks) {
    const link = normalizeLiteraryImpactLink(raw),
      key = literaryImpactLinkKey(link);
    if (literaryImpactNodeKey(link.from) !== current) fail();
    if (seen.has(key)) continue;
    seen.add(key);
    const next = normalizeLiteraryImpactVisit({
      node: link.to,
      source: visit.source,
      effect: nextEffect(visit.effect, link.relation),
      depth: integer(visit.depth + 1),
    });
    // Preserve every distinct witness. The caller deduplicates visits, not evidence.
    result.push({ visit: next, visitKey: literaryImpactVisitKey(next), link, linkKey: key });
  }
  return result;
}
function inventory(value) {
  closed(value, ['scopeKind', 'scopeId', 'collection']);
  return {
    scopeKind: one(value.scopeKind, ['book', 'universe', 'user']),
    scopeId: id(value.scopeId),
    collection: id(value.collection),
  };
}
const inventoryKey = (value) => JSON.stringify([value.scopeKind, value.scopeId, value.collection]);
export function literaryImpactInventoryKey(value) {
  return inventoryKey(inventory(value));
}
export function literaryImpactCoverage(expected, observed, fence) {
  closed(fence, ['before', 'after']);
  hash(fence.before);
  hash(fence.after);
  if (
    !Array.isArray(expected) ||
    !expected.length ||
    expected.length > 512 ||
    !Array.isArray(observed) ||
    observed.length > 512
  )
    fail();
  const expectedKeys = new Set(),
    rows = new Map();
  for (const raw of expected) {
    const key = inventoryKey(inventory(raw));
    if (expectedKeys.has(key)) fail();
    expectedKeys.add(key);
  }
  for (const raw of observed) {
    closed(raw, ['inventory', 'scanComplete', 'verified', 'records', 'unavailable', 'unsupported']);
    const key = inventoryKey(inventory(raw.inventory));
    if (
      !expectedKeys.has(key) ||
      rows.has(key) ||
      typeof raw.scanComplete !== 'boolean' ||
      typeof raw.verified !== 'boolean'
    )
      fail();
    rows.set(key, {
      scanComplete: raw.scanComplete,
      verified: raw.verified,
      records: integer(raw.records),
      unavailable: integer(raw.unavailable),
      unsupported: integer(raw.unsupported),
    });
  }
  const missing = [],
    pending = [],
    unavailable = [],
    unsupported = [];
  for (const key of expectedKeys) {
    const row = rows.get(key);
    if (!row) {
      missing.push(key);
      continue;
    }
    if (!row.scanComplete || !row.verified) pending.push(key);
    if (row.unavailable) unavailable.push({ inventory: key, count: row.unavailable });
    if (row.unsupported) unsupported.push({ inventory: key, count: row.unsupported });
  }
  const concurrentChange = fence.before !== fence.after;
  return {
    scope: 'registered-dependencies',
    complete:
      !concurrentChange &&
      !missing.length &&
      !pending.length &&
      !unavailable.length &&
      !unsupported.length,
    concurrentChange,
    missing,
    pending,
    unavailable,
    unsupported,
    semanticCompleteness: false,
    authorAccepted: false,
    publicationReady: false,
  };
}
