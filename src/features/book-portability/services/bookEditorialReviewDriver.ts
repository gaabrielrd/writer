import type {
  EditorialReviewApi,
  EditorialReviewOutcome,
  EditorialReviewWire,
} from '../model/bookEditorialReview';
import type {
  EditorialReviewJournal,
  EditorialReviewPending,
  EditorialReviewScope,
} from './bookEditorialReviewJournal';
import { parseEditorialReviewPending } from './bookEditorialReviewJournal';
import {
  editorialReviewOutcome,
  editorialReviewResolution,
  editorialReviewWire,
  reviewCheck,
  reviewWireHash,
} from './bookEditorialReviewContracts';
interface Options {
  scope: EditorialReviewScope;
  journal: EditorialReviewJournal;
  api: EditorialReviewApi;
  guard: () => void;
  onChange?: (pending: EditorialReviewPending | null) => void;
  lock?: <T>(run: () => Promise<T>) => Promise<T>;
}
export interface EditorialReviewResult {
  outcome: EditorialReviewOutcome | null;
  cleared: boolean;
}
export function createEditorialReviewDriver({
  scope,
  journal,
  api,
  guard,
  lock,
  onChange,
}: Options) {
  const local = <T>(run: () => Promise<T>): Promise<T> => {
    guard();
    if (lock) return lock(run);
    reviewCheck(typeof navigator.locks?.request === 'function');
    return navigator.locks.request(
      'writer:editorial-review:' + JSON.stringify([scope.actorId, scope.bookId]),
      async () => {
        guard();
        return run();
      },
    );
  };
  async function read() {
    guard();
    const row = await parseEditorialReviewPending(await journal.read(), scope);
    guard();
    return row;
  }
  async function change(
    expected: EditorialReviewPending,
    patch: Partial<Pick<EditorialReviewPending, 'intent' | 'phase'>>,
  ) {
    const next: EditorialReviewPending = { ...expected, ...patch, revision: expected.revision + 1 };
    reviewCheck(Number.isSafeInteger(next.revision));
    reviewCheck(expected.intent !== 'withdraw' || next.intent === 'withdraw');
    reviewCheck(await journal.compare(expected, next));
    guard();
    onChange?.(structuredClone(next));
    return next;
  }
  async function uncertain(sent: EditorialReviewPending) {
    await local(async () => {
      const current = await read();
      if (current?.ticket === sent.ticket && current.revision === sent.revision)
        await change(current, { phase: 'uncertain' });
    });
  }
  async function terminal(
    sent: EditorialReviewPending,
    raw: EditorialReviewOutcome,
  ): Promise<EditorialReviewResult> {
    guard();
    const outcome = editorialReviewOutcome(raw, sent.wire);
    const cleared = await local(async () => {
      const current = await read();
      if (!current || current.ticket !== sent.ticket || current.revision !== sent.revision)
        return false;
      const removed = await journal.compare(current, null);
      guard();
      if (removed) onChange?.(null);
      return removed;
    });
    return { outcome, cleared };
  }
  async function send(
    intent: 'apply' | 'withdraw',
    initial?: EditorialReviewPending,
  ): Promise<EditorialReviewResult> {
    const sent = await local(async () => {
      const row = await read();
      reviewCheck(row);
      if (initial) reviewCheck(row.ticket === initial.ticket && row.revision === initial.revision);
      if (intent === 'apply')
        reviewCheck(row.intent === 'apply' && row.phase === (initial ? 'prepared' : 'unconfirmed'));
      return change(row, { intent, phase: intent === 'withdraw' ? 'withdrawing' : 'sent' });
    });
    try {
      guard();
      const reply = await (intent === 'apply' ? api.apply(sent.wire) : api.retire(sent.wire));
      guard();
      return await terminal(sent, reply);
    } catch (error) {
      try {
        await uncertain(sent);
      } catch {
        /* The original durable record remains discoverable. */
      }
      throw error;
    }
  }
  return {
    async pending() {
      return local(read);
    },
    async submit(input: EditorialReviewWire): Promise<EditorialReviewResult> {
      // Clone before the first await: UI edits cannot alter an authorized request.
      const wire = editorialReviewWire(input);
      guard();
      reviewCheck(wire.bookId === scope.bookId);
      const wireHash = await reviewWireHash(wire);
      guard();
      const prepared: EditorialReviewPending = {
        version: 1,
        ...scope,
        ticket: crypto.randomUUID(),
        revision: 0,
        intent: 'apply',
        phase: 'prepared',
        wire,
        wireHash,
      };
      await local(async () => {
        reviewCheck((await read()) === null);
        reviewCheck(await journal.compare(null, prepared));
        guard();
        onChange?.(structuredClone(prepared));
      });
      return send('apply', prepared);
    },
    async retry() {
      return send('apply');
    },
    async retire() {
      return send('withdraw');
    },
    async resolve(): Promise<EditorialReviewResult> {
      const checking = await local(async () => {
        const current = await read();
        reviewCheck(current);
        return change(current, { phase: 'checking' });
      });
      try {
        guard();
        const raw = await api.resolve(scope.bookId, checking.wire.operationId);
        guard();
        const response = editorialReviewResolution(raw, scope.bookId, checking.wire.operationId);
        if (response.state === 'unconfirmed') {
          await local(async () => {
            const current = await read();
            if (current?.ticket === checking.ticket && current.revision === checking.revision)
              await change(current, { phase: 'unconfirmed' });
          });
          return { outcome: null, cleared: false };
        }
        return await terminal(checking, {
          schemaVersion: 1,
          bookId: scope.bookId,
          kind: response.state,
          receipt: response.receipt,
        } as EditorialReviewOutcome);
      } catch (error) {
        try {
          await uncertain(checking);
        } catch {
          /* Preserve local debt. */
        }
        throw error;
      }
    },
  };
}
