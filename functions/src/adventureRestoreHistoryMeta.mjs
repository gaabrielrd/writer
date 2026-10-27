import { contentClosed as closed, contentCount as count } from './adventureContentPrimitives.mjs';
export const historyPhase = (v) => ['history', 'history-ready'].includes(v.phase);
export const historyViewKeys = [
  'historyVersions',
  'historyBytes',
  'historyBodies',
  'historySourceRecords',
  'drafts',
  'draftBytes',
  'draftBodies',
  'textFrames',
  'historyUnits',
];
export const historyPrivateKeys = [
  'historyStartIndex',
  'historySection',
  'historyPending',
  'textStateCreated',
];
export function validAdventureHistoryView(v) {
  return historyViewKeys.every((k) => count(v[k])) && typeof v.historyPending === 'boolean';
}
export function validAdventureHistoryMeta(v, job, profileEnd) {
  const t = job.validation.summary.totals;
  if (
    !count(v.historyStartIndex) ||
    v.historyStartIndex !== profileEnd ||
    typeof v.textStateCreated !== 'boolean' ||
    !['universe', 'versions', 'drafts', 'complete'].includes(v.historySection) ||
    v.itemIndex !== v.historyStartIndex + v.historyUnits ||
    v.historyVersions > t.versions ||
    v.historyBytes > t.historyBytes ||
    v.historySourceRecords > t.nativeHistoryRecords ||
    v.drafts > t.drafts ||
    v.draftBytes > t.draftBytes ||
    v.historyBodies > Math.ceil(t.historyBytes / 65533) + t.versions ||
    v.draftBodies > Math.max(1, Math.ceil(t.draftBytes / 65533)) ||
    v.textFrames > t.nativeHistoryRecords + Math.max(1, Math.ceil(t.draftBytes / 65533)) ||
    (v.historyPending && !v.textStateCreated)
  )
    return false;
  if (v.historySection === 'universe')
    return (
      v.phase === 'history' &&
      v.historyUnits === 0 &&
      historyViewKeys.every((k) => v[k] === 0) &&
      !v.historyPending &&
      !v.textStateCreated
    );
  const afterHistory = ['drafts', 'complete'].includes(v.historySection),
    complete = v.historySection === 'complete';
  if (
    v.historyUnits !==
      1 +
        2 * v.historyVersions +
        Number(v.historySection === 'versions' && v.historyPending) +
        Number(afterHistory) +
        v.drafts +
        Number(complete) ||
    (afterHistory &&
      (v.historyVersions !== t.versions ||
        v.historyBytes !== t.historyBytes ||
        v.historySourceRecords !== t.nativeHistoryRecords)) ||
    (!afterHistory && (v.drafts !== 0 || v.draftBytes !== 0 || v.draftBodies !== 0)) ||
    (complete && (v.drafts !== t.drafts || v.draftBytes !== t.draftBytes || v.historyPending)) ||
    (v.phase === 'history-ready') !== complete
  )
    return false;
  return true;
}
const mapped = (id) => typeof id === 'string' && /^restore-[a-f0-9]{64}$/.test(id);
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
function validTextHeader(v) {
  const h = v.header,
    version = v.kind === 'version';
  if (
    !closed(
      h,
      version
        ? [
            'id',
            'target',
            'resource',
            'createdAt',
            'reason',
            'label',
            'wordCount',
            'byteLength',
            'contentHash',
            'chunkCount',
          ]
        : [
            'resource',
            'createdAt',
            'baseRevision',
            'byteLength',
            'contentHash',
            'chunkCount',
            'current',
          ],
    ) ||
    !closed(h.resource, ['kind', 'id']) ||
    !['scene', 'block'].includes(h.resource.kind) ||
    !mapped(h.resource.id) ||
    !count(h.byteLength) ||
    !hash(h.contentHash) ||
    !count(h.chunkCount) ||
    h.chunkCount < 1 ||
    !Number.isFinite(h.createdAt) ||
    h.createdAt < 0 ||
    h.createdAt > 8640000000000000
  )
    return false;
  return version
    ? h.id === v.versionId &&
        closed(h.target, ['kind', 'id']) &&
        h.target.kind === 'adventure' &&
        typeof h.target.id === 'string' &&
        /^restore-a-[a-f0-9]{64}$/.test(h.target.id) &&
        ['manual', 'before-restore'].includes(h.reason) &&
        count(h.wordCount) &&
        (h.label === null || (typeof h.label === 'string' && h.label.length <= 300))
    : count(h.baseRevision) &&
        h.baseRevision >= 1 &&
        closed(h.current, ['headHash', 'bodyHash']) &&
        hash(h.current.headHash) &&
        hash(h.current.bodyHash);
}
export function validAdventureTextState(v) {
  return (
    closed(v, [
      'schemaVersion',
      'ownerId',
      'kind',
      'unitIndex',
      'versionId',
      'header',
      'sourceHeaderHash',
      'rawCheckpoint',
      'chunkCount',
      'writtenBytes',
      'tailBase64',
      'done',
    ]) &&
    validTextHeader(v) &&
    v.schemaVersion === 1 &&
    typeof v.ownerId === 'string' &&
    ['version', 'draft'].includes(v.kind) &&
    count(v.unitIndex) &&
    /^restore-[a-f0-9]{64}$/.test(v.versionId) &&
    typeof v.sourceHeaderHash === 'string' &&
    /^[a-f0-9]{64}$/.test(v.sourceHeaderHash) &&
    count(v.chunkCount) &&
    count(v.writtenBytes) &&
    typeof v.tailBase64 === 'string' &&
    v.tailBase64.length <= 87384 &&
    Buffer.from(v.tailBase64, 'base64').toString('base64') === v.tailBase64 &&
    Buffer.from(v.tailBase64, 'base64').length < 65536 &&
    typeof v.done === 'boolean' &&
    Buffer.byteLength(JSON.stringify(v)) <= 100000 &&
    (v.rawCheckpoint === null
      ? !v.done && v.chunkCount === 0 && v.writtenBytes === 0 && v.tailBase64 === ''
      : v.rawCheckpoint &&
        typeof v.rawCheckpoint === 'object' &&
        hash(v.rawCheckpoint.sourceToken) &&
        v.rawCheckpoint.done === v.done &&
        v.rawCheckpoint.byteLength ===
          v.writtenBytes + Buffer.from(v.tailBase64, 'base64').length) &&
    (!v.done ||
      (v.tailBase64 === '' && v.writtenBytes === v.header.byteLength && v.chunkCount >= 1))
  );
}
