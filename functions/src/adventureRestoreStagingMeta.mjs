import { contentClosed as closed, contentCount as count } from './adventureContentPrimitives.mjs';
import { adventureCoreCounts } from './adventureArchiveCore.mjs';
export const ADVENTURE_STAGING_COLLECTIONS = Object.freeze(['stagingArtifacts', 'preparedRoot']);
const viewKeys = [
  'version',
  'phase',
  'itemIndex',
  'artifactCount',
  'cleanedArtifacts',
  'parts',
  'scenes',
  'blocks',
];
const resourceView = [
  'resourceIndex',
  'resourcesProcessed',
  'checklistTotal',
  'checklistCompleted',
];
const resourcePhase = (v) => ['resources', 'resources-ready'].includes(v.phase);
export const adventureStagingView = (value) =>
  structuredClone(
    Object.fromEntries(
      [...viewKeys, ...(Object.hasOwn(value, 'resourceIndex') ? resourceView : [])].map((k) => [
        k,
        value[k],
      ]),
    ),
  );
export function validAdventureStagingView(v) {
  if (
    !closed(v, viewKeys, resourceView) ||
    v.version !== 1 ||
    !['structure', 'structure-ready', 'resources', 'resources-ready'].includes(v.phase) ||
    !viewKeys.filter((k) => !['version', 'phase'].includes(k)).every((k) => count(v[k])) ||
    v.cleanedArtifacts > v.artifactCount
  )
    return false;
  if (resourcePhase(v))
    return resourceView.every((k) => count(v[k])) && v.checklistCompleted <= v.checklistTotal;
  return resourceView.every((k) => !Object.hasOwn(v, k));
}
export function validAdventureStagingMeta(v, job) {
  if (
    !closed(
      v,
      [...viewKeys, 'resourceStartIndex', 'timestamp'],
      [...resourceView, 'resourceCounts'],
    ) ||
    !validAdventureStagingView(adventureStagingView(v)) ||
    !count(v.timestamp) ||
    v.timestamp > 8640000000000000 ||
    !job.validation ||
    job.validation.phase !== 'verified' ||
    v.itemIndex > job.validation.items ||
    v.parts > job.validation.summary.totals.parts ||
    v.scenes > job.validation.summary.totals.resources.scene ||
    v.blocks > job.validation.summary.totals.resources.block ||
    (v.resourceStartIndex !== null &&
      (!count(v.resourceStartIndex) ||
        v.resourceStartIndex < 1 ||
        v.resourceStartIndex > v.itemIndex))
  )
    return false;
  if (
    !['content-verified', 'cancelling', 'cancelled'].includes(job.state) ||
    (job.state === 'content-verified' && v.cleanedArtifacts !== 0) ||
    (job.state === 'cancelled' && v.cleanedArtifacts !== v.artifactCount)
  )
    return false;
  const completeStructure = v.phase !== 'structure',
    expected = job.validation.summary.totals.resources;
  if (
    completeStructure &&
    (v.resourceStartIndex === null ||
      v.parts !== job.validation.summary.totals.parts ||
      v.scenes !== expected.scene ||
      v.blocks !== expected.block)
  )
    return false;
  if (
    v.phase === 'structure-ready' &&
    v.artifactCount !== 3 + v.parts + 2 * v.scenes + 2 * v.blocks
  )
    return false;
  if (resourcePhase(v)) {
    const keys = Object.keys(adventureCoreCounts('resources'));
    if (
      !closed(v.resourceCounts, keys) ||
      keys.some((k) => !count(v.resourceCounts[k]) || v.resourceCounts[k] > expected[k]) ||
      v.resourceIndex < v.resourceStartIndex ||
      v.resourceIndex > v.itemIndex ||
      v.resourcesProcessed !== Object.values(v.resourceCounts).reduce((a, b) => a + b, 0) ||
      v.resourceIndex - v.resourceStartIndex !==
        v.resourcesProcessed + Number(v.phase === 'resources-ready') ||
      v.checklistTotal !== v.resourceCounts.checklist ||
      v.checklistCompleted > v.checklistTotal
    )
      return false;
    if (
      v.phase === 'resources-ready' &&
      (v.resourceIndex !== v.itemIndex || keys.some((k) => v.resourceCounts[k] !== expected[k]))
    )
      return false;
  } else if (Object.hasOwn(v, 'resourceCounts')) return false;
  return true;
}
