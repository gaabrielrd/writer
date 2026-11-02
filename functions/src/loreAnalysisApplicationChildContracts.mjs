import { digest } from './workProgressContracts.mjs';
import { applicationConflict as conflict } from './loreAnalysisApplicationContracts.mjs';
export const analysisChildCollections = {
  creation: 'bookLoreCreations',
  inspection: 'bookLoreSourceInspections',
  field: 'bookLoreFieldUploads',
  edit: 'bookLoreEdits',
};
const prefixes = {
  creation: 'analysis-',
  inspection: 'analysis-source-',
  field: 'analysis-field-',
  edit: 'analysis-edit-',
};
export function reservedAnalysisChild(kind, id) {
  const prefix = prefixes[kind];
  return (
    typeof id === 'string' &&
    prefix &&
    id.startsWith(prefix) &&
    /^[a-f0-9]{64}$/.test(id.slice(prefix.length))
  );
}
export function applicationChildren(context) {
  return context.members.flatMap((m) => [
    ...(m.children.creationId
      ? [{ member: m.index, kind: 'creation', id: m.children.creationId }]
      : []),
    ...(m.children.inspectionId
      ? [{ member: m.index, kind: 'inspection', id: m.children.inspectionId }]
      : []),
    ...m.children.uploads.map((u) => ({ member: m.index, kind: 'field', id: u.uploadId })),
    ...(m.children.editId ? [{ member: m.index, kind: 'edit', id: m.children.editId }] : []),
  ]);
}
export function analysisChildPaths(db, uid, child) {
  if (!reservedAnalysisChild(child.kind, child.id)) conflict();
  const key = digest({ kind: child.kind, id: child.id }),
    base = 'users/' + uid + '/';
  return {
    key,
    root: db.doc(base + analysisChildCollections[child.kind] + '/' + child.id),
    owner: db.doc(base + 'loreAnalysisChildOwners/' + key),
    proof: db.doc(base + 'loreAnalysisChildOwnerProofs/' + key),
  };
}
