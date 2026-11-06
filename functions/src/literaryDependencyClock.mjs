import { workProject, workRevision, workFail, readWorkMetadata } from './workProgressContracts.mjs';

// A relational clock, independent of prose/editorial semantics. Metadata-only
// artifact creation invalidates impact inventory without staling its own writing.
// Prepare inside EACH transaction attempt, before any writes. Never cache by tx:
// Firestore may reuse its Transaction object across retry attempts.
function stage(tx, ref, root) {
  const revision = workRevision(workRevision(root.literaryDependencyRevision ?? 0) + 1);
  let committed = false;
  return {
    revision,
    commit() {
      if (committed) return;
      committed = true;
      tx.update(ref, { literaryDependencyRevision: revision, hasLiteraryResources: true });
    },
  };
}
export async function prepareLiteraryDependencyWrite(tx, c) {
  const root = await workProject(tx, c);
  if (c.target.kind !== 'book')
    workFail('invalid-argument', 'Os vínculos literários exigem um livro.');
  return stage(tx, c.ref, root);
}
// Expiration runs without an interactive user. It never grants access to bodies.
// A removed/deleting parent cannot have a readable live impact map.
export async function prepareLiteraryDependencyCleanup(tx, db, bookPath) {
  if (typeof bookPath !== 'string' || !/^books\/[^/]+$/.test(bookPath))
    workFail('failed-precondition', 'Origem da limpeza literária inválida.');
  const ref = db.doc(bookPath),
    row = await readWorkMetadata(tx, ref, ['authorId', 'deleting', 'literaryDependencyRevision']);
  const root = row.data();
  if (!root || root.deleting) return { revision: null, commit() {} };
  if (typeof root.authorId !== 'string' || !root.authorId)
    workFail('failed-precondition', 'Autoria da origem indisponível.');
  return stage(tx, ref, root);
}
