import { parseCampaignBackupOwnContent } from './campaignBackupOwnContent.mjs';
import { CAMPAIGN_OWN_FAMILIES } from './campaignBackupOwnDefinitions.mjs';
import { workFail } from './workProgressContracts.mjs';
export const families = ['campaign', 'progress', ...CAMPAIGN_OWN_FAMILIES];
export const bad = () =>
  workFail(
    'failed-precondition',
    'Os dados próprios ou seus vínculos estão inconsistentes.',
    'campaign-backup-own-semantics-invalid',
  );
export const controls = ['session-reference-state', 'session-preparation-state'];
export const add = (a, b = 1) => {
  const result = a + b;
  if (!Number.isSafeInteger(result) || result < 0) bad();
  return result;
};
export function metadata(unit, payload) {
  const kind = unit.section.slice(4);
  if (unit.outcome === 'omitted') {
    const allowed = controls.includes(kind)
      ? unit.reason === 'control'
      : unit.reason === 'deleted'
        ? [
            'note',
            'session',
            'preparation-item',
            'session-reference',
            'session-preparation-link',
          ].includes(kind)
        : unit.reason === 'inactive-parent' &&
          ['session-reference', 'session-preparation-link'].includes(kind);
    if (!allowed) bad();
    return { outcome: 'omitted', reason: unit.reason };
  }
  if (unit.outcome !== 'available' || controls.includes(kind)) bad();
  let value;
  try {
    value = parseCampaignBackupOwnContent(kind, unit.id, payload);
  } catch {
    bad();
  }
  const d = value.data,
    result = { outcome: 'available' };
  if (kind === 'campaign')
    Object.assign(result, { provenanceKind: d.provenance.kind, universeId: d.universeId ?? null });
  if (kind === 'progress') result.present = value.present;
  if (['session', 'preparation-item', 'session-preparation-link'].includes(kind))
    result.order = d.order;
  if (kind === 'checklist') result.completed = d.completed;
  if (['preparation-item', 'preparation-body'].includes(kind)) result.preparationKind = d.kind;
  if (['session-reference', 'session-preparation-link'].includes(kind))
    result.sessionId = d.sessionId;
  if (kind === 'session-preparation-link') result.itemId = d.itemId;
  if (kind === 'session-reference') result.target = d.target;
  return result;
}

export function checkOwnEnvelope(root, progress, project, file) {
  if (
    !root ||
    !progress ||
    (root.provenanceKind === 'independent') !== (file.manifest.availability === 'none')
  )
    bad();
  if (
    file.manifest.provenanceVersion === 2 &&
    (!project ||
      (project.universe.kind === 'none'
        ? root.universeId !== null
        : root.universeId !== project.universe.id))
  )
    bad();
}

export const ownCounts = () => ({
  units: 0,
  active: 0,
  omitted: 0,
  notes: 0,
  sessions: 0,
  checklist: 0,
  checklistCompleted: 0,
  preparationItems: 0,
  preparationBodies: 0,
  sessionReferences: 0,
  sessionLinks: 0,
  nextSessionOrder: 1,
  nextPreparationOrder: 1,
});

export async function checkOwnRow(row, counts, required) {
  const { family, id, value: v } = row,
    dependencies = [];
  if (v.outcome === 'available') {
    const other = async (family, id, active = true) => {
      const target = await required(family, id, active);
      dependencies.push([target.index, target.family, target.id, target.value]);
      return target.value;
    };
    if (family === 'preparation-item' || family === 'preparation-body') {
      const paired = await other(
        family === 'preparation-item' ? 'preparation-body' : 'preparation-item',
        id,
      );
      if (paired.preparationKind !== v.preparationKind) bad();
    }
    if (family === 'session-reference' || family === 'session-preparation-link') {
      await other('session', v.sessionId);
      const control = await other(
        family === 'session-reference' ? 'session-reference-state' : 'session-preparation-state',
        v.sessionId,
        false,
      );
      if (control.outcome !== 'omitted' || control.reason !== 'control') bad();
      if (family === 'session-preparation-link') await other('preparation-item', v.itemId);
    }
    counts.active = add(counts.active);
    const field = {
      note: 'notes',
      session: 'sessions',
      checklist: 'checklist',
      'preparation-item': 'preparationItems',
      'preparation-body': 'preparationBodies',
      'session-reference': 'sessionReferences',
      'session-preparation-link': 'sessionLinks',
    }[family];
    if (field) counts[field] = add(counts[field]);
    if (family === 'checklist' && v.completed)
      counts.checklistCompleted = add(counts.checklistCompleted);
    if (family === 'session-preparation-link') add(v.order);
    if (family === 'session')
      counts.nextSessionOrder = Math.max(counts.nextSessionOrder, add(v.order));
    if (family === 'preparation-item')
      counts.nextPreparationOrder = Math.max(counts.nextPreparationOrder, add(v.order));
  } else {
    counts.omitted = add(counts.omitted);
    if (controls.includes(family)) {
      const parent = await required('session', id, false);
      dependencies.push([parent.index, parent.family, parent.id, parent.value]);
    }
  }
  counts.units = add(counts.units);
  return [row.index, family, id, v, dependencies];
}
