import {
  createBookPortableLoreRelationsValidation,
  advanceBookPortableLoreRelationsPrefixValidation,
  finishBookPortableLoreRelationsValidation,
} from './bookLoreFieldValidation.mjs';
import { bookContentClosed as closed, bookContentInvalid as bad } from './bookBackupSchema.mjs';
export const BOOK_RESTORE_LORE_FRAGMENT_BYTES = 80 * 1024;
export function createBookRestoreLoreTransform() {
  return { schemaVersion: 1, parser: createBookPortableLoreRelationsValidation(), targets: 0 };
}
export function checkBookRestoreLoreTransform(input) {
  closed(input, ['schemaVersion', 'parser', 'targets']);
  if (input.schemaVersion !== 1 || !Number.isSafeInteger(input.targets) || input.targets < 0) bad();
  advanceBookPortableLoreRelationsPrefixValidation(input.parser, new Uint8Array(), undefined, 64);
  if (input.targets < input.parser.relationCount || input.targets > input.parser.relationCount + 1)
    bad();
  return input;
}
/** Source syntax only. Mapping/source authorization and durable cursor proof belong to the host. */
export async function advanceBookRestoreLoreTransform(input, bytes, mapTarget) {
  checkBookRestoreLoreTransform(input);
  if (!(bytes instanceof Uint8Array) || bytes.length > 65536 || typeof mapTarget !== 'function')
    bad();
  const state = structuredClone(input),
    unit = new Uint8Array(bytes),
    fragments = [],
    base = state.parser.byteLength;
  let from = state.parser.role === 'target' ? null : 0,
    target = state.parser.role === 'target' ? state.parser.text : '';
  const result = advanceBookPortableLoreRelationsPrefixValidation(
    state.parser,
    unit,
    {
      text(code, role) {
        if (role === 'target') target += String.fromCodePoint(code);
      },
      position(event, role, position) {
        if (role !== 'target') return;
        const at = position - base;
        if (event === 'start') {
          if (from === null) bad();
          if (at > from) fragments.push({ raw: unit.subarray(from, at) });
          from = null;
          target = '';
        } else {
          if (from !== null) bad();
          fragments.push({ target, index: state.targets++ });
          from = at;
          target = '';
        }
      },
    },
    64,
  );
  if (from !== null && result.consumed > from)
    fragments.push({ raw: unit.subarray(from, result.consumed) });
  state.parser = result.state;
  checkBookRestoreLoreTransform(state);
  const output = [],
    encoder = new TextEncoder();
  let byteLength = 0,
    references = 0;
  for (const fragment of fragments) {
    let value;
    if (fragment.raw) value = fragment.raw;
    else {
      const mapped = await mapTarget(fragment.target, fragment.index);
      // The existing remapper either keeps an external literal or emits this native identity.
      if (
        typeof mapped !== 'string' ||
        (mapped !== fragment.target && !/^restore-[a-f0-9]{64}$/.test(mapped))
      )
        bad();
      value = encoder.encode(JSON.stringify(mapped));
      references++;
    }
    byteLength += value.length;
    if (byteLength > BOOK_RESTORE_LORE_FRAGMENT_BYTES) bad();
    output.push(value);
  }
  const projected = new Uint8Array(byteLength);
  let at = 0;
  for (const value of output) {
    projected.set(value, at);
    at += value.length;
  }
  const done = state.parser.mode === 'done';
  if (done) {
    const end = finishBookPortableLoreRelationsValidation(state.parser);
    if (state.targets !== end.count) bad();
  }
  return { state, consumed: result.consumed, bytes: projected, references, done };
}
