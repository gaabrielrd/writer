import { digest } from './sceneContracts.mjs';
import { sourceKey } from './narrativeContracts.mjs';
import { sceneLoreLinkId } from './sceneLoreIndex.mjs';
import { inconsistent } from './bookRestoreUploadContracts.mjs';
import { BOOK_RESTORE_RESOURCE_CHILDREN } from './bookRestoreResourcePaths.mjs';
/** Native pending resources; derived counts are reconciled before any root activation. */
export function projectBookRestoreResource(value, uid, timestamp) {
  const { kind, id, parentId, data } = value;
  const key = Object.hasOwn(BOOK_RESTORE_RESOURCE_CHILDREN, kind) ? parentId + ':' + id : id;
  let native;
  if (kind === 'scene')
    native = {
      ...data,
      schemaVersion: 1,
      revision: 1,
      id,
      ownerId: uid,
      wordCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  else if (['arc', 'milestone', 'event'].includes(kind))
    native = {
      ...data,
      kind,
      schemaVersion: 1,
      revision: 1,
      id,
      ownerId: uid,
      referenceCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  else if (kind === 'scene-control')
    native = {
      ...data,
      id: null,
      ownerId: uid,
      schemaVersion: 1,
      revision: 1,
      assemblyRevision: 0,
      structureRevision: 0,
      wordCount: 0,
      sceneCount: 0,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
  else if (kind === 'scene-source') native = { ...data, id, createdAt: timestamp };
  else if (kind === 'narrative-control')
    native = {
      ...data,
      structureRevision: 0,
      rebalancing: false,
      updatedAt: timestamp,
    };
  else if (kind === 'narrative-link')
    native = {
      ...data,
      id,
      sourceKey: sourceKey(data.source),
      sourceArcId:
        data.source.kind === 'milestone'
          ? data.source.arcId
          : data.source.kind === 'arc'
            ? data.source.id
            : null,
      ...(data.reference.kind === 'lore' ? { loreKey: digest(data.reference.reference) } : {}),
    };
  else if (['scene-body', 'scene-planning', 'scene-reference'].includes(kind)) native = { ...data };
  else inconsistent();
  const writes = [
    {
      kind,
      id: key,
      value: native,
      ...(['scene-reference', 'narrative-link'].includes(kind) ? { replace: true } : {}),
    },
  ];
  if (kind === 'scene-reference') {
    const linkId = sceneLoreLinkId(parentId, data);
    writes.push({
      kind: 'scene-lore-link',
      id: linkId,
      replace: true,
      value: { id: linkId, sceneId: parentId, reference: data, loreKey: digest(data) },
    });
  }
  return writes;
}
