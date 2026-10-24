import {
  prepareBookLoreCreationOperation,
  type BookLoreCreationRecovery,
} from './bookLoreCreationOperation';
import type { BookLoreCreationInput } from './bookLoreCreationPlan';
import { createBookLoreManualOperation } from './bookLoreManualOperation';
import { bookLoreJournalSession } from './bookLoreJournalSession';
import { readJournalPreparation, listJournalPreparations } from './bookLoreJournalDb';
import { createPersistedBookLoreEditOperation } from './bookLorePersistedOperation';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { getFunctions, httpsCallable } from 'firebase/functions';
import { auth, getFirebaseApp } from '@/shared/lib';
import { BOOK_LORE_EDIT_CALLABLE } from '../../../../functions/src/bookLoreEditTransportMethods.mjs';
import {
  prepareBookLoreEditOperation,
  type BookLoreEditOperationInput,
} from './bookLoreEditOperation';
import type { BookLoreWriteOptions } from './bookLoreWritePayload';
import type { BookLoreEditRecovery } from './bookLoreEditCheckpoint';
import type { openBookLoreJournal } from './bookLoreJournal';

export const currentBookLoreActor = () => auth.currentUser;

/** Auth-bound ports; the host explicitly drives pure or persistent operations. */
export function bookLoreEditSession(isCurrent: () => boolean = () => true) {
  const actor = auth.currentUser;
  if (!actor?.uid) throw new Error('Entre na sua conta para editar o lore.');
  const uid = actor.uid;
  const guard = () => {
    if (auth.currentUser !== actor || auth.currentUser?.uid !== actor.uid || !isCurrent())
      throw new Error('O contexto mudou. Reabra a ficha.');
  };
  const port = {
    async call(method: string, input: unknown) {
      guard();
      const result = await httpsCallable<unknown, unknown>(
        getFunctions(getFirebaseApp(), 'us-central1'),
        BOOK_LORE_EDIT_CALLABLE,
        { timeout: 130000 },
      )({ method, input });
      guard();
      return result.data;
    },
  };
  async function prepare(
    input: Omit<BookLoreEditOperationInput, 'uid'>,
    options: BookLoreWriteOptions = {},
    recovery?: BookLoreEditRecovery,
  ) {
    const { guard: hostGuard, signal, yieldControl } = options;
    const check = () => {
      guard();
      hostGuard?.();
    };
    check();
    return prepareBookLoreEditOperation(
      { ...input, uid },
      port,
      {
        signal,
        yieldControl,
        guard: check,
      },
      recovery,
    );
  }
  function prepareCreation(
    input: Omit<BookLoreCreationInput, 'uid'>,
    options: BookLoreWriteOptions = {},
    recovery?: BookLoreCreationRecovery,
  ) {
    guard();
    const frozen = freezeLoreEditValue(input) as Omit<BookLoreCreationInput, 'uid'>;
    const hostGuard = options.guard;
    return prepareBookLoreCreationOperation(
      { ...frozen, uid },
      port,
      {
        ...options,
        guard: () => {
          guard();
          hostGuard?.();
        },
      },
      recovery,
    );
  }
  const restore = (
    input: Omit<BookLoreEditOperationInput, 'uid'>,
    recovery: BookLoreEditRecovery,
    options: BookLoreWriteOptions = {},
  ) => prepare(input, options, recovery);
  async function cleanup(
    journal: Pick<
      Awaited<ReturnType<typeof openBookLoreJournal>>,
      'inspect' | 'advanceControlCleanup'
    >,
  ) {
    guard();
    if ((await journal.inspect()).identity.uid !== uid)
      throw Error('Entre na conta que iniciou a edição.');
    guard();
    const result = await journal.advanceControlCleanup(port);
    guard();
    return result;
  }
  async function persistent(
    journal: Awaited<ReturnType<typeof openBookLoreJournal>>,
    input?: Omit<BookLoreEditOperationInput, 'uid'>,
    options: BookLoreWriteOptions = {},
  ) {
    guard();
    const hostGuard = options.guard;
    const frozen = input
      ? (freezeLoreEditValue(input) as Omit<BookLoreEditOperationInput, 'uid'>)
      : undefined;
    if ((await journal.inspect()).identity.uid !== uid)
      throw Error('Entre na conta que iniciou a edição.');
    guard();
    return createPersistedBookLoreEditOperation(
      journal,
      port,
      frozen ? { ...frozen, uid } : undefined,
      {
        ...options,
        guard: () => {
          guard();
          hostGuard?.();
        },
      },
    );
  }
  function manualEnvironment(hostGuard?: () => void) {
    const check = () => {
      guard();
      hostGuard?.();
    };
    return {
      uid,
      guard: check,
      edit: port,
      recovery: {
        async call(
          method: 'reserveBookLoreEditRecovery' | 'revokeBookLoreEditRecovery',
          input: unknown,
        ) {
          check();
          const response = await httpsCallable<unknown, unknown>(
            getFunctions(getFirebaseApp(), 'us-central1'),
            method,
            { timeout: 130000 },
          )(input);
          check();
          return response.data;
        },
      },
      createJournal: (identity: Parameters<typeof bookLoreJournalSession>[0]) =>
        bookLoreJournalSession(identity, () => {
          check();
          return true;
        }).create(),
      openJournal: (identity: Parameters<typeof bookLoreJournalSession>[0]) =>
        bookLoreJournalSession(identity, () => {
          check();
          return true;
        }).open(),
    };
  }
  function manual(
    input: Omit<BookLoreEditOperationInput, 'uid'>,
    options: BookLoreWriteOptions = {},
  ) {
    guard();
    const frozen = freezeLoreEditValue(input) as Omit<BookLoreEditOperationInput, 'uid'>;
    return createBookLoreManualOperation(
      frozen.writeId,
      manualEnvironment(options.guard),
      { ...frozen, uid },
      options,
    );
  }
  function resumeManual(writeId: string, options: BookLoreWriteOptions = {}) {
    guard();
    return createBookLoreManualOperation(
      writeId,
      manualEnvironment(options.guard),
      undefined,
      options,
    );
  }
  async function preparations(after?: string, limit = 50) {
    guard();
    const result = await listJournalPreparations(uid, after, limit);
    guard();
    return result;
  }
  async function preparation(writeId: string) {
    guard();
    const p = await readJournalPreparation(uid, writeId);
    guard();
    return p;
  }
  return Object.freeze({
    actor,
    guard,
    prepare,
    prepareCreation,
    restore,
    cleanup,
    persistent,
    manual,
    resumeManual,
    preparations,
    preparation,
  });
}
