import { readWorkMetadata, digest } from './workProgressContracts.mjs';
import { adventureDeletionInconsistent as invalid } from './adventureDeletionContracts.mjs';
export async function prepareAdventureDeletionActivity(tx, db, p) {
  const target = { kind: 'adventure', id: p.adventureId },
    ref = db.doc('users/' + p.ownerId + '/workActivity/' + digest(target)),
    snapshot = await readWorkMetadata(tx, ref, ['target.kind', 'target.id', 'kind']),
    rows = await tx.get(
      db
        .collection('users/' + p.ownerId + '/workActivity')
        .where('target.kind', '==', 'adventure')
        .where('target.id', '==', p.adventureId)
        .select('target.kind', 'target.id')
        .limit(2),
    );
  if (
    rows.docs.length !== Number(snapshot.exists) ||
    rows.docs.some((s) => s.ref.path !== ref.path)
  )
    invalid();
  if (snapshot.exists) {
    const v = snapshot.data();
    if (v.target?.kind !== target.kind || v.target.id !== target.id || v.kind !== target.kind)
      invalid();
    const stateRef = db.doc('users/' + p.ownerId + '/workActivityState/current'),
      state = await readWorkMetadata(tx, stateRef, ['revision', 'accessedAt']);
    const s = state.data();
    if (
      !state.exists ||
      !Number.isSafeInteger(s.revision) ||
      s.revision < 0 ||
      !Number.isSafeInteger(s.revision + 1) ||
      !Number.isSafeInteger(s.accessedAt) ||
      s.accessedAt < 0 ||
      s.accessedAt > 8640000000000000
    )
      invalid();
    tx.update(stateRef, { revision: s.revision + 1 });
    tx.delete(ref);
  }
  return {
    ...p,
    phase: 'verify',
    part: 0,
    cursor: null,
    deletedDocuments: p.deletedDocuments + Number(snapshot.exists),
    certified: [...p.certified, 'activity'],
  };
}
