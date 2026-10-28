import {
  contentClosed as closed,
  contentCount as count,
  contentHash as hash,
  contentId as id,
} from './adventureContentPrimitives.mjs';
import { ADVENTURE_AUDIT_LAYOUT } from './adventureRestoreAuditLayout.mjs';
export const ADVENTURE_AUDIT_PHASES = [
  'audit-journals',
  'audit-physical',
  'audit-media',
  'audit-ready',
];
export const adventureAuditPhase = (v) => ADVENTURE_AUDIT_PHASES.includes(v.phase);
export const auditViewKeys = ['auditJournals', 'auditPhysical', 'auditMedia'];
export const auditPrivateKeys = [
  'auditContext',
  'auditFamily',
  'auditParent',
  'auditParentAfter',
  'auditAfter',
  'auditAnchor',
  'auditMediaAfter',
  'auditSealOperationId',
];
export const validAdventureAuditView = (v) => auditViewKeys.every((k) => count(v[k]));
function anchor(value) {
  return (
    value === null ||
    (closed(value, ['address', 'journalToken', 'targetToken']) &&
      closed(value.address, ['scope', 'path']) &&
      ['adventure', 'job', 'persona'].includes(value.address.scope) &&
      Array.isArray(value.address.path) &&
      [2, 4].includes(value.address.path.length) &&
      value.address.path.every(id) &&
      hash(value.journalToken) &&
      hash(value.targetToken))
  );
}
export function validAdventureAuditMeta(v) {
  const phase = ADVENTURE_AUDIT_PHASES.indexOf(v.phase),
    end = ADVENTURE_AUDIT_LAYOUT.length;
  return (
    validAdventureAuditView(v) &&
    hash(v.auditContext) &&
    count(v.auditFamily) &&
    v.auditFamily <= end &&
    v.auditJournals <= v.artifactCount &&
    v.auditPhysical <= v.auditJournals &&
    v.auditMedia <= v.storagePrepared &&
    anchor(v.auditAnchor) &&
    ['auditParent', 'auditParentAfter', 'auditAfter', 'auditMediaAfter'].every(
      (k) => v[k] === null || id(v[k]),
    ) &&
    (phase !== 0 ||
      (v.auditFamily === 0 &&
        v.auditPhysical === 0 &&
        v.auditMedia === 0 &&
        v.auditParent === null &&
        v.auditParentAfter === null &&
        v.auditMediaAfter === null)) &&
    (phase < 1 || v.auditJournals === v.artifactCount) &&
    (phase !== 1 || v.auditFamily < end) &&
    (phase < 2 ||
      (v.auditFamily === end &&
        v.auditPhysical === v.auditJournals &&
        v.auditParent === null &&
        v.auditParentAfter === null &&
        v.auditAfter === null)) &&
    (phase >= 2 || (v.auditMedia === 0 && v.auditMediaAfter === null)) &&
    (phase !== 3
      ? v.auditSealOperationId === null
      : v.auditMedia === v.storagePrepared &&
        typeof v.auditSealOperationId === 'string' &&
        /^[a-zA-Z0-9-]{16,80}$/.test(v.auditSealOperationId))
  );
}
