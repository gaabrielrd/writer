import {
  validateApplicationState,
  applicationWorkflowState,
} from './loreAnalysisApplicationWorkflowContracts.mjs';
import {
  applicationChildren,
  analysisChildPaths,
} from './loreAnalysisApplicationChildContracts.mjs';
import { born, bornEqual, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { bookContentId } from './bookBackupSchema.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  applicationConflict as conflict,
  applicationView,
  validateApplicationMembers,
  applicationChildPaths,
} from './loreAnalysisApplicationContracts.mjs';
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
const openings = new WeakMap();
const refs = (c, revision) => {
  const id = String(revision).padStart(16, '0');
  return { event: c.db.doc(c.path + '/events/' + id), proof: c.db.doc(c.path + '/proofs/' + id) };
};
function validateContext(v, c) {
  closed(
    v,
    ['schemaVersion', 'kind', 'ownerId', 'id', 'requestHash', 'bookId'],
    v?.kind === 'reservation'
      ? [
          'bookBirth',
          'provider',
          'universeId',
          'universeBirth',
          'chapterId',
          'chapterBirth',
          'analysisBirth',
          'fingerprint',
          'sourceRevision',
          'textHash',
          'expiresAt',
          'members',
        ]
      : [],
  );
  if (
    v.schemaVersion !== 1 ||
    !['reservation', 'fence'].includes(v.kind) ||
    v.ownerId !== c.uid ||
    v.id !== c.id
  )
    conflict();
  restoreHash(v.requestHash);
  if (v.kind === 'fence') {
    if (v.bookId !== null) conflict();
    return;
  }
  for (const key of ['bookId', 'chapterId']) bookContentId(v[key]);
  for (const key of ['bookBirth', 'chapterBirth', 'analysisBirth']) {
    closed(v[key], ['seconds', 'nanoseconds']);
    born({ createTime: v[key] });
  }
  for (const key of ['fingerprint', 'sourceRevision', 'textHash']) restoreHash(v[key]);
  integer(v.expiresAt);
  if (!Number.isFinite(new Date(v.expiresAt).getTime())) conflict();
  if (!['platform', 'byok'].includes(v.provider)) conflict();
  validateApplicationMembers(v.members);
  if (v.universeId === null) {
    if (v.universeBirth !== null || v.members.some((m) => m.scope === 'global')) conflict();
  } else {
    bookContentId(v.universeId);
    closed(v.universeBirth, ['seconds', 'nanoseconds']);
    born({ createTime: v.universeBirth });
  }
}
const atMost = (a, b) =>
  a.seconds < b.seconds || (a.seconds === b.seconds && a.nanoseconds <= b.nanoseconds);
