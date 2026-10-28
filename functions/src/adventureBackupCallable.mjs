import { workFail } from './workProgressContracts.mjs';
export const ADVENTURE_BACKUP_METHODS = Object.freeze([
  'getAdventureBackupSource',
  'listAdventureBackupStructure',
  'readAdventureBackupStructure',
  'listAdventureBackupResources',
  'readAdventureBackupResource',
  'listAdventureBackupLore',
  'readAdventureBackupLore',
  'listAdventureBackupPersonaBindings',
  'readAdventureBackupPersona',
  'listAdventureBackupHistory',
  'readAdventureBackupHistory',
  'readAdventureBackupHistoryText',
  'listAdventureBackupImageBindings',
  'getAdventureBackupImage',
  'readAdventureBackupImageChunk',
  'verifyAdventureBackupImage',
  'getAdventureBackupUniverse',
]);
export async function invokeAdventureBackupCallable(service, method, uid, input) {
  if (typeof uid !== 'string' || !uid) workFail('unauthenticated', 'Entre na sua conta.');
  if (
    !ADVENTURE_BACKUP_METHODS.includes(method) ||
    !service ||
    !Object.hasOwn(service, method) ||
    typeof service[method] !== 'function'
  )
    workFail('invalid-argument', 'Leitura de backup indisponível.');
  return service[method](uid, input);
}
export function setAdventureBackupHeaders(method, request) {
  if (!ADVENTURE_BACKUP_METHODS.includes(method)) return;
  request.rawRequest?.res?.setHeader('Cache-Control', 'private, no-store');
  request.rawRequest?.res?.setHeader('Vary', 'Authorization');
}
