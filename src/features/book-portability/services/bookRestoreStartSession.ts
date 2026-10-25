import type { BookRestoreSourceDescriptor } from '../model/bookRestoreTransfer';
import {
  restorePreparationCheck as check,
  restorePreparationId,
  restorePreparationOperationId,
} from './bookRestorePreparationContracts';
import {
  createBookRestoreBootstrapRecord,
  readBookRestoreBootstrapRecord,
  readStoredBookRestoreStart,
  compareStoredBookRestoreStart,
  listStoredBookRestoreStarts,
  type BookRestoreBootstrapRecord,
} from './bookRestoreBootstrapStore';
import {
  bookRestoreStartRequest,
  readBookRestoreStartIntent,
  bookRestoreStartFingerprint,
} from './bookRestoreTransferContracts';
import {
  readBookRestoreStartOutcome,
  readBookRestoreTransferJob,
  readBookRestoreTransferPage,
  type BookRestoreStartOutcome,
} from './bookRestoreTransferJob';
import {
  bookRestoreTransferApi,
  type BookRestoreTransferApi,
} from './bookRestoreTransferCallables';
export interface BookRestoreBootstrapStorage {
  read: typeof readStoredBookRestoreStart;
  compare: typeof compareStoredBookRestoreStart;
  list: typeof listStoredBookRestoreStarts;
}
const defaults: BookRestoreBootstrapStorage = {
  read: readStoredBookRestoreStart,
  compare: compareStoredBookRestoreStart,
  list: listStoredBookRestoreStarts,
};
export function createBookRestoreStartSession(options: {
  ownerId: string;
  check: () => void;
  api?: BookRestoreTransferApi;
  storage?: BookRestoreBootstrapStorage;
  operationId?: () => string;
}) {
  const {
    ownerId,
    check: guard,
    api = bookRestoreTransferApi,
    storage = defaults,
    operationId = () => crypto.randomUUID(),
  } = options;
  check(restorePreparationId(ownerId));
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
    record: BookRestoreBootstrapRecord,
    raw: unknown,
  ): Promise<BookRestoreStartOutcome> {
    guard();
    const outcome = readBookRestoreStartOutcome(raw, record.intent);
    const cleared = await storage.compare(ownerId, record.intent.operationId, record, null, guard);
    guard();
    check(cleared);
    return outcome;
  }
  async function existing(id: string) {
    check(restorePreparationOperationId(id));
    guard();
    const raw = await storage.read(ownerId, id, guard);
    guard();
    return raw === null ? null : readBookRestoreBootstrapRecord(raw, ownerId, id);
  }
  async function send(record: BookRestoreBootstrapRecord) {
    guard();
    const raw = await api.start(bookRestoreStartRequest(record.intent));
    guard();
    return confirmed(record, raw);
  }
  return {
    begin: (source: BookRestoreSourceDescriptor, reviewHash: string) =>
      unit(async () => {
        const intent = readBookRestoreStartIntent(
            { schemaVersion: 1, ownerId, operationId: operationId(), source, reviewHash },
            ownerId,
          ),
          record = createBookRestoreBootstrapRecord(intent);
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
          requestHash: bookRestoreStartFingerprint(record.intent),
          intent: 'cancel',
        });
        guard();
        // A confirmed job must use the separate durable job-cancellation protocol.
        return confirmed(record, raw);
      }),
    async get(input: { restoreId: string; jobToken?: string }) {
      guard();
      check(
        restorePreparationOperationId(input.restoreId) &&
          (input.jobToken === undefined || /^[a-f0-9]{64}$/.test(input.jobToken)),
      );
      const expected = {
        restoreId: input.restoreId,
        ...(input.jobToken === undefined ? {} : { jobToken: input.jobToken }),
      };
      const raw = await api.get(expected);
      guard();
      return readBookRestoreTransferJob(raw, ownerId, expected);
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
      return readBookRestoreTransferPage(raw, ownerId, limit);
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
