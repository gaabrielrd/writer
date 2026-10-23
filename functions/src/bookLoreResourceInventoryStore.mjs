import { born, bornEqual, closed, integer } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  inventoryAddress,
  inventoryEventId,
  inventoryToken,
  validateInventoryContext,
  validateInventoryState,
  inventoryConflict as conflict,
  inventoryInitialState,
} from './bookLoreResourceInventoryContracts.mjs';
export const inventoryImmutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
const atMost = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
function eventRefs(at, revision) {
  const id = inventoryEventId(revision);
  return {
    eventRef: at.db.doc(at.controlPath + '/events/' + id),
    proofRef: at.db.doc(at.controlPath + '/proofs/' + id),
  };
}
export async function readInventoryEvent(tx, loaded, revision) {
  integer(revision);
  const at = loaded.at,
    refs = eventRefs(at, revision),
    event = await tx.get(refs.eventRef),
    proof = await tx.get(refs.proofRef),
    r = event.data(),
    p = proof.data();
  if (
    !inventoryImmutable(event) ||
    !inventoryImmutable(proof) ||
    !bornEqual(event, proof) ||
    !atMost(born(loaded.snapshot), born(event)) ||
    !atMost(born(event), born({ createTime: loaded.stateSnapshot.updateTime }))
  )
    conflict();
  closed(r, ['schemaVersion', 'controlToken', 'revision', 'operation', 'payloadHash', 'stateHash']);
  closed(p, ['schemaVersion', 'eventHash']);
  if (
    r.schemaVersion !== 1 ||
    p.schemaVersion !== 1 ||
    p.eventHash !== digest(r) ||
    r.revision !== revision ||
    r.controlToken !== (revision === 0 ? null : loaded.token) ||
    revision > loaded.state.revision ||
    (revision === 0 && !bornEqual(event, loaded.snapshot))
  )
    conflict();
  return { event, record: r };
}
export async function loadInventoryControl(tx, c, kind, id) {
  const at = inventoryAddress(c, kind, id),
    snapshot = await tx.get(at.ref);
  if (!snapshot.exists) return null;
  if (!inventoryImmutable(snapshot)) conflict();
  const context = validateInventoryContext(at, snapshot.data()),
    stateSnapshot = await tx.get(at.stateRef);
  if (!stateSnapshot.exists || !bornEqual(stateSnapshot, snapshot)) conflict();
  const state = validateInventoryState(at, context, stateSnapshot.data()),
    loaded = {
      at,
      snapshot,
      context,
      stateSnapshot,
      state,
      token: inventoryToken(at, snapshot, context),
    };
  const last = await readInventoryEvent(tx, loaded, state.revision);
  if (
    last.record.stateHash !== digest(state) ||
    !bornEqual(last.event, { createTime: stateSnapshot.updateTime })
  )
    conflict();
  return loaded;
}
export async function prepareInventoryInitialization(tx, c, context) {
  const at = inventoryAddress(
      c,
      context.kind,
      context.kind === 'generation' ? context.generationId : context.bodyId,
    ),
    state = inventoryInitialState(context.kind),
    refs = eventRefs(at, 0);
  validateInventoryContext(at, context);
  validateInventoryState(at, context, state);
  const existing = await Promise.all([
    tx.get(at.ref),
    tx.get(at.stateRef),
    tx.get(refs.eventRef),
    tx.get(refs.proofRef),
  ]);
  if (existing.some((s) => s.exists)) conflict();
  const record = {
    schemaVersion: 1,
    controlToken: null,
    revision: 0,
    operation: 'initialize',
    payloadHash: null,
    stateHash: digest(state),
  };
  return {
    commit() {
      tx.create(at.ref, context);
      tx.create(at.stateRef, state);
      tx.create(refs.eventRef, record);
      tx.create(refs.proofRef, { schemaVersion: 1, eventHash: digest(record) });
    },
  };
}
export async function prepareInventoryChange(tx, loaded, operation, patch, payloadHash = null) {
  const { at, context, state } = loaded,
    next = { ...state, ...patch, revision: state.revision + 1 };
  validateInventoryState(at, context, next);
  if (at.kind === 'generation') {
    if (
      operation !== 'retire' ||
      state.phase !== 'active' ||
      next.phase !== 'retired' ||
      payloadHash !== null
    )
      conflict();
  } else {
    if (
      state.phase === 'collected' ||
      next.cleanupIndex < state.cleanupIndex ||
      next.referenceRevision < state.referenceRevision
    )
      conflict();
    if (operation === 'register') {
      if (
        ['collecting', 'collected'].includes(state.phase) ||
        next.phase !== 'live' ||
        next.referenceRevision !== state.referenceRevision + 1 ||
        next.scanRevision !== null ||
        next.cursor !== null ||
        next.headToken !== null ||
        next.headPage !== 0 ||
        typeof payloadHash !== 'string'
      )
        conflict();
    } else {
      if (next.referenceRevision !== state.referenceRevision || payloadHash !== null) conflict();
      if (operation === 'scan-head') {
        if (
          next.phase !== (state.phase === 'initializing' ? 'live' : state.phase) ||
          next.cleanupIndex !== state.cleanupIndex ||
          next.scanRevision !== state.scanRevision ||
          next.cursor !== state.cursor ||
          next.headToken === null
        )
          conflict();
      } else if (operation === 'scan') {
        if (
          ['collecting', 'collected'].includes(state.phase) ||
          !['scanning', 'collecting'].includes(next.phase) ||
          next.headToken === null ||
          next.headPage !== null
        )
          conflict();
      } else if (operation === 'collect-chunks') {
        if (
          state.phase !== 'collecting' ||
          next.phase !== 'collecting' ||
          next.cleanupIndex <= state.cleanupIndex ||
          next.headToken === null ||
          next.headPage !== null
        )
          conflict();
      } else if (operation === 'collect-header') {
        if (
          state.phase !== 'collecting' ||
          next.phase !== 'collected' ||
          next.headToken === null ||
          next.headPage !== null
        )
          conflict();
      } else conflict();
    }
  }
  const refs = eventRefs(at, next.revision),
    old = await Promise.all([tx.get(refs.eventRef), tx.get(refs.proofRef)]);
  if (old.some((s) => s.exists)) conflict();
  const record = {
    schemaVersion: 1,
    controlToken: loaded.token,
    revision: next.revision,
    operation,
    payloadHash,
    stateHash: digest(next),
  };
  return {
    next,
    commit() {
      tx.update(at.stateRef, next);
      tx.create(refs.eventRef, record);
      tx.create(refs.proofRef, { schemaVersion: 1, eventHash: digest(record) });
    },
  };
}
export const inventoryReference = (body, generation, revision) => ({
  schemaVersion: 1,
  ownerId: body.at.uid,
  bookId: body.at.bookId,
  loreId: body.context.loreId,
  bodyId: body.at.id,
  bodyToken: body.token,
  generationId: generation.at.id,
  generationBirth: born(generation.snapshot),
  generationToken: generation.token,
  revision,
});
export async function readInventoryReference(tx, body, snapshot) {
  if (!inventoryImmutable(snapshot)) conflict();
  const r = snapshot.data();
  closed(r, [
    'schemaVersion',
    'ownerId',
    'bookId',
    'loreId',
    'bodyId',
    'bodyToken',
    'generationId',
    'generationBirth',
    'generationToken',
    'revision',
  ]);
  const generation = await loadInventoryControl(tx, body.at, 'generation', r.generationId);
  if (
    !generation ||
    snapshot.ref.path !== body.at.controlPath + '/references/' + r.generationId ||
    !bornEqual(generation.snapshot, { createTime: r.generationBirth }) ||
    generation.token !== r.generationToken ||
    digest(r) !== digest(inventoryReference(body, generation, r.revision)) ||
    generation.context.loreId !== body.context.loreId ||
    !bornEqual({ createTime: generation.context.bookBirth }, { createTime: body.context.bookBirth })
  )
    conflict();
  integer(r.revision, 1);
  const event = await readInventoryEvent(tx, body, r.revision);
  if (
    event.record.operation !== 'register' ||
    event.record.payloadHash !== digest(r) ||
    !bornEqual(snapshot, event.event)
  )
    conflict();
  return { generation, record: r };
}
