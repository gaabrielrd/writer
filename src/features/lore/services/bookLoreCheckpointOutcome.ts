import { journalFail } from './bookLoreJournalContracts';
import { readCheckpointOutcome, checkpointOutcomeHash } from './bookLoreCheckpointOutcomeContracts';
import {
  readBookLoreCheckpointBundle,
  type BookLoreCheckpointBundle,
} from './bookLoreCheckpointBundle';
import type { LoreControlContext } from './bookLoreControlMap';
import {
  LoreCheckpointCollectionRequired,
  type checkpointJournal,
} from './bookLoreCheckpointJournal';
import type { BookLoreEditControlPage } from './bookLoreEditOperation';
export function checkpointOutcomeJournal(
  { inspect, mutate }: LoreControlContext,
  checkpoints: ReturnType<typeof checkpointJournal>,
  readControlMapPage: (offset: number) => Promise<BookLoreEditControlPage>,
) {
  async function recordCheckpointOutcome(value: unknown) {
    const h = await inspect(),
      o = readCheckpointOutcome(value, h.identity);
    if (!o) journalFail();
    const digest = checkpointOutcomeHash(o);
    if (h.checkpointOutcomeReceipt?.id === o.id) {
      if (h.checkpointOutcomeReceipt.hash !== digest) journalFail();
      return h;
    }
    if (h.checkpointOutcome) {
      if (checkpointOutcomeHash(h.checkpointOutcome) !== digest) journalFail();
      return h;
    }
    if (o.patch) {
      const known = await readControlMapPage(o.patch.offset);
      if (
        known.items.some(
          (item, n) =>
            item.id !== o.patch!.page.items[n]?.id ||
            item.startHash !== o.patch!.page.items[n]?.startHash,
        )
      )
        journalFail();
    }
    return mutate((h) => {
      const receipt = h.checkpointOutcomeReceipt;
      if (receipt?.id === o.id) {
        if (receipt.hash !== digest) journalFail();
        return h;
      }
      if (h.checkpointOutcome) {
        if (checkpointOutcomeHash(h.checkpointOutcome) !== digest) journalFail();
        return h;
      }
      if (
        !h.controls?.ready ||
        o.checkpoint.uploadCount !== h.controls.count ||
        o.baseGeneration !== (h.checkpoint?.active?.generation ?? null) ||
        (o.baseGeneration === null && (h.production || h.cleanup || h.diagnostic)) ||
        (o.checkpoint.edit &&
          (o.checkpoint.edit.id !== h.controls.edit?.id ||
            o.checkpoint.edit.startHash !== h.controls.edit?.startHash)) ||
        o.confirmed.some(
          (c) => h.production?.requestHash !== c.requestHash || h.production.state === 'sealing',
        )
      )
        journalFail();
      return { ...h, checkpointOutcome: o };
    });
  }
  async function recoverCheckpointOutcome(): Promise<BookLoreCheckpointBundle | null> {
    const h = await inspect(),
      o = h.checkpointOutcome;
    if (!o) return checkpoints.readCheckpoint();
    if (o.baseGeneration !== (h.checkpoint?.active?.generation ?? null)) journalFail();
    const before = o.baseGeneration ? await checkpoints.readCheckpoint(true) : null;
    const pages: BookLoreEditControlPage[] = before ? [...before.pages] : [];
    if (!before)
      for (let offset = 0; offset < o.checkpoint.uploadCount; offset += 50)
        pages.push(await readControlMapPage(offset));
    if (o.patch) pages[o.patch.offset / 50] = o.patch.page;
    const bundle = readBookLoreCheckpointBundle(
      { schemaVersion: 1, checkpoint: o.checkpoint, pages, confirmed: o.confirmed },
      h.identity,
    );
    try {
      await checkpoints.writeCheckpoint(bundle);
    } catch (error) {
      if (!(error instanceof LoreCheckpointCollectionRequired)) throw error;
      while ((await inspect()).checkpoint?.garbage) await checkpoints.advanceCheckpointCleanup();
      await checkpoints.writeCheckpoint(bundle);
    }
    return bundle;
  }
  return { recordCheckpointOutcome, recoverCheckpointOutcome };
}
