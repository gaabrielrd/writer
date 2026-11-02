import { closed, inconsistent } from './bookRestoreInput.mjs';
const safe = (value) => Number.isSafeInteger(value) && value >= 0;
const hash = (value) => typeof value === 'string' && /^[a-f0-9]{64}$/.test(value);
function id(value) {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= 512 &&
    value.isWellFormed() &&
    !value.includes('/') &&
    !value.includes(String.fromCharCode(92)) &&
    !Array.from(value).some((c) => c.charCodeAt(0) < 32 || c.charCodeAt(0) === 127)
  );
}
export function validateBookRestoreAudit(value) {
  closed(value, [
    'schemaVersion',
    'contextToken',
    'phase',
    'family',
    'parent',
    'parentAfter',
    'after',
    'checkedArtifacts',
    'checkedPhysical',
    'anchor',
    'sealOperationId',
  ]);
  if (
    value.schemaVersion !== 1 ||
    !hash(value.contextToken) ||
    !['journals', 'physical', 'done'].includes(value.phase) ||
    ![value.family, value.checkedArtifacts, value.checkedPhysical].every(safe) ||
    value.checkedPhysical > value.checkedArtifacts
  )
    inconsistent();
  for (const key of ['parent', 'parentAfter', 'after'])
    if (value[key] !== null && !id(value[key])) inconsistent();
  if (
    value.phase === 'journals' &&
    (value.family !== 0 ||
      value.parent !== null ||
      value.parentAfter !== null ||
      (value.after !== null && !hash(value.after)) ||
      value.checkedPhysical !== 0)
  )
    inconsistent();
  if (value.anchor !== null) {
    closed(value.anchor, ['kind', 'id', 'nativeToken', 'journalToken']);
    if (
      !id(value.anchor.kind) ||
      !id(value.anchor.id) ||
      !hash(value.anchor.nativeToken) ||
      !hash(value.anchor.journalToken)
    )
      inconsistent();
  }
  if (value.phase === 'done') {
    if (
      value.parent !== null ||
      value.parentAfter !== null ||
      value.after !== null ||
      !id(value.sealOperationId) ||
      value.sealOperationId.length > 128 ||
      value.checkedPhysical !== value.checkedArtifacts
    )
      inconsistent();
  } else if (value.sealOperationId !== null) inconsistent();
  return value;
}
