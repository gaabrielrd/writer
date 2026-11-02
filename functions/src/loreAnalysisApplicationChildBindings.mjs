import { bornEqual, closed, integer, restoreHash } from './bookRestoreUploadContracts.mjs';
import { digest, readWorkMetadata } from './workProgressContracts.mjs';
import {
  applicationPaths,
  applicationConflict as conflict,
} from './loreAnalysisApplicationContracts.mjs';
import {
  loadApplication,
  assertApplicationOpening,
  readApplicationEvent,
} from './loreAnalysisApplicationStore.mjs';
import { assertApplicationSourceOpening } from './loreAnalysisApplicationSource.mjs';
import {
  applicationChildren,
  analysisChildPaths,
  reservedAnalysisChild,
} from './loreAnalysisApplicationChildContracts.mjs';
import { readPreparedApplicationMember } from './loreAnalysisApplicationProduction.mjs';
import { editReservationRequest } from './bookLoreEditReservationContracts.mjs';
import { applicationAdoptionBatchId } from './loreAnalysisApplicationApplyContracts.mjs';
const permits = new WeakMap();
const adoptions = new WeakMap();
const batchOpenings = new WeakMap();
const immutable = (s) => s.exists && bornEqual(s, { createTime: s.updateTime });
export function resetApplicationChildPermits(tx, l) {
  assertApplicationOpening(tx, l);
  permits.set(tx, new Map());
  adoptions.delete(tx);
}
export async function readOwnedAnalysisChild(tx, c, kind, id, parent = null) {
  if (!reservedAnalysisChild(kind, id)) return null;
  const at = analysisChildPaths(c.db, c.uid, { kind, id }),
    root = await readWorkMetadata(tx, at.root, ['startHash']),
    owner = await tx.get(at.owner),
    proof = await tx.get(at.proof);
  if (!root.exists && !owner.exists && !proof.exists) return null;
  if (
    !root.exists ||
    !immutable(owner) ||
    !immutable(proof) ||
    !bornEqual(root, owner) ||
    !bornEqual(owner, proof)
  )
    conflict();
  const v = owner.data(),
    anchor = proof.data();
  closed(v, [
    'schemaVersion',
    'applicationId',
    'applicationToken',
    'requestHash',
    'member',
    'kind',
    'id',
    'startHash',
    'intentHash',
    'unitRevision',
    'operationId',
  ]);
  closed(anchor, ['schemaVersion', 'ownerHash']);
  if (
    v.schemaVersion !== 1 ||
    anchor.schemaVersion !== 1 ||
    anchor.ownerHash !== digest(v) ||
    v.kind !== kind ||
    v.id !== id ||
    root.data().startHash !== v.startHash
  )
    conflict();
  integer(v.member);
  integer(v.unitRevision, 1);
  restoreHash(v.intentHash);
  restoreHash(v.startHash);
  const l =
    parent ??
    (await loadApplication(tx, applicationPaths(c.db, c.uid, v.applicationId), {
      requestHash: v.requestHash,
      jobToken: v.applicationToken,
    }));
  if (!l) conflict();
  assertApplicationOpening(tx, l);
  if (
    v.applicationId !== l.c.id ||
    v.applicationToken !== l.token ||
    v.requestHash !== l.context.requestHash ||
    !applicationChildren(l.context).some(
      (child) => child.member === v.member && child.kind === kind && child.id === id,
    )
  )
    conflict();
  const event = await readApplicationEvent(tx, l, v.unitRevision);
  if (
    event.record.schemaVersion !== 2 ||
    event.record.method !== 'advanceLoreAnalysisApplication' ||
    event.record.operationId !== v.operationId ||
    !bornEqual(event.snapshot, owner)
  )
    conflict();
  return { l, child: { member: v.member, kind, id }, at, record: v, root };
}
/** Only the reauthorized parent coordinator may authorize an individual producer. */
export async function prepareAnalysisChildBinding(tx, l, child, startHash, intent, operationId) {
  assertApplicationOpening(tx, l);
  assertApplicationSourceOpening(tx, l);
  if (
    l.state.phase !== 'preparing' ||
    !applicationChildren(l.context).some((v) => digest(v) === digest(child))
  )
    conflict();
  const at = analysisChildPaths(l.c.db, l.c.uid, child),
    existing = await readOwnedAnalysisChild(tx, l.c, child.kind, child.id, l);
  let record = existing?.record ?? null;
  if (
    existing &&
    (record.startHash !== startHash || (intent && record.intentHash !== digest(intent)))
  )
    conflict();
  if (!existing) {
    if (!intent) conflict();
    record = {
      schemaVersion: 1,
      applicationId: l.c.id,
      applicationToken: l.token,
      requestHash: l.context.requestHash,
      ...child,
      startHash,
      intentHash: digest(intent),
      unitRevision: l.state.revision + 1,
      operationId,
    };
  }
  const capability = { l, child, role: 'produce' },
    map = permits.get(tx);
  if (!map) conflict();
  map.set(at.key, capability);
  return {
    existing,
    commit() {
      if (!existing) {
        tx.create(at.owner, record);
        tx.create(at.proof, { schemaVersion: 1, ownerHash: digest(record) });
      }
    },
  };
}
export function assertAnalysisChildUnit(
  tx,
  db,
  uid,
  kind,
  id,
  role = 'produce',
  batchPermit = null,
) {
  if (!reservedAnalysisChild(kind, id)) return;
  const at = analysisChildPaths(db, uid, { kind, id }),
    capability = permits.get(tx)?.get(at.key);
  if (
    !capability ||
    capability.role !== role ||
    capability.l.c.uid !== uid ||
    capability.child.kind !== kind ||
    capability.child.id !== id
  )
    conflict();
  assertApplicationOpening(tx, capability.l);
  assertApplicationSourceOpening(tx, capability.l);
  if (role === 'produce') {
    if (capability.l.state.phase !== 'preparing') conflict();
  } else if (role === 'adopt') {
    const opening = batchPermit && batchOpenings.get(batchPermit);
    if (
      capability.l.state.phase !== 'ready' ||
      !opening ||
      opening.tx !== tx ||
      opening.l !== capability.l ||
      adoptions.get(tx)?.currentPermit !== batchPermit
    )
      conflict();
  } else conflict();
}
export async function assertAnalysisSourceChild(tx, c, sourceKind, sourceId, childKind, childId) {
  if (!reservedAnalysisChild(sourceKind, sourceId)) return;
  const source = await readOwnedAnalysisChild(tx, c, sourceKind, sourceId);
  if (!source) conflict();
  const child = applicationChildren(source.l.context).find(
    (v) => v.member === source.child.member && v.kind === childKind && v.id === childId,
  );
  if (!child) conflict();
  const map = permits.get(tx),
    key = analysisChildPaths(c.db, c.uid, child).key;
  let permit = map?.get(key);
  // An edit may read one of its already sealed fields as a dependency.
  // Actual field producers still require their own exact capability above.
  if (!permit && childKind === 'field') {
    permit = [...(map?.values() ?? [])].find(
      (value) => value.child.kind === 'edit' && value.child.member === source.child.member,
    );
    if (permit && !(await readOwnedAnalysisChild(tx, c, childKind, childId, source.l))) conflict();
  }
  if (!permit) conflict();
  assertAnalysisChildUnit(
    tx,
    c.db,
    c.uid,
    permit.child.kind,
    permit.child.id,
    permit.role,
    adoptions.get(tx)?.currentPermit ?? null,
  );
  if (permit.l.token !== source.l.token || permit.l.state.revision !== source.l.state.revision)
    conflict();
}

