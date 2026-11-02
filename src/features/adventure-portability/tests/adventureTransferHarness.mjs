import { isDeepStrictEqual } from 'node:util';
import { transferFixture } from '../../../../functions/test/helpers/adventureRestoreTransferFixture.mjs';
export function harness(bytes = Buffer.alloc(131079, 65)) {
  const f = transferFixture(bytes),
    service = f.api;
  f.service = service;
  f.calls = [];
  f.local = new Map();
  const mapping = {
    start: 'startAdventureRestore',
    resolveStart: 'resolveAdventureRestoreStart',
    get: 'getAdventureRestore',
    list: 'listAdventureRestores',
    append: 'appendAdventureRestoreChunk',
  };
  f.remote = Object.fromEntries(
    Object.entries(mapping).map(([name, method]) => [
      name,
      async (input) => {
        f.calls.push({ name, input: structuredClone(input) });
        return service[method](f.uid, input);
      },
    ]),
  );
  f.events = [];
  const key = (owner, id) => JSON.stringify([owner, id]);
  f.storage = {
    async read(owner, id, guard) {
      guard();
      return structuredClone(f.local.get(key(owner, id)) ?? null);
    },
    async compare(owner, id, old, next, guard) {
      guard();
      f.events.push(next ? 'persist' : 'clear');
      if (!isDeepStrictEqual(f.local.get(key(owner, id)) ?? null, old)) return false;
      if (next === null) f.local.delete(key(owner, id));
      else f.local.set(key(owner, id), structuredClone(next));
      return true;
    },
    async list(owner, guard, { cursor = null, limit = 25 } = {}) {
      guard();
      const rows = [...f.local]
        .filter(
          ([k, v]) =>
            JSON.parse(k)[0] === owner && (cursor === null || v.intent.operationId > cursor),
        )
        .map(([, v]) => structuredClone(v))
        .sort((a, b) => a.intent.operationId.localeCompare(b.intent.operationId));
      return {
        items: rows.slice(0, limit),
        nextCursor: rows.length > limit ? rows[limit - 1].intent.operationId : null,
      };
    },
  };
  return f;
}
export async function uploadHarness(bytes) {
  const f = harness(bytes),
    started = await f.remote.start(f.input),
    p = started.progress;
  f.identity = {
    ownerId: f.uid,
    restoreId: p.restoreId,
    adventureId: p.adventureId,
    jobToken: p.jobToken,
    reviewHash: p.reviewHash,
  };
  f.descriptor = f.input.source;
  f.file = new Blob([f.bytes]);
  return f;
}
