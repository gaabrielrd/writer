import { assertBookEditorialReviewNamespacesEmpty } from './bookRestoreEditorialInventory.mjs';
import { verifyBookRestoreEditorialAudit } from './bookRestoreEditorialAudit.mjs';
import { readBookRestoreArtifact, prepareBookRestoreArtifacts } from './bookRestoreArtifacts.mjs';
import { nativeRestoreToken } from './bookRestoreIntegrityRead.mjs';
import { inconsistent } from './bookRestoreUploadContracts.mjs';

export const isBookRestoreEditorial = (job) =>
  job.source?.format === 'writer-book-archive' && job.source.version === 2;

/** Native census proof for a private copy. Never takes certificates from the caller. */
export async function prepareBookRestoreEditorialActivation(tx, db, loaded, readOp) {
  const proof = await verifyBookRestoreEditorialAudit(tx, db, loaded, readOp);
  await assertBookEditorialReviewNamespacesEmpty(tx, db, loaded);
  const value = proof.control.value,
    heads = value.heads;
  const contract =
    heads.contracts === 0
      ? null
      : await readBookRestoreArtifact(tx, db, loaded, 'editorial-contract', 'current');
  return {
    seal: proof.seal,
    certificate: {
      schemaVersion: 1,
      contextToken: proof.contextToken,
      controlToken: nativeRestoreToken(proof.control.snapshot),
      sealToken: nativeRestoreToken(proof.seal),
    },
    summary: {
      artifacts: value.artifacts,
      links: value.links,
      contracts: heads.contracts,
      plans: heads.plans,
      reviewsRequired: heads.contracts + heads.plans,
      historicalExecutions: 'disabled',
    },
    rootState: {
      hasLiteraryResources: true,
      hasLiteraryArchiveResources: true,
      ...(contract?.value.contract.publicationPolicy ? { hasLiteraryPublications: true } : {}),
      literaryRevision: heads.contracts + heads.plans > 0 ? 1 : 0,
      literaryContextRevision: heads.contracts + heads.plans > 0 ? 1 : 0,
      literaryDependencyRevision: 0,
    },
  };
}

/** Retire an uncertain activation even when new activation is disabled.
 * The base seal stays immutable; only the native editorial census seal advances.
 */
export async function prepareBookRestoreEditorialRetirement(tx, db, loaded, readOp, operationId) {
  const proof = await verifyBookRestoreEditorialAudit(tx, db, loaded, readOp);
  const value = structuredClone(proof.control.value);
  value.census.sealOperationId = operationId;
  const effects = await prepareBookRestoreArtifacts(tx, db, loaded, operationId, [
    { kind: 'editorial-control', id: 'current', value, replace: true },
  ]);
  if (effects.created !== 0) inconsistent();
  return effects;
}
