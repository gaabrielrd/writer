import { readBookRestoreArtifact } from './bookRestoreArtifacts.mjs';
import { bornEqual, inconsistent } from './bookRestoreUploadContracts.mjs';
import {
  validateEditorialMaterialization,
  editorialArtifactCount,
} from './bookRestoreEditorialBodyContracts.mjs';
export async function readProtectedBookRestoreEditorialArtifact(
  tx,
  db,
  loaded,
  kind,
  id,
  optional = false,
) {
  const metadata = await readBookRestoreArtifact(tx, db, loaded, kind, id, {
    metadataOnly: true,
    optional,
  });
  return metadata === null ? null : readBookRestoreArtifact(tx, db, loaded, kind, id);
}
export function assertEditorialSameCommit(first, second) {
  if (
    !first?.exists ||
    !second?.exists ||
    !bornEqual({ createTime: first.updateTime }, { createTime: second.updateTime })
  )
    inconsistent();
}
export async function readBookRestoreEditorialControl(tx, db, loaded) {
  if (loaded.job.cleanupVersion < 15) return null;
  const value = await readProtectedBookRestoreEditorialArtifact(
    tx,
    db,
    loaded,
    'editorial-control',
    'current',
  );
  validateEditorialMaterialization(value.value);
  assertEditorialSameCommit(value.snapshot, loaded.snapshot);
  if (
    value.value.sourceSha256 !== loaded.job.source.sha256 ||
    value.value.sourceBookId !== loaded.job.validationSummary.sourceBookId ||
    editorialArtifactCount(value.value) !== loaded.job.preparation.artifactCount ||
    loaded.job.preparation.editorialAddedArtifacts !==
      loaded.job.preparation.artifactCount - value.value.baseArtifacts
  )
    inconsistent();
  return value;
}
