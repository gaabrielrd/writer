/** Only the remote transport is simulated; the dialog, journal, Web Locks and reload are real. */
import type { AdventureDeletionTransport } from '../../../src/features/adventure-deletions/services/adventureDeletionTransport';
import type {
  AdventureDeletionProgress as Progress,
  AdventureDeletionReceipt as Receipt,
} from '../../../src/features/adventure-deletions/model/adventureDeletion';
import { author, FIXTURE_TIME } from './data';
export const fixtureDeletionAdventure = 'visual-delete-adventure';
const title = 'Crônicas do Vento — '.repeat(14);
interface Data {
  job: Progress | null;
  receipts: Record<string, Receipt>;
  fences: string[];
  calls: { method: string; operationId?: string; expectedCheckpoint?: number }[];
}
const key = 'writer.visual.adventure-deletion-dialog';
const read = (): Data =>
  JSON.parse(
    localStorage.getItem(key) ?? '{"job":null,"receipts":{},"fences":[],"calls":[]}',
  ) as Data;
const write = (data: Data) => localStorage.setItem(key, JSON.stringify(data));
let held = false,
  release: (() => void) | null = null;
export function fixtureHoldDeletionStep() {
  held = true;
}
export function fixtureReleaseDeletionStep() {
  release?.();
}
export function fixtureDeletionInspect() {
  return structuredClone(read());
}
function result(data: Data, id: string) {
  const receipt = data.receipts[id];
  if (!receipt || !data.job) throw Error('Missing simulated receipt');
  return structuredClone({ receipt, progress: data.job });
}
export const adventureDeletionTransport: AdventureDeletionTransport = {
  getSource: () =>
    Promise.resolve({
      schemaVersion: 1,
      ownerId: author.uid,
      adventureId: fixtureDeletionAdventure,
      adventureToken: 'a'.repeat(64),
      sourceToken: 'b'.repeat(64),
      revision: 1,
      title,
    }),
  get: () =>
    Promise.resolve({
      schemaVersion: 1,
      ownerId: author.uid,
      lookup: { adventureId: fixtureDeletionAdventure },
      deletion: read().job,
    }),
  list: () =>
    Promise.resolve({
      schemaVersion: 1,
      ownerId: author.uid,
      items: read().job ? [read().job] : [],
      nextCursor: null,
    }),
  start: (input) => {
    const data = read();
    data.calls.push({ method: 'start', operationId: input.operationId });
    if (data.fences.includes(input.operationId)) {
      write(data);
      return Promise.resolve({
        schemaVersion: 1,
        ownerId: author.uid,
        kind: 'canceled',
        request: input,
      });
    }
    if (!data.receipts[input.operationId]) {
      data.job = {
        schemaVersion: 1,
        ownerId: author.uid,
        adventureId: fixtureDeletionAdventure,
        adventureToken: input.adventureToken,
        deletionId: input.operationId,
        deletionToken: 'c'.repeat(64),
        title,
        checkpoint: 0,
        deletedDocuments: 0,
        phase: 'quiescence',
        state: 'deleting',
        complete: false,
        revoked: true,
        createdAt: FIXTURE_TIME,
        updatedAt: FIXTURE_TIME,
      };
      data.receipts[input.operationId] = {
        operationId: input.operationId,
        action: 'start',
        expectedCheckpoint: null,
        confirmedCheckpoint: 0,
      };
    }
    write(data);
    return Promise.resolve(result(data, input.operationId));
  },
  resolveStart: (input) => {
    const data = read(),
      { intent, ...request } = input;
    void intent;
    if (data.receipts[input.operationId]) return Promise.resolve(result(data, input.operationId));
    data.fences.push(input.operationId);
    write(data);
    return Promise.resolve({ schemaVersion: 1, ownerId: author.uid, kind: 'canceled', request });
  },
  advance: async (input) => {
    let data = read();
    data.calls.push({
      method: 'advance',
      operationId: input.operationId,
      expectedCheckpoint: input.expectedCheckpoint,
    });
    write(data);
    if (held)
      await new Promise<void>((resolve) => {
        release = () => {
          release = null;
          held = false;
          resolve();
        };
      });
    data = read();
    if (!data.receipts[input.operationId]) {
      if (
        !data.job ||
        data.job.deletionId !== input.deletionId ||
        data.job.deletionToken !== input.deletionToken ||
        data.job.checkpoint !== input.expectedCheckpoint
      )
        throw Error('Simulated checkpoint mismatch');
      const checkpoint = input.expectedCheckpoint + 1,
        complete = checkpoint >= 3;
      data.job = {
        ...data.job,
        checkpoint,
        deletedDocuments: checkpoint * 12,
        updatedAt: FIXTURE_TIME + checkpoint,
        phase: complete ? 'complete' : 'children',
        state: complete ? 'deleted' : 'deleting',
        complete,
      };
      data.receipts[input.operationId] = {
        operationId: input.operationId,
        action: 'advance',
        expectedCheckpoint: input.expectedCheckpoint,
        confirmedCheckpoint: checkpoint,
      };
    }
    write(data);
    return result(data, input.operationId);
  },
};
