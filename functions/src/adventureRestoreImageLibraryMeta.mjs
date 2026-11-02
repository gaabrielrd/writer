import {
  contentClosed as closed,
  contentCount as count,
  contentHash as hash,
} from './adventureContentPrimitives.mjs';
import { adventureAuditPhase } from './adventureRestoreAuditMeta.mjs';
export const ADVENTURE_IMAGE_LIBRARY_PHASES = ['image-library', 'image-library-ready'];
export const adventureImageLibraryPhase = (v) =>
  ADVENTURE_IMAGE_LIBRARY_PHASES.includes(v.phase) ||
  (adventureAuditPhase(v) && Object.hasOwn(v, 'libraryImages'));
export const imageLibraryViewKeys = ['libraryImages', 'libraryUses'];
export const imageLibraryPrivateKeys = ['libraryAfter', 'librarySourceAudit'];
export const validAdventureImageLibraryView = (v) => imageLibraryViewKeys.every((k) => count(v[k]));
export function validAdventureImageLibraryMeta(v, job) {
  const s = v.librarySourceAudit,
    ready = v.phase !== 'image-library';
  return (
    validAdventureImageLibraryView(v) &&
    v.libraryUses === v.libraryImages &&
    v.libraryImages <= v.storagePrepared &&
    (v.libraryImages === 0
      ? v.libraryAfter === null
      : typeof v.libraryAfter === 'string' &&
        /^image-storage-[a-f0-9]{64}$/.test(v.libraryAfter)) &&
    closed(s, ['operationId', 'checkpoint', 'artifactCount', 'contextToken', 'jobHash']) &&
    typeof s.operationId === 'string' &&
    /^[a-zA-Z0-9-]{16,80}$/.test(s.operationId) &&
    count(s.checkpoint) &&
    s.checkpoint < job.checkpoint &&
    count(s.artifactCount) &&
    hash(s.contextToken) &&
    hash(s.jobHash) &&
    v.artifactCount === s.artifactCount + 2 * v.libraryImages &&
    (!ready || v.libraryImages === v.imageAssets)
  );
}
