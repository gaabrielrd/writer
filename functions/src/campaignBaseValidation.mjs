import { baseKinds, CAPTURE_WRITE_BYTES, fail } from './campaignBaseContracts.mjs';
import { CHUNK_BYTES } from './workHistoryContracts.mjs';
import { CAMPAIGN_BASE_FIELDS as textFields } from './campaignBackupBaseDefinitions.mjs';
const inconsistent = () => fail('failed-precondition', 'O conteúdo capturado está inconsistente.');
export function validItem(item, key) {
  if (
    !item ||
    item.sourceKey !== key ||
    !baseKinds.includes(item.kind) ||
    typeof item.title !== 'string' ||
    typeof item.archived !== 'boolean' ||
    typeof item.orderKey !== 'string' ||
    !(
      item.parentKey === null ||
      (typeof item.parentKey === 'string' && /^[a-f0-9]{64}$/.test(item.parentKey))
    )
  )
    inconsistent();
  return item;
}
export function validateCapturedFields(item) {
  if (!Array.isArray(item.fields) || item.fields.length > 16) inconsistent();
  if (!textFields[item.kind]) inconsistent();
  const seen = new Set();
  let bytes = 0;
  for (const field of item.fields) {
    if (
      !field ||
      !textFields[item.kind].includes(field.field) ||
      seen.has(field.field) ||
      !/^[a-f0-9]{64}$/.test(field.sha256) ||
      !Number.isSafeInteger(field.bytes) ||
      field.bytes < 0 ||
      !Number.isSafeInteger(field.chunkCount) ||
      field.chunkCount < 1 ||
      field.chunkCount > Math.max(1, Math.ceil(field.bytes / (CHUNK_BYTES - 3))) ||
      typeof field.bodySourceKey !== 'string' ||
      !/^[a-f0-9]{64}$/.test(field.bodySourceKey)
    )
      inconsistent();
    bytes += field.bytes;
    if (bytes > CAPTURE_WRITE_BYTES) inconsistent();
    seen.add(field.field);
  }
  return item.fields;
}
