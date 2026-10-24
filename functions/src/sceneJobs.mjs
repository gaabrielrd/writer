import { prepareBookLoreDeletion } from './bookLoreDeletion.mjs';
import { assertBookLorePayloadsEmpty } from './bookLoreDeletionStore.mjs';
import {
  sceneFail,
  conflict,
  sceneId,
  parentId,
  sceneLimit,
  sceneDate,
  digest,
} from './sceneContracts.mjs';
import { sceneRankBetween, rebalancedSceneRank } from './sceneRanks.mjs';
import { BOOK_CHAPTER_BODY_FIELDS, prepareBookChapterBodyCleanup } from './bookChapterCleanup.mjs';
import { createBookChapterBodyPlan } from './bookChapterStorage.mjs';

const BOOK_DELETE_FLAT_PHASES = [
  'chapters',
  'lore',
  'acts',
  'sceneControls',
  'sceneSources',
  'sceneJobs',
  'timelineEvents',
  'narrativeLinks',
  'sceneLoreLinks',
  'narrativeControls',
  'narrativeJobs',
  'workProgress',
  'workWordSources',
  'workWordGroups',
  'workChecklist',
  'workVersionBodies',
  'workVersions',
];
const BOOK_DELETE_PHASES = [
  'lore-resources',
  'scenes',
  'revisions',
  'arcs',
  ...BOOK_DELETE_FLAT_PHASES,
  'text-bodies',
  'finish',
];

