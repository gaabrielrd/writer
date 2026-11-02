import { expect } from 'vitest';
import { createBookLoreManualOperation as create } from '../services/bookLoreManualOperation.ts';
import { createBookLoreJournal, openBookLoreJournal } from '../services/bookLoreJournal.ts';
import { readJournalPreparation } from '../services/bookLoreJournalDb.ts';
import { preparationRequestHash } from '../services/bookLorePreparationContracts.ts';
import { createBookLoreReadClient } from '../services/bookLoreReadClient.ts';
import { createBookLoreReadService } from '../../../../functions/src/bookLoreRead.mjs';
import { createBookLoreEditTransportService } from '../../../../functions/src/bookLoreEditTransport.mjs';
import { createBookLoreWriteRecoveryService } from '../../../../functions/src/bookLoreWriteRecovery.mjs';
import { adventureImportDb } from '../../../../functions/test/helpers/adventureImportDb.mjs';
import { loreLogicalFixture } from '../../../../functions/test/helpers/bookLoreLogicalFixture.mjs';
export async function manualFixture(h, { big = false, signal } = {}) {
  const f = adventureImportDb({ nativeUpdates: true }),
    seed = await loreLogicalFixture(f.db, { mode: 'inline' }),
    read = createBookLoreReadService({ db: f.db }),
    client = createBookLoreReadClient(
      (m, v) => read[m](seed.uid, v),
      () => {},
    ),
    source = await client.capture(seed.bookId, seed.entityId),
    input = {
      uid: seed.uid,
      writeId: 'native-bootstrap',
      source,
      changes: [
        { field: 'summary', value: ' BOOT_PRIVATE_🌙\r\n ' + (big ? '🌙'.repeat(40000) : '') },
      ],
    },
    recovery = createBookLoreWriteRecoveryService({ db: f.db, now: () => 8000 }),
    edit = createBookLoreEditTransportService({ db: f.db, now: () => 8000 }),
    calls = [],
    keys = [];
  let current = true,
    keyAllowed = true,
    reserveIntercept = null,
    editIntercept = null,
    keyIntercept = null,
    journal;
  const guard = () => {
    if (!current) throw Error('actor changed');
  };
  const options = (identity) => ({
    guard,
    yieldControl: async () => {},
    async getKey() {
      keys.push(identity.writeId);
      if (!keyAllowed) throw Error('key denied');
      const invoke = () =>
        recovery.getBookLoreEditRecoveryKey(seed.uid, {
          writeId: identity.writeId,
          requestHash: identity.requestHash,
          jobToken: identity.jobToken,
        });
      const data = keyIntercept ? await keyIntercept(invoke) : await invoke();
      guard();
      const bytes = Uint8Array.from(Buffer.from(data.keyBase64, 'base64')),
        key = await crypto.subtle.importKey('raw', bytes, 'AES-GCM', false, ['encrypt', 'decrypt']);
      bytes.fill(0);
      return { identity, key };
    },
  });
  const environment = {
    uid: seed.uid,
    guard,
    recovery: {
      async call(method, value) {
        guard();
        const ticket = await readJournalPreparation(seed.uid, input.writeId);
        expect(ticket).not.toBeNull();
        expect(ticket.requestHash).toBe(preparationRequestHash(seed.uid, ticket.intent));
        if (method === 'reserveBookLoreEditRecovery') {
          expect(ticket.reserveState).toBe('pending');
          expect(value).toEqual(ticket.intent);
        } else {
          expect(ticket.cancelRequested).toBe(true);
          expect(ticket.jobsClosed).not.toBeNull();
          expect(ticket.revoke.wire).toEqual(value);
        }
        calls.push({ kind: 'recovery', method, input: structuredClone(value) });
        const invoke = () => recovery[method](seed.uid, value);
        return reserveIntercept ? reserveIntercept(method, value, invoke) : invoke();
      },
    },
    edit: {
      async call(method, value) {
        const ticket = await readJournalPreparation(seed.uid, input.writeId);
        expect(ticket.reserveState).toBe('confirmed');
        expect(ticket.identity).not.toBeNull();
        if (
          !method.startsWith('get') &&
          !method.startsWith('cancel') &&
          !method.endsWith('Cleanup')
        )
          expect(ticket.cancelRequested).toBe(false);
        calls.push({ kind: 'edit', method, input: structuredClone(value) });
        const invoke = () => edit.bookLoreEdit(seed.uid, { method, input: value });
        return editIntercept ? editIntercept(method, value, invoke) : invoke();
      },
    },
    createJournal: async (identity) => {
      journal = await createBookLoreJournal(identity, options(identity));
      return journal;
    },
    openJournal: async (identity) => {
      journal = await openBookLoreJournal(identity, options(identity));
      return journal;
    },
  };
  const make = (draft = input) =>
      create(input.writeId, environment, draft, { guard, signal, yieldControl: async () => {} }),
    resume = () =>
      create(input.writeId, environment, undefined, {
        guard,
        signal,
        yieldControl: async () => {},
      });
  return {
    ...f,
    ...seed,
    input,
    environment,
    calls,
    keys,
    client,
    source,
    recovery,
    make,
    resume,
    get j() {
      return journal;
    },
    current: (v) => {
      current = v;
    },
    keyAllowed: (v) => {
      keyAllowed = v;
    },
    reserveIntercept: (fn) => {
      reserveIntercept = fn;
    },
    editIntercept: (fn) => {
      editIntercept = fn;
    },
    keyIntercept: (fn) => {
      keyIntercept = fn;
    },
    ticket: () => readJournalPreparation(seed.uid, input.writeId),
    revokeOrigin: () =>
      f.db.runTransaction((tx) => tx.update(f.db.doc('books/book'), { authorId: 'other' })),
  };
}
