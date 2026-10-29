/** Only the transport is simulated; actual routes, dialogs, journal, Web Locks and reload run. */
import type { AdventureDeletionTransport } from '../../../src/features/adventure-deletions/services/adventureDeletionTransport';
import type {
  AdventureDeletionProgress as Progress,
  AdventureDeletionReceipt as Receipt,
  AdventureDeletionSource as Source,
} from '../../../src/features/adventure-deletions/model/adventureDeletion';
import { FIXTURE_TIME } from './data';
import {
  fixtureOwner,
  fixtureGet,
  fixtureReserveAdventureDeletion,
  fixtureFinishAdventureDeletion,
} from './studioStore';
export const fixtureDeletionAdventure = 'visual-delete-adventure';
const title = 'Crônicas do Vento — '.repeat(14),
  prefix = 'writer.visual.adventure-deletion:';
interface Data {
  job: Progress | null;
  receipts: Record<string, Receipt>;
  requests: Record<string, string>;
  fences: string[];
  calls: { method: string; operationId?: string; expectedCheckpoint?: number }[];
}
const key = (uid: string, id: string) => prefix + JSON.stringify([uid, id]);
const read = (uid: string, id: string): Data =>
  JSON.parse(
    localStorage.getItem(key(uid, id)) ??
      '{"job":null,"receipts":{},"requests":{},"fences":[],"calls":[]}',
  ) as Data;
const write = (uid: string, id: string, data: Data) =>
  localStorage.setItem(key(uid, id), JSON.stringify(data));
function jobs(uid: string) {
  const values: { id: string; data: Data }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i)!;
    if (!k.startsWith(prefix)) continue;
    const [owner, id] = JSON.parse(k.slice(prefix.length)) as string[];
    if (owner === uid) values.push({ id, data: read(uid, id) });
  }
  return values;
}
let held = false,
  release: (() => void) | null = null;
export function fixtureHoldDeletionStep() {
  held = true;
}
export function fixtureReleaseDeletionStep() {
  release?.();
}
export function fixtureDeletionInspect(id = fixtureDeletionAdventure) {
  return structuredClone(read(fixtureOwner(), id));
}
function result(data: Data, id: string) {
  const receipt = data.receipts[id];
  if (!receipt || !data.job) throw Error('Missing simulated receipt');
  return structuredClone({ receipt, progress: data.job });
}
function request(data: Data, id: string, input: unknown) {
  const body = JSON.stringify(input);
  if (data.requests[id] && data.requests[id] !== body) throw Error('Simulated request conflict');
  data.requests[id] = body;
}
async function source(uid: string, id: string): Promise<Source | null> {
  if (read(uid, id).job) return null;
  const root = await fixtureGet('adventure', id);
  if (fixtureOwner() !== uid) throw Error('Simulated account changed');
  if (!root && id !== fixtureDeletionAdventure) return null;
  return {
    schemaVersion: 1,
    ownerId: uid,
    adventureId: id,
    adventureToken: 'a'.repeat(64),
    sourceToken: 'b'.repeat(64),
    revision: root?.revision ?? 1,
    title: root?.title ?? title,
  };
}
export const adventureDeletionTransport: AdventureDeletionTransport = {
  getSource: ({ adventureId }) => source(fixtureOwner(), adventureId),
  get: ({ adventureId }) =>
    Promise.resolve({
      schemaVersion: 1,
      ownerId: fixtureOwner(),
      lookup: { adventureId },
      deletion: read(fixtureOwner(), adventureId).job,
    }),
  list: (input) => {
    const uid = fixtureOwner(),
      offset = input.cursor ? Number(atob(input.cursor)) : 0;
    if (!Number.isSafeInteger(offset) || offset < 0) throw Error('Simulated cursor conflict');
    const all = jobs(uid)
        .map((v) => v.data.job)
        .filter((p): p is Progress => !!p)
        .sort((a, b) => a.deletionId.localeCompare(b.deletionId)),
      limit = input.limit ?? 25;
    return Promise.resolve({
      schemaVersion: 1,
      ownerId: uid,
      items: all.slice(offset, offset + limit),
      nextCursor:
        offset + limit < all.length ? btoa(String(offset + limit)).replace(/=/g, '') : null,
    });
  },
  start: async (input) => {
    const uid = fixtureOwner(),
      id = input.adventureId,
      data = read(uid, id);
    data.calls.push({ method: 'start', operationId: input.operationId });
    request(data, input.operationId, input);
    if (data.fences.includes(input.operationId)) {
      write(uid, id, data);
      return { schemaVersion: 1, ownerId: uid, kind: 'canceled', request: input };
    }
    if (!data.receipts[input.operationId]) {
      const current = await source(uid, id);
      if (
        !current ||
        current.adventureToken !== input.adventureToken ||
        current.sourceToken !== input.sourceToken ||
        current.revision !== input.expectedRevision
      )
        throw Error('Simulated source changed');
      fixtureReserveAdventureDeletion(uid, id, input.operationId);
      data.job = {
        schemaVersion: 1,
        ownerId: uid,
        adventureId: id,
        adventureToken: input.adventureToken,
        deletionId: input.operationId,
        deletionToken: 'c'.repeat(64),
        title: current.title,
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
    write(uid, id, data);
    return result(data, input.operationId);
  },
  resolveStart: (input) => {
    const uid = fixtureOwner(),
      data = read(uid, input.adventureId),
      { intent, ...original } = input;
    void intent;
    request(data, input.operationId, original);
    if (data.receipts[input.operationId]) return Promise.resolve(result(data, input.operationId));
    data.fences.push(input.operationId);
    write(uid, input.adventureId, data);
    return Promise.resolve({ schemaVersion: 1, ownerId: uid, kind: 'canceled', request: original });
  },
  advance: async (input) => {
    const uid = fixtureOwner(),
      found = jobs(uid).find((v) => v.data.job?.deletionId === input.deletionId);
    if (!found) throw Error('Simulated job unavailable');
    let data = found.data;
    data.calls.push({
      method: 'advance',
      operationId: input.operationId,
      expectedCheckpoint: input.expectedCheckpoint,
    });
    request(data, input.operationId, input);
    write(uid, found.id, data);
    if (held)
      await new Promise<void>((resolve) => {
        release = () => {
          release = null;
          held = false;
          resolve();
        };
      });
    if (fixtureOwner() !== uid) throw Error('Simulated account changed');
    data = read(uid, found.id);
    if (!data.receipts[input.operationId]) {
      if (
        !data.job ||
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
      if (complete) fixtureFinishAdventureDeletion(uid, found.id, data.job.deletionId);
    }
    write(uid, found.id, data);
    return result(data, input.operationId);
  },
};
