import { inconsistent, integer, restoreHash, sum } from './bookRestoreUploadContracts.mjs';
import { editorialContract } from './literaryContracts.mjs';
import { literaryPlan } from './literaryPlanningSchema.mjs';
import { normalizeBookEditorialArtifact } from './bookEditorialProtocol.mjs';
import { createBookRestoreRemapper } from './bookRestoreRemap.mjs';
import { digest } from './workProgressContracts.mjs';
export const BOOK_RESTORE_EDITORIAL_HEAD_KINDS = Object.freeze([
  'editorial-contract',
  'editorial-contract-version',
  'editorial-plan',
  'editorial-plan-version',
  'editorial-review',
]);
export const BOOK_RESTORE_EDITORIAL_HEAD_SEED = digest({
  domain: 'writer-restored-editorial-heads-v1',
});
function closed(value, keys) {
  if (
    !value ||
    typeof value !== 'object' ||
    Array.isArray(value) ||
    Object.keys(value).length !== keys.length ||
    keys.some((key) => !Object.hasOwn(value, key))
  )
    inconsistent();
}
export function validateEditorialHeads(value, itemCount) {
  closed(value, [
    'schemaVersion',
    'phase',
    'itemIndex',
    'itemCount',
    'created',
    'contracts',
    'plans',
    'proofRoot',
    'last',
  ]);
  if (
    value.schemaVersion !== 1 ||
    !['scan', 'prepared'].includes(value.phase) ||
    value.itemCount !== itemCount
  )
    inconsistent();
  for (const key of ['itemIndex', 'itemCount', 'created', 'contracts', 'plans'])
    integer(value[key]);
  restoreHash(value.proofRoot);
  if (
    value.itemIndex > itemCount ||
    value.contracts > 1 ||
    sum(value.contracts, value.plans) > value.itemIndex ||
    value.created !== 3 * sum(value.contracts, value.plans)
  )
    inconsistent();
  if (value.last !== null) {
    if (value.phase !== 'scan' || !Array.isArray(value.last) || value.last.length !== 3)
      inconsistent();
    const keys = new Set();
    for (const item of value.last) {
      closed(item, ['kind', 'id', 'valueHash']);
      if (!BOOK_RESTORE_EDITORIAL_HEAD_KINDS.includes(item.kind) || typeof item.id !== 'string')
        inconsistent();
      restoreHash(item.valueHash);
      const key = item.kind + ':' + item.id;
      if (keys.has(key)) inconsistent();
      keys.add(key);
    }
    const byKind = new Map(value.last.map((item) => [item.kind, item]));
    const contract = byKind.has('editorial-contract');
    const head = byKind.get(contract ? 'editorial-contract' : 'editorial-plan');
    const version = byKind.get(contract ? 'editorial-contract-version' : 'editorial-plan-version');
    const review = byKind.get('editorial-review');
    if (
      !head ||
      !version ||
      !review ||
      (contract
        ? head.id !== 'current' || version.id !== '1' || review.id !== 'contract'
        : !/^restore-[a-f0-9]{64}$/.test(head.id) ||
          review.id !== head.id ||
          version.id !== digest({ id: head.id, revision: 1 }))
    )
      inconsistent();
  }
  if (value.phase === 'prepared' && (value.itemIndex !== itemCount || value.last !== null))
    inconsistent();
  return value;
}
/** Host-only projection of a certified historical artifact, never a grant. */
export function projectBookRestoreEditorialHead(raw, context, timestamp) {
  const mapper = createBookRestoreRemapper(context);
  integer(timestamp);
  const item = normalizeBookEditorialArtifact(raw);
  if (
    !['contract', 'plan'].includes(item.kind) ||
    item.availability.state !== 'included' ||
    item.lineage?.role !== 'current'
  )
    return null;
  const sourceArtifactId = mapper.editorialIdentity({
    kind: 'book-editorial-artifact',
    id: item.id,
    part: 0,
  });
  const id =
    item.kind === 'contract'
      ? 'contract'
      : 'restore-' +
        digest({
          domain: 'writer-restored-editorial-plan-v1',
          ...context,
          lineage: item.lineage.id,
        });
  const review = {
    schemaVersion: 1,
    id,
    kind: item.kind,
    sourceArtifactId,
    nativeRevision: 1,
    nativeContentHash: null,
    sourceRevision: item.revision,
    sourceCreatedAt: item.createdAt,
    sourceUpdatedAt: item.updatedAt,
    historicalStatus: item.kind === 'plan' ? item.content.status : null,
    historicalCollaboration:
      item.kind === 'contract' ? (item.content.collaborationPolicy ?? null) : null,
    pendingReferences:
      item.kind === 'plan' ? item.content.references.map(mapper.editorialReference) : [],
    review: 'required',
    execution: 'disabled',
    publication: 'private',
  };
  if (item.kind === 'contract') {
    // Decision IDs are local to the new book/contract. Keeping them preserves the
    // exact bounded payload and supersession graph without expanding an 180 KiB contract.
    const contract = editorialContract({
      ...item.content,
      ...(Object.hasOwn(item.content, 'collaborationPolicy')
        ? { collaborationPolicy: { version: 1, mode: 'guidance' } }
        : {}),
    });
    review.nativeContentHash = digest(contract);
    const value = { revision: 1, updatedAt: timestamp, contract };
    return {
      kind: 'contract',
      id,
      writes: [
        { kind: 'editorial-contract', id: 'current', value },
        { kind: 'editorial-contract-version', id: '1', value },
        { kind: 'editorial-review', id, value: review },
      ],
    };
  }
  const plan = literaryPlan({ ...item.content, status: 'proposal', references: [] });
  review.nativeContentHash = digest(plan);
  const value = {
    schemaVersion: 1,
    id,
    revision: 1,
    createdAt: timestamp,
    updatedAt: timestamp,
    plan,
  };
  return {
    kind: 'plan',
    id,
    writes: [
      { kind: 'editorial-plan', id, value },
      { kind: 'editorial-plan-version', id: digest({ id, revision: 1 }), value },
      { kind: 'editorial-review', id, value: review },
    ],
  };
}
