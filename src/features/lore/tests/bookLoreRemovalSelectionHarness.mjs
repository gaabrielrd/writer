import { expect } from 'vitest';
import { installLoreJournalHarness } from './bookLoreJournalHarness.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { sourceInspectionFixture } from '../../../../functions/test/helpers/bookLoreSourceInspectionFixture.mjs';
import { createBookLoreRemovalTransportService } from '../../../../functions/src/bookLoreRemovalTransport.mjs';
import { openBookLoreRemovalOperation } from '../services/bookLoreRemovalOperation.ts';
import {
  readRemovalJournal,
  removalJournalTransition,
  LoreRemovalJournalConflict,
} from '../services/bookLoreRemovalJournalContracts.ts';
import { createRemovalSelection } from '../services/bookLoreRemovalSelectionContracts.ts';
import { bookLoreRemovalSelectionStore } from '../services/bookLoreRemovalSelectionDb.ts';
import { openBookLoreRemovalSelection } from '../services/bookLoreRemovalSelectionOperation.ts';

export async function removalSelectionFixture({
  count = 3,
  modes = ['inline'],
  selectionId = 'selected-original',
} = {}) {
  const local = installLoreJournalHarness(),
    remote = adventureImportDb({ nativeUpdates: true }),
    sources = [],
    children = new Map(),
    calls = [];
  for (let i = 0; i < count; i++)
    sources.push(
      await sourceInspectionFixture(remote.db, {
        id: 'selected-' + String(i).padStart(3, '0'),
        mode: modes[i % modes.length],
        tokenVersion: 2,
        inspectionId: 'unused-source-' + i,
        data: {
          name: 'PRIVATE_PROSE ' + i,
          category: 'other',
          details: '\ufeffprivate 🌙',
          isPublic: i === 0,
          createdAt: 1000,
          updatedAt: 1001,
        },
      }),
    );
  const input = {
      uid: 'author',
      bookId: 'book',
      selectionId,
      members: sources.map((s) => ({ loreId: s.id, sourceToken: s.view.readToken })),
    },
    pack = createRemovalSelection(input);
  let current = true,
    hook = null;
  const guard = () => {
      if (!current) throw Error('Actor/host changed');
    },
    store = bookLoreRemovalSelectionStore(pack.root.manifest.identity, guard),
    native = createBookLoreRemovalTransportService({ db: remote.db, now: () => 3000 });
  function childStore(identity) {
    return {
      async read() {
        return children.has(identity.writeId)
          ? structuredClone(children.get(identity.writeId))
          : null;
      },
      async commit(next, expected) {
        const old = children.get(identity.writeId),
          checked = readRemovalJournal(next, identity.uid, identity.writeId);
        if (old?.stamp === checked.stamp) return structuredClone(old);
        if ((old?.stamp ?? null) !== expected) throw new LoreRemovalJournalConflict();
        if (old) removalJournalTransition(old, checked);
        children.set(identity.writeId, structuredClone(checked));
        return structuredClone(checked);
      },
    };
  }
  const port = {
    async call(method, input) {
      guard();
      const root = await store.read();
      expect(root).not.toBeNull(); // Full parent is durable before every child RPC.
      calls.push({ method, input: structuredClone(input) });
      if (!method.startsWith('get')) {
        const saved = [...children.values()].find(
          (j) =>
            j.pending?.method === method &&
            JSON.stringify(j.pending.input) === JSON.stringify(input),
        );
        expect(saved).toBeDefined(); // Child wire is durable before every mutation.
      }
      const invoke = () => native.bookLoreRemoval('author', { method, input });
      return hook ? hook(method, input, invoke) : invoke();
    },
  };
  const environment = {
    guard,
    ...port,
    openMember: (identity) =>
      openBookLoreRemovalOperation(identity, port, childStore(identity), guard),
  };
  const resume = () =>
    openBookLoreRemovalSelection(pack.root.manifest.identity, store, environment);
  return {
    ...remote,
    local,
    sources,
    input,
    pack,
    store,
    calls,
    children,
    guard,
    environment,
    resume,
    make: async () => {
      await store.init(pack);
      return resume();
    },
    setHook(value) {
      hook = value;
    },
    setCurrent(value) {
      current = value;
    },
  };
}
export async function finishSelection(op, method = 'apply') {
  for (let n = 0; n < 10000; n++) {
    if (['complete', 'partial', 'cancelled'].includes(op.snapshot().phase)) return op.snapshot();
    await op[method]();
    if (op.snapshot().phase === 'uncertain') throw Error('Unexpected uncertain selection');
  }
  throw Error('Selection did not finish');
}
