import { readAdventureBackupPackage } from './adventureBackupPackage.mjs';
import {
  createAdventureContentState,
  createAdventureContentMachine,
} from './adventureContentMachine.mjs';
import {
  ADVENTURE_CONTENT_LIMITS,
  contentInvalid as bad,
  decodeAdventureContentJSON,
} from './adventureContentPrimitives.mjs';
/** Inert semantic validation only. The host owns its index/hash and source; no operation is authorized by this report. */
export async function validateAdventureBackupContent(source, { index, hash, signal } = {}) {
  const stream = readAdventureBackupPackage(source, { signal });
  let complete = false,
    envelope,
    machine,
    current;
  const check = () => signal?.throwIfAborted();
  const metadata = (record) => ({ kind: record.kind, id: record.id, part: record.part });
  async function next() {
    check();
    const value = await stream.next();
    check();
    if (value.done) {
      envelope = value.value;
      return null;
    }
    if (value.value.type !== 'record') bad();
    return value.value.record;
  }
  try {
    check();
    const first = await stream.next();
    check();
    if (first.done || first.value.type !== 'manifest') bad();
    machine = createAdventureContentMachine(
      createAdventureContentState(first.value.manifest.adventureId),
      { index, hash, signal },
    );
    current = await next();
    while (current) {
      if (machine.checkpoint().pending?.stage === 'raw') {
        await machine.acceptRaw(metadata(current), current.payload);
        current = await next();
        continue;
      }
      const initial = current,
        parts = [];
      let bytes = 0,
        part = 0,
        previous;
      do {
        if (
          current.part !== part++ ||
          !current.payload.length ||
          current.payload.length > 65536 ||
          (previous !== undefined && previous !== 65536)
        )
          bad();
        bytes += current.payload.length;
        if (bytes > ADVENTURE_CONTENT_LIMITS.itemBytes) bad();
        parts.push(current.payload);
        previous = current.payload.length;
        current = await next();
      } while (current && current.kind === initial.kind && current.id === initial.id);
      const payload = new Uint8Array(bytes);
      let at = 0;
      for (const bytes of parts) {
        payload.set(bytes, at);
        at += bytes.length;
      }
      const value = decodeAdventureContentJSON(payload);
      await machine.acceptJSON(metadata(initial), value);
      check();
    }
    if (!envelope || envelope.validation !== 'envelope-only') bad();
    await machine.beginFinish(envelope);
    while (machine.checkpoint().phase !== 'done') {
      await machine.advanceFinish(ADVENTURE_CONTENT_LIMITS.stepItems);
      check();
    }
    const result = machine.result();
    complete = true;
    return {
      validation: 'content-only',
      version: 1,
      envelope,
      totals: result.totals,
      warnings: result.warnings,
    };
  } finally {
    if (!complete) await stream.return(undefined);
  }
}