/** Authorize exactly one complete, natively certified ready manifest. */
export async function grantApplicationAdoption(tx, l) {
  assertApplicationOpening(tx, l);
  assertApplicationSourceOpening(tx, l);
  const count = l.context.members.length;
  if (l.state.phase !== 'ready' || l.state.preparedCount !== count) conflict();
  for (const collection of ['prepared', 'preparedProofs']) {
    const rows = await tx.get(
      l.c.db
        .collection(l.c.path + '/' + collection)
        .orderBy('__name__')
        .limit(51)
        .select(),
    );
    if (rows.docs.length !== count || rows.docs.some((d, i) => d.id !== String(i).padStart(4, '0')))
      conflict();
  }
  const results = await Promise.allSettled(
    l.context.members.map((m) => readPreparedApplicationMember(tx, l, m.index)),
  );
  const failure = results.find((r) => r.status === 'rejected');
  if (failure) throw failure.reason;
  const references = results.map((r) => r.value),
    requests = [],
    owners = [];
  for (const m of l.context.members) {
    if (m.scope !== 'local') continue;
    const r = editReservationRequest(l.c.uid, references[m.index].edit, [], true, true),
      owned = await readOwnedAnalysisChild(tx, l.c, 'edit', r.editId, l);
    if (
      !owned ||
      r.editId !== m.children.editId ||
      r.startHash !== owned.record.startHash ||
      r.operationId !== digest(['analysis-adopt-member', l.token, m.index])
    )
      conflict();
    requests.push(r);
    owners.push(owned);
  }
  const localBatch = requests.length
    ? { batchId: applicationAdoptionBatchId(l.token), requests }
    : null;
  resetApplicationChildPermits(tx, l);
  for (const owned of owners)
    permits.get(tx).set(owned.at.key, { l, child: owned.child, role: 'adopt' });
  if (localBatch) adoptions.set(tx, { l, batchHash: digest(localBatch), currentPermit: null });
  return { references, localBatch };
}
/** The aggregate API alone receives the opaque permit; singular adoption never does. */
export function beginAnalysisAdoptionBatch(tx, db, uid, request) {
  if (!request.requests.some((r) => reservedAnalysisChild('edit', r.editId))) return null;
  const session = adoptions.get(tx);
  if (!session) return null;
  if (session.l.c.db !== db || session.l.c.uid !== uid || session.batchHash !== digest(request))
    conflict();
  assertApplicationOpening(tx, session.l);
  assertApplicationSourceOpening(tx, session.l);
  const permit = Object.freeze({});
  batchOpenings.set(permit, { tx, l: session.l });
  session.currentPermit = permit;
  return permit;
}