const progress = (record) => ({
  complete: record.complete ?? false,
  processed: record.processed ?? 0,
});
export function addSceneJobs(api, helpers) {
  const {
    db,
    now,
    workLedger,
    scope,
    project,
    group,
    writeGroup,
    writeProject,
    operation,
    receipt,
    writeReceipt,
  } = helpers;
  api.rebalanceSceneRanks = async (uid, data) => {
    const context = scope(uid, data, ['parentId', 'operationId', 'limit']),
      id = parentId(data.parentId),
      limit = sceneLimit(data.limit ?? 50);
    const op = operation(context, data, 'rebalanceSceneRanks', { parentId: id });
    return db.runTransaction(async (tx) => {
      const p = await project(context, tx),
        previous = await receipt(tx, op),
        entry = await group(context, id, tx, { composed: true });
      if (previous?.complete) return progress(previous);
      if (entry.value.rebalancing && entry.snapshot.data().rebalanceOperation !== op.id)
        sceneFail('failed-precondition', 'Outra reorganização está em andamento.');
      const active = previous?.active ?? entry.value.rankSlot,
        inactive = active === 'A' ? 'B' : 'A';
      if (entry.value.rankSlot !== active) conflict();
      let query = db
        .collection(`${context.path}/scenes`)
        .where('parentId', '==', id)
        .orderBy(`rank${active}`)
        .orderBy('__name__')
        .limit(limit);
      if (previous?.cursor) query = query.startAfter(previous.cursor.rank, previous.cursor.id);
      const page = await tx.get(query),
        timestamp = sceneDate(now, p.updatedAt ?? 0),
        processed = (previous?.processed ?? 0) + page.docs.length,
        complete = page.docs.length < limit;
      const record = {
        kind: 'rebalance',
        input: { target: context.target, parentId: id, operationId: op.id },
        active,
        processed,
        complete,
        cursor: page.docs.length
          ? { rank: page.docs.at(-1).data()[`rank${active}`], id: page.docs.at(-1).id }
          : (previous?.cursor ?? null),
      };
      page.docs.forEach((item, index) =>
        tx.update(item.ref, {
          [`rank${inactive}`]: rebalancedSceneRank((previous?.processed ?? 0) + index),
        }),
      );
      const value = {
        ...entry.value,
        rankSlot: complete ? inactive : active,
        structureRevision: entry.value.structureRevision + (complete ? 1 : 0),
        assemblyRevision: entry.value.assemblyRevision + (complete ? 1 : 0),
        updatedAt: timestamp,
      };
      writeGroup(tx, entry, value);
      tx.update(entry.ref, { rebalancing: !complete, rebalanceOperation: complete ? null : op.id });
      writeProject(tx, context, p, timestamp);
      writeReceipt(tx, op, record);
      return progress(record);
    });
  };

  api.deleteSceneGroups = async (uid, data) => {
    const context = scope(uid, data, ['operationId', 'groups', 'limit']),
      limit = sceneLimit(data.limit ?? 50);
    if (
      !Array.isArray(data.groups) ||
      !data.groups.length ||
      data.groups.length > 200 ||
      new Set(data.groups.map((item) => item?.id)).size !== data.groups.length
    )
      sceneFail('invalid-argument', 'Selecione entre 1 e 200 agrupadores distintos.');
    const groups = data.groups.map((item) => {
      if (
        !item ||
        Object.keys(item).some((key) => !['id', 'expectedUpdatedAt'].includes(key)) ||
        typeof item.expectedUpdatedAt !== 'number' ||
        !Number.isFinite(item.expectedUpdatedAt)
      )
        sceneFail('invalid-argument', 'Versão de agrupador inválida.');
      return { id: sceneId(item.id), expectedUpdatedAt: item.expectedUpdatedAt };
    });
    const op = operation(context, data, 'deleteSceneGroups', { groups });
    const initialized = await db.runTransaction(async (tx) => {
      const p = await project(context, tx),
        previous = await receipt(tx, op);
      if (previous) return previous;
      const entries = [];
      for (const selection of groups) {
        const entry = await group(context, selection.id, tx, { structure: true });
        if (entry.value.updatedAt !== selection.expectedUpdatedAt) conflict();
        entries.push(entry);
      }
      const timestamp = sceneDate(now, p.updatedAt ?? 0),
        removedWords = entries.reduce((sum, entry) => sum + entry.value.wordCount, 0);
      const wordProgress = await workLedger.prepareChanges(tx, {
        target: context.target,
        root: p,
        changes: [],
        disableGroups: entries.map((entry) => entry.value.id),
      });
      const bodies =
        context.target.kind === 'book'
          ? createBookChapterBodyPlan(tx, db, { uid, bookId: context.target.id })
          : null;
      if (bodies)
        for (const entry of entries) {
          const manifest = entry.snapshot.data()?.contentStorage;
          if (manifest != null) await bodies.pin(entry.value.id, manifest, -1);
        }
      for (const entry of entries)
        tx.update(entry.ref, {
          deleting: true,
          deletionOperation: op.id,
          assemblyRevision: entry.value.assemblyRevision + 1,
          structureRevision: entry.value.structureRevision + 1,
          updatedAt: timestamp,
        });
      bodies?.commit();
      writeProject(tx, context, p, timestamp, -removedWords);
      wordProgress.commit();
      const state = {
        kind: 'delete-groups',
        input: { target: context.target, operationId: op.id, groups },
        groups,
        index: 0,
        processed: 0,
        complete: false,
      };
      writeReceipt(tx, op, state);
      return state;
    });
    if (initialized.complete) return progress(initialized);
    return db.runTransaction(async (tx) => {
      const p = await project(context, tx),
        previous = await receipt(tx, op);
      if (previous.complete) return progress(previous);
      const id = previous.groups[previous.index].id,
        entry = await group(context, id, tx, { deleting: true });
      if (entry.snapshot.data().deletionOperation !== op.id)
        sceneFail('failed-precondition', 'Exclusão indisponível.');
      const destination = await group(context, null, tx, { composed: true, structure: true });
      const page = await tx.get(
        db
          .collection(`${context.path}/scenes`)
          .where('parentId', '==', id)
          .orderBy('__name__')
          .limit(limit),
      );
      const last = (
        await tx.get(
          db
            .collection(`${context.path}/scenes`)
            .where('parentId', '==', null)
            .where('archived', '==', false)
            .orderBy(`rank${destination.value.rankSlot}`, 'desc')
            .orderBy('__name__', 'desc')
            .limit(1),
        )
      ).docs[0]?.data();
      let rank = last?.[`rank${destination.value.rankSlot}`] ?? null,
        words = 0;
      const timestamp = sceneDate(now, p.updatedAt ?? 0);
      const moved = page.docs.map((item) => {
        rank = sceneRankBetween(rank);
        const scene = item.data();
        if (!scene.archived) words += scene.wordCount;
        return {
          ref: item.ref,
          patch: {
            parentId: null,
            formerParentId: id,
            [`rank${destination.value.rankSlot}`]: rank,
            revision: scene.revision + 1,
            updatedAt: timestamp,
          },
        };
      });
      const finishedGroup = page.docs.length < limit,
        index = previous.index + (finishedGroup ? 1 : 0),
        complete = index === previous.groups.length;
      const wordProgress = await workLedger.prepareChanges(tx, {
        target: context.target,
        root: p,
        changes: page.docs.map((item) => ({
          kind: 'scene',
          id: item.id,
          parentId: null,
          archived: item.data().archived,
          removed: true,
        })),
      });
      for (const item of moved) tx.update(item.ref, item.patch);
      if (moved.length)
        writeGroup(tx, destination, {
          ...destination.value,
          sceneCount: destination.value.sceneCount + moved.length,
          wordCount: destination.value.wordCount + words,
          structureRevision: destination.value.structureRevision + 1,
          assemblyRevision: destination.value.assemblyRevision + 1,
          updatedAt: timestamp,
        });
      if (finishedGroup) tx.delete(entry.ref);
      writeProject(tx, context, p, timestamp);
      wordProgress.commit();
      const state = {
        kind: previous.kind,
        input: previous.input,
        groups: previous.groups,
        index,
        processed: previous.processed + moved.length,
        complete,
      };
      writeReceipt(tx, op, state);
      return progress(state);
    });
  };
  api.deleteSceneGroup = (uid, data) => {
    scope(uid, data, ['parentId', 'operationId', 'expectedUpdatedAt', 'limit']);
    return api.deleteSceneGroups(uid, {
      target: data.target,
      operationId: data.operationId,
      groups: [{ id: sceneId(data.parentId), expectedUpdatedAt: data.expectedUpdatedAt }],
      ...(data.limit !== undefined ? { limit: data.limit } : {}),
    });
  };

  api.deleteSceneBook = async (uid, data) => {
    const context = scope(uid, data, ['operationId', 'limit']),
      limit = sceneLimit(data.limit ?? 50);
    if (context.target.kind !== 'book')
      sceneFail('invalid-argument', 'Esta operação exclui um livro.');
    const op = operation(context, data, 'deleteSceneBook', {});
    return db.runTransaction(async (tx) => {
      let previous = await receipt(tx, op),
        effective = op;
      const rootSnapshot = await tx.get(context.ref);
      const checkpointId = previous?.checkpointId ?? rootSnapshot.data()?.sceneDeletionOperationId;
      if (checkpointId && checkpointId !== op.id) {
        effective = {
          ...op,
          id: checkpointId,
          ref: db.doc(`users/${uid}/sceneOperations/${sceneId(checkpointId)}`),
        };
        const checkpoint = await receipt(tx, effective);
        if (!checkpoint || checkpoint.kind !== 'delete-book')
          sceneFail('failed-precondition', 'Checkpoint da exclusão indisponível.');
        previous = checkpoint;
      }
      if (previous?.kind === 'delete-book' && !BOOK_DELETE_PHASES.includes(previous.phase))
        sceneFail('failed-precondition', 'Fase da exclusão indisponível.');
      if (previous && ![undefined, 1, 2, 3].includes(previous.cleanupVersion))
        sceneFail('failed-precondition', 'Versão da exclusão indisponível.');
      if (!rootSnapshot.exists && previous?.complete) return progress(previous);
      const p = await project(context, tx, true),
        publicRoot = await tx.get(db.doc(`publicBooks/${context.target.id}`));
      if (!p.deleting || publicRoot.exists)
        sceneFail(
          'failed-precondition',
          'Revogue a publicação e inicie a exclusão antes da limpeza.',
        );
      const state = {
        kind: 'delete-book',
        input: { target: context.target, operationId: effective.id },
        phase: 'scenes',
        processed: 0,
        complete: false,
        ...previous,
      };
      delete state.fingerprint;
      state.cleanupVersion = 3;
      if (state.complete) return progress(state);
      if (!Number.isSafeInteger(state.processed) || state.processed < 0)
        sceneFail('failed-precondition', 'Contagem da exclusão inválida.');
      const lore = await prepareBookLoreDeletion(tx, {
        db,
        uid,
        bookId: context.target.id,
        operationId: effective.id,
        limit,
      });
      const priorLore = state.loreProcessed ?? 0;
      if (!Number.isSafeInteger(priorLore) || priorLore < 0 || lore.processed < priorLore)
        conflict();
      state.processed += lore.processed - priorLore;
      state.loreProcessed = lore.processed;
      if (!lore.complete && state.phase !== 'lore-resources') {
        state.loreResumePhase = state.phase;
        state.phase = 'lore-resources';
      }
      if (lore.complete && state.phase === 'lore-resources') {
        if (
          !BOOK_DELETE_PHASES.includes(state.loreResumePhase) ||
          state.loreResumePhase === 'lore-resources'
        )
          conflict();
        state.phase = state.loreResumePhase;
        delete state.loreResumePhase;
      }
      let deleted = [];
      if (state.phase === 'lore-resources') {
        // Child protocols have already read their inputs; only checkpoint writes follow.
      } else if (
        state.phase === 'scenes' ||
        state.phase === 'revisions' ||
        state.phase === 'arcs'
      ) {
        const base =
          state.phase === 'scenes'
            ? `${context.path}/scenes`
            : state.phase === 'arcs'
              ? `${context.path}/arcs`
              : `publicBooks/${context.target.id}/revisions`;
        const parent = (await tx.get(db.collection(base).orderBy('__name__').limit(1))).docs[0];
        if (!parent) {
          state.phase =
            state.phase === 'scenes'
              ? 'revisions'
              : state.phase === 'revisions'
                ? 'arcs'
                : 'chapters';
          state.childPhase = 0;
        } else {
          const children =
            state.phase === 'scenes'
              ? ['references', 'body', 'planning']
              : state.phase === 'arcs'
                ? ['milestones']
                : ['chapters', 'lore', 'acts'];
          const childPhase = state.childPhase ?? 0;
          if (!Number.isInteger(childPhase) || childPhase < 0 || childPhase > children.length)
            sceneFail('failed-precondition', 'Fase da exclusão indisponível.');
          if (childPhase < children.length) {
            const page = await tx.get(
              db
                .collection(`${parent.ref.path}/${children[childPhase]}`)
                .orderBy('__name__')
                .limit(limit),
            );
            deleted = page.docs.map((item) => item.ref);
            if (page.docs.length < limit) state.childPhase = childPhase + 1;
          } else {
            deleted = [parent.ref];
            state.childPhase = 0;
          }
        }
      } else if (state.phase === 'text-bodies') {
        const bodies = await tx.get(
          db
            .collection(context.path + '/bookTextBodies')
            .orderBy('__name__')
            .select(...BOOK_CHAPTER_BODY_FIELDS)
            .limit(1),
        );
        if (!bodies.docs.length) state.phase = 'finish';
        else {
          const plan = await prepareBookChapterBodyCleanup(tx, db, {
            uid,
            bookId: context.target.id,
            body: bodies.docs[0],
            limit,
            requireUnreferenced: false,
          });
          deleted = plan.remove;
        }
      } else {
        const phases = BOOK_DELETE_FLAT_PHASES;
        const at = phases.indexOf(state.phase);
        if (at >= 0) {
          const page = await tx.get(
            db.collection(`${context.path}/${state.phase}`).orderBy('__name__').limit(limit),
          );
          deleted = page.docs.map((item) => item.ref);
          if (page.docs.length < limit) state.phase = phases[at + 1] ?? 'text-bodies';
        } else if (state.phase === 'finish') {
          const remaining = await tx.get(
            db
              .collection(context.path + '/bookTextBodies')
              .select()
              .limit(1),
          );
          if (remaining.docs.length) state.phase = 'text-bodies';
          else {
            await assertBookLorePayloadsEmpty(tx, db, context.target.id);
            let universe, link;
            if (p.universeId) {
              universe = await tx.get(db.doc(`universes/${sceneId(p.universeId)}`));
              link = await tx.get(db.doc(`${universe.ref.path}/books/${context.target.id}`));
            }
            if (link?.exists) {
              tx.delete(link.ref);
              if (universe.exists)
                tx.update(universe.ref, {
                  bookCount: Math.max(0, (universe.data().bookCount ?? 0) - 1),
                });
            }
            tx.set(db.doc(`deletedBooks/${context.target.id}`), {
              deletedAt: sceneDate(now, p.updatedAt ?? 0),
            });
            tx.delete(context.ref);
            state.complete = true;
          }
        } else sceneFail('failed-precondition', 'Fase da exclusão indisponível.');
      }
      if (!Number.isSafeInteger(state.processed + deleted.length))
        sceneFail('failed-precondition', 'Contagem da exclusão inválida.');
      lore.commit();
      for (const ref of deleted) tx.delete(ref);
      state.processed += deleted.length;
      if (!state.complete) tx.update(context.ref, { sceneDeletionOperationId: effective.id });
      writeReceipt(tx, effective, state);
      if (effective.id !== op.id) writeReceipt(tx, op, { checkpointId: effective.id });
      return progress(state);
    });
  };
  api.getSceneJob = async (uid, data) => {
    const context = scope(uid, data, ['operationId']),
      id = sceneId(data.operationId);
    return db.runTransaction(async (tx) => {
      const record = (await tx.get(db.doc(`users/${uid}/sceneOperations/${id}`))).data();
      const job = record?.checkpointId
        ? (
            await tx.get(db.doc(`users/${uid}/sceneOperations/${sceneId(record.checkpointId)}`))
          ).data()
        : record;
      if (
        !job?.input ||
        digest(job.input.target) !== digest(context.target) ||
        !['rebalance', 'delete-groups', 'delete-book'].includes(job.kind)
      )
        return null;
      const root = (await tx.get(context.ref)).data();
      if (!root || root[context.domain.owner] !== uid) return null;
      return { kind: job.kind, input: job.input, progress: progress(job) };
    });
  };
}
