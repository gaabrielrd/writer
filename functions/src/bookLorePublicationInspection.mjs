import { createSHA256 } from 'hash-wasm';
import { readBookLoreRecordPart } from './bookLoreStorageRead.mjs';
import {
  createBookLoreFieldValidation,
  advanceBookLoreFieldValidation,
  finishBookLoreFieldValidation,
} from './bookLoreFieldValidation.mjs';
import { publicationOverrides, publicationObservers } from './bookLorePublicationValidation.mjs';
import { inspectionConflict as conflict } from './bookLoreSourceInspectionContracts.mjs';
/** One native field part; only syntax, hash state and match positions survive the call. */
export async function advancePublicationOverride(tx, opened, state, candidate) {
  const keys = publicationOverrides(opened),
    key = keys[state.fieldIndex];
  if (!key) conflict();
  const hasher = await createSHA256(),
    part = await readBookLoreRecordPart(tx, opened, 'field', 0, state.partIndex, key);
  if (state.partIndex === 0) {
    if (state.validation !== null || state.hashState !== null) conflict();
  } else {
    const saved = Buffer.from(state.hashState ?? '', 'base64');
    if (saved.length !== hasher.save().length || saved.toString('base64') !== state.hashState)
      conflict();
    hasher.load(saved);
  }
  state.validation = advanceBookLoreFieldValidation(
    state.validation ?? createBookLoreFieldValidation({ field: key }),
    part.bytes,
    publicationObservers(state, candidate, [key])[key],
  );
  if (state.validation.field !== key) conflict();
  hasher.update(part.bytes);
  state.partIndex++;
  if (state.partIndex === part.manifest.chunkCount) {
    const result = finishBookLoreFieldValidation(state.validation);
    if (
      result.byteLength !== part.manifest.byteLength ||
      hasher.digest() !== part.manifest.contentHash
    )
      conflict();
    state.fieldIndex++;
    state.partIndex = 0;
    state.validation = null;
    state.hashState = null;
  } else state.hashState = Buffer.from(hasher.save()).toString('base64');
  return state.fieldIndex === keys.length;
}
