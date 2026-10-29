import { CAMPAIGN_OWN_FAMILIES } from './campaignBackupOwnDefinitions.mjs';
import { CAMPAIGN_BASE_FIELDS } from './campaignBackupBaseDefinitions.mjs';
import {
  campaignManifestId,
  closedCampaignRecord,
  CAMPAIGN_CONTENT_VERSIONS,
} from './portableCampaignManifest.mjs';
import { validatePortableCampaignWitness } from './portableCampaignProvenance.mjs';
import { CampaignBackupFormatError } from './campaignBackupContainer.mjs';
import { campaignFieldChunkCount } from './campaignBackupTextChunks.mjs';
const encoder = new TextEncoder(),
  decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
export const campaignFileBad = () => {
  throw new CampaignBackupFormatError('invalid-campaign', 'Arquivo de campanha inconsistente.');
};
const hash = (v) => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
const count = (v) => Number.isSafeInteger(v) && v >= 0;
const own = ['campaign', 'progress', ...CAMPAIGN_OWN_FAMILIES].map((k) => 'own:' + k);
const sections = [
  ...own,
  'base',
  'base:item',
  'base:field',
  'base:bodies',
  'base:links',
  'base:loreReferences',
  'image',
  'variant',
  'anchor',
  'anchor:field',
];
export function campaignFileJson(bytes, project, max = 16384) {
  if (!(bytes instanceof Uint8Array) || bytes.length > max) campaignFileBad();
  let value;
  try {
    value = project(JSON.parse(decoder.decode(bytes)));
  } catch {
    campaignFileBad();
  }
  if (!BufferEqual(encoder.encode(JSON.stringify(value)), bytes)) campaignFileBad();
  return value;
}
function BufferEqual(a, b) {
  return a.length === b.length && a.every((v, i) => v === b[i]);
}
export function campaignFileHeader(v) {
  if (
    !closedCampaignRecord(v, [
      'schemaVersion',
      'kind',
      'contentVersion',
      'provenanceVersion',
      'originCampaignId',
      'availability',
    ]) ||
    v.schemaVersion !== 1 ||
    v.kind !== 'writer-campaign' ||
    !CAMPAIGN_CONTENT_VERSIONS.includes(v.contentVersion) ||
    ![1, 2].includes(v.provenanceVersion) ||
    !['none', 'available', 'unavailable'].includes(v.availability)
  )
    campaignFileBad();
  return {
    schemaVersion: 1,
    kind: 'writer-campaign',
    contentVersion: v.contentVersion,
    provenanceVersion: v.provenanceVersion,
    originCampaignId: campaignManifestId(v.originCampaignId),
    availability: v.availability,
  };
}
export function campaignFileUnit(v, contentVersion = 1) {
  if (!CAMPAIGN_CONTENT_VERSIONS.includes(contentVersion)) campaignFileBad();
  if (!v || !sections.includes(v.section)) campaignFileBad();
  const field = ['base:field', 'anchor:field'].includes(v.section),
    image = v.section === 'image',
    available = v.outcome === 'available',
    omitted = v.outcome === 'omitted';
  if (
    !closedCampaignRecord(v, [
      'section',
      'id',
      ...(field ? ['field'] : []),
      'outcome',
      ...(omitted ? ['reason'] : []),
      ...(available
        ? [...(image ? ['contentType'] : []), 'byteLength', 'chunkCount', 'contentHash']
        : []),
    ])
  )
    campaignFileBad();
  if (v.section === 'base' && v.id === null) {
    if (!['none', 'unavailable'].includes(v.outcome)) campaignFileBad();
  } else {
    campaignManifestId(v.id);
    if (!v.section.startsWith('own:') && !hash(v.id)) campaignFileBad();
  }
  if (field) {
    const names =
      v.section === 'anchor:field'
        ? CAMPAIGN_BASE_FIELDS.lore
        : Object.values(CAMPAIGN_BASE_FIELDS).flat();
    if (!names.includes(v.field) || !available) campaignFileBad();
  }
  const control = ['own:session-reference-state', 'own:session-preparation-state'].includes(
    v.section,
  );
  if (
    (control && (!omitted || v.reason !== 'control')) ||
    (omitted && v.reason === 'control' && !control)
  )
    campaignFileBad();
  if (omitted) {
    if (!own.includes(v.section) || !['control', 'deleted', 'inactive-parent'].includes(v.reason))
      campaignFileBad();
  } else if (
    !available &&
    v.outcome !== 'unavailable' &&
    !(v.section === 'base' && v.outcome === 'none')
  )
    campaignFileBad();
  if (v.outcome === 'unavailable' && own.includes(v.section)) campaignFileBad();
  const out = {
    section: v.section,
    id: v.id,
    ...(field ? { field: v.field } : {}),
    outcome: v.outcome,
  };
  if (omitted) out.reason = v.reason;
  if (available) {
    if (
      !count(v.byteLength) ||
      !count(v.chunkCount) ||
      (field && contentVersion >= 2
        ? !campaignFieldChunkCount(v.byteLength, v.chunkCount)
        : v.chunkCount !== Math.max(1, Math.ceil(v.byteLength / 65536))) ||
      !hash(v.contentHash) ||
      (image && (v.contentType !== 'image/png' || v.byteLength < 8 || v.byteLength > 16777216))
    )
      campaignFileBad();
    if (image) out.contentType = 'image/png';
    Object.assign(out, {
      byteLength: v.byteLength,
      chunkCount: v.chunkCount,
      contentHash: v.contentHash,
    });
  }
  return out;
}
export function campaignFileWitness(v) {
  if (!Array.isArray(v) || v.length !== 4 || !['project', 'base', 'item', 'anchor'].includes(v[0]))
    campaignFileBad();
  const [section, id, outcome, raw] = v;
  if (outcome === 'available') {
    const content = validatePortableCampaignWitness(raw);
    if (
      (section === 'project' && (content.kind !== 'project' || id !== content.campaignId)) ||
      (section === 'base' && (content.kind !== 'base' || id !== content.baseId)) ||
      (section === 'item' && (content.kind !== 'item' || id !== content.sourceKey)) ||
      (section === 'anchor' && (content.kind !== 'anchor' || id !== content.item.sourceKey))
    )
      campaignFileBad();
    return [section, id, outcome, content];
  }
  if (raw !== null) campaignFileBad();
  if (section === 'base' && id === null && ['none', 'unavailable'].includes(outcome))
    return [section, id, outcome, null];
  if (section === 'anchor' && hash(id) && outcome === 'unavailable')
    return [section, id, outcome, null];
  campaignFileBad();
}
