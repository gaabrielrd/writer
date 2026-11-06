import { normalizeLiteraryCollaboration } from './literaryCollaborationProtocol.mjs';
import { readWorkMetadata, workFail, workRevision } from './workProgressContracts.mjs';
// Caller authorizes the book before this metadata-only projection.
export async function readLiteraryCollaboration(tx, c) {
  const snapshot = await readWorkMetadata(tx, c.db.doc(c.path + '/literaryProduction/current'), [
    'revision',
    'contract.collaborationPolicy',
  ]);
  const row = snapshot.data();
  let policy;
  try {
    policy = normalizeLiteraryCollaboration(row?.contract?.collaborationPolicy);
  } catch {
    workFail('failed-precondition', 'Confira o modo de colaboração salvo no contrato.');
  }
  const revision = row ? workRevision(row.revision) : 0;
  if (row && revision < 1) workFail('failed-precondition', 'Revisão editorial indisponível.');
  return { ...policy, revision, configured: row?.contract?.collaborationPolicy !== undefined };
}
export function assertLiteraryProseApplication(binding) {
  if (binding.mode === 'guidance')
    workFail(
      'failed-precondition',
      'O contrato está em orientação: use as análises e sugestões para conduzir a escrita.',
      'collaboration-guidance',
    );
}
