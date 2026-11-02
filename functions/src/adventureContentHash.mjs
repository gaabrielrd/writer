import { createSHA256 } from 'hash-wasm';
import { contentInvalid, contentClosed } from './adventureContentPrimitives.mjs';
export const ADVENTURE_CONTENT_HASH_ALGORITHM = 'sha256/hash-wasm@4.12.0';
/** One local WASM engine, synchronously loaded per stream; checkpoints are trusted host state, never file input. */
export async function createAdventureContentHash() {
  const engine = await createSHA256(),
    initial = new Uint8Array(engine.save());
  function encode(bytes) {
    return btoa(String.fromCharCode(...bytes));
  }
  function decode(value) {
    if (
      !contentClosed(value, ['algorithm', 'state']) ||
      value.algorithm !== ADVENTURE_CONTENT_HASH_ALGORITHM ||
      typeof value.state !== 'string' ||
      value.state.length > 4096 ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(value.state)
    )
      contentInvalid();
    const bytes = Uint8Array.from(atob(value.state), (c) => c.charCodeAt(0));
    if (bytes.length !== initial.length || encode(bytes) !== value.state) contentInvalid();
    try {
      engine.load(bytes);
    } catch {
      contentInvalid();
    }
    return bytes;
  }
  return Object.freeze({
    create(saved) {
      let bytes = saved === undefined ? new Uint8Array(initial) : decode(saved),
        ended = false;
      function check() {
        if (ended) contentInvalid();
      }
      return {
        update(payload) {
          check();
          if (!(payload instanceof Uint8Array)) contentInvalid();
          engine.load(bytes);
          engine.update(payload);
          bytes.fill(0);
          bytes = new Uint8Array(engine.save());
        },
        digest() {
          check();
          engine.load(bytes);
          const value = engine.digest();
          bytes.fill(0);
          ended = true;
          return value;
        },
        save() {
          check();
          return Object.freeze({
            algorithm: ADVENTURE_CONTENT_HASH_ALGORITHM,
            state: encode(bytes),
          });
        },
        destroy() {
          bytes.fill(0);
          ended = true;
        },
      };
    },
  });
}
