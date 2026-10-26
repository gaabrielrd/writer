import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import type {
  AdventureInventorySource,
  AdventureInventoryScope,
  AdventureInventoryItem,
} from './adventureInventoryContracts';
import {
  captureUnit,
  unitPart,
  unitInvalid,
  type AdventureUnitApi,
  type AdventureUnitOptions,
  type AdventureUnitProof,
  type UnitManifest,
} from './adventureUnitContracts';
/** Each yielded chunk is provisional until natural completion returns a unit-bytes-only proof. */
export function readAdventureBackupUnit(
  source: AdventureInventorySource,
  scope: AdventureInventoryScope,
  item: AdventureInventoryItem,
  api: AdventureUnitApi,
  options: AdventureUnitOptions,
): AsyncGenerator<Uint8Array, AdventureUnitProof | undefined, void> {
  const ref = captureUnit(source, scope, item);
  if (typeof api?.call !== 'function' || typeof options?.guard !== 'function') unitInvalid();
  const invoke = api.call.bind(api),
    guard = options.guard,
    signal = options.signal,
    controller = new AbortController();
  const check = () => {
    guard();
    signal?.throwIfAborted();
    controller.signal.throwIfAborted();
  };
  check();
  async function* run(): AsyncGenerator<Uint8Array, AdventureUnitProof | undefined, void> {
    const hash = sha256.create();
    let first: UnitManifest | undefined;
    try {
      for (let index = 0; !first || index < first.chunkCount; index++) {
        check();
        const response = await invoke(
          ref.method,
          Object.freeze({
            adventureId: ref.anchor.adventureId,
            sourceToken: ref.anchor.sourceToken,
            ...ref.descriptor,
            id: ref.item.id,
            itemToken: ref.item.itemToken,
            index,
          }),
        );
        check();
        const part = unitPart(response, ref, index, first);
        first ??= part.manifest;
        hash.update(part.bytes);
        if (index === first.chunkCount - 1 && bytesToHex(hash.digest()) !== first.contentHash)
          unitInvalid();
        check();
        yield part.bytes;
        check();
      }
      if (!first) unitInvalid();
      return Object.freeze({
        validation: 'unit-bytes-only',
        source: ref.anchor,
        scope: ref.scope,
        item: ref.item,
        ...first,
      });
    } finally {
      hash.destroy();
    }
  }
  const stream = run(),
    pull = stream.next.bind(stream),
    finish = stream.return.bind(stream),
    raise = stream.throw.bind(stream);
  stream.next = () => {
    const pending = pull();
    void pending.catch(() => {});
    return pending;
  };
  // Signal now: a queued generator return alone cannot interrupt a suspended RPC.
  stream.return = (): Promise<IteratorReturnResult<undefined>> => {
    controller.abort(new DOMException('Leitura encerrada.', 'AbortError'));
    void finish(undefined).catch(() => {});
    return Promise.resolve({ done: true, value: undefined });
  };
  stream.throw = (error: unknown) => {
    controller.abort(error);
    return raise(error);
  };
  return stream;
}
