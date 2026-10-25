import { expect } from 'vitest';
import { createDurableBookLoreCreation } from '../services/bookLoreCreationDurableOperation.ts';
import { getCreationTicket } from '../services/bookLoreCreationTicketDb.ts';
import { creationJobsClosed } from '../services/bookLoreCreationTicketContracts.ts';
import { preparationFixture } from './bookLoreCreationPreparationHarness.mjs';
export async function durableCreationFixture(options = {}) {
  const f = await preparationFixture(options),
    calls = [];
  let editHook = null,
    recoveryHook = null;
  const environment = {
    ...f.environment,
    edit: {
      async call(method, input) {
        f.environment.guard();
        const t = await getCreationTicket('author', f.input.writeId);
        expect(t).not.toBeNull();
        if (method === 'adoptBookLoreEditGeneration') expect(t.ownApply.intent).toEqual(input);
        if (
          !method.startsWith('get') &&
          !method.startsWith('cancel') &&
          !method.endsWith('Cleanup') &&
          method !== 'startBookLoreCreationReservation'
        ) {
          expect(t.checkpoint.active.complete).toBe(true);
          expect(t.checkpoint.pending).toBeNull();
          expect(t.checkpoint.outcome).toBeNull();
          expect(t.cancelRequested).toBe(false);
        }
        calls.push({ kind: 'edit', method, input: structuredClone(input) });
        const invoke = () => f.nativeEdit.bookLoreEdit('author', { method, input });
        return editHook ? editHook(method, input, invoke) : invoke();
      },
    },
    recovery: {
      async call(method, input) {
        const t = await getCreationTicket('author', f.input.writeId);
        expect(t).not.toBeNull();
        if (method.startsWith('revoke')) {
          expect(creationJobsClosed(t)).toBe(true);
          expect(t.releaseRequested).toBe(true);
          expect(t.revoke.wire).toEqual(input);
        }
        calls.push({ kind: 'recovery', method, input: structuredClone(input) });
        const invoke = () => f.nativeRecovery[method]('author', input);
        return recoveryHook ? recoveryHook(method, input, invoke) : invoke();
      },
    },
  };
  return {
    ...f,
    calls,
    environment,
    make: (value = f.input, extra = {}) =>
      createDurableBookLoreCreation(f.input.writeId, environment, value, {
        signal: options.signal,
        yieldControl: async () => {},
        ...extra,
      }),
    resume: (extra = {}) =>
      createDurableBookLoreCreation(f.input.writeId, environment, undefined, {
        signal: options.signal,
        yieldControl: async () => {},
        ...extra,
      }),
    editHook: (fn) => {
      editHook = fn;
    },
    recoveryHook: (fn) => {
      recoveryHook = fn;
    },
  };
}
export async function durableCreationReady(op) {
  await op.initialize();
  for (let n = 0; n < 20000; n++) {
    const s = op.snapshot();
    if (s.phase === 'ready') return s;
    if (s.phase !== 'preparing') throw Error('Unexpected durable creation: ' + s.phase);
    await op.advance();
  }
  throw Error('Creation did not reach ready');
}
export async function durableCreationClose(op, kind = 'cancel', limit = 50) {
  for (let n = 0; n < 20000; n++) {
    let s;
    try {
      s = await op[kind](limit);
    } catch (error) {
      if (!['failed-precondition', 'functions/failed-precondition'].includes(String(error.code)))
        throw error;
      continue;
    }
    if (kind === 'cancel' ? s.jobsClosed : kind === 'release' ? s.keyReleased : s.copyDiscarded)
      return s;
    if (s.phase === 'conflict') return s;
  }
  throw Error('Creation did not close');
}
export const deferred = () => {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { resolve, promise };
};
