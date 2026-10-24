import { born } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { readLoreAnalysisContext } from './loreAnalysisContext.mjs';
import {
  applicationConflict as conflict,
  reserveApplicationInput,
  applicationRequest,
  applicationPaths,
  applicationView,
  createApplicationMembers,
} from './loreAnalysisApplicationContracts.mjs';
import {
  loadApplication,
  prepareApplicationInitialization,
  prepareApplicationCancellation,
} from './loreAnalysisApplicationStore.mjs';
export function createLoreAnalysisApplicationService({ db, now = () => Date.now() }) {
  const get = (uid, input) => {
    const r = applicationRequest(uid, input),
      c = applicationPaths(db, uid, r.id);
    return db.runTransaction(async (tx) => {
      const l = await loadApplication(tx, c, r);
      return l ? applicationView(l) : null;
    });
  };
  return {
    getLoreAnalysisApplication: get,
    async reserveLoreAnalysisApplication(uid, input) {
      const r = reserveApplicationInput(uid, input),
        c = applicationPaths(db, uid, r.id);
      const previous = await db.runTransaction(async (tx) => {
        const existing = await loadApplication(tx, c, r);
        if (existing) return applicationView(existing);
        const analysis = await tx.get(db.doc('users/' + uid + '/loreAnalyses/' + r.id)),
          value = analysis.data();
        if (
          !value ||
          value.state !== 'ready' ||
          value.expiresAt <= now() ||
          value.textHash !== digest(JSON.stringify(r.source))
        )
          conflict();
        const current = await readLoreAnalysisContext(tx, db, uid, value.bookId, value.chapterId);
        if (
          value.revision !== current.revision ||
          (current.chapterHash !== value.chapterHash && current.chapterHash !== value.contentHash)
        )
          conflict();
        const context = {
            schemaVersion: 1,
            kind: 'reservation',
            ownerId: uid,
            id: r.id,
            requestHash: r.requestHash,
            bookId: value.bookId,
            bookBirth: born(current.bookSnapshot),
            provider: value.provider,
            universeId: current.book.universeId ?? null,
            universeBirth: current.worldSnapshot ? born(current.worldSnapshot) : null,
            chapterId: value.chapterId,
            chapterBirth: born(current.chapterSnapshot),
            analysisBirth: born(analysis),
            fingerprint: value.fingerprint,
            sourceRevision: value.revision,
            textHash: value.textHash,
            expiresAt: value.expiresAt,
            members: createApplicationMembers(uid, r, analysis, current),
          },
          plan = await prepareApplicationInitialization(tx, c, context);
        plan.commit();
        if (current.book.hasLoreResources !== true)
          tx.update(current.bookRef, { hasLoreResources: true });
        return null;
      });
      return previous ?? get(uid, { id: r.id, requestHash: r.requestHash });
    },
    async cancelLoreAnalysisApplication(uid, input) {
      const r = applicationRequest(uid, input, true),
        c = applicationPaths(db, uid, r.id);
      const result = await db.runTransaction(async (tx) => {
        const existing = await loadApplication(tx, c, r);
        if (existing) {
          const plan = await prepareApplicationCancellation(tx, existing, r.operationId);
          plan.commit();
          return plan.result;
        }
        if (r.jobToken !== undefined) conflict();
        const context = {
            schemaVersion: 1,
            kind: 'fence',
            ownerId: uid,
            id: c.id,
            requestHash: r.requestHash,
            bookId: null,
          },
          plan = await prepareApplicationInitialization(tx, c, context, 'cancelled');
        plan.commit();
        return null;
      });
      return result ?? get(uid, { id: r.id, requestHash: r.requestHash });
    },
  };
}
