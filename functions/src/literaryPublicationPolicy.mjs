import { normalizeLiteraryPublicationPolicy } from './literaryPublicationPolicyProtocol.mjs';
import { readWorkMetadata, workFail, workRevision } from './workProgressContracts.mjs';

// Caller authorizes the native book before reading this metadata-only projection.
export async function readLiteraryPublicationPolicy(tx, c) {
  const snapshot = await readWorkMetadata(tx, c.db.doc(c.path + '/literaryProduction/current'), [
    'revision',
    'contract.schemaVersion',
    'contract.publicationPolicy',
  ]);
  const row = snapshot.data();
  if (!row) return { revision: 0, policy: null };
  const revision = workRevision(row.revision);
  if (revision < 1 || row.contract?.schemaVersion !== 1)
    workFail('failed-precondition', 'Confira o contrato salvo antes de preparar a publicação.');
  let policy;
  try {
    policy = normalizeLiteraryPublicationPolicy(row.contract.publicationPolicy);
  } catch {
    workFail('failed-precondition', 'Confira a unidade de publicação salva no contrato.');
  }
  return { revision, policy };
}
