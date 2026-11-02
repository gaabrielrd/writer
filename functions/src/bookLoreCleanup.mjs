import { born, bornEqual, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import {
  loreGenerationStorage,
  loreFieldPointer,
  loreBirthAtMost,
} from './bookLoreGenerationContracts.mjs';
import { lorePayloadPointer, lorePayloadSegmentId } from './bookRestoreLorePayloadContracts.mjs';
import { inventoryScope } from './bookLoreResourceInventoryContracts.mjs';
import { loadInventoryControl, prepareInventoryChange } from './bookLoreResourceInventoryStore.mjs';
import { editReservationPaths } from './bookLoreEditReservationContracts.mjs';
import { loadEditReservation } from './bookLoreEditReservationStore.mjs';
import {
  deletionConflict as conflict,
  deletionAtMost,
  deletionScopeCheck,
} from './bookLoreDeletionStore.mjs';
import { assertLoreCleanupOpening, loreCleanupQuery } from './bookLoreCleanupScope.mjs';
import { advanceDeletionJob } from './bookLoreDeletionJobs.mjs';
import { prepareDeletionPayload } from './bookLoreDeletionPayload.mjs';
async function heads(tx, l, next, limit) {
  if (l.c.loreId) {
    next.phase = 'generations';
    return [];
  }
  const page = await tx.get(
    l.c.db
      .collection('books/' + l.c.bookId + '/lore')
      .orderBy('__name__')
      .select('bookId', 'ownerId', 'universeId', 'adventureId', 'payloadStorage')
      .limit(limit),
  );
  for (const s of page.docs) {
    deletionScopeCheck(l, s);
    if (!deletionAtMost(born({ createTime: s.updateTime }), l.cutoff)) conflict();
    const v = s.data();
    if (
      (v.bookId !== undefined && v.bookId !== l.c.bookId) ||
      (v.ownerId !== undefined && v.ownerId !== l.c.uid) ||
      Object.hasOwn(v, 'universeId') ||
      Object.hasOwn(v, 'adventureId')
    )
      conflict();
    if (Object.hasOwn(v, 'payloadStorage')) loreGenerationStorage(v.payloadStorage);
  }
  if (page.docs.length < limit) next.phase = 'generations';
  return page.docs.map((s) => s.ref);
}
async function generations(tx, l, next) {
  let query = loreCleanupQuery(l, 'bookLoreGenerations').orderBy('__name__').select().limit(1);
  if (next.cursor) query = query.startAfter(next.cursor);
  const s = (await tx.get(query)).docs[0];
  if (!s) {
    next.phase = 'segments';
    next.cursor = null;
    return null;
  }
  deletionScopeCheck(l, s);
  const c = inventoryScope(l.c.db, l.c.uid, l.c.bookId),
    g = await loadInventoryControl(tx, c, 'generation', s.id);
  if (!g || !bornEqual(l.root, { createTime: g.context.bookBirth })) conflict();
  next.cursor = s.id;
  if (['retired', 'cancelled'].includes(g.state.phase)) return null;
  if (g.state.phase !== 'active') conflict();
  if (g.context.preparation) {
    const p = g.context.preparation,
      parent = await loadEditReservation(tx, editReservationPaths(l.c.db, l.c.uid, p.editId), {
        startHash: p.startHash,
        jobToken: p.editToken,
      });
    if (!parent || parent.job.phase !== 'adopted' || parent.job.generationId !== g.at.id)
      conflict();
  }
  return prepareInventoryChange(tx, g, 'retire', { phase: 'retired' });
}
async function segments(tx, l, next, limit) {
  const page = await tx.get(
    loreCleanupQuery(l, 'bookLoreSegments')
      .orderBy('__name__')
      .select(
        'schemaVersion',
        'ownerId',
        'bookId',
        'loreId',
        'generationId',
        'offset',
        'count',
        'payload',
      )
      .limit(limit),
  );
  for (const s of page.docs) {
    deletionScopeCheck(l, s);
    if (!bornEqual(s, { createTime: s.updateTime })) conflict();
    const v = s.data();
    closed(v, [
      'schemaVersion',
      'ownerId',
      'bookId',
      'loreId',
      'generationId',
      'offset',
      'count',
      'payload',
    ]);
    integer(v.offset);
    integer(v.count, 1);
    restoreHash(v.generationId);
    if (
      ![1, 2].includes(v.schemaVersion) ||
      v.ownerId !== l.c.uid ||
      v.bookId !== l.c.bookId ||
      v.offset % 64 !== 0 ||
      v.count > 64 ||
      s.id !== lorePayloadSegmentId(v.generationId, v.offset)
    )
      conflict();
    const pointer =
      v.schemaVersion === 1 ? lorePayloadPointer(v.payload) : loreFieldPointer(v.payload);
    if (!loreBirthAtMost(pointer.expectedBirth, born(s))) conflict();
  }
  if (page.docs.length < limit) next.phase = 'bodies';
  return page.docs.map((s) => s.ref);
}
export async function prepareLoreCleanupUnit(tx, l, next, limit) {
  assertLoreCleanupOpening(tx, l);
  let remove = [],
    plan = null;
  if (['edits', 'fields', 'inspections'].includes(next.phase))
    await advanceDeletionJob(tx, l, next);
  else if (next.phase === 'heads') remove = await heads(tx, l, next, limit);
  else if (next.phase === 'generations') plan = await generations(tx, l, next);
  else if (next.phase === 'segments') remove = await segments(tx, l, next, limit);
  else if (next.phase === 'bodies') {
    plan = await prepareDeletionPayload(tx, l, next, limit);
    remove = plan.remove;
  } else conflict();
  return {
    remove,
    commit() {
      plan?.commit();
    },
  };
}
