import { restoredCampaignBaseSource } from './campaignRestoredSource.mjs';
import { digest, workFail } from './workProgressContracts.mjs';
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const closed = (v, keys) =>
  v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === keys.length &&
  Object.keys(v).every((k) => keys.includes(k));
const bad = () =>
  workFail(
    'failed-precondition',
    'A referência portátil está inconsistente.',
    'campaign-portable-reference-inconsistent',
  );
function marker(base, value, fields) {
  if (
    !value ||
    (!Object.hasOwn(value, 'referenceMode') && !Object.hasOwn(value, 'portableReference'))
  )
    return null;
  if (
    !restoredCampaignBaseSource(base) ||
    value.referenceMode !== 'portable' ||
    Object.hasOwn(value, 'reference') ||
    !closed(value.portableReference, fields) ||
    value.portableReference.schemaVersion !== 1
  )
    bad();
  const target = value.portableReference.target;
  if (
    !closed(target, ['kind', 'sourceKey', 'available']) ||
    !['lore', 'scene', 'event'].includes(target.kind) ||
    !hash(target.sourceKey) ||
    typeof target.available !== 'boolean'
  )
    bad();
  return Object.freeze({ ...value.portableReference, target: Object.freeze({ ...target }) });
}
/** Private server-owned representation of a validated portable link, never an authorization grant. */
export function portableCampaignLink(base, key, value) {
  const result = marker(base, value, ['schemaVersion', 'target', 'ledgerId']);
  if (!result) return null;
  if (
    !hash(key) ||
    !hash(value.sourceKey) ||
    !['scene', 'narrative'].includes(value.kind) ||
    (value.kind === 'scene' && result.target.kind !== 'lore') ||
    !(result.ledgerId === null || hash(result.ledgerId)) ||
    (result.target.kind !== 'lore' && result.ledgerId !== null) ||
    (result.target.kind === 'lore' && result.target.available && result.ledgerId === null)
  )
    bad();
  return result;
}
export function portableCampaignLedger(base, key, value) {
  const result = marker(base, value, ['schemaVersion', 'target']);
  if (!result) return null;
  if (
    !hash(key) ||
    value.referenceKey !== key ||
    value.processed !== true ||
    result.target.kind !== 'lore' ||
    Object.hasOwn(value, 'sourceKey') ||
    Object.hasOwn(value, 'available')
  )
    bad();
  return result;
}
export function matchPortableCampaignLedger(link, ledger) {
  if (
    !ledger ||
    link.target.kind !== 'lore' ||
    link.target.sourceKey !== ledger.target.sourceKey ||
    link.target.available !== ledger.target.available
  )
    bad();
}

export function matchPortableCampaignLedgerOrigin(key, origin) {
  const ref =
    origin?.kind === 'lore'
      ? { kind: 'universe', scopeId: origin.scopeId, entityId: origin.id }
      : origin?.kind === 'adventure-lore'
        ? { kind: 'adventure', scopeId: origin.adventureId, entityId: origin.id }
        : null;
  if (!ref || digest(ref) !== key) bad();
}
