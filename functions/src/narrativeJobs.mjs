import { rebalancedSceneRank } from './sceneRanks.mjs';
import { writeSceneLoreIndex } from './sceneLoreIndex.mjs';
import {
  fail,
  id,
  limit,
  version,
  date,
  digest,
  conflict,
  resource,
  sourceKey,
  scope,
  itemPath,
  operation,
} from './narrativeContracts.mjs';

const progress = (value) => ({
  complete: value?.complete ?? false,
  processed: value?.processed ?? 0,
});
export function addNarrativeJobs(api, helpers) {
  const {
    db,
    now,
    root,
    sequence,
    controlRef,
    item,
    writeRoot,
    writeSequence,
    receipt,
    saveReceipt,
  } = helpers;
  api.rebalanceNarrativeRanks = async (uid, data) => {
    const context = scope(db, uid, data, ['operationId', 'resource', 'limit']),
      value = resource(data.resource),
      pageLimit = limit(data.limit ?? 50),
      op = operation(db, context, data, 'rebalanceNarrativeRanks', { resource: value });
    return db.runTransaction(async (tx) => {
      const p = await root(context, tx),
        previous = await receipt(tx, op),
        seq = await sequence(context, value, tx);
      if (previous?.complete) return progress(previous);
      if (seq.state.rebalancing && seq.state.rebalanceOperationId !== op.id)
        fail('failed-precondition', 'Outra reorganização está em andamento.');
      const active = previous?.active ?? seq.state.rankSlot,
        inactive = active === 'A' ? 'B' : 'A';
      if (seq.state.rankSlot !== active) conflict();
      let query = db
        .collection(itemPath(context, value))
        .orderBy(`rank${active}`)
        .orderBy('__name__')
        .limit(pageLimit);
      if (previous?.cursor) query = query.startAfter(previous.cursor.rank, previous.cursor.id);
      const page = await tx.get(query),
        processed = (previous?.processed ?? 0) + page.docs.length,
        complete = page.docs.length < pageLimit,
        timestamp = date(now, p.updatedAt ?? 0);
      page.docs.forEach((snap, index) =>
        tx.update(snap.ref, {
          [`rank${inactive}`]: rebalancedSceneRank((previous?.processed ?? 0) + index),
        }),
      );
      tx.set(
        seq.ref,
        {
          ...seq.state,
          rankSlot: complete ? inactive : active,
          rebalancing: !complete,
          rebalanceOperationId: complete ? null : op.id,
          structureRevision: seq.state.structureRevision + (complete ? 1 : 0),
          updatedAt: timestamp,
        },
        { merge: true },
      );
      writeRoot(tx, context, p, timestamp);
      saveReceipt(tx, op, {
        kind: 'rebalance',
        input: { target: context.target, resource: value, operationId: op.id },
        active,
        processed,
        complete,
        cursor: page.docs.length
          ? { rank: page.docs.at(-1).data()[`rank${active}`], id: page.docs.at(-1).id }
          : (previous?.cursor ?? null),
      });
      return { complete, processed };
    });
  };
  api.deleteNarrativeItem = async (uid, data) => {
    const context = scope(db, uid, data, ['operationId', 'source', 'expectedRevision', 'limit']),
      source = resource(data.source, true),
      pageLimit = limit(data.limit ?? 50);
    version(data.expectedRevision);
    const op = operation(db, context, data, 'deleteNarrativeItem', {
      source,
      expectedRevision: data.expectedRevision,
    });
    return db.runTransaction(async (tx) => {
      const p = await root(context, tx),
        previous = await receipt(tx, op);
      if (previous?.complete) return progress(previous);
      let state = previous,
        seq,
        current;
      const timestamp = date(now, p.updatedAt ?? 0);
      if (!state) {
        seq = await sequence(context, source, tx, true);
        current = await item(context, source, tx);
        if (current.value.revision !== data.expectedRevision) conflict();
        // An arc cannot be removed while a child sequence is rebalancing.
        if (source.kind === 'arc') {
          const childControl = (
            await tx.get(controlRef(context, { kind: 'milestone', arcId: source.id }))
          ).data();
          if (childControl?.rebalancing)
            fail(
              'failed-precondition',
              'Conclua a reorganização dos marcos antes de remover o arco.',
            );
        }
        state = {
          kind: 'delete-item',
          input: {
            target: context.target,
            source,
            expectedRevision: data.expectedRevision,
            operationId: op.id,
          },
          phase: source.kind === 'arc' ? 'milestones' : 'links',
          processed: 0,
          complete: false,
        };
        tx.update(current.ref, {
          deleting: true,
          deletionOperationId: op.id,
          revision: current.value.revision + 1,
          updatedAt: timestamp,
        });
        writeSequence(tx, seq, timestamp);
        writeRoot(tx, context, p, timestamp);
        saveReceipt(tx, op, state);
        return progress(state);
      }
      const itemRef = db.doc(itemPath(context, source)),
        snap = await tx.get(itemRef);
      if (!snap.exists || !snap.data().deleting || snap.data().deletionOperationId !== op.id)
        fail('failed-precondition', 'Checkpoint de remoção indisponível.');
      state = { ...state };
      delete state.fingerprint;
      let refs = [];
      if (state.phase === 'milestones') {
        const children = await tx.get(
          db.collection(`${itemRef.path}/milestones`).orderBy('__name__').limit(pageLimit),
        );
        refs = children.docs.map((snap) => snap.ref);
        if (children.docs.length < pageLimit) state.phase = 'links';
      } else if (state.phase === 'links') {
        const query = db
          .collection(`${context.path}/narrativeLinks`)
          .where(
            source.kind === 'arc' ? 'sourceArcId' : 'sourceKey',
            '==',
            source.kind === 'arc' ? source.id : sourceKey(source),
          )
          .orderBy('__name__')
          .limit(pageLimit);
        const links = await tx.get(query);
        refs = links.docs.map((snap) => snap.ref);
        if (links.docs.length < pageLimit) state.phase = 'finish';
      } else {
        if (source.kind === 'arc')
          refs.push(controlRef(context, { kind: 'milestone', arcId: source.id }));
        refs.push(itemRef);
        state.complete = true;
      }
      refs.forEach((ref) => tx.delete(ref));
      state.processed += refs.length;
      writeRoot(tx, context, p, timestamp);
      saveReceipt(tx, op, state);
      return progress(state);
    });
  };
  api.prepareEntitySceneIndex = async (uid, data) => {
    const context = scope(db, uid, data, ['operationId', 'limit']),
      pageLimit = limit(data.limit ?? 50),
      requested = operation(db, context, data, 'prepareEntitySceneIndex', {});
    return db.runTransaction(async (tx) => {
      const p = await root(context, tx),
        controlRef = db.doc(`${context.path}/narrativeControls/entity-scenes`),
        control = (await tx.get(controlRef)).data();
      // Reload may submit a new UUID: adopt the protected original checkpoint.
      const op =
        control?.operationId && control.operationId !== requested.id
          ? {
              ...requested,
              id: control.operationId,
              ref: db.doc(`users/${uid}/narrativeOperations/${id(control.operationId)}`),
            }
          : requested;
      const alias = await receipt(tx, requested),
        previous = op.id === requested.id ? alias : await receipt(tx, op);
      if (op.id !== requested.id && !previous)
        fail('failed-precondition', 'Checkpoint de preparação indisponível.');
      if (previous?.kind && previous.kind !== 'prepare-entity-scenes')
        fail('invalid-argument', 'Operação de outro tipo.');
      if (previous?.complete) return progress(previous);
      const state = {
        kind: 'prepare-entity-scenes',
        input: { target: context.target, operationId: op.id },
        sceneCursor: null,
        currentScene: null,
        referenceCursor: null,
        processed: 0,
        complete: false,
        ...previous,
      };
      delete state.fingerprint;
      let scene;
      if (state.currentScene)
        scene = await tx.get(db.doc(`${context.path}/scenes/${id(state.currentScene)}`));
      else {
        let query = db.collection(`${context.path}/scenes`).orderBy('__name__').limit(1);
        if (state.sceneCursor) query = query.startAfter(state.sceneCursor);
        scene = (await tx.get(query)).docs[0];
      }
      let children = [];
      if (!scene) {
        state.complete = true;
      } else if (!scene.exists) {
        state.sceneCursor = state.currentScene;
        state.currentScene = null;
        state.referenceCursor = null;
      } else {
        state.currentScene = scene.id;
        let query = db
          .collection(`${scene.ref.path}/references`)
          .orderBy('__name__')
          .limit(pageLimit);
        if (state.referenceCursor) query = query.startAfter(state.referenceCursor);
        const page = await tx.get(query);
        children = page.docs;
        state.processed += children.length;
        if (children.length < pageLimit) {
          state.sceneCursor = scene.id;
          state.currentScene = null;
          state.referenceCursor = null;
        } else state.referenceCursor = children.at(-1).id;
      }
      for (const child of children)
        writeSceneLoreIndex(tx, db, context.path, scene.id, child.data());
      tx.set(controlRef, {
        complete: state.complete,
        operationId: op.id,
        processed: state.processed,
      });
      writeRoot(tx, context, p, date(now, p.updatedAt ?? 0));
      saveReceipt(tx, op, state);
      if (op.id !== requested.id) saveReceipt(tx, requested, { checkpointId: op.id });
      return progress(state);
    });
  };
  api.getNarrativeJob = async (uid, data) => {
    const context = scope(db, uid, data, ['operationId']),
      operationId = id(data.operationId);
    try {
      return await db.runTransaction(async (tx) => {
        await root(context, tx);
        const alias = (
          await tx.get(db.doc(`users/${uid}/narrativeOperations/${operationId}`))
        ).data();
        const record = alias?.checkpointId
          ? (
              await tx.get(db.doc(`users/${uid}/narrativeOperations/${id(alias.checkpointId)}`))
            ).data()
          : alias;
        if (
          !record?.input ||
          digest(record.input.target) !== digest(context.target) ||
          !['rebalance', 'delete-item', 'prepare-entity-scenes'].includes(record.kind)
        )
          return null;
        return { kind: record.kind, input: record.input, progress: progress(record) };
      });
    } catch (error) {
      if (error.code === 'not-found') return null;
      throw error;
    }
  };
}