export const assertApplicationOpening = (tx, l) => {
  if (openings.get(l) !== tx) conflict();
};
async function pair(tx, c, revision) {
  const at = refs(c, revision),
    event = await tx.get(at.event),
    proof = await tx.get(at.proof);
  if (!immutable(event) || !immutable(proof) || !bornEqual(event, proof)) conflict();
  const record = event.data();
  closed(proof.data(), ['schemaVersion', 'eventHash']);
  closed(
    record,
    ['schemaVersion', 'contextHash', 'token', 'revision', 'stateHash', 'requestHash'],
    record?.schemaVersion === 2 ? ['operationId', 'method', 'progress'] : [],
  );
  if (
    ![1, 2].includes(record.schemaVersion) ||
    proof.data().schemaVersion !== 1 ||
    proof.data().eventHash !== digest(record)
  )
    conflict();
  return { snapshot: event, record };
}
async function validateEvent(tx, l, revision) {
  const event = await pair(tx, l.c, revision),
    v = event.record;
  if (
    v.revision !== revision ||
    v.contextHash !== digest(l.context) ||
    v.token !== (revision === 0 ? null : l.token) ||
    !atMost(born(l.snapshot), born(event.snapshot)) ||
    !atMost(born(event.snapshot), born({ createTime: l.stateSnapshot.updateTime }))
  )
    conflict();
  if (v.schemaVersion === 2) {
    if (revision < 1 || typeof v.method !== 'string') conflict();
    restoreHash(v.requestHash);
    restoreHash(v.stateHash);
    bookContentId(v.operationId);
    const index = await tx.get(l.c.db.doc(l.c.path + '/operations/' + v.operationId));
    if (!immutable(index) || !bornEqual(index, event.snapshot)) conflict();
    closed(index.data(), ['schemaVersion', 'revision', 'eventHash']);
    if (digest(index.data()) !== digest({ schemaVersion: 1, revision, eventHash: digest(v) }))
      conflict();
  }
  return event;
}
export async function readApplicationEvent(tx, l, revision) {
  assertApplicationOpening(tx, l);
  integer(revision);
  if (revision > l.state.revision) conflict();
  return validateEvent(tx, l, revision);
}
export async function loadApplication(tx, c, request) {
  const snapshot = await tx.get(c.ref);
  if (!snapshot.exists) return null;
  if (!immutable(snapshot)) conflict();
  const context = snapshot.data();
  validateContext(context, c);
  if (context.requestHash !== request.requestHash) conflict();
  const token = digest({ domain: 'writer-analysis-application', context, birth: born(snapshot) });
  if (request.jobToken !== undefined && request.jobToken !== token) conflict();
  const stateSnapshot = await tx.get(c.stateRef),
    state = validateApplicationState(stateSnapshot.data(), context),
    l = { c, snapshot, context, token, state, stateSnapshot },
    initial = await validateEvent(tx, l, 0);
  if (
    !bornEqual(initial.snapshot, snapshot) ||
    initial.record.schemaVersion !== 1 ||
    initial.record.requestHash !== null
  )
    conflict();
  const current = state.revision === 0 ? initial : await validateEvent(tx, l, state.revision);
  if (
    !bornEqual(current.snapshot, { createTime: stateSnapshot.updateTime }) ||
    current.record.stateHash !== digest(state)
  )
    conflict();
  if (current.record.schemaVersion === 1) {
    if (
      state.schemaVersion !== 1 ||
      (state.revision === 0
        ? current.record.requestHash !== null
        : current.record.requestHash !==
          digest({
            id: c.id,
            requestHash: context.requestHash,
            jobToken: token,
            operationId: state.lastOperationId,
          }))
    )
      conflict();
  } else if (
    state.schemaVersion !== 2 ||
    current.record.operationId !== state.lastOperationId ||
    digest(current.record.progress) !== digest(applicationView(l))
  )
    conflict();
  openings.set(l, tx);
  return l;
}
export async function replayApplicationOperation(tx, l, method, r) {
  assertApplicationOpening(tx, l);
  const index = await tx.get(l.c.db.doc(l.c.path + '/operations/' + r.operationId));
  if (!index.exists) return null;
  const value = index.data();
  closed(value, ['schemaVersion', 'revision', 'eventHash']);
  integer(value.revision, 1);
  if (value.revision > l.state.revision) conflict();
  const event = await validateEvent(tx, l, value.revision),
    v = event.record;
  if (
    v.schemaVersion !== 2 ||
    v.operationId !== r.operationId ||
    v.method !== method ||
    v.requestHash !== digest(r)
  )
    conflict();
  return { receipt: v.progress, progress: applicationView(l) };
}
async function childrenPresent(tx, c, context, starting = false) {
  if (context.kind === 'fence') return false;
  const paths = applicationChildPaths(c, context);
  for (const child of applicationChildren(context)) {
    const at = analysisChildPaths(c.db, c.uid, child);
    paths.push(at.owner.path, at.proof.path);
  }
  if (starting)
    for (const member of context.members)
      if (member.scope === 'global' && member.source === null)
        paths.push('universes/' + context.universeId + '/lore/' + member.targetId);
  const reads = paths.map((path) => readWorkMetadata(tx, c.db.doc(path), []));
  reads.push(
    tx.get(
      c.db
        .collection(c.path + '/prepared')
        .limit(1)
        .select(),
    ),
  );
  const results = await Promise.allSettled(reads),
    failure = results.find((r) => r.status === 'rejected');
  if (failure) throw failure.reason;
  return results.some((r) => r.value.exists || r.value.docs?.length > 0);
}
export async function assertApplicationChildrenAbsent(tx, c, context, starting = false) {
  if (await childrenPresent(tx, c, context, starting)) conflict();
}
export async function prepareApplicationInitialization(tx, c, context, phase = 'preparing') {
  validateContext(context, c);
  if (phase !== (context.kind === 'fence' ? 'cancelled' : 'preparing')) conflict();
  const at = refs(c, 0);
  for (const ref of [c.stateRef, at.event, at.proof]) if ((await tx.get(ref)).exists) conflict();
  await assertApplicationChildrenAbsent(tx, c, context, true);
  const state = { schemaVersion: 1, phase, revision: 0, lastOperationId: null },
    event = {
      schemaVersion: 1,
      contextHash: digest(context),
      token: null,
      revision: 0,
      stateHash: digest(state),
      requestHash: null,
    };
  return {
    commit() {
      tx.create(c.ref, context);
      tx.create(c.stateRef, state);
      tx.create(at.event, event);
      tx.create(at.proof, { schemaVersion: 1, eventHash: digest(event) });
    },
  };
}
export async function reserveApplicationCommit(tx, l, method, r) {
  assertApplicationOpening(tx, l);
  const revision = l.state.revision + 1,
    at = refs(l.c, revision),
    opRef = l.c.db.doc(l.c.path + '/operations/' + r.operationId);
  integer(revision, 1);
  for (const ref of [at.event, at.proof, opRef]) if ((await tx.get(ref)).exists) conflict();
  return (value) => {
    const state = validateApplicationState(
        { ...value, schemaVersion: 2, revision, lastOperationId: r.operationId },
        l.context,
      ),
      progress = applicationView({ ...l, state }),
      event = {
        schemaVersion: 2,
        contextHash: digest(l.context),
        token: l.token,
        revision,
        stateHash: digest(state),
        requestHash: digest(r),
        operationId: r.operationId,
        method,
        progress,
      };
    return {
      result: { receipt: progress, progress },
      commit() {
        tx.update(l.c.stateRef, state);
        tx.create(at.event, event);
        tx.create(at.proof, { schemaVersion: 1, eventHash: digest(event) });
        tx.create(opRef, { schemaVersion: 1, revision, eventHash: digest(event) });
      },
    };
  };
}
export async function prepareApplicationCancellation(tx, l, operationId) {
  assertApplicationOpening(tx, l);
  bookContentId(operationId);
  const r = { id: l.c.id, requestHash: l.context.requestHash, jobToken: l.token, operationId },
    replay = await replayApplicationOperation(tx, l, 'cancelLoreAnalysisApplication', r);
  if (replay) return { result: replay.progress, commit() {} };
  if (['cancelling', 'cancelled'].includes(l.state.phase))
    return { result: applicationView(l), commit() {} };
  const present = await childrenPresent(tx, l.c, l.context),
    next = applicationWorkflowState(l),
    finish = await reserveApplicationCommit(tx, l, 'cancelLoreAnalysisApplication', r);
  next.phase = present ? 'cancelling' : 'cancelled';
  if (!present) next.cleanup.member = l.context.members.length;
  const plan = finish(next);
  return { result: plan.result.progress, commit: plan.commit };
}
