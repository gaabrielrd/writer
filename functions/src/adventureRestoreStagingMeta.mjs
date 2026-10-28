import {
  adventurePersonaLibraryPhase,
  adventurePersonaLibraryViewKeys,
  adventurePersonaLibraryPrivateKeys,
  validAdventurePersonaLibraryView,
  validAdventurePersonaLibraryMeta,
} from './adventureRestorePersonaLibraryMeta.mjs';
import {
  universeRestorePhase,
  universeRestoreViewKeys,
  validAdventureUniverseOutcome,
} from './adventureRestoreUniverseMeta.mjs';
import {
  draftFinalizePhase,
  draftFinalizeViewKeys,
  validAdventureDraftFinalized,
} from './adventureRestoreDraftMeta.mjs';
import {
  historyPhase,
  historyViewKeys,
  historyPrivateKeys,
  validAdventureHistoryView,
  validAdventureHistoryMeta,
} from './adventureRestoreHistoryMeta.mjs';
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
const profileView = [
  'loreHeads',
  'loreBodies',
  'personaAdventureBindings',
  'personaSceneBindings',
  'personaProfiles',
];
const profilePhase = (v) =>
  ['lore', 'personas', 'profiles-ready'].includes(v.phase) || historyPhase(v);
const resourcePhase = (v) => ['resources', 'resources-ready'].includes(v.phase) || profilePhase(v);
export const adventureStagingView = (value) =>
  structuredClone(
    Object.fromEntries(
      [
        ...viewKeys,
        ...(Object.hasOwn(value, 'resourceIndex') ? resourceView : []),
        ...(profilePhase(value) ? profileView : []),
        ...(historyPhase(value) ? [...historyViewKeys, 'historyPending'] : []),
        ...(draftFinalizePhase(value) ? draftFinalizeViewKeys : []),
        ...(universeRestorePhase(value) ? universeRestoreViewKeys : []),
        ...(adventurePersonaLibraryPhase(value) ? adventurePersonaLibraryViewKeys : []),
      ].map((k) => [k, value[k]]),
    ),
  );
export function validAdventureStagingView(v) {
  if (
    !closed(v, viewKeys, [
      ...resourceView,
      ...profileView,
      ...historyViewKeys,
      'historyPending',
      ...draftFinalizeViewKeys,
      ...universeRestoreViewKeys,
      ...adventurePersonaLibraryViewKeys,
    ]) ||
    v.version !== 1 ||
    ![
      'structure',
      'structure-ready',
      'resources',
      'resources-ready',
      'lore',
      'personas',
      'profiles-ready',
      'history',
      'history-ready',
      'draft-ready',
      'universe-ready',
      'persona-library',
      'persona-library-ready',
    ].includes(v.phase) ||
    !viewKeys.filter((k) => !['version', 'phase'].includes(k)).every((k) => count(v[k])) ||
    v.cleanedArtifacts > v.artifactCount
  )
    return false;
  if (resourcePhase(v)) {
    if (!resourceView.every((k) => count(v[k])) || v.checklistCompleted > v.checklistTotal)
      return false;
  } else if (resourceView.some((k) => Object.hasOwn(v, k))) return false;
  if (
    profilePhase(v)
      ? !profileView.every((k) => count(v[k]))
      : profileView.some((k) => Object.hasOwn(v, k))
  )
    return false;
  if (
    draftFinalizePhase(v)
      ? !validAdventureDraftFinalized(v)
      : draftFinalizeViewKeys.some((k) => Object.hasOwn(v, k))
  )
    return false;
  if (
    universeRestorePhase(v)
      ? !validAdventureUniverseOutcome(v)
      : universeRestoreViewKeys.some((k) => Object.hasOwn(v, k))
  )
    return false;
  if (
    adventurePersonaLibraryPhase(v)
      ? !validAdventurePersonaLibraryView(v)
      : adventurePersonaLibraryViewKeys.some((k) => Object.hasOwn(v, k))
  )
    return false;
  return historyPhase(v)
    ? validAdventureHistoryView(v)
    : [...historyViewKeys, 'historyPending'].every((k) => !Object.hasOwn(v, k));
}
export function validAdventureStagingMeta(v, job) {
  if (
    !closed(
      v,
      [...viewKeys, 'resourceStartIndex', 'timestamp'],
      [
        ...resourceView,
        'resourceCounts',
        ...profileView,
        ...historyViewKeys,
        ...historyPrivateKeys,
        ...draftFinalizeViewKeys,
        ...universeRestoreViewKeys,
        ...adventurePersonaLibraryViewKeys,
        ...adventurePersonaLibraryPrivateKeys,
      ],
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
        v.resourcesProcessed + Number(v.phase !== 'resources') ||
      v.checklistTotal !== v.resourceCounts.checklist ||
      v.checklistCompleted > v.checklistTotal
    )
      return false;
    if (
      v.phase !== 'resources' &&
      ((v.phase === 'resources-ready' && v.resourceIndex !== v.itemIndex) ||
        keys.some((k) => v.resourceCounts[k] !== expected[k]))
    )
      return false;
  } else if (Object.hasOwn(v, 'resourceCounts')) return false;
  if (profilePhase(v)) {
    const totals = job.validation.summary.totals;
    if (
      v.loreHeads > totals.lore.lore ||
      v.loreBodies > totals.lore['lore-body'] ||
      v.personaAdventureBindings > totals.personas.adventure ||
      v.personaSceneBindings > totals.personas.scene ||
      v.personaProfiles > v.personaAdventureBindings + v.personaSceneBindings ||
      (historyPhase(v) ? v.historyStartIndex : v.itemIndex) !==
        v.resourceIndex +
          v.loreHeads +
          v.loreBodies +
          Number(v.phase !== 'lore') +
          v.personaAdventureBindings +
          v.personaSceneBindings +
          Number(v.phase === 'profiles-ready' || historyPhase(v)) ||
      (v.phase === 'lore' &&
        (v.personaAdventureBindings !== 0 ||
          v.personaSceneBindings !== 0 ||
          v.personaProfiles !== 0)) ||
      (v.phase !== 'lore' &&
        (v.loreHeads !== totals.lore.lore || v.loreBodies !== totals.lore['lore-body'])) ||
      ((v.phase === 'profiles-ready' || historyPhase(v)) &&
        (v.personaAdventureBindings !== totals.personas.adventure ||
          v.personaSceneBindings !== totals.personas.scene))
    )
      return false;
  } else if (profileView.some((k) => Object.hasOwn(v, k))) return false;
  if (historyPhase(v)) {
    const profileEnd =
      v.resourceIndex +
      v.loreHeads +
      v.loreBodies +
      2 +
      v.personaAdventureBindings +
      v.personaSceneBindings;
    if (!validAdventureHistoryMeta(v, job, profileEnd)) return false;
  } else if ([...historyViewKeys, ...historyPrivateKeys].some((k) => Object.hasOwn(v, k)))
    return false;
  if (draftFinalizePhase(v)) {
    if ((v.draftOutcome === 'version') !== (v.drafts === 1)) return false;
  } else if (draftFinalizeViewKeys.some((k) => Object.hasOwn(v, k))) return false;
  if (!universeRestorePhase(v) && universeRestoreViewKeys.some((k) => Object.hasOwn(v, k)))
    return false;
  if (
    adventurePersonaLibraryPhase(v)
      ? !validAdventurePersonaLibraryMeta(v, job)
      : [...adventurePersonaLibraryViewKeys, ...adventurePersonaLibraryPrivateKeys].some((k) =>
          Object.hasOwn(v, k),
        )
  )
    return false;
  return true;
}
