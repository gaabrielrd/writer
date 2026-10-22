import {
  authorize,
  mutationInput,
  requestHash,
  restoreFail as fail,
  inconsistent,
  sum,
  date,
} from './bookRestoreUploadContracts.mjs';
import { prepareRestoredChapterText } from './bookChapterText.mjs';
import { createVerifiedBookRestoreContent } from './bookRestoreContentRead.mjs';
import {
  prepareBookRestoreArtifacts,
  assertBookRestoreArtifactsEmpty,
  assertBookRestoreBodyNamespaceEmpty,
} from './bookRestoreArtifacts.mjs';
import { createWorkProgressLedger } from './workProgressLedger.mjs';
import { initialWorkControl } from './workProgressContracts.mjs';
import { countVisibleWords } from './visibleWordCount.mjs';

const action = 'advanceBookRestoreStructure';
function nativeChapter(uid, bookId, id, value, timestamp) {
  const mode = value.contentMode ?? 'legacy',
    content = value.content ?? '';
  return {
    schemaVersion: 1,
    revision: 1,
    id,
    bookId,
    ownerId: uid,
    title: value.title,
    order: value.order,
    actId: value.actId ?? null,
    content,
    contentMode: mode,
    assemblyRevision: 0,
    structureRevision: 0,
    rankSlot: value.rankSlot ?? 'A',
    sceneCount: 0,
    wordCount: mode === 'legacy' ? countVisibleWords(content) : 0,
    ...(Object.hasOwn(value, 'personaComplement')
      ? { personaComplement: value.personaComplement }
      : {}),
    createdAt: timestamp,
    updatedAt: timestamp,
  };
}
export function createBookRestoreStructureService({
  db,
  now,
  load,
  readOp,
  writeOp,
  confirmed,
  next,
  pickProgress,
}) {
  const ledger = createWorkProgressLedger({ db });
  function available(loaded, request) {
    if (loaded.job.state !== 'content-verified') fail('failed-precondition', 'state-conflict');
    if (loaded.job.checkpoint !== request.expectedCheckpoint)
      fail('failed-precondition', 'checkpoint-conflict');
    if (loaded.job.preparation && loaded.job.preparation.phase !== 'structure')
      fail('failed-precondition', 'structure-complete');
  }
  const opRef = (uid, operationId) =>
    db.doc('users/' + uid + '/bookRestoreOperations/' + operationId);
  return {
    async advanceBookRestoreStructure(uid, input) {
      authorize(uid);
      const request = mutationInput(input),
        fingerprint = requestHash(action, request);
      const initial = await db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(opRef(uid, request.operationId));
        if (op.exists)
          return {
            resolved: confirmed(loaded, readOp(op, uid, request.restoreId, fingerprint, loaded)),
          };
        available(loaded, request);
        return { loaded };
      });
      if (initial.resolved) return initial.resolved;
      const original = initial.loaded,
        first = original.job.cleanupVersion < 4,
        cursor = first
          ? {
              schemaVersion: 1,
              phase: 'structure',
              itemIndex: 0,
              artifactCount: 0,
              cleanedArtifacts: 0,
              actCount: 0,
              chapterCount: 0,
              wordCount: 0,
              timestamp: date(now, original.job.updatedAt),
            }
          : structuredClone(original.job.preparation);
      let item;
      try {
        const reader = await createVerifiedBookRestoreContent({
          db,
          uid,
          id: request.restoreId,
          token: request.jobToken,
          load,
        });
        item = await reader.readMappedItem(cursor.itemIndex);
      } catch (error) {
        const resolved = await db.runTransaction(async (tx) => {
          const current = await load(tx, uid, request.restoreId, request.jobToken),
            op = await tx.get(opRef(uid, request.operationId));
          return op.exists
            ? confirmed(current, readOp(op, uid, request.restoreId, fingerprint, current))
            : null;
        });
        if (resolved) return resolved;
        throw error;
      }
      return db.runTransaction(async (tx) => {
        const loaded = await load(tx, uid, request.restoreId, request.jobToken),
          op = await tx.get(opRef(uid, request.operationId));
        if (op.exists)
          return confirmed(loaded, readOp(op, uid, request.restoreId, fingerprint, loaded));
        available(loaded, request);
        await item.verify(tx);
        if (first) await assertBookRestoreArtifactsEmpty(tx, db, loaded);
        let version = loaded.job.cleanupVersion >= 4 ? loaded.job.cleanupVersion : 4;
        const preparation = structuredClone(cursor),
          writes = [],
          kind = item.record.kind,
          target = { kind: 'book', id: loaded.job.bookId };
        if (preparation.itemIndex === 0) {
          if (kind !== 'book-metadata') inconsistent();
          const root = { editorialState: item.value.progress.editorialState ?? 'draft' },
            control = {
              ...initialWorkControl(target, root),
              wordGoal: item.value.progress.wordGoal ?? null,
            };
          writes.push({ kind: 'work-control', id: 'current', value: control });
        } else if (kind === 'act') {
          writes.push({
            kind: 'act',
            id: item.record.id,
            value: {
              id: item.record.id,
              name: item.value.name,
              order: item.value.order,
              createdAt: preparation.timestamp,
              updatedAt: preparation.timestamp,
            },
          });
          preparation.actCount = sum(preparation.actCount, 1);
        } else if (kind === 'chapter') {
          const chapter = nativeChapter(
            uid,
            target.id,
            item.record.id,
            item.value,
            preparation.timestamp,
          );
          const content = chapter.content,
            body = prepareRestoredChapterText({
              uid,
              bookId: target.id,
              chapterId: chapter.id,
              operationId: request.operationId,
              timestamp: preparation.timestamp,
              content,
            });
          if (body) {
            version = 5;
            if (loaded.job.cleanupVersion < 5)
              await assertBookRestoreBodyNamespaceEmpty(tx, db, loaded);
            Object.assign(chapter, body.patch);
            writes.push(...body.writes);
          }
          writes.push({ kind: 'chapter', id: chapter.id, value: chapter });
          const buffered = [],
            prefix = 'books/' + target.id + '/',
            proxy = {
              get: tx.get.bind(tx),
              getAll: typeof tx.getAll === 'function' ? tx.getAll.bind(tx) : undefined,
              set(ref, value) {
                buffered.push({ ref, value });
              },
              update() {
                inconsistent();
              }, // The invisible root is never written by the ledger.
            },
            change = await ledger.prepareChanges(proxy, {
              target,
              root: { authorId: uid, hasProgressResources: true },
              changes: [
                {
                  kind: 'chapter',
                  id: chapter.id,
                  content,
                  contentMode: chapter.contentMode,
                },
              ],
              groupStates: [chapter],
            });
          if (change.control.countReady !== false) inconsistent();
          change.commit();
          const families = {
            workProgress: 'work-control',
            workWordGroups: 'word-group',
            workWordSources: 'word-source',
          };
          for (const value of buffered) {
            if (!value.ref.path.startsWith(prefix)) inconsistent();
            const [collection, id, extra] = value.ref.path.slice(prefix.length).split('/');
            if (!families[collection] || extra !== undefined) inconsistent();
            writes.push({
              kind: families[collection],
              id,
              value: value.value,
              replace: collection === 'workProgress',
            });
          }
          preparation.wordCount = change.wordCount;
          preparation.chapterCount = sum(preparation.chapterCount, 1);
        } else {
          // Keep this item for the resource writer; no section is skipped or declared restored.
          preparation.phase = 'resources';
        }
        if (preparation.phase === 'structure')
          preparation.itemIndex = sum(preparation.itemIndex, 1);
        const effects = await prepareBookRestoreArtifacts(
          tx,
          db,
          loaded,
          request.operationId,
          writes,
          version,
        );
        preparation.artifactCount = sum(preparation.artifactCount, effects.created);
        const record = next(loaded.job, request, {
          cleanupVersion: version,
          validationCheckpoint: loaded.job.validationCheckpoint ?? loaded.job.checkpoint,
          preparation,
        });
        effects.commit();
        tx.update(loaded.ref, record);
        const receipt = writeOp(
          tx,
          uid,
          request.restoreId,
          action,
          request,
          record,
          loaded.view.jobToken,
        );
        return confirmed({ ...loaded, view: { ...loaded.view, ...pickProgress(record) } }, receipt);
      });
    },
  };
}
