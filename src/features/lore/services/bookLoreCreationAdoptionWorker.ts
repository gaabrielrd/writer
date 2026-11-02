import { readObject } from './bookLoreReadContracts';
import { freezeLoreEditValue } from './bookLoreWritePlan';
import { bookLoreCreationIdentity } from './bookLoreCreationPlan';
import { creationProgress } from './bookLoreCreationProgress';
import { editProgress } from './bookLoreWriteProgress';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { journalFail } from './bookLoreJournalContracts';
import {
  readCreationApplyIntent,
  creationParentAdoptionMatches,
  creationAdoptionPair,
  type CreationAdoptionState,
} from './bookLoreCreationAdoptionContracts';
import type { CreationTicket } from './bookLoreCreationTicketContracts';
import type { BookLoreEditPort } from './bookLoreEditOperation';

interface Context {
  guard: () => void;
  inspect: () => Promise<CreationTicket>;
  mutate: (fn: (t: CreationTicket) => CreationTicket) => Promise<CreationTicket>;
  edit: BookLoreEditPort;
}
export function creationAdoptionWorker({ guard, inspect, mutate, edit }: Context) {
  let busy = false;
  async function stage(value: unknown) {
    guard();
    const w = readObject(freezeLoreEditValue(value), ['method', 'input']);
    if (w.method !== 'adoptBookLoreEditGeneration') journalFail();
    const t = await inspect();
    guard();
    const intent = readCreationApplyIntent(w.input, t);
    return mutate((h) => {
      guard();
      if (h.cancelRequested || h.releaseRequested || h.discard || h.jobsClosed) journalFail();
      if (h.ownApply) {
        if (hash(h.ownApply.intent) !== hash(intent)) journalFail();
        return h;
      }
      return {
        ...h,
        ownApply: { intent, phase: 'pending', request: 'parent', parent: null, edit: null },
      };
    });
  }
  async function confirmed(t: CreationTicket) {
    const s = t.ownApply!;
    guard();
    const parent = creationProgress(
      await edit.call('getBookLoreCreationReservation', {
        bookId: t.bookId,
        creationId: t.creationId,
        ...(t.parent?.jobToken ? { jobToken: t.parent.jobToken } : {}),
      }),
      { ...bookLoreCreationIdentity(t.uid, t.writeId, t.bookId), token: t.parent?.jobToken },
    );
    guard();
    await inspect();
    guard();
    const e = editProgress(
      await edit.call('getBookLoreEditReservation', {
        editId: s.intent.editId,
        startHash: s.intent.startHash,
      }),
      { id: s.intent.editId, startHash: s.intent.startHash, token: s.intent.jobToken },
      t.uploadCount! + 7,
    );
    guard();
    if (!creationAdoptionPair(parent, e, s.intent)) journalFail();
    await inspect();
    guard();
    return t;
  }
  async function reconcile() {
    guard();
    if (busy) throw Error('Uma confirmação da criação já está em andamento.');
    busy = true;
    try {
      const t = await inspect(),
        s = t.ownApply;
      if (!s) journalFail();
      if (s.phase === 'conflict') return t;
      if (s.phase === 'confirmed') return await confirmed(t);
      if (s.request === 'parent') {
        const p = creationProgress(
          await edit.call('getBookLoreCreationReservation', {
            bookId: t.bookId,
            creationId: t.creationId,
            ...(t.parent?.jobToken ? { jobToken: t.parent.jobToken } : {}),
          }),
          { ...bookLoreCreationIdentity(t.uid, t.writeId, t.bookId), token: t.parent?.jobToken },
        );
        guard();
        return mutate((h) => {
          guard();
          const own = h.ownApply;
          if (!own || hash(own.intent) !== hash(s.intent)) journalFail();
          if (own.phase !== 'pending') return h;
          const adopted = p.phase === 'adopted',
            match = creationParentAdoptionMatches(p, s.intent);
          const state: CreationAdoptionState = {
            ...own,
            parent: p,
            request: adopted ? (match ? 'edit' : null) : 'parent',
            phase: adopted && !match ? 'conflict' : 'pending',
          };
          return {
            ...h,
            parent: p,
            ownApply: state,
            cancelRequested:
              h.cancelRequested || p.phase === 'cancelled' || p.phase === 'cancelling',
            jobsClosed: h.jobsClosed || p.phase === 'cancelled',
          };
        });
      }
      let raw: unknown;
      try {
        raw = await edit.call('getBookLoreEditReservation', {
          editId: s.intent.editId,
          startHash: s.intent.startHash,
        });
      } catch (error) {
        guard();
        if (
          error &&
          typeof error === 'object' &&
          'code' in error &&
          ['failed-precondition', 'functions/failed-precondition'].includes(String(error.code))
        ) {
          await mutate((h) => ({
            ...h,
            ownApply: { ...h.ownApply!, phase: 'conflict', request: null },
          }));
        }
        throw error;
      }
      guard();
      const e = editProgress(
        raw,
        { id: s.intent.editId, startHash: s.intent.startHash, token: s.intent.jobToken },
        t.uploadCount! + 7,
      );
      if (!s.parent || !creationAdoptionPair(s.parent, e, s.intent)) journalFail();
      return mutate((h) => {
        guard();
        const own = h.ownApply;
        if (!own || hash(own.intent) !== hash(s.intent)) journalFail();
        if (own.phase !== 'pending') return h;
        if (hash(h.parent) !== hash(s.parent)) journalFail();
        return { ...h, ownApply: { ...own, phase: 'confirmed', request: null, edit: e } };
      });
    } finally {
      busy = false;
    }
  }
  return Object.freeze({ stage, reconcile });
}
