import { expect } from 'vitest';
import { prepareCreationRecovery } from '../services/bookLoreCreationPreparation.ts';
import { getCreationTicket } from '../services/bookLoreCreationTicketDb.ts';
import { creationRecoveryIntent } from '../services/bookLoreCreationTicketContracts.ts';
import { createBookLoreEditTransportService } from '../../../../functions/src/bookLoreEditTransport.mjs';
import { createBookLoreWriteRecoveryService } from '../../../../functions/src/bookLoreWriteRecovery.mjs';
import { seedCreationBook } from '../../../../functions/test/helpers/bookLoreCreationFixture.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { creationData } from './bookLoreCreationHarness.mjs';
export async function preparationFixture({
  data = creationData(),
  writeId = 'creation-copy',
  signal,
} = {}) {
  const f = adventureImportDb({ nativeUpdates: true });
  await seedCreationBook(f.db, 'book', 'author', { localLoreVersion: 0 });
  const input = { uid: 'author', bookId: 'book', writeId, data },
    nativeEdit = createBookLoreEditTransportService({ db: f.db, now: () => 8000 }),
    nativeRecovery = createBookLoreWriteRecoveryService({ db: f.db, now: () => 8000 }),
    calls = [],
    keys = [];
  let current = true,
    allowed = true,
    editHook = null,
    recoveryHook = null,
    keyHook = null;
  const guard = () => {
    if (!current) throw Error('actor changed');
  };
  const ticket = () => getCreationTicket('author', writeId);
  const environment = {
    uid: 'author',
    guard,
    edit: {
      async call(method, value) {
        guard();
        const t = await ticket();
        expect(t).not.toBeNull();
        if (method === 'startBookLoreCreationReservation') {
          expect(t.startState).toBe('pending');
          expect(value).toEqual({ bookId: t.bookId, creationId: t.creationId });
        } else {
          expect(t.cancelRequested).toBe(true);
          expect(t.closing.state).toBe('pending');
          expect(t.closing.wire).toEqual({ method, input: value });
        }
        calls.push({ kind: 'edit', method, input: structuredClone(value) });
        const invoke = () => nativeEdit.bookLoreEdit('author', { method, input: value });
        return editHook ? editHook(method, value, invoke) : invoke();
      },
    },
    recovery: {
      async call(method, value) {
        guard();
        const t = await ticket();
        if (method === 'reserveBookLoreEditRecovery') {
          expect(t.keyState).toBe('pending');
          expect(value).toEqual(creationRecoveryIntent(t));
        } else {
          expect(t.releaseRequested).toBe(true);
          expect(t.jobsClosed).toBe(true);
          expect(t.revoke.state).toBe('pending');
          expect(t.revoke.wire).toEqual(value);
        }
        calls.push({ kind: 'recovery', method, input: structuredClone(value) });
        const invoke = () => nativeRecovery[method]('author', value);
        return recoveryHook ? recoveryHook(method, value, invoke) : invoke();
      },
    },
    async getKey(identity) {
      guard();
      keys.push(structuredClone(identity));
      if (!allowed) throw Error('key denied');
      const invoke = () =>
        nativeRecovery.getBookLoreEditRecoveryKey('author', {
          writeId,
          requestHash: identity.requestHash,
          jobToken: identity.jobToken,
        });
      const raw = keyHook ? await keyHook(invoke) : await invoke();
      guard();
      const bytes = Uint8Array.from(Buffer.from(raw.keyBase64, 'base64'));
      try {
        const key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, [
          'encrypt',
          'decrypt',
        ]);
        return { identity, key };
      } finally {
        bytes.fill(0);
      }
    },
  };
  const make = (value = input, extra = {}) =>
    prepareCreationRecovery(writeId, environment, value, {
      signal,
      yieldControl: async () => {},
      ...extra,
    });
  return {
    ...f,
    input,
    environment,
    calls,
    keys,
    ticket,
    nativeRecovery,
    nativeEdit,
    make,
    resume: () =>
      prepareCreationRecovery(writeId, environment, undefined, {
        signal,
        yieldControl: async () => {},
      }),
    current: (v) => {
      current = v;
    },
    allowed: (v) => {
      allowed = v;
    },
    editHook: (v) => {
      editHook = v;
    },
    recoveryHook: (v) => {
      recoveryHook = v;
    },
    keyHook: (v) => {
      keyHook = v;
    },
    revokeOrigin: () =>
      f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' })),
  };
}
export async function finishPreparationClose(op, kind = 'discard', limit = 50) {
  for (let n = 0; n < 1000; n++) {
    const s =
      kind === 'cancel'
        ? await op.cancel()
        : kind === 'release'
          ? await op.release()
          : await op.discard(limit);
    if (
      kind === 'cancel'
        ? s.phase === 'cancelled'
        : kind === 'release'
          ? s.keyReleased
          : s.copyDiscarded
    )
      return s;
  }
  throw Error('Closing did not finish');
}
