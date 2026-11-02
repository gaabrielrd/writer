import { prepareBookLoreCreationOperation } from '../services/bookLoreCreationOperation.ts';
import {
  captureCreationCheckpoint,
  makeCreationCheckpointOutcome,
  creationCheckpointRecovery,
} from '../services/bookLoreCreationCheckpointBundle.ts';
import { preparationFixture } from './bookLoreCreationPreparationHarness.mjs';
export async function checkpointFixture(options = {}) {
  const f = await preparationFixture(options),
    bootstrap = f.make();
  await bootstrap.initialize();
  let journal = await bootstrap.checkpointJournal(),
    op,
    hook = null,
    before = null,
    beforeGeneration = null;
  const calls = [];
  const port = {
    async call(method, input) {
      await collectAll(journal);
      before = captureCreationCheckpoint(op);
      await journal.write(before);
      beforeGeneration = (await journal.inspect()).checkpoint.active.generation;
      calls.push({ method, input: structuredClone(input) });
      const invoke = () => f.nativeEdit.bookLoreEdit('author', { method, input });
      return hook ? hook(method, input, invoke) : invoke();
    },
  };
  const restore = async (bundle) => {
    op = await prepareBookLoreCreationOperation(
      f.input,
      port,
      { yieldControl: async () => {} },
      bundle ? creationCheckpointRecovery(bundle) : undefined,
    );
    return op;
  };
  await restore();
  return {
    ...f,
    bootstrap,
    calls,
    port,
    get op() {
      return op;
    },
    get journal() {
      return journal;
    },
    get before() {
      return before;
    },
    get beforeGeneration() {
      return beforeGeneration;
    },
    hook: (fn) => {
      hook = fn;
    },
    restore,
    async reopen() {
      const b = f.resume();
      await b.initialize();
      journal = await b.checkpointJournal();
      const bundle = await journal.recover();
      if (bundle) await restore(bundle);
      return journal;
    },
    async step(apply = false, { persist = true } = {}) {
      if (apply) await op.apply();
      else await op.advance();
      const after = captureCreationCheckpoint(op);
      if (
        !persist ||
        !before ||
        after.checkpoint.completedCalls === before.checkpoint.completedCalls
      )
        return after;
      const outcome = makeCreationCheckpointOutcome(before, after, beforeGeneration);
      await journal.recordOutcome(outcome);
      await collectAll(journal);
      await journal.write(after);
      return after;
    },
  };
}
export async function collectAll(journal) {
  for (let n = 0; n < 1000; n++) {
    if (!(await journal.inspect()).checkpoint?.garbage) return;
    await journal.collect(50);
  }
  throw Error('checkpoint collection did not finish');
}
