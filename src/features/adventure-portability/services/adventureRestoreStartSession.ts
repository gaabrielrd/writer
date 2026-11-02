import type { AdventureRestoreSourceDescriptor } from './adventureRestoreTransferContracts';
import {
  recoveryCheck as check,
  recoveryOwner,
  recoveryOperationId,
} from './adventureRestoreRecoveryContracts';
import {
  createAdventureRestoreBootstrapRecord,
  readAdventureRestoreBootstrapRecord,
  readStoredAdventureRestoreStart,
  compareStoredAdventureRestoreStart,
  listStoredAdventureRestoreStarts,
  type AdventureRestoreBootstrapRecord,
} from './adventureRestoreBootstrapStore';
import {
  adventureRestoreStartRequest,
  readAdventureRestoreStartIntent,
  adventureRestoreStartFingerprint,
} from './adventureRestoreTransferContracts';
import {
  readAdventureRestoreStartOutcome,
  readAdventureRestoreTransferJob,
  readAdventureRestoreTransferPage,
  type AdventureRestoreStartOutcome,
} from './adventureRestoreTransferJob';
import {
  createAdventureRestoreTransferApi,
  type AdventureRestoreTransferApi,
} from './adventureRestoreTransferCallables';
export interface AdventureRestoreBootstrapStorage {
  read: typeof readStoredAdventureRestoreStart;
  compare: typeof compareStoredAdventureRestoreStart;
  list: typeof listStoredAdventureRestoreStarts;
}
const defaults: AdventureRestoreBootstrapStorage = {
  read: readStoredAdventureRestoreStart,
  compare: compareStoredAdventureRestoreStart,
  list: listStoredAdventureRestoreStarts,
};
export function createAdventureRestoreStartSession(options: {
  ownerId: string;
  check: () => void;
  api?: AdventureRestoreTransferApi;
  storage?: AdventureRestoreBootstrapStorage;
  operationId?: () => string;
}) {
  const {
    ownerId,
    check: guard,
    api = createAdventureRestoreTransferApi(ownerId, guard),
    storage = defaults,
    operationId = () => crypto.randomUUID(),
  } = options;
  check(recoveryOwner(ownerId));
  let running = false;
  async function unit<T>(work: () => Promise<T>): Promise<T> {
    guard();
    check(!running);
    running = true;
    try {
      return await work();
    } finally {
      running = false;
    }
  }
  async function confirmed(
    record: AdventureRestoreBootstrapRecord,
    raw: unknown,
  ): Promise<AdventureRestoreStartOutcome> {
    guard();
    const outcome = readAdventureRestoreStartOutcome(raw, record.intent);
    const cleared = await storage.compare(ownerId, record.intent.operationId, record, null, guard);
    guard();
    check(cleared);
    return outcome;
  }
  async function existing(id: string) {
    check(recoveryOperationId(id));
    guard();
    const raw = await storage.read(ownerId, id, guard);
    guard();
    return raw === null ? null : readAdventureRestoreBootstrapRecord(raw, ownerId, id);
  }
  async function send(record: AdventureRestoreBootstrapRecord) {
    guard();
    const raw = await api.start(adventureRestoreStartRequest(record.intent));
    guard();
    return confirmed(record, raw);
  }
  return {
    begin: (source: AdventureRestoreSourceDescriptor, reviewHash: string) =>
      unit(async () => {
        const intent = readAdventureRestoreStartIntent(
            { schemaVersion: 1, ownerId, operationId: operationId(), source, reviewHash },
            ownerId,
          ),
          record = createAdventureRestoreBootstrapRecord(intent);
        const saved = await storage.compare(ownerId, intent.operationId, null, record, guard);
        guard();
        check(saved);
        return send(record);
      }),
    resume: (id: string) =>
      unit(async () => {
        const record = await existing(id);
        guard();
        return record === null ? { kind: 'absent' as const } : send(record);
      }),
    resolveStartForCancellation: (id: string) =>
      unit(async () => {
        const record = await existing(id);
        guard();
        if (record === null) return { kind: 'absent' as const };
        const raw = await api.resolveStart({
          operationId: id,
          requestHash: adventureRestoreStartFingerprint(record.intent),
          intent: 'cancel',
        });
        guard();
        // A confirmed job must use the separate durable job-cancellation protocol.
        return confirmed(record, raw);
      }),
    async get(input: { restoreId: string; jobToken?: string }) {
      guard();
      check(
        recoveryOperationId(input.restoreId) &&
          (input.jobToken === undefined || /^[a-f0-9]{64}$/.test(input.jobToken)),
      );
      const expected = {
        restoreId: input.restoreId,
        ...(input.jobToken === undefined ? {} : { jobToken: input.jobToken }),
      };
      const raw = await api.get(expected);
      guard();
      return readAdventureRestoreTransferJob(raw, ownerId, expected);
    },
    async listRemote(input: { cursor?: string | null; limit?: number } = {}) {
      guard();
      const cursor = input.cursor ?? null,
        limit = input.limit ?? 25;
      check(
        Number.isSafeInteger(limit) &&
          limit >= 1 &&
          limit <= 50 &&
          (cursor === null ||
            (typeof cursor === 'string' &&
              cursor.length <= 4096 &&
              /^[A-Za-z0-9_-]+$/.test(cursor))),
      );
      const raw = await api.list({ cursor, limit });
      guard();
      return readAdventureRestoreTransferPage(raw, ownerId, limit);
    },
    async list(input: { cursor?: string | null; limit?: number } = {}) {
      guard();
      const page = await storage.list(ownerId, guard, {
        cursor: input.cursor ?? null,
        limit: input.limit ?? 25,
      });
      guard();
      return page;
    },
  };
}
