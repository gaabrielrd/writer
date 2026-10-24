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
function eventValue(l, state, request = null) {
  return {
    schemaVersion: 1,
    contextHash: digest(l.context),
    token: state.revision === 0 ? null : l.token,
    revision: state.revision,
    stateHash: digest(state),
    requestHash: request === null ? null : digest(request),
  };
}
async function pair(tx, c, revision) {
  const at = refs(c, revision),
    event = await tx.get(at.event),
    proof = await tx.get(at.proof);
  if (!immutable(event) || !immutable(proof) || !bornEqual(event, proof)) conflict();
  closed(proof.data(), ['schemaVersion', 'eventHash']);
  closed(event.data(), [
    'schemaVersion',
    'contextHash',
    'token',
    'revision',
    'stateHash',
    'requestHash',
  ]);
  if (proof.data().schemaVersion !== 1 || proof.data().eventHash !== digest(event.data()))
    conflict();
  return { snapshot: event, record: event.data() };
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
    state = stateSnapshot.data();
  closed(state, ['schemaVersion', 'phase', 'revision', 'lastOperationId']);
  integer(state.revision);
  if (
    state.schemaVersion !== 1 ||
    !['preparing', 'cancelled'].includes(state.phase) ||
    (context.kind === 'fence' && state.phase !== 'cancelled') ||
    (state.revision === 0
      ? state.lastOperationId !== null
      : typeof state.lastOperationId !== 'string')
  )
    conflict();
  const l = { c, snapshot, context, token, state, stateSnapshot },
    initial = await pair(tx, c, 0);
  if (
    !bornEqual(initial.snapshot, snapshot) ||
    initial.record.schemaVersion !== 1 ||
    initial.record.contextHash !== digest(context) ||
    initial.record.revision !== 0 ||
    initial.record.token !== null ||
    initial.record.requestHash !== null
  )
    conflict();
  const current = state.revision === 0 ? initial : await pair(tx, c, state.revision);
  if (
    !bornEqual(current.snapshot, { createTime: stateSnapshot.updateTime }) ||
    current.record.contextHash !== digest(context) ||
    current.record.schemaVersion !== 1 ||
    current.record.token !== (state.revision === 0 ? null : token) ||
    current.record.revision !== state.revision ||
    current.record.stateHash !== digest(state) ||
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
  openings.set(l, tx);
  return l;
}
export async function assertApplicationChildrenAbsent(tx, c, context, starting = false) {
  const paths = context.kind === 'fence' ? [] : applicationChildPaths(c, context);
  if (starting && context.kind === 'reservation')
    for (const member of context.members)
      if (member.scope === 'global' && member.source === null)
        paths.push('universes/' + context.universeId + '/lore/' + member.targetId);
  const results = await Promise.allSettled(
    paths.map((path) => readWorkMetadata(tx, c.db.doc(path), [])),
  );
  const failure = results.find((r) => r.status === 'rejected');
  if (failure) throw failure.reason;
  if (results.some((r) => r.value.exists)) conflict();
}
export async function prepareApplicationInitialization(tx, c, context, phase = 'preparing') {
  validateContext(context, c);
  if (phase !== (context.kind === 'fence' ? 'cancelled' : 'preparing')) conflict();
  const at = refs(c, 0);
  for (const ref of [c.stateRef, at.event, at.proof]) if ((await tx.get(ref)).exists) conflict();
  await assertApplicationChildrenAbsent(tx, c, context, true);
  const state = { schemaVersion: 1, phase, revision: 0, lastOperationId: null },
    event = eventValue({ context, token: null }, state);
  return {
    commit() {
      tx.create(c.ref, context);
      tx.create(c.stateRef, state);
      tx.create(at.event, event);
      tx.create(at.proof, { schemaVersion: 1, eventHash: digest(event) });
    },
  };
}
export async function prepareApplicationCancellation(tx, l, operationId) {
  if (openings.get(l) !== tx) conflict();
  bookContentId(operationId);
  if (l.state.phase === 'cancelled') return { result: applicationView(l), commit() {} };
  await assertApplicationChildrenAbsent(tx, l.c, l.context);
  const revision = l.state.revision + 1,
    at = refs(l.c, revision);
  integer(revision, 1);
  if ((await tx.get(at.event)).exists || (await tx.get(at.proof)).exists) conflict();
  const state = { schemaVersion: 1, phase: 'cancelled', revision, lastOperationId: operationId },
    event = eventValue(l, state, {
      id: l.c.id,
      requestHash: l.context.requestHash,
      jobToken: l.token,
      operationId,
    }),
    result = applicationView({ ...l, state });
  return {
    result,
    commit() {
      tx.update(l.c.stateRef, state);
      tx.create(at.event, event);
      tx.create(at.proof, { schemaVersion: 1, eventHash: digest(event) });
    },
  };
}
