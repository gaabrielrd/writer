import { contentClosed as closed, contentCount as count } from './adventureContentPrimitives.mjs';
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
export const adventureStagingView = (value) =>
  structuredClone(Object.fromEntries(viewKeys.map((k) => [k, value[k]])));
export function validAdventureStagingView(v) {
  return (
    closed(v, viewKeys) &&
    v.version === 1 &&
    ['structure', 'structure-ready'].includes(v.phase) &&
    viewKeys.filter((k) => !['version', 'phase'].includes(k)).every((k) => count(v[k])) &&
    v.cleanedArtifacts <= v.artifactCount
  );
}
export function validAdventureStagingMeta(v, job) {
  if (
    !closed(v, [...viewKeys, 'resourceStartIndex', 'timestamp']) ||
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
  if (
    v.phase === 'structure-ready' &&
    (v.resourceStartIndex === null ||
      v.parts !== job.validation.summary.totals.parts ||
      v.scenes !== job.validation.summary.totals.resources.scene ||
      v.blocks !== job.validation.summary.totals.resources.block ||
      v.artifactCount !== 3 + v.parts + 2 * v.scenes + 2 * v.blocks)
  )
    return false;
  return true;
}
