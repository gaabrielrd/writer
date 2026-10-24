import { born } from './bookRestoreUploadContracts.mjs';
import { digest } from './workProgressContracts.mjs';
import { openCreationUploadSource } from './bookLoreCreationSource.mjs';
import { editReservationConflict as conflict } from './bookLoreEditReservationContracts.mjs';
/** A creation has no source head, base, source update or source inspection. */
export async function creationCompositionSource(tx, c, intent, expected = null) {
  const opened = await openCreationUploadSource(tx, c, intent),
    l = opened.loaded,
    metadata = {
      fields: [],
      dates: {},
      ranges: {},
      relations: { present: false, count: 0, pages: 0 },
      isPublic: { present: false, value: null },
    },
    sourceContext = {
      intent,
      bookBirth: born(l.root),
      creationBirth: born(l.snapshot),
      sourceMode: 'creation',
      metadataHash: digest(metadata),
    };
  if (expected && digest(expected) !== digest(sourceContext)) conflict();
  return {
    sourceContext,
    source: {
      loaded: l,
      metadata,
      source: { book: { snapshot: l.root }, opened: { mode: 'creation', storage: null } },
    },
  };
}
