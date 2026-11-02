import { auth } from '@/shared/lib';
import type { LoreJournalIdentity } from './bookLoreJournalContracts';
import { createBookLoreJournal, openBookLoreJournal } from './bookLoreJournal';
import { listJournalHeads } from './bookLoreJournalDb';
import { bookLoreRecoveryKeySession } from './bookLoreRecoveryKeyClient';
export function bookLoreJournalSession(
  identity: LoreJournalIdentity,
  isCurrent: () => boolean = () => true,
) {
  const grant = bookLoreRecoveryKeySession(identity, isCurrent);
  const options = { guard: grant.guard, getKey: grant.getKey };
  return Object.freeze({
    guard: grant.guard,
    create: () => createBookLoreJournal(grant.identity, options),
    open: () => openBookLoreJournal(grant.identity, options),
  });
}

export async function listBookLoreJournals(
  after?: string,
  limit = 50,
  isCurrent: () => boolean = () => true,
) {
  const actor = auth.currentUser;
  if (!actor?.uid) throw Error('Entre na conta que iniciou a edição.');
  const guard = () => {
    if (auth.currentUser !== actor || !isCurrent())
      throw Error('O contexto mudou. Reabra a recuperação.');
  };
  guard();
  const result = await listJournalHeads(actor.uid, after, limit);
  guard();
  return result;
}
