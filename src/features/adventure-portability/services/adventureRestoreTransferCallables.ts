import { callAdventureRestore } from './adventureRestoreCallables';
import {
  recoveryCheck as check,
  recoveryObject as object,
  recoveryOwner,
  recoveryOperationId as id,
  recoveryHash as hash,
} from './adventureRestoreRecoveryContracts';
import {
  readAdventureRestoreStartIntent,
  adventureRestoreStartRequest,
  readAdventureRestoreChunkRequest,
  type AdventureRestoreStartRequest,
  type AdventureRestoreChunkRequest,
} from './adventureRestoreTransferContracts';
export interface AdventureRestoreTransferApi {
  start(input: AdventureRestoreStartRequest): Promise<unknown>;
  get(input: { restoreId: string; jobToken?: string }): Promise<unknown>;
  list(input: { cursor?: string | null; limit?: number }): Promise<unknown>;
  append(input: AdventureRestoreChunkRequest): Promise<unknown>;
  resolveStart(input: {
    operationId: string;
    requestHash: string;
    intent: 'cancel';
  }): Promise<unknown>;
}
export function createAdventureRestoreTransferApi(
  ownerId: string,
  guard: () => void,
): AdventureRestoreTransferApi {
  check(recoveryOwner(ownerId));
  const call = (name: string, input: Readonly<Record<string, unknown>>) =>
    callAdventureRestore(ownerId, guard, name, input);
  return {
    start(input) {
      guard();
      check(object(input, ['operationId', 'source', 'reviewHash']));
      const intent = readAdventureRestoreStartIntent(
        { schemaVersion: 1, ownerId, ...input },
        ownerId,
      );
      return call('startAdventureRestore', adventureRestoreStartRequest(intent));
    },
    get(input) {
      guard();
      check(
        object(input, ['restoreId'], ['jobToken']) &&
          id(input.restoreId) &&
          (!Object.hasOwn(input, 'jobToken') || hash(input.jobToken)),
      );
      return call(
        'getAdventureRestore',
        Object.freeze({
          restoreId: input.restoreId,
          ...(Object.hasOwn(input, 'jobToken') ? { jobToken: input.jobToken } : {}),
        }),
      );
    },
    list(input) {
      guard();
      check(object(input, [], ['cursor', 'limit']));
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
      return call('listAdventureRestores', Object.freeze({ cursor, limit }));
    },
    append(input) {
      guard();
      return call('appendAdventureRestoreChunk', readAdventureRestoreChunkRequest(input));
    },
    resolveStart(input) {
      guard();
      check(
        object(input, ['operationId', 'requestHash', 'intent']) &&
          id(input.operationId) &&
          hash(input.requestHash) &&
          input.intent === 'cancel',
      );
      return call(
        'resolveAdventureRestoreStart',
        Object.freeze({
          operationId: input.operationId,
          requestHash: input.requestHash,
          intent: 'cancel',
        }),
      );
    },
  };
}
