import type { AdventureRestoreStartIntent } from './adventureRestoreTransferContracts';
import { readAdventureRestoreStartIntent } from './adventureRestoreTransferContracts';
import { recoveryCheck as check } from './adventureRestoreRecoveryContracts';
import { createAdventureRestoreMetadataStore } from './adventureRestoreMetadataStore';
export type AdventureRestoreBootstrapRecord = {
  schemaVersion: 1;
  stamp: string;
  intent: AdventureRestoreStartIntent;
};
export const ADVENTURE_RESTORE_BOOTSTRAP_DB = 'writer.adventure-restore.starts';

const closed = (v: unknown, names: string[]): v is Record<string, unknown> =>
  !!v &&
  typeof v === 'object' &&
  !Array.isArray(v) &&
  Object.keys(v).length === names.length &&
  names.every((k) => Object.hasOwn(v, k));
export function readAdventureRestoreBootstrapRecord(
  raw: unknown,
  ownerId: string,
  operationId?: string,
): AdventureRestoreBootstrapRecord {
  check(
    closed(raw, ['schemaVersion', 'stamp', 'intent']) &&
      raw.schemaVersion === 1 &&
      typeof raw.stamp === 'string' &&
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(raw.stamp),
  );
  const intent = readAdventureRestoreStartIntent(raw.intent, ownerId);
  check(operationId === undefined || intent.operationId === operationId);
  return Object.freeze({ schemaVersion: 1, stamp: raw.stamp, intent });
}
export function createAdventureRestoreBootstrapRecord(
  intent: AdventureRestoreStartIntent,
): AdventureRestoreBootstrapRecord {
  return readAdventureRestoreBootstrapRecord(
    { schemaVersion: 1, stamp: crypto.randomUUID(), intent },
    intent.ownerId,
  );
}

const storage = createAdventureRestoreMetadataStore(
  ADVENTURE_RESTORE_BOOTSTRAP_DB,
  'attempts',
  readAdventureRestoreBootstrapRecord,
);
export const readStoredAdventureRestoreStart = storage.read;
export const compareStoredAdventureRestoreStart = storage.compare;
export const listStoredAdventureRestoreStarts = storage.list;
