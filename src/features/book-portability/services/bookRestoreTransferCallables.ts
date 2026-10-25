import { callBookBackup } from './bookStructureCallables';
import type { BookRestoreStartRequest } from '../model/bookRestoreTransfer';
export interface BookRestoreTransferApi {
  start(input: BookRestoreStartRequest): Promise<unknown>;
  list(input: { cursor?: string | null; limit?: number }): Promise<unknown>;
  get(input: { restoreId: string; jobToken?: string }): Promise<unknown>;
  append(input: {
    restoreId: string;
    jobToken: string;
    operationId: string;
    expectedCheckpoint: number;
    index: number;
    chunkHash: string;
    chunkBase64: string;
  }): Promise<unknown>;
  resolveStart(input: {
    operationId: string;
    requestHash: string;
    intent: 'cancel';
  }): Promise<unknown>;
}
export const bookRestoreTransferApi: BookRestoreTransferApi = {
  start: (input) => callBookBackup<unknown>('startBookRestore', input),
  list: (input) => callBookBackup<unknown>('listBookRestores', input),
  get: (input) => callBookBackup<unknown>('getBookRestore', input),
  append: (input) => callBookBackup<unknown>('appendBookRestoreChunk', input),
  resolveStart: (input) => callBookBackup<unknown>('resolveBookRestoreStart', input),
};
