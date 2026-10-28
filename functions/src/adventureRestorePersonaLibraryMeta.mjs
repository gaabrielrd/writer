import { ADVENTURE_COUNT_PHASES } from './adventureRestoreCountMeta.mjs';
import { contentCount as count } from './adventureContentPrimitives.mjs';
export const adventurePersonaLibraryPhase = (v) =>
  [
    'persona-library',
    'persona-library-ready',
    'image-bytes',
    'image-bytes-ready',
    'image-storage',
    'image-storage-ready',
    ...ADVENTURE_COUNT_PHASES,
  ].includes(v.phase);
export const adventurePersonaLibraryViewKeys = ['personaLibraryInstalled', 'personaLibraryRevoked'];
export const adventurePersonaLibraryPrivateKeys = ['personaLibraryAfter'];
export const validAdventurePersonaLibraryView = (v) =>
  count(v.personaLibraryInstalled) && typeof v.personaLibraryRevoked === 'boolean';
export function validAdventurePersonaLibraryMeta(v, job) {
  return (
    validAdventurePersonaLibraryView(v) &&
    v.personaLibraryInstalled <= v.personaProfiles &&
    (v.personaLibraryInstalled === 0
      ? v.personaLibraryAfter === null
      : typeof v.personaLibraryAfter === 'string' &&
        /^persona-custom-[a-f0-9]{64}$/.test(v.personaLibraryAfter)) &&
    (v.phase === 'persona-library' || v.personaLibraryInstalled === v.personaProfiles) &&
    (!v.personaLibraryRevoked || ['cancelling', 'cancelled'].includes(job.state)) &&
    (job.state !== 'cancelled' || v.personaLibraryRevoked)
  );
}
