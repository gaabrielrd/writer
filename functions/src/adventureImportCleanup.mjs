import { adventureImportIds, importInconsistent, importSum } from './adventureImportContracts.mjs';
import { workSourceKey, workGroupKey } from './workProgressLedger.mjs';

// Six indices are at most 42 document deletions, plus the caller's control/receipt writes.
export function prepareAdventureImportCleanup(tx, { db, uid, importId, job }) {
  if (job.state !== 'deleting') importInconsistent();
  const start = job.cleanedSections,
    end = importSum(start, Math.min(6, job.uploadedSections - start));
  const target = { kind: 'adventure', id: job.adventureId },
    paths = [];
  for (let index = start; index < end; index++) {
    const { partId, sceneId } = adventureImportIds(uid, importId, index),
      root = 'adventures/' + job.adventureId;
    paths.push(
      `users/${uid}/adventureImports/${importId}/sections/${String(index).padStart(16, '0')}`,
      `${root}/parts/${partId}`,
      `${root}/scenes/${sceneId}`,
      `${root}/scenes/${sceneId}/body/current`,
      `${root}/scenes/${sceneId}/planning/current`,
      `${root}/workWordSources/${workSourceKey('scene', sceneId)}`,
      `${root}/workWordGroups/${workGroupKey(target, partId)}`,
    );
  }
  if (start === job.uploadedSections)
    paths.push(`adventures/${job.adventureId}/workProgress/current`);
  return {
    patch: {
      cleanedSections: end,
      ...(start === job.uploadedSections ? { state: 'deleted' } : {}),
    },
    index: start === job.uploadedSections ? null : start,
    commit() {
      for (const path of paths) tx.delete(db.doc(path));
    },
  };
}
