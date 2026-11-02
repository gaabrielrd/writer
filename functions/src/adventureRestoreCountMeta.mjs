import { ADVENTURE_IMAGE_LIBRARY_PHASES } from './adventureRestoreImageLibraryMeta.mjs';
import { ADVENTURE_AUDIT_PHASES, adventureAuditPhase } from './adventureRestoreAuditMeta.mjs';
import { contentCount as count } from './adventureContentPrimitives.mjs';
export const ADVENTURE_COUNT_PHASES = [
  'counts-blocks',
  'counts-scenes',
  'counts-links',
  'counts-ready',
];
export const ADVENTURE_COUNT_AND_AUDIT_PHASES = [
  ...ADVENTURE_COUNT_PHASES,
  ...ADVENTURE_AUDIT_PHASES,
  ...ADVENTURE_IMAGE_LIBRARY_PHASES,
];
export const adventureCountPhase = (v) => ADVENTURE_COUNT_AND_AUDIT_PHASES.includes(v.phase);
export const countViewKeys = ['countBlocks', 'countScenes', 'countLinks', 'countWordCount'];
export const countPrivateKeys = ['countIndex'];
export const validAdventureCountView = (v) => countViewKeys.every((k) => count(v[k]));
export function validAdventureCountMeta(v) {
  const step =
    adventureAuditPhase(v) || ADVENTURE_IMAGE_LIBRARY_PHASES.includes(v.phase)
      ? 3
      : ADVENTURE_COUNT_PHASES.indexOf(v.phase);
  return (
    validAdventureCountView(v) &&
    count(v.countIndex) &&
    v.countIndex >= v.resourceStartIndex &&
    v.countIndex <= v.resourceIndex &&
    v.countBlocks <= v.blocks &&
    v.countScenes <= v.scenes &&
    v.countLinks <= v.resourceCounts['narrative-link'] &&
    (step !== 0 || (v.countScenes === 0 && v.countLinks === 0 && v.countWordCount === 0)) &&
    (step >= 2 || v.countLinks === 0) &&
    (step < 1 || v.countBlocks === v.blocks) &&
    (step < 2 || v.countScenes === v.scenes) &&
    (step < 3 ||
      (v.countLinks === v.resourceCounts['narrative-link'] && v.countIndex === v.resourceIndex))
  );
}
