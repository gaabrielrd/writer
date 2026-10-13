import { digest } from './sceneContracts.mjs';
export const sceneLoreLinkId = (sceneId, reference) => digest({ sceneId, reference });
export function writeSceneLoreIndex(tx, db, projectPath, sceneId, reference, remove = false) {
  const id = sceneLoreLinkId(sceneId, reference),
    ref = db.doc(`${projectPath}/sceneLoreLinks/${id}`);
  if (remove) tx.delete(ref);
  else tx.set(ref, { id, sceneId, reference, loreKey: digest(reference) });
}
