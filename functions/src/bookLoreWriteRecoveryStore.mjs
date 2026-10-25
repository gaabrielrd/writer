import { createHash } from 'node:crypto';
import { born, bornEqual, closed, integer } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import {
  recoveryIntent,
  recoveryRequestHash,
  immutableRecovery,
  recoveryToken,
  recoveryConflict as conflict,
} from './bookLoreWriteRecoveryContracts.mjs';
// Wait for sibling reads to settle before a native transaction rejects.
export async function settledRecoveryReads(promises) {
  const results = await Promise.allSettled(promises),
    failed = results.find((r) => r.status === 'rejected');
  if (failed) throw failed.reason;
  return results.map((r) => r.value);
}
export const keyHash = (bytes) => createHash('sha256').update(bytes).digest('hex');
export function readRecoveryKey(snapshot, l) {
  if (!immutableRecovery(snapshot) || !bornEqual(snapshot, l.root)) conflict();
  const v = snapshot.data();
  closed(v, ['schemaVersion', 'keyBase64']);
  if (
    v.schemaVersion !== 1 ||
    typeof v.keyBase64 !== 'string' ||
    !/^[A-Za-z0-9+/]{43}=$/.test(v.keyBase64)
  )
    conflict();
  const bytes = Buffer.from(v.keyBase64, 'base64');
  if (
    bytes.length !== 32 ||
    bytes.toString('base64') !== v.keyBase64 ||
    keyHash(bytes) !== l.value.keyId
  )
    conflict();
  return v.keyBase64;
}
export async function loadBookLoreWriteRecovery(tx, c, r) {
  const [root, proof, terminal, terminalProof] = await settledRecoveryReads([
    tx.get(c.root),
    tx.get(c.proof),
    tx.get(c.closed),
    tx.get(c.closedProof),
  ]);
  if (!root.exists) {
    if (proof.exists || terminal.exists || terminalProof.exists) conflict();
    return null;
  }
  if (!immutableRecovery(root) || !immutableRecovery(proof) || !bornEqual(root, proof)) conflict();
  const v = root.data(),
    p = proof.data();
  closed(
    v,
    ['schemaVersion', 'ownerId', 'writeId', 'requestHash', 'kind', 'createdAt'],
    ['intent', 'bookBirth', 'sourceBirth', 'keyId', 'keyInventory'],
  );
  closed(p, ['schemaVersion', 'hash']);
  if (
    v.schemaVersion !== 1 ||
    p.schemaVersion !== 1 ||
    p.hash !== digest(v) ||
    v.ownerId !== c.uid ||
    v.writeId !== c.id ||
    v.requestHash !== r.requestHash ||
    !['recovery', 'fence'].includes(v.kind) ||
    (Object.hasOwn(v, 'keyInventory') && (v.kind !== 'recovery' || v.keyInventory !== 1))
  )
    conflict();
  integer(v.createdAt);
  if (!Number.isFinite(new Date(v.createdAt).getTime())) conflict();
  if (v.kind === 'recovery') {
    const intent = recoveryIntent(c.uid, v.intent);
    if (
      intent.writeId !== c.id ||
      recoveryRequestHash(c.uid, intent) !== v.requestHash ||
      !/^[a-f0-9]{64}$/.test(v.keyId ?? '')
    )
      conflict();
    born({ createTime: v.bookBirth });
    born({ createTime: v.sourceBirth });
  } else if (['intent', 'bookBirth', 'sourceBirth', 'keyId'].some((k) => Object.hasOwn(v, k)))
    conflict();
  const token = recoveryToken(c, root);
  if (r.jobToken !== undefined && r.jobToken !== token) conflict();
  if (terminal.exists !== terminalProof.exists) conflict();
  if (terminal.exists) {
    if (
      v.kind !== 'recovery' ||
      !immutableRecovery(terminal) ||
      !immutableRecovery(terminalProof) ||
      !bornEqual(terminal, terminalProof)
    )
      conflict();
    const t = terminal.data(),
      tp = terminalProof.data();
    closed(t, ['schemaVersion', 'jobToken']);
    closed(tp, ['schemaVersion', 'hash']);
    if (
      t.schemaVersion !== 1 ||
      tp.schemaVersion !== 1 ||
      t.jobToken !== token ||
      tp.hash !== digest(t)
    )
      conflict();
    const a = born(root),
      b = born(terminal);
    if (b.seconds < a.seconds || (b.seconds === a.seconds && b.nanoseconds < a.nanoseconds))
      conflict();
  }
  return { c, root, value: v, token, closed: v.kind === 'fence' || terminal.exists };
}
