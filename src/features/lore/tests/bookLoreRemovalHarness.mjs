import { expect } from 'vitest';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { sourceInspectionFixture } from '../../../../functions/test/helpers/bookLoreSourceInspectionFixture.mjs';
import { createBookLoreRemovalTransportService } from '../../../../functions/src/bookLoreRemovalTransport.mjs';
import { bookLoreRemovalStore } from '../services/bookLoreRemovalJournalDb.ts';
import { openBookLoreRemovalOperation } from '../services/bookLoreRemovalOperation.ts';

export async function removalOperationFixture({
  mode = 'inline',
  writeId = 'remove-native-client',
} = {}) {
  const local = installLoreJournalHarness();
  const remote = adventureImportDb({ nativeUpdates: true });
  const source = await sourceInspectionFixture(remote.db, {
    mode,
    data: {
      name: 'PRIVATE_PROSE',
      category: 'other',
      details: '\ufeffPRIVATE_PROSE 🌙'.repeat(15000),
      isPublic: true,
      createdAt: 1000,
      updatedAt: 1001,
    },
  });
  const identity = {
    uid: source.uid,
    writeId,
    bookId: source.bookId,
    loreId: source.id,
    sourceToken: source.view.readToken,
  };
  let current = true,
    hook = null;
  const guard = () => {
    if (!current) throw Error('Actor/host changed');
  };
  const store = bookLoreRemovalStore(identity.uid, writeId, guard);
  const native = createBookLoreRemovalTransportService({ db: remote.db, now: () => 3000 });
  const calls = [];
  const port = {
    async call(method, input) {
      guard();
      if (!method.startsWith('get')) {
        const saved = await store.read();
        expect(saved.pending).toEqual({ method, input }); // Durable before every mutation.
      }
      calls.push({ method, input: structuredClone(input) });
      const invoke = () => native.bookLoreRemoval(identity.uid, { method, input });
      return hook ? hook(method, input, invoke) : invoke();
    },
  };
  return {
    ...remote,
    local,
    source,
    identity,
    store,
    native,
    calls,
    port,
    guard,
    setHook(value) {
      hook = value;
    },
    setCurrent(value) {
      current = value;
    },
    make: () => openBookLoreRemovalOperation(identity, port, store, guard),
    resume: () => openBookLoreRemovalOperation(identity, port, store, guard, true),
  };
}
export async function prepareRemoval(op) {
  for (let n = 0; n < 1000 && op.snapshot().phase !== 'ready'; n++) await op.advance();
  expect(op.snapshot().phase).toBe('ready');
}
export async function finishRemovalOperation(op) {
  for (let n = 0; n < 1000 && op.snapshot().phase !== 'complete'; n++) await op.advance();
  expect(op.snapshot().phase).toBe('complete');
}
export function gate() {
  let release, entered;
  const waiting = new Promise((r) => {
    release = r;
  });
  const started = new Promise((r) => {
    entered = r;
  });
  return { waiting, started, release, entered };
}
