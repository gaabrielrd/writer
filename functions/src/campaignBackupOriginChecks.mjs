import { workFail } from './workProgressContracts.mjs';
export const originIndexBad = () =>
  workFail(
    'failed-precondition',
    'O índice temporário está inconsistente.',
    'campaign-backup-origin-index-invalid',
  );
const add = (n, amount = 1) => {
  const result = n + amount;
  if (!Number.isSafeInteger(result) || result < 0) originIndexBad();
  return result;
};

const bad = originIndexBad;
export const createCampaignOriginPassState = () => ({
  activeBase: null,
  sawBase: false,
  sawProject: false,
  organizationalUniverse: { availability: 'unproven' },
  processed: 0,
  available: 0,
  unavailable: 0,
  none: 0,
  globalUnavailable: 0,
});
export function prepareCampaignOriginWitness(s, file, ordinal, record) {
  if (ordinal !== s.processed) bad();
  const [section, id, outcome, content] = record;
  let base = null,
    item = null,
    omission = null;
  if (section === 'project') {
    if (
      file.manifest.provenanceVersion !== 2 ||
      s.sawProject ||
      s.processed !== 0 ||
      id !== file.manifest.originCampaignId
    )
      bad();
    s.sawProject = true;
  } else if (section === 'base') {
    if (
      s.sawBase ||
      s.processed !== (s.sawProject ? 1 : 0) ||
      outcome !== file.manifest.availability
    )
      bad();
    s.sawBase = true;
    if (outcome === 'available') {
      s.activeBase = content;
      base = content;
    } else omission = outcome;
  } else if (section === 'item') {
    if (!s.activeBase || content.baseId !== s.activeBase.baseId) bad();
    base = s.activeBase;
    item = content;
    if (item.availability !== 'available') omission = 'unavailable';
    else if (
      item.origin.kind === 'lore'
        ? base.universe.kind !== 'reference' || item.origin.scopeId !== base.universe.id
        : item.origin.adventureId !== base.adventure.id
    )
      bad();
  } else {
    if (!s.sawBase) bad();
    if (outcome === 'unavailable') omission = 'unavailable';
    else {
      base = content.base;
      item = content.item;
    }
  }

  return { section, id, content, base, item, omission };
}
export function applyCampaignOriginDecision(s, ordinal, record, result) {
  const [section, id, , content] = record;
  s.processed = add(s.processed);
  if (section === 'project') {
    s.organizationalUniverse = Object.freeze({
      availability: result.availability,
      ...(content.universe.kind === 'none' ? {} : { id: content.universe.id }),
    });
  } else if (result.availability === 'available') s.available = add(s.available);
  else if (result.availability === 'unavailable') s.unavailable = add(s.unavailable);
  else s.none = add(s.none);
  if (result.globalLore === 'unavailable') s.globalUnavailable = add(s.globalUnavailable);
  const decision = Object.freeze({
    index: ordinal,
    section,
    id,
    availability: result.availability,
    ...(result.globalLore === undefined ? {} : { globalLore: result.globalLore }),
  });

  return decision;
}
export function finishCampaignOriginPass(s, file, stored, digest) {
  if (
    !s.sawBase ||
    s.processed !== stored ||
    (file.manifest.provenanceVersion === 2 && !s.sawProject)
  )
    bad();
  return Object.freeze({
    witnesses: s.processed,
    derivedWitnesses: s.processed - (s.sawProject ? 1 : 0),
    organizationalUniverse: Object.freeze({ ...s.organizationalUniverse }),
    available: s.available,
    unavailable: s.unavailable,
    none: s.none,
    globalUnavailable: s.globalUnavailable,
    digest,
  });
}
