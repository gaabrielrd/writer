import {
  readCreationTicket,
  creationTicketScope,
  type CreationTicket,
} from './bookLoreCreationTicketContracts';
import {
  getCreationTicket,
  commitCreationTicket,
  purgeCreationFrames,
} from './bookLoreCreationTicketDb';
import { bookLoreWriteHash as hash } from './bookLoreWritePayload';
import { journalFail } from './bookLoreJournalContracts';

export type CreationTicketHandle = Awaited<ReturnType<typeof openCreationTicket>>;
export async function createCreationTicket(initial: CreationTicket, guard: () => void) {
  guard();
  const old = await getCreationTicket(initial.uid, initial.writeId);
  guard();
  if (old) {
    if (creationTicketScope(old) !== creationTicketScope(initial)) journalFail();
    return openCreationTicket(initial.uid, initial.writeId, guard);
  }
  const saved = await commitCreationTicket(initial, null);
  guard();
  return ticketHandle(saved, guard);
}
export async function openCreationTicket(uid: string, writeId: string, guard: () => void) {
  guard();
  const old = await getCreationTicket(uid, writeId);
  guard();
  if (!old) throw Error('A preparação não foi encontrada neste dispositivo.');
  const claimed = await commitCreationTicket({ ...old, stamp: crypto.randomUUID() }, old.stamp);
  guard();
  return ticketHandle(claimed, guard);
}
function ticketHandle(initial: CreationTicket, guard: () => void) {
  let head = initial,
    queue = Promise.resolve();
  async function inspect() {
    guard();
    const current = await getCreationTicket(head.uid, head.writeId);
    guard();
    if (
      !current ||
      current.stamp !== head.stamp ||
      creationTicketScope(current) !== creationTicketScope(head)
    )
      journalFail();
    return current;
  }
  function mutate(
    update: (head: CreationTicket) => CreationTicket,
    adds: Parameters<typeof commitCreationTicket>[2] = [],
  ) {
    const result = queue.then(async () => {
      guard();
      const next = readCreationTicket(
        { ...update(head), stamp: crypto.randomUUID() },
        head.uid,
        head.writeId,
      );
      let saved;
      try {
        saved = await commitCreationTicket(next, head.stamp, adds);
      } catch (error) {
        const observed = await getCreationTicket(head.uid, head.writeId);
        if (!observed || observed.stamp !== next.stamp || hash(observed) !== hash(next))
          throw error;
        saved = observed;
      }
      head = saved;
      guard();
      return saved;
    });
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  function purge(limit = 50) {
    const result = queue.then(async () => {
      guard();
      const saved = await purgeCreationFrames(head.uid, head.writeId, head.stamp, limit);
      head = saved;
      guard();
      return saved;
    });
    queue = result.then(
      () => {},
      () => {},
    );
    return result;
  }
  return Object.freeze({ inspect, mutate, purge });
}
