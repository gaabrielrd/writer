import { workScope, workProject, readWorkMetadata } from './workProgressContracts.mjs';
// Current labels only. No label is journaled or claimed as the captured historical name.
const fields = {
  book: [null, 'title'],
  act: ['acts', 'name'],
  chapter: ['chapters', 'title'],
  scene: ['scenes', 'title'],
  arc: ['arcs', 'title'],
  event: ['timelineEvents', 'title'],
  plan: ['literaryPlans', 'plan.title'],
  workflow: ['literaryWorkflowJobs', 'chapterTitle'],
  sequence: ['literarySequenceJobs', 'bookTitle'],
  publication: ['literaryPublications', 'title'],
};
export async function readLiteraryImpactLabel(tx, c, node) {
  if (node.scopeKind !== 'book' || !Object.hasOwn(fields, node.kind)) return null;
  const source = workScope(c.db, c.uid, { target: { kind: 'book', id: node.scopeId } }, []);
  await workProject(tx, source);
  const [collection, field] = fields[node.kind],
    path = collection ? source.path + '/' + collection + '/' + node.id : source.path;
  const row = await readWorkMetadata(tx, c.db.doc(path), [field, 'deleting']);
  if (!row.exists || row.data().deleting) return null;
  const label = field.split('.').reduce((value, key) => value?.[key], row.data());
  return typeof label === 'string' && label.isWellFormed() && label.length <= 300 ? label : null;
}
