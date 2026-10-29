import { validNoteContent, validNoteTitle } from './campaignNotesContracts.mjs';
import {
  utf8,
  validTitle,
  validSummary,
  validScheduledDate,
  statuses as sessionStatuses,
} from './campaignSessionsContracts.mjs';
import {
  validBody,
  bodyKeys,
  statuses as preparationStatuses,
} from './campaignPreparationContracts.mjs';

export { CAMPAIGN_OWN_CHUNK_BYTES } from './campaignBackupOwnDefinitions.mjs';
export const CAMPAIGN_OWN_FIELDS = Object.freeze(
  Object.fromEntries(
    Object.entries({
      campaign: [
        'title',
        'description',
        'status',
        'createdAt',
        'updatedAt',
        'provenance.kind',
        'universeId',
      ],
      progress: ['editorialState', 'wordGoal', 'updatedAt'],
      note: ['title', 'content', 'createdAt', 'updatedAt'],
      session: ['title', 'summary', 'status', 'scheduledDate', 'order', 'createdAt', 'updatedAt'],
      checklist: ['title', 'completed', 'createdAt', 'updatedAt'],
      'preparation-item': ['kind', 'title', 'status', 'order', 'createdAt', 'updatedAt'],
      'preparation-body': ['kind', 'body'],
      'session-reference': [
        'sessionId',
        'target.kind',
        'target.sourceKey',
        'createdAt',
        'updatedAt',
      ],
      'session-preparation-link': ['sessionId', 'itemId', 'order', 'createdAt', 'updatedAt'],
    }).map(([kind, fields]) => [kind, Object.freeze(fields)]),
  ),
);
const invalid = () => {
  throw new TypeError('Conteúdo próprio não representável no backup da campanha.');
};
const object = (value) => !!value && typeof value === 'object' && !Array.isArray(value);
const safe = (value, minimum = 0) => Number.isSafeInteger(value) && value >= minimum;
const id = (value) =>
  utf8(value) &&
  value.length > 0 &&
  Buffer.byteLength(value) <= 1500 &&
  !value.includes('/') &&
  !['.', '..'].includes(value);
const date = (value) => Number.isFinite(value) && value >= 0 && value <= 8640000000000000;
const title = (value) => utf8(value) && !!value.trim() && value.length <= 300;
const pick = (value, keys) =>
  Object.fromEntries(
    keys.filter((key) => Object.hasOwn(value, key)).map((key) => [key, value[key]]),
  );
function dated(value) {
  if (!date(value.createdAt) || !date(value.updatedAt) || value.updatedAt < value.createdAt)
    invalid();
}
function optional(value, key, validate) {
  if (Object.hasOwn(value, key) && !validate(value[key])) invalid();
}
/** Closed source projection only. Declarations of provenance/targets grant no access. */
export function serializeCampaignBackupOwnContent(kind, resourceId, value, present = true) {
  if (
    typeof kind !== 'string' ||
    !Object.hasOwn(CAMPAIGN_OWN_FIELDS, kind) ||
    !id(resourceId) ||
    typeof present !== 'boolean' ||
    (!present && kind !== 'progress')
  )
    invalid();
  let data = {};
  if (present) {
    if (!object(value)) invalid();
    if (!['progress', 'preparation-body'].includes(kind)) dated(value);
    switch (kind) {
      case 'campaign':
        if (
          !title(value.title) ||
          !['planning', 'active', 'completed', 'archived'].includes(value.status) ||
          !object(value.provenance) ||
          !['independent', 'original'].includes(value.provenance.kind)
        )
          invalid();
        optional(value, 'description', (v) => utf8(v) && v.length <= 4000);
        optional(value, 'universeId', (v) => v === null || id(v));
        data = {
          ...pick(value, [
            'title',
            'description',
            'status',
            'createdAt',
            'updatedAt',
            'universeId',
          ]),
          provenance: { kind: value.provenance.kind },
        };
        break;
      case 'progress':
        optional(value, 'editorialState', (v) => v === null);
        optional(value, 'wordGoal', (v) => v === null);
        optional(value, 'updatedAt', date);
        data = pick(value, CAMPAIGN_OWN_FIELDS.progress);
        break;
      case 'note':
        if (!validNoteTitle(value.title) || !validNoteContent(value.content)) invalid();
        data = pick(value, CAMPAIGN_OWN_FIELDS.note);
        break;
      case 'session':
        if (
          !validTitle(value.title) ||
          !validSummary(value.summary) ||
          !validScheduledDate(value.scheduledDate) ||
          !sessionStatuses.includes(value.status) ||
          !safe(value.order, 1)
        )
          invalid();
        data = pick(value, CAMPAIGN_OWN_FIELDS.session);
        break;
      case 'checklist':
        if (!title(value.title) || typeof value.completed !== 'boolean') invalid();
        data = pick(value, CAMPAIGN_OWN_FIELDS.checklist);
        break;
      case 'preparation-item':
        if (
          !title(value.title) ||
          typeof value.kind !== 'string' ||
          !Object.hasOwn(preparationStatuses, value.kind) ||
          !preparationStatuses[value.kind].includes(value.status) ||
          !safe(value.order, 1)
        )
          invalid();
        data = pick(value, CAMPAIGN_OWN_FIELDS[kind]);
        break;
      case 'preparation-body':
        if (!validBody(value.kind, value.body)) invalid();
        data = { kind: value.kind, body: pick(value.body, bodyKeys[value.kind]) };
        break;
      case 'session-reference':
        if (
          !id(value.sessionId) ||
          !object(value.target) ||
          !['scene', 'lore'].includes(value.target.kind) ||
          typeof value.target.sourceKey !== 'string' ||
          !/^[a-f0-9]{64}$/.test(value.target.sourceKey)
        )
          invalid();
        data = {
          ...pick(value, ['sessionId', 'createdAt', 'updatedAt']),
          target: pick(value.target, ['kind', 'sourceKey']),
        };
        break;
      case 'session-preparation-link':
        if (!id(value.sessionId) || !id(value.itemId) || !safe(value.order, 1)) invalid();
        data = pick(value, CAMPAIGN_OWN_FIELDS[kind]);
        break;
    }
  }
  const json = JSON.stringify({ schemaVersion: 1, kind, id: resourceId, present, data });
  return { json, bytes: Buffer.from(json, 'utf8') };
}
